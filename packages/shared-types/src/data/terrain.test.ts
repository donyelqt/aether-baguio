import { describe, expect, it } from 'vitest';
import {
  BASE_ELEVATION_M,
  generateHeightfield,
  RIDGE_HEIGHT_M,
  sampleHeight,
  sampleNormal,
} from './terrain.js';

const EXTENT = 4608;
const RES = 129;

/** Builds the standard field once; generation is the expensive part. */
const field = generateHeightfield(EXTENT, RES);

describe('heightfield generation', () => {
  it('produces the requested resolution and extent', () => {
    expect(field.res).toBe(RES);
    expect(field.extentM).toBe(EXTENT);
    expect(field.heights).toHaveLength(RES * RES);
  });

  it('keeps every elevation finite and inside a plausible band', () => {
    let min = Infinity;
    let max = -Infinity;
    for (const h of field.heights) {
      expect(Number.isFinite(h)).toBe(true);
      if (h < min) min = h;
      if (h > max) max = h;
    }
    // Baguio is ~1,400 m; the rim should reach into the 1,600s but not 3 km.
    expect(min).toBeGreaterThan(BASE_ELEVATION_M - 120);
    expect(max).toBeLessThan(BASE_ELEVATION_M + RIDGE_HEIGHT_M + 120);
  });

  it('is deterministic for a given seed (NFR-1)', () => {
    const a = generateHeightfield(EXTENT, 33, 7);
    const b = generateHeightfield(EXTENT, 33, 7);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces different terrain for a different seed', () => {
    const a = generateHeightfield(EXTENT, 33, 7);
    const b = generateHeightfield(EXTENT, 33, 8);
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('raises elevation toward the eastern rim, as the Cordillera does', () => {
    const centre = sampleHeight(field, 0, 0);
    const east = sampleHeight(field, EXTENT * 0.45, 0);
    expect(east).toBeGreaterThan(centre + 60);
  });

  it('keeps the CBD centre comparatively flat', () => {
    // Sample a small area around the origin; relief there must stay modest or
    // roads will not sit flush on the ground.
    let min = Infinity;
    let max = -Infinity;
    for (let dx = -150; dx <= 150; dx += 50) {
      for (let dz = -150; dz <= 150; dz += 50) {
        const h = sampleHeight(field, dx, dz);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(max - min).toBeLessThan(45);
  });

  it('rejects a degenerate resolution', () => {
    expect(() => generateHeightfield(EXTENT, 1)).toThrow(RangeError);
    expect(() => generateHeightfield(0, 16)).toThrow(RangeError);
  });
});

describe('sampling', () => {
  it('returns the exact stored value at a grid node', () => {
    // Node (i=3, j=5) of the generated field.
    const step = EXTENT / (RES - 1);
    const x = -EXTENT / 2 + 5 * step;
    const z = EXTENT / 2 - 3 * step;
    expect(sampleHeight(field, x, z)).toBeCloseTo(field.heights[3 * RES + 5]!, 4);
  });

  it('clamps outside the field rather than wrapping', () => {
    const inside = sampleHeight(field, 0, 0);
    const beyond = sampleHeight(field, EXTENT * 4, 0);
    expect(Number.isFinite(beyond)).toBe(true);
    expect(beyond).not.toBe(inside);
    // Wrapping would return a value from the opposite edge; clamping returns
    // the edge value, so both far-out samples agree.
    expect(sampleHeight(field, EXTENT * 4, 0)).toBeCloseTo(
      sampleHeight(field, EXTENT / 2 - 1, 0),
      0,
    );
  });

  it('interpolates bilinearly between nodes', () => {
    const step = EXTENT / (RES - 1);
    const x0 = -EXTENT / 2 + 10 * step;
    const z0 = EXTENT / 2 - 10 * step;
    const a = field.heights[10 * RES + 10]!;
    const b = field.heights[10 * RES + 11]!;
    const mid = sampleHeight(field, x0 + step / 2, z0);
    expect(mid).toBeCloseTo((a + b) / 2, 3);
  });

  it('is continuous across a cell boundary', () => {
    // A discontinuity would show as a visible seam in the rendered mesh.
    const step = EXTENT / (RES - 1);
    const x = -EXTENT / 2 + 20 * step;
    const z = 0;
    const before = sampleHeight(field, x - 0.01, z);
    const after = sampleHeight(field, x + 0.01, z);
    expect(Math.abs(after - before)).toBeLessThan(0.5);
  });
});

describe('normals', () => {
  it('returns a unit vector', () => {
    const n = sampleNormal(field, 120, -80);
    const len = Math.hypot(n.nx, n.ny, n.nz);
    expect(len).toBeCloseTo(1, 6);
  });

  it('points generally upward', () => {
    const n = sampleNormal(field, 0, 0);
    expect(n.ny).toBeGreaterThan(0.9);
  });

  it('tilts toward downhill on the ridge', () => {
    // On the eastern slope the surface rises with +x, so the normal's x
    // component must lean back the other way.
    const n = sampleNormal(field, EXTENT * 0.35, 0);
    expect(n.nx).toBeLessThan(0);
  });
});
