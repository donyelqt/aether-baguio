'use client';

import { createProjector, ROAD_WIDTH_M, WORLD_EXTENT_M } from '@aether/shared-types';
import * as THREE from 'three';
import { OSM_GREEN, OSM_ROADS, OSM_STATS, OSM_WATER } from './baguio.generated';
import { groundAt } from './Terrain';

/**
 * Real Baguio geometry, rendered from OpenStreetMap survey data.
 *
 * The previous map drew boxes on invented polylines. This draws the actual
 * street network, Burnham Park's real 1161 x 588 m outline, and Burnham Park
 * Lake, which was absent entirely.
 *
 * Two rules keep the draw-call budget:
 *
 * 1. Everything merges into a handful of BufferGeometries, one per class plus
 *    water and green. 988 road ways become 3 draw calls, not 988.
 * 2. Geometry outside the world extent is dropped at build time. OSM returns
 *    whole crossing ways, so a chunk of the network reaches 3 km beyond the
 *    terrain and would otherwise be geometry with no ground under it.
 */

const project = createProjector();

/** Half the world extent; anything past this has no terrain to sit on. */
const LIMIT = WORLD_EXTENT_M / 2;

/** Vertical clearance above the terrain, in metres. */
const LIFT_M = 0.4;

interface RibbonBuffers {
  positions: number[];
  indices: number[];
}

/**
 * Appends one polyline to the shared buffers, draped on the terrain.
 *
 * Vertices are emitted per segment rather than per polyline so that a long road
 * crossing varied terrain follows the ground. A single pair of vertices per
 * polyline would float over ridges or sink into valleys.
 */
function appendRibbon(
  out: RibbonBuffers,
  points: readonly (readonly [number, number])[],
  widthM: number,
): void {
  if (points.length < 2) return;

  const base = out.positions.length / 3;
  let emitted = 0;
  let previous: { x: number; z: number } | null = null;

  for (let i = 0; i < points.length; i++) {
    // `points` is a non-empty readonly tuple array; the generated data always
    // has at least two entries per way, and `appendRibbon` returns early
    // below that. The clamp on `i` is what makes the neighbour lookups safe.
    const cur = points[i];
    if (cur === undefined) continue;
    const { x, z } = project({ lat: cur[0], lon: cur[1] });

    // Skip anything with no terrain beneath it.
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) {
      previous = null;
      continue;
    }

    // Perpendicular in the XZ plane, from the local direction. Using the
    // neighbours rather than the previous vertex keeps the normal correct at
    // the ends of a polyline. The clamps guarantee both indices are in range.
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    if (before === undefined || after === undefined) continue;
    const p = project({ lat: before[0], lon: before[1] });
    const q = project({ lat: after[0], lon: after[1] });
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    // Degenerate segment (duplicate vertex): skip rather than divide by zero
    // and poison the position buffer with NaN.
    if (len < 1e-6) continue;

    const hw = widthM / 2;
    const nx = -dz / len;
    const nz = dx / len;
    const y = groundAt(x, z) + LIFT_M;

    out.positions.push(x + nx * hw, y, z + nz * hw);
    out.positions.push(x - nx * hw, y, z - nz * hw);
    emitted++;

    // Quad between this pair and the previous.
    if (previous !== null && emitted > 1) {
      const t = (emitted - 1) * 2;
      const p0 = base + t - 2;
      out.indices.push(p0, p0 + 2, p0 + 1, p0 + 1, p0 + 2, p0 + 3);
    }
    previous = { x, z };
  }
}

function toGeometry(buf: RibbonBuffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geo.setIndex(buf.indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Builds the ribbon for one road class. */
export function buildRoadGeometry(
  roadClass: 'arterial' | 'collector' | 'local',
): THREE.BufferGeometry {
  const buf: RibbonBuffers = { positions: [], indices: [] };
  for (const path of OSM_ROADS[roadClass]) {
    appendRibbon(buf, path.points, ROAD_WIDTH_M[roadClass]);
  }
  return toGeometry(buf);
}

/**
 * Builds a flat polygon for an area (park or water).
 *
 * Closed rings are triangulated as a fan from the first vertex. OSM parks and
 * ponds in this area are simple enough that a fan does not cross the boundary;
 * an ear-clipping pass would be correct but is not yet warranted.
 */
export function buildAreaGeometry(
  areas: readonly { name: string; points: readonly (readonly [number, number])[] }[],
  liftM: number,
): THREE.BufferGeometry {
  const buf: RibbonBuffers = { positions: [], indices: [] };

  for (const area of areas) {
    // Drop vertices with no terrain under them, and keep only the surviving
    // ones so the fan below triangulates a contiguous ring.
    const pts = area.points.filter((p) => {
      const { x, z } = project({ lat: p[0], lon: p[1] });
      return Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT;
    });
    if (pts.length < 3) continue;

    const base = buf.positions.length / 3;
    for (const p of pts) {
      const { x, z } = project({ lat: p[0], lon: p[1] });
      buf.positions.push(x, groundAt(x, z) + liftM, z);
    }
    for (let i = 1; i < pts.length - 1; i++) {
      buf.indices.push(base, base + i, base + i + 1);
    }
  }

  return toGeometry(buf);
}

/** Draw-call budget for the whole map, asserted in tests. */
export const OSM_DRAW_CALLS = {
  arterial: 1,
  collector: 1,
  local: 1,
  water: 1,
  green: 1,
} as const;

export { OSM_GREEN, OSM_ROADS, OSM_STATS, OSM_WATER };
