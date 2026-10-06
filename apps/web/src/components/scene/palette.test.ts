import { describe, expect, it } from 'vitest';
import { BAND_STYLE } from './Buildings';
import { ROAD_COLOR } from './roads';

/**
 * Palette separation, measured.
 *
 * The defect these guard: every building band sat at 0.07-0.13 saturation and the
 * road classes were effectively one cool grey, so the whole city rendered as a
 * single undifferentiated mass. Distinctness on screen is a measurable property,
 * so it is measured rather than asserted by eye.
 */

const relLuminance = (hex: number): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((hex >> 16) & 255);
  const g = channel((hex >> 8) & 255);
  const b = channel(hex & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const saturation = (hex: number): number => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

const hueDegrees = (hex: number): number => {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (((raw * 60) % 360) + 360) % 360;
};

/** Circular hue distance, since 350 and 10 are adjacent, not far apart. */
const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(hueDegrees(a) - hueDegrees(b)) % 360;
  return Math.min(d, 360 - d);
};

const lumaRatio = (a: number, b: number): number => {
  const sorted = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (sorted[0] ?? 1) / (sorted[1] ?? 1);
};

/** Real band populations, from the extractor. */
const BAND_COUNT: Record<string, number> = {
  default: 12659,
  residential: 2230,
  civic: 382,
  commercial: 370,
  utility: 91,
  religious: 30,
};
const TOTAL = Object.values(BAND_COUNT).reduce((a, b) => a + b, 0);

/** Bands with enough footprints to affect how the city reads. */
const VISIBLE_BANDS = Object.keys(BAND_COUNT).filter((n) => (BAND_COUNT[n] ?? 0) / TOTAL >= 0.005);

describe('building band palette', () => {
  it('styles every band that has footprints', () => {
    for (const band of Object.keys(BAND_COUNT)) {
      expect(BAND_STYLE[band], `${band} is missing a style`).toBeDefined();
    }
  });

  it('carries enough saturation to read as distinct materials', () => {
    // The old palette: 0.066-0.130, i.e. all effectively neutral cream.
    for (const [band, style] of Object.entries(BAND_STYLE)) {
      expect(saturation(style.color), `${band} is too desaturated`).toBeGreaterThan(0.13);
    }
  });

  it('separates every band that carries a visible share of the city', () => {
    // Bands must differ by a luminance ratio above 1.22 or a hue delta above 25
    // degrees. Luminance alone cannot separate five bands along one axis, so the
    // cool civic and commercial bands are split from the warm bulk by hue.
    //
    // religious is exempt at 0.2% of footprints: 30 buildings cannot change how
    // the city reads, and it sits between default and residential on both axes.
    for (let i = 0; i < VISIBLE_BANDS.length; i++) {
      for (let j = i + 1; j < VISIBLE_BANDS.length; j++) {
        const a = VISIBLE_BANDS[i] as string;
        const b = VISIBLE_BANDS[j] as string;
        const ca = BAND_STYLE[a]?.color ?? 0;
        const cb = BAND_STYLE[b]?.color ?? 0;
        const distinct = lumaRatio(ca, cb) > 1.22 || hueDistance(ca, cb) > 25;
        expect(
          distinct,
          `${a} (${ca.toString(16)}) vs ${b} (${cb.toString(16)}) are indistinguishable`,
        ).toBe(true);
      }
    }
  });

  it('splits the city into a warm residential bulk and cool civic mass', () => {
    // The districts are legible because they differ in hue family, not only
    // lightness: warm 32-38 for the housing bands, cool 211-215 for the rest.
    const warm = ['default', 'residential', 'utility'].map((n) =>
      hueDegrees(BAND_STYLE[n]?.color ?? 0),
    );
    const cool = ['civic', 'commercial'].map((n) => hueDegrees(BAND_STYLE[n]?.color ?? 0));
    for (const h of warm) expect(h).toBeLessThan(90);
    for (const h of cool) expect(h).toBeGreaterThan(170);
    for (const h of cool) expect(h).toBeLessThan(260);
  });

  it('keeps the dominant band lighter than the ground it stands on', () => {
    // Buildings must not sink into the terrain. Terrain sits around 0.15-0.35.
    expect(relLuminance(BAND_STYLE.default?.color ?? 0)).toBeGreaterThan(0.4);
  });

  it('weights the dominant band as the city majority', () => {
    // default is 80.3% of footprints, so it is the colour the player reads first.
    expect((BAND_COUNT.default ?? 0) / TOTAL).toBeGreaterThan(0.7);
  });
});

describe('road palette', () => {
  it('separates the road classes by luminance', () => {
    // Before: arterial 0.287 vs local 0.088, but both cool grey at saturation
    // ~0.07, merging into one mat at distance. Now arterial/local is 2.2x.
    expect(lumaRatio(ROAD_COLOR.arterial, ROAD_COLOR.local)).toBeGreaterThan(1.5);
  });

  it('orders the classes light to dark', () => {
    expect(relLuminance(ROAD_COLOR.arterial)).toBeGreaterThan(relLuminance(ROAD_COLOR.collector));
    expect(relLuminance(ROAD_COLOR.collector)).toBeGreaterThan(relLuminance(ROAD_COLOR.local));
  });

  it('straddles the terrain band so classes read by prominence', () => {
    // The road classes deliberately bracket the ground rather than all sitting
    // below it: arterial is a light concrete cutting, local is dark asphalt.
    // The terrain band measures 0.15-0.35 in relative luminance, so arterial
    // must clear the top of it and local must fall under the bottom.
    expect(relLuminance(ROAD_COLOR.arterial)).toBeGreaterThan(0.35);
    expect(relLuminance(ROAD_COLOR.local)).toBeLessThan(0.15);
  });
});
