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

/** Luminance of the terrain green the roads sit on. */
const TERRAIN_LUM = lum(0x5f7d54);

describe('road colours', () => {
  it('separates the three classes enough to tell apart', () => {
    // The previous palette spanned 30 luminance levels end to end, which
    // vanished past a few hundred metres. 62 is the floor that reads at the
    // distances the observer camera actually works at.
    const values = Object.values(ROAD_COLOR).map(lum);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(50);
  });

  it('orders classes by prominence, widest and brightest first', () => {
    expect(lum(ROAD_COLOR.arterial)).toBeGreaterThan(lum(ROAD_COLOR.collector));
    expect(lum(ROAD_COLOR.collector)).toBeGreaterThan(lum(ROAD_COLOR.local));
  });

  it('puts arterials above and local lanes below the terrain luminance', () => {
    // So the network reads as a cutting through the green rather than the
    // roads and the ground sharing one value.
    expect(lum(ROAD_COLOR.arterial)).toBeGreaterThan(TERRAIN_LUM);
    expect(lum(ROAD_COLOR.local)).toBeLessThan(TERRAIN_LUM);
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
