import { generateHeightfield, WORLD_EXTENT_M } from '@aether/shared-types';
import { describe, expect, it } from 'vitest';
import { buildTerrainGeometry } from './terrainGeometry';
import { applyTerrainColours, terrainColorAt } from './terrainSurface';

/** Relative luminance, so "lighter" is a measurement rather than an impression. */
const lum = (c: { r: number; g: number; b: number }): number =>
  0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Colour saturation as max-min channel spread: grey rock scores low. */
const spread = (c: { r: number; g: number; b: number }): number =>
  Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

describe('terrain surface colour', () => {
  it('varies with altitude, reading lighter and drier up high', () => {
    const low = terrainColorAt(1400, 1);
    const high = terrainColorAt(1650, 1);
    expect(low.getHex()).not.toBe(high.getHex());
    expect(lum(high)).toBeGreaterThan(lum(low));
  });

  it('turns to rock on steep ground at any altitude', () => {
    const flat = terrainColorAt(1400, 1.0);
    const steep = terrainColorAt(1400, 0.965);
    expect(flat.getHex()).not.toBe(steep.getHex());
    expect(spread(steep)).toBeLessThan(spread(flat));
  });

  it('spans a real gradient across the city bowl, not just the distant ridge', () => {
    // The defect: normalising the ramp to the full ridge put the whole developed
    // bowl at t=0.00-0.32, never crossing the LOW->MID midpoint, so everything
    // the camera looks at was one green. The global-spread test below still
    // passed because the far ridge varies; this samples only the city.
    const field = generateHeightfield(WORLD_EXTENT_M, 128, 1337);
    const geo = buildTerrainGeometry(field);
    applyTerrainColours(geo);

    const position = geo.attributes.position;
    const colours = geo.attributes.color;
    if (position === undefined || colours === undefined) {
      throw new Error('terrain is missing colour or position attributes');
    }

    // CityScene orbits FOCUS = (200, 300); sample everything within 1,500 m.
    // At res 128 that is 2,223 vertices spanning 1,393-1,425 m.
    //
    // A distinct-colour count is useless here: the old ramp still produced 82
    // distinct bytes. Measured on the real mesh, the ridge-normalised ramp gives
    // a green spread of 0.0028 and a luminance spread of 0.0032; the bowl ramp
    // gives 0.0293 and 0.0336. Both thresholds sit between the two, so the test
    // fails on the regression and passes on the fix without pinning a palette.
    const greens: number[] = [];
    const lums: number[] = [];
    for (let i = 0; i < colours.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (Math.hypot(x - 200, z - 300) > 1500) continue;
      greens.push(colours.getY(i));
      lums.push(lum({ r: colours.getX(i), g: colours.getY(i), b: colours.getZ(i) }));
    }

    expect(greens.length).toBeGreaterThan(1000);
    const span = (vals: number[]): number => {
      vals.sort((a, b) => a - b);
      return (
        (vals[Math.floor(vals.length * 0.95)] ?? 0) - (vals[Math.floor(vals.length * 0.05)] ?? 0)
      );
    };
    expect(span(greens)).toBeGreaterThan(0.015);
    expect(span(lums)).toBeGreaterThan(0.015);
  });

  it('does not produce a constant colour across the real mesh', () => {
    // The defect being fixed: one flat green across 7 km with no shading
    // signal. A constant surface gives zero spread in every channel.
    const field = generateHeightfield(WORLD_EXTENT_M, 64, 1337);
    const geo = buildTerrainGeometry(field);
    applyTerrainColours(geo);

    const colours = geo.attributes.color;
    if (colours === undefined) throw new Error('terrain has no colour attribute');
    expect(colours.count).toBe(field.res * field.res);

    let minR = 1;
    let maxR = 0;
    let minG = 1;
    let maxG = 0;
    for (let i = 0; i < colours.count; i += 13) {
      minR = Math.min(minR, colours.getX(i));
      maxR = Math.max(maxR, colours.getX(i));
      minG = Math.min(minG, colours.getY(i));
      maxG = Math.max(maxG, colours.getY(i));
    }
    expect(maxR - minR).toBeGreaterThan(0.05);
    expect(maxG - minG).toBeGreaterThan(0.05);
  });

  it('colours the mesh from the same heightfield it was built from', () => {
    // Guards against colouring by a different field than the geometry uses,
    // which would put the wrong shading on the wrong ground.
    const field = generateHeightfield(WORLD_EXTENT_M, 32, 4242);
    const geo = buildTerrainGeometry(field);
    applyTerrainColours(geo);

    const position = geo.attributes.position;
    const normal = geo.attributes.normal;
    const colours = geo.attributes.color;
    if (colours === undefined || normal === undefined || position === undefined) {
      throw new Error('terrain is missing colour, normal, or position attributes');
    }
    expect(colours.count).toBe(position.count);

    // Vertex 0 must match the colour for that vertex's own height and slope.
    const expected = terrainColorAt(position.getY(0), normal.getY(0));
    expect(colours.getX(0)).toBeCloseTo(expected.r, 5);
    expect(colours.getY(0)).toBeCloseTo(expected.g, 5);
    expect(colours.getZ(0)).toBeCloseTo(expected.b, 5);
  });

  it('is deterministic for a given field', () => {
    const field = generateHeightfield(WORLD_EXTENT_M, 32, 99);
    const a = buildTerrainGeometry(field);
    const b = buildTerrainGeometry(field);
    applyTerrainColours(a);
    applyTerrainColours(b);
    expect(Array.from(a.attributes.color?.array ?? [])).toEqual(
      Array.from(b.attributes.color?.array ?? []),
    );
  });
});
