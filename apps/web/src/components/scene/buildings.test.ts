import { describe, expect, it } from 'vitest';
import { BUILDING_BANDS, BUILDING_STATS, BUILDING_STEP_M } from './buildings.generated';

/**
 * Guards the generated building data.
 *
 * The failure this exists to catch is real and already happened twice during
 * the extraction: an int16 encoding silently dropped 754 real buildings, and a
 * height formula collapsed 99% of them onto a 4 m floor. Both produced a
 * plausible-looking city that was quietly wrong.
 */

describe('building data', () => {
  it('holds a real number of footprints', () => {
    // An empty or near-empty array means the OSM fetch failed, not that Baguio
    // has no buildings.
    expect(BUILDING_STATS.footprints).toBeGreaterThan(10_000);
  });

  it('is attributed', () => {
    expect(BUILDING_STATS.attribution).toMatch(/OpenStreetMap/);
    expect(BUILDING_STATS.attribution).toMatch(/ODbL/);
  });

  it('dropped nothing for encoding range', () => {
    // Every footprint is real data. Silently discarding any is a defect, not a
    // trade-off, so this must be zero.
    expect(BUILDING_STATS.skippedOutsideInt16).toBe(0);
  });

  it('has more measured heights than a token amount', () => {
    // Only 2% of OSM carries a height tag. This proves the extractor still
    // reads them rather than inferring everything.
    expect(BUILDING_STATS.measuredHeights).toBeGreaterThan(100);
    expect(BUILDING_STATS.inferredHeights).toBeGreaterThan(1000);
  });

  it('covers the residential core, which is most of the city', () => {
    const total = BUILDING_STATS.footprints;
    const residential =
      (BUILDING_BANDS.residential?.count ?? 0) + (BUILDING_BANDS.default?.count ?? 0);
    // Baguio is low-rise. A map dominated by commercial or civic volumes means
    // the band mapping is wrong.
    expect(residential / total).toBeGreaterThan(0.8);
  });

  it('has footprints in every declared band', () => {
    for (const [name, band] of Object.entries(BUILDING_BANDS)) {
      expect(band.count, `${name} should have buildings`).toBeGreaterThan(0);
    }
  });
});

describe('building encoding', () => {
  it('fits int32 across the world', () => {
    // The bug: at 10 cm, the 7,168 m world needed 35,840 steps against an
    // int16 ceiling of 32,767. At 5 cm packed as int32 there is no ceiling to
    // hit, but the coordinate range must still be inside the world.
    const limit = (7168 / 2 / BUILDING_STEP_M) * 1.001;
    let maxAbs = 0;
    for (const band of Object.values(BUILDING_BANDS)) {
      for (let i = 0; i < band.rings.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(band.rings[i] ?? 0));
      }
    }
    expect(maxAbs).toBeLessThan(limit);
  });

  it('quantises finely enough that building edges do not stair-step', () => {
    // 5 cm on a 7 km world. Coarser than 20 cm and a wall visibly jitters.
    expect(BUILDING_STEP_M).toBeLessThanOrEqual(0.05);
  });

  it('keeps every footprint internally consistent', () => {
    for (const [name, band] of Object.entries(BUILDING_BANDS)) {
      // One [offset, vertexCount, heightCm] triple per footprint.
      expect(band.footprints.length, name).toBe(band.count * 3);

      for (let f = 0; f < band.count; f++) {
        const off = band.footprints[f * 3] ?? -1;
        const nPts = band.footprints[f * 3 + 1] ?? 0;
        const heightCm = band.footprints[f * 3 + 2] ?? 0;

        // A footprint needs at least a triangle to be a footprint.
        expect(nPts, `${name}[${f}]`).toBeGreaterThanOrEqual(3);
        // Ring data must stay inside the buffer.
        expect(off + nPts, `${name}[${f}] offset+count`).toBeLessThanOrEqual(band.rings.length / 2);
        // No zero-height or absurd buildings.
        expect(heightCm, `${name}[${f}] height`).toBeGreaterThan(200);
        expect(heightCm, `${name}[${f}] height`).toBeLessThan(20000);
      }
    }
  });

  it('varies height, so the city is not a field of identical blocks', () => {
    // The second real bug: every building collapsed onto the same 4 m floor.
    // If the heights are near-constant the formula has lost its dynamic range.
    const heights = new Set<number>();
    for (const band of Object.values(BUILDING_BANDS)) {
      for (let f = 0; f < band.count; f++) heights.add(band.footprints[f * 3 + 2] ?? 0);
    }
    expect(heights.size).toBeGreaterThan(20);
  });

  it('puts the CBD towers in the commercial band, not scattered everywhere', () => {
    // Commercial is where the tall buildings belong. If the tallest default
    // band building is as tall as a commercial one, the band mapping is wrong.
    const tallest = (name: string): number => {
      const band = BUILDING_BANDS[name];
      if (band === undefined) return 0;
      let max = 0;
      for (let f = 0; f < band.count; f++) {
        max = Math.max(max, band.footprints[f * 3 + 2] ?? 0);
      }
      return max;
    };
    expect(tallest('commercial')).toBeGreaterThan(tallest('default'));
  });
});
