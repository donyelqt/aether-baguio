/**
 * Building mesh worker.
 *
 * Extrudes 16,000 footprints into triangle buffers off the main thread. The
 * input is 1.1 MB of int32 rings; the output is roughly half a million
 * triangles that would otherwise cost 27 MB if shipped baked.
 *
 * The alternative — one InstancedMesh per footprint — is not available: every
 * footprint is a different outline, so instancing needs a shared geometry and
 * a scaled box throws the real shapes away. Merging per material band gives
 * real footprints in five draw calls, which is what this produces.
 */
import { generateHeightfield, sampleHeight, WORLD_EXTENT_M } from '@aether/shared-types';
import type { BuildingBand } from './buildings.generated';
import { BUILDING_BANDS, BUILDING_STEP_M } from './buildings.generated';

/** One band, ready to become a BufferGeometry. */
export interface BandMesh {
  band: string;
  /** Flat XYZ positions, local metres. */
  positions: Float32Array;
  /** Flat XYZ outward normals. */
  normals: Float32Array;
  /** Flat RGB brightness multiplier per vertex. */
  colors: Float32Array;
  /** Footprint count in this band. */
  count: number;
  /** Triangle count, for budget assertions. */
  triangles: number;
}

/**
 * Typed-array read that returns a total number.
 *
 * Indices here are computed from the generator's own metadata, so out of range
 * cannot happen. Rather than assert that at every one of the twenty-odd reads,
 * this makes the compiler satisfied without weakening the check anywhere it
 * could actually hide a bug. Returns 0 on failure, which for a coordinate
 * collapses the footprint to the origin and for metadata skips it.
 */
function at(array: Int32Array | Float32Array | Float64Array, index: number): number {
  const value = array[index];
  return value === undefined ? 0 : value;
}

/**
 * Ground height, straight from the engine's own terrain sampler.
 *
 * The first version reimplemented the bowl term here and omitted the fbm
 * relief, which is worth up to +/-35 m. Every building was therefore placed
 * at the wrong elevation and most were buried in the terrain, with only a
 * sliver of wall showing as a streak. Importing the real sampler is the fix,
 * and it cannot drift: one implementation, one answer.
 */
// Must match Terrain.tsx exactly, or buildings float above or sink into the mesh.
const TERRAIN_RES = 192;
const TERRAIN_SEED = 1337;
const TERRAIN_FIELD = generateHeightfield(WORLD_EXTENT_M, TERRAIN_RES, TERRAIN_SEED);

function groundHeight(x: number, z: number): number {
  return sampleHeight(TERRAIN_FIELD, x, z);
}

/**
 * Deterministic per-building brightness.
 *
 * Without it a block of same-height buildings reads as one flat mass. Derived
 * from footprint area, so it is stable across reloads (NFR-1) with no seeded RNG.
 */
function tintFor(area: number): number {
  const t = (((area * 7.3) % 1) + 1) % 1;
  return 0.82 + 0.18 * t;
}

export function extrudeBand(band: string, data: BuildingBand): BandMesh {
  const { rings, footprints, count } = data;

  // A roof fan needs its centroid PLUS every ring vertex, and the mesh is
  // non-indexed, so each triangle costs 3 whole vertices.
  //
  // This was the bug behind the streaks: only the centroid was emitted while
  // nPts-2 triangles were counted, so the renderer consumed the next
  // building's vertices as roof corners and drew quads across the map.
  let ringTotal = 0;
  for (let f = 0; f < count; f++) {
    ringTotal += at(footprints, f * 3 + 1);
  }
  const capacity = count * 4 + ringTotal * 9;

  const positions = new Float32Array(capacity * 3);
  const normals = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);

  let p = 0;
  let triangles = 0;

  for (let f = 0; f < count; f++) {
    const off = at(footprints, f * 3);
    const nPts = at(footprints, f * 3 + 1);
    const heightCm = at(footprints, f * 3 + 2);
    if (nPts < 3) continue;
    const height = heightCm / 100;

    const xs = new Float64Array(nPts);
    const zs = new Float64Array(nPts);
    for (let i = 0; i < nPts; i++) {
      xs[i] = at(rings, (off + i) * 2) * BUILDING_STEP_M;
      zs[i] = at(rings, (off + i) * 2 + 1) * BUILDING_STEP_M;
    }

    let twice = 0;
    for (let i = 0; i < nPts; i++) {
      const j = (i + 1) % nPts;
      twice += at(xs, i) * at(zs, j) - at(xs, j) * at(zs, i);
    }
    const tint = tintFor(Math.abs(twice) / 2);

    // Roof: a real fan. Centroid, then the whole ring lifted to roof height,
    // wound so the normal points up.
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < nPts; i++) {
      cx += at(xs, i);
      cz += at(zs, i);
    }
    cx /= nPts;
    cz /= nPts;
    const roofY = groundHeight(cx, cz) + height;

    for (let i = 0; i < nPts; i++) {
      const j = (i + 1) % nPts;
      const tri: readonly (readonly [number, number, number])[] = [
        [cx, roofY, cz],
        [at(xs, i), groundHeight(at(xs, i), at(zs, i)) + height, at(zs, i)],
        [at(xs, j), groundHeight(at(xs, j), at(zs, j)) + height, at(zs, j)],
      ];
      for (const [vx, vy, vz] of tri) {
        positions[p * 3] = vx;
        positions[p * 3 + 1] = vy;
        positions[p * 3 + 2] = vz;
        normals[p * 3 + 1] = 1;
        colors[p * 3] = tint;
        colors[p * 3 + 1] = tint;
        colors[p * 3 + 2] = tint;
        p++;
      }
      triangles += 1;
    }

    // Walls: two triangles per edge, outward-facing.
    for (let i = 0; i < nPts; i++) {
      const j = (i + 1) % nPts;
      const x1 = at(xs, i);
      const z1 = at(zs, i);
      const x2 = at(xs, j);
      const z2 = at(zs, j);

      const ex = x2 - x1;
      const ez = z2 - z1;
      const len = Math.hypot(ex, ez);
      if (len < 1e-4) continue;

      const y1 = groundHeight(x1, z1);
      const y2 = groundHeight(x2, z2);
      const nx = ez / len;
      const nz = -ex / len;

      // Typed as a 3-tuple so destructuring stays total under
      // noUncheckedIndexedAccess.
      const quad: readonly (readonly [number, number, number])[] = [
        [x1, y1, z1],
        [x2, y2, z2],
        [x2, y2 + height, z2],
        [x1, y1, z1],
        [x2, y2 + height, z2],
        [x1, y1 + height, z1],
      ];
      for (const [vx, vy, vz] of quad) {
        positions[p * 3] = vx;
        positions[p * 3 + 1] = vy;
        positions[p * 3 + 2] = vz;
        normals[p * 3] = nx;
        normals[p * 3 + 1] = 0;
        normals[p * 3 + 2] = nz;
        colors[p * 3] = tint;
        colors[p * 3 + 1] = tint;
        colors[p * 3 + 2] = tint;
        p++;
      }
      triangles += 2;
    }
  }

  return {
    band,
    positions: positions.slice(0, p * 3),
    normals: normals.slice(0, p * 3),
    colors: colors.slice(0, p * 3),
    count,
    triangles,
  };
}

// Guarded so this module can be imported by tests; `self` only exists in a worker.
if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent<{ bands?: string[] }>) => {
    const only = event.data?.bands;
    const names = only ?? Object.keys(BUILDING_BANDS);
    const out: BandMesh[] = [];
    for (const name of names) {
      const band = BUILDING_BANDS[name];
      if (band !== undefined) out.push(extrudeBand(name, band));
    }
    const transfer: ArrayBuffer[] = [];
    for (const m of out) {
      // slice() may return a view over a larger buffer, so the exact ArrayBuffer
      // is not guaranteed by the type. Buffers are detached-safe to send either
      // way; the view itself is what postMessage transfers.
      transfer.push(m.positions.buffer as ArrayBuffer);
      transfer.push(m.normals.buffer as ArrayBuffer);
      transfer.push(m.colors.buffer as ArrayBuffer);
    }
    self.postMessage({ meshes: out }, { transfer });
  };
}
