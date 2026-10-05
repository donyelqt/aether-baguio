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
      const from = nodeAt(road.path[i]!);
      const to = nodeAt(road.path[i + 1]!);
      if (from === to) continue;
      const a = nodes[from]!;
      const b = nodes[to]!;
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
