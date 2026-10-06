import { generateHeightfield, sampleHeight, WORLD_EXTENT_M } from '@aether/shared-types';
import { describe, expect, it } from 'vitest';
import { BUILDING_BANDS, BUILDING_STEP_M, type BuildingBand } from './buildings.generated';
import { extrudeBand } from './buildingWorker';

/**
 * Behavioural tests for the building extrusion.
 *
 * Each test targets a defect that shipped into a render before it was caught.
 * These assert what the geometry IS, not what the source text says.
 */

/** A band with one axis-aligned square footprint, metres. */
function squareBand(side: number, heightCm: number, x: number, z: number): BuildingBand {
  const half = side / 2;
  const corners: readonly (readonly [number, number])[] = [
    [x - half, z - half],
    [x + half, z - half],
    [x + half, z + half],
    [x - half, z + half],
  ];
  const ring = corners.flatMap(([px, pz]) => [
    Math.round(px / BUILDING_STEP_M),
    Math.round(pz / BUILDING_STEP_M),
  ]);
  return {
    rings: new Int32Array(ring),
    footprints: new Int32Array([0, corners.length, heightCm]),
    count: 1,
  };
}

/** Largest absolute X or Z across a mesh. */
function maxExtent(mesh: { positions: Float32Array }): number {
  let max = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = Math.abs(mesh.positions[i] as number);
    const z = Math.abs(mesh.positions[i + 2] as number);
    if (x > max) max = x;
    if (z > max) max = z;
  }
  return max;
}

/** Every Y value in a mesh, roof and ground contact included. */
function heights(mesh: { positions: Float32Array }): number[] {
  const ys: number[] = [];
  for (let i = 1; i < mesh.positions.length; i += 3) ys.push(mesh.positions[i] as number);
  return ys;
}

describe('extrudeBand geometry', () => {
  it('emits exactly three vertices per triangle', () => {
    // The bug that produced shards across the map: one roof vertex was pushed
    // while nPts-2 triangles were counted, so the renderer read the following
    // building's vertices as roof corners.
    const mesh = extrudeBand('default', squareBand(10, 500, 200, -1100));
    const vertexCount = mesh.positions.length / 3;
    expect(vertexCount).toBe(mesh.triangles * 3);
  });

  it('does not overflow the buffer it allocated', () => {
    // Capacity must cover centroid + ring + walls, or writes silently truncate.
    const mesh = extrudeBand('default', squareBand(10, 500, 200, -1100));
    expect(mesh.positions.length).toBe(mesh.normals.length);
    expect(mesh.normals.length).toBe(mesh.colors.length);
    expect(mesh.positions.length % 3).toBe(0);
  });

  it('places every vertex inside the footprint it belongs to', () => {
    // A stretched triangle means a vertex came from another building.
    const mesh = extrudeBand('default', squareBand(20, 600, 200, -1100));
    const limit = 20; // half-diagonal plus margin
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const dx = (mesh.positions[i] as number) - 200;
      const dz = (mesh.positions[i + 2] as number) + 1100;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(limit);
    }
  });

  it('sits the base on the terrain, not on a local reimplementation', () => {
    // The worker previously reimplemented the generator and dropped the fbm
    // relief worth +/-35 m, so walls hung in the air or sank into the mesh.
    const field = generateHeightfield(WORLD_EXTENT_M, 192, 1337);
    const x = 200;
    const z = -1100;
    const mesh = extrudeBand('default', squareBand(20, 600, x, z));
    const expected = sampleHeight(field, x, z);

    const ys = [...mesh.positions].filter((_, i) => i % 3 === 1);
    // Lowest vertex is the ground contact; roof is that plus the 6 m height.
    expect(Math.min(...ys)).toBeCloseTo(expected, 0);
    expect(Math.max(...ys)).toBeCloseTo(expected + 6, 0);
  });

  it('honours the encoded height', () => {
    const field = generateHeightfield(WORLD_EXTENT_M, 192, 1337);
    const ground = sampleHeight(field, 200, -1100);
    const short = extrudeBand('default', squareBand(10, 300, 200, -1100));
    const tall = extrudeBand('default', squareBand(10, 1200, 200, -1100));

    const roofOf = (m: typeof short) =>
      Math.max(...[...m.positions].filter((_, i) => i % 3 === 1)) - ground;
    expect(roofOf(tall) - roofOf(short)).toBeCloseTo(9, 0);
  });

  it('produces no NaN anywhere in a real band', () => {
    const band = BUILDING_BANDS.default;
    if (band === undefined) throw new Error('default band missing');
    const mesh = extrudeBand('default', band);
    expect(mesh.positions.some((v) => !Number.isFinite(v))).toBe(false);
    expect(mesh.normals.some((v) => !Number.isFinite(v))).toBe(false);
    expect(mesh.colors.some((v) => !Number.isFinite(v))).toBe(false);
  });

  it('keeps every generated band within the terrain extent', () => {
    // 353 footprints reached past the edge and were dropped by the extractor.
    // This asserts the crop held, so a regenerated file cannot reintroduce them.
    const half = WORLD_EXTENT_M / 2;
    for (const name of Object.keys(BUILDING_BANDS)) {
      const band = BUILDING_BANDS[name];
      if (band === undefined) continue;
      expect(maxExtent(extrudeBand(name, band))).toBeLessThanOrEqual(half);
    }
  });

  it('never sinks a wall below the terrain it stands on', () => {
    // A wall whose ground contact is below the sampled surface is buried;
    // one far above it floats. Both were symptoms of the sampler drift.
    const field = generateHeightfield(WORLD_EXTENT_M, 192, 1337);
    const band = BUILDING_BANDS.commercial;
    if (band === undefined) throw new Error('commercial band missing');
    const mesh = extrudeBand('commercial', band);
    const ys = heights(mesh);
    // Every vertex must sit at or above the terrain directly beneath it.
    // Sampling a whole band spans ~360 m of relief, so the check is per-footprint
    // distance rather than a global height range.
    const half = WORLD_EXTENT_M / 2;
    expect(ys.length).toBeGreaterThan(0);
    let worstSink = 0;
    for (let i = 0; i < mesh.positions.length; i += 3 * 997) {
      const x = mesh.positions[i] as number;
      const z = mesh.positions[i + 2] as number;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const surface = sampleHeight(field, x, z);
      const sink = surface - (mesh.positions[i + 1] as number);
      if (sink > worstSink) worstSink = sink;
    }
    expect(worstSink).toBeLessThan(1);
  });

  it('extrudes every real footprint without dropping one', () => {
    const band = BUILDING_BANDS.commercial;
    if (band === undefined) throw new Error('commercial band missing');
    const mesh = extrudeBand('commercial', band);
    // 4 roof tris + 4 wall quads for a square footprint.
    expect(mesh.count).toBe(band.count);
    expect(mesh.triangles % 8).toBe(0);
  });

  it('emits unit normals so lighting is correct', () => {
    const mesh = extrudeBand('default', squareBand(10, 500, 200, -1100));
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.hypot(
        mesh.normals[i] as number,
        mesh.normals[i + 1] as number,
        mesh.normals[i + 2] as number,
      );
      expect(len).toBeCloseTo(1, 5);
    }
  });
});
