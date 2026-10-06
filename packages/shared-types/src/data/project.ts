/**
 * WGS84 to local ENU projection, and road-graph construction.
 *
 * The simulation runs in metres. Storing degrees would put the entire city in
 * a ~0.02-degree box, where float32 precision at 1 m resolution is already
 * marginal, and where physics constants (metres, seconds) would need
 * conversion at every call site. So degrees exist only in the source data and
 * are projected once at load.
 */

import type { Landmark, RoadClassValue, RoadNode, RoadSegment } from '../world';
import { LANDMARKS, type LatLon, ORIGIN, ROADS } from './baguio';

/**
 * Metres per degree of latitude at the origin latitude. Uses the standard
 * series expansion; accurate to well under a centimetre over a 4 km span.
 */
function metresPerDegLat(latDeg: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return (
    111132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad) - 0.0023 * Math.cos(6 * rad)
  );
}

/** Metres per degree of longitude, which shrinks by cos(lat). */
function metresPerDegLon(latDeg: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return 111412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad) + 0.118 * Math.cos(5 * rad);
}

/**
 * Projects WGS84 degrees to metres east/north of the origin.
 *
 * East is +x and north is +z. Three.js treats +y as up, so the renderer maps
 * this frame onto the XZ ground plane and puts elevation on Y.
 */
export function createProjector(origin: LatLon = ORIGIN): (p: LatLon) => { x: number; z: number } {
  const mLat = metresPerDegLat(origin.lat);
  const mLon = metresPerDegLon(origin.lat);
  return (p: LatLon) => ({
    x: (p.lon - origin.lon) * mLon,
    z: (p.lat - origin.lat) * mLat,
  });
}

/** Road width in metres by class — drives both the mesh and the traffic lanes. */
export const ROAD_WIDTH_M: Record<RoadClassValue, number> = {
  arterial: 16,
  collector: 11,
  local: 8,
};

/**
 * Builds the road graph, projecting to local metres.
 *
 * Nodes are deduplicated on a 2 m grid so that roads meeting at a junction
 * share a node — without this the Phase 1 router would treat the CBD as
 * disconnected islands. Elevation is left at 0 here and sampled from the
 * heightfield once the terrain generator exists.
 */
export function buildRoadGraph(project: (p: LatLon) => { x: number; z: number }): {
  nodes: RoadNode[];
  segments: RoadSegment[];
} {
  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  /** Grid cell (2 m) to node index. A Map keyed by a string avoids float keys. */
  const grid = new Map<string, number>();
  const CELL = 2;

  const nodeAt = (p: LatLon): number => {
    const { x, z } = project(p);
    const key = `${Math.round(x / CELL)},${Math.round(z / CELL)}`;
    const existing = grid.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ id, x, z, y: 0 });
    grid.set(key, id);
    return id;
  };

  for (const road of ROADS) {
    for (let i = 0; i < road.path.length - 1; i++) {
      const start = road.path[i];
      const end = road.path[i + 1];
      // A malformed polyline with a missing vertex is skipped rather than
      // asserted through: a bad data file should drop a road, not throw.
      if (start === undefined || end === undefined) continue;
      const from = nodeAt(start);
      const to = nodeAt(end);
      if (from === to) continue;
      const a = nodes[from];
      const b = nodes[to];
      if (a === undefined || b === undefined) continue;
      segments.push({
        id: `${road.id}:${i}`,
        from,
        to,
        roadClass: road.roadClass,
        length: Math.hypot(b.x - a.x, b.z - a.z),
      });
    }
  }

  return { nodes, segments };
}

/** Projects the landmark list into the local frame. */
export function buildLandmarks(project: (p: LatLon) => { x: number; z: number }): Landmark[] {
  return LANDMARKS.map((l) => {
    const { x, z } = project(l.at);
    return {
      id: l.id,
      name: l.name,
      kind: l.kind,
      x,
      z,
      halfWidth: l.halfWidth,
      halfDepth: l.halfDepth,
      height: l.height,
    };
  });
}

/** Metres of clearance kept between a landmark footprint and any road surface. */
export const LANDMARK_ROAD_CLEARANCE_M = 6;

/**
 * Relaxation passes allowed when pushing a landmark clear of the network.
 * Landmarks sit at junctions, so one pass per crossing is typical; the cap
 * stops a pathological layout from looping.
 */
export const MAX_CLEARANCE_PASSES = 400;

/**
 * Fraction of the remaining overlap resolved per pass.
 * Below 1.0 so a landmark at a junction settles instead of oscillating between
 * the roads it is being pushed away from.
 */
export const CLEARANCE_DAMPING = 0.6;

/**
 * Pushes landmarks clear of nearby roads.
 *
 * Landmark coordinates come from OSM and frequently sit *on* a street centre
 * line — that is where Nominatim places a building whose address is the street.
 * Rendered as-is, a 90 m wide box straddles an 8–16 m road and the road visibly
 * runs through the building.
 *
 * Each landmark is nudged along the perpendicular of its nearest road until its
 * footprint clears the carriageway by `LANDMARK_ROAD_CLEARANCE_M`. Flat features
 * (parks, terrain) are left alone: a park meeting a road is correct, and
 * moving one would break the layout it defines.
 */
export function clearLandmarksFromRoads(
  landmarks: Landmark[],
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
): Landmark[] {
  const resolved = new Map<number, RoadNode>();
  for (const n of nodes) resolved.set(n.id, n);

  return landmarks.map((landmark) => {
    // Flat features are left in place. A park or a street-level plaza meeting a
    // road is correct, and a zero-height slab is a ground overlay, not a
    // building that could be shoved off its centre line.
    const flat = landmark.kind === 'park' || landmark.kind === 'nature' || landmark.height === 0;
    if (flat) return landmark;

    let x = landmark.x;
    let z = landmark.z;
    const reach = Math.hypot(landmark.halfWidth, landmark.halfDepth);
    // Start strict. Dropped to centre-only if the strict pass cannot settle,
    // which is the signature of a block enclosed by streets.
    let relaxFull = true;

    // Landmarks sit at junctions where several roads meet, so stepping clear of
    // one can land on another. Push clear of all of them, a little at a time.
    //
    // Damping matters: moving the full deficit in one step overshoots a road it
    // has just cleared and sends the landmark orbiting outward forever. A
    // fraction of the deficit per pass converges; the full amount does not.
    for (let pass = 0; pass < MAX_CLEARANCE_PASSES; pass++) {
      const stepsTaken = pass;
      let worstDeficit = 0;
      let pushX = 0;
      let pushZ = 0;

      for (const seg of segments) {
        const a = resolved.get(seg.from);
        const b = resolved.get(seg.to);
        if (a === undefined || b === undefined) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lenSq = dx * dx + dz * dz;
        const t =
          lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq));
        const cx = a.x + t * dx;
        const cz = a.z + t * dz;
        const dist = Math.hypot(x - cx, z - cz);

        const halfWidth = (ROAD_WIDTH_M[seg.roadClass] ?? 8) / 2;
        // Two tiers. First try to clear the whole footprint, which is what a
        // free-standing landmark wants: a road should not cross a lawn either.
        // If the block is enclosed by streets on several sides — SM City Baguio
        // sits in one — no position satisfies that, so fall back to keeping
        // roads off the centre, which is the difference between a building and
        // a building with a road through it.
        const fullClear = reach + halfWidth + LANDMARK_ROAD_CLEARANCE_M;
        const centreClear = halfWidth + LANDMARK_ROAD_CLEARANCE_M;
        const target = relaxFull ? fullClear : centreClear;
        const deficit = target - dist;
        if (deficit <= 0) continue;

        // Unit vector from the road toward the landmark; pushing along it moves
        // the landmark directly away from this segment.
        let nx = x - cx;
        let nz = z - cz;
        const nLen = Math.hypot(nx, nz);
        if (nLen < 1e-6) {
          // Exactly on the centreline: fall back to the road's perpendicular.
          nx = -dz;
          nz = dx;
          const pLen = Math.hypot(nx, nz);
          if (pLen < 1e-6) continue;
          nx /= pLen;
          nz /= pLen;
        } else {
          nx /= nLen;
          nz /= nLen;
        }

        // Accumulate the deepest offender's direction, weighted by its share of
        // the total, so several roads contribute one coherent step.
        pushX += nx * deficit;
        pushZ += nz * deficit;
        worstDeficit = Math.max(worstDeficit, deficit);
      }

      if (worstDeficit === 0) break; // clear of every road

      if (stepsTaken >= MAX_CLEARANCE_PASSES / 2 && relaxFull) {
        // Halfway through with no sign of settling: this landmark is walled in.
        // Switch to the weaker rule and let the remainder of the budget resolve it.
        relaxFull = false;
        x = landmark.x;
        z = landmark.z;
        continue;
      }

      const pushLen = Math.hypot(pushX, pushZ);
      if (pushLen < 1e-6) break; // opposing roads, no consistent direction
      const step = Math.min(worstDeficit, pushLen) * CLEARANCE_DAMPING;
      x += (pushX / pushLen) * step;
      z += (pushZ / pushLen) * step;

      if (step < 0.001) break; // converged to sub-centimetre
    }

    if (x === landmark.x && z === landmark.z) return landmark;
    return { ...landmark, x, z };
  });
}

/** Smallest axis-aligned bounds containing every road node and landmark. */
export function worldBounds(nodes: RoadNode[], landmarks: Landmark[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minZ = Math.min(minZ, n.z);
    maxZ = Math.max(maxZ, n.z);
  }
  for (const l of landmarks) {
    minX = Math.min(minX, l.x - l.halfWidth);
    maxX = Math.max(maxX, l.x + l.halfWidth);
    minZ = Math.min(minZ, l.z - l.halfDepth);
    maxZ = Math.max(maxZ, l.z + l.halfDepth);
  }
  return { minX, maxX, minZ, maxZ, spanX: maxX - minX, spanZ: maxZ - minZ };
}
