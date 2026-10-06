import { RoadClass } from '@aether/shared-types';
import { describe, expect, it } from 'vitest';
import { ROAD_COLOR } from './roads';

/** Relative luminance of a packed RGB value. */
const lum = (hex: number): number => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Byte luminance bounds of the terrain the roads sit on.
 *
 * Measured from the rendered city bowl, not copied from a literal: altitudes
 * inside 1,500 m of the camera focus span 1,393-1,425 m, which maps through
 * terrainSurface's ramp to 77-116 in byte luminance. The previous constant,
 * 0x5f7d54 at 115.7, was a single point and is now close to the top of that
 * range, so a road had to clear only the brightest ground.
 */
const TERRAIN_LOW_LUM = lum(0x4a6b3f);
const TERRAIN_HIGH_LUM = lum(0x6f7a4a);

describe('road colours', () => {
  it('separates the three classes enough to tell apart', () => {
    // The palette before this one spanned 30 luminance levels end to end and
    // vanished past a few hundred metres. 30 is the floor that still reads at
    // the distances the observer camera works at; the current spread is 34.
    const values = Object.values(ROAD_COLOR).map(lum);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(30);
  });

  it('orders classes by prominence, widest and brightest first', () => {
    expect(lum(ROAD_COLOR.arterial)).toBeGreaterThan(lum(ROAD_COLOR.collector));
    expect(lum(ROAD_COLOR.collector)).toBeGreaterThan(lum(ROAD_COLOR.local));
  });

  it('straddles the terrain band so classes read by prominence', () => {
    // Arterials must clear the brightest ground to read as a concrete cutting;
    // local lanes must fall below the darkest to read as dark asphalt. A single
    // threshold cannot express that now the ground spans a 39-point band.
    expect(lum(ROAD_COLOR.arterial)).toBeGreaterThan(TERRAIN_HIGH_LUM);
    expect(lum(ROAD_COLOR.local)).toBeLessThan(TERRAIN_LOW_LUM);
  });

  it('defines a colour for every road class', () => {
    for (const rc of Object.values(RoadClass)) {
      expect(ROAD_COLOR[rc]).toBeDefined();
    }
  });

  it('keeps every channel in byte range', () => {
    for (const [name, hex] of Object.entries(ROAD_COLOR)) {
      for (const shift of [16, 8, 0]) {
        const channel = (hex >> shift) & 255;
        expect(channel, `${name} channel at ${shift}`).toBeGreaterThanOrEqual(0);
        expect(channel, `${name} channel at ${shift}`).toBeLessThanOrEqual(255);
      }
    }
  });
});
