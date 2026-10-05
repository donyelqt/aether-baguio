import { describe, expect, it } from 'vitest';
import { skyColors, sunPosition } from './DayNight';

describe('sun position', () => {
  it('rises in the east (+x) and sets in the west (-x)', () => {
    const dawn = sunPosition(172, 6);
    const dusk = sunPosition(172, 18);
    expect(dawn.x).toBeGreaterThan(0);
    expect(dusk.x).toBeLessThan(0);
  });

  it('is highest near solar noon', () => {
    expect(sunPosition(172, 12).y).toBeGreaterThan(sunPosition(172, 9).y);
    expect(sunPosition(172, 12).y).toBeGreaterThan(sunPosition(172, 15).y);
  });

  it('is below the horizon at midnight', () => {
    const night = sunPosition(172, 0);
    expect(night.y).toBeLessThan(0);
    expect(night.daylight).toBe(0);
  });

  it('tracks north of the zenith at Baguio latitude during the solstice', () => {
    // At 16°N the midday sun is north of the zenith around June, so its z
    // component stays positive. A naive model would put it due south.
    const noon = sunPosition(172, 12);
    expect(noon.z).toBeGreaterThan(0);
  });

  it('returns a unit vector', () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      const s = sunPosition(172, hour);
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
    }
  });

  it('produces full daylight at noon on the solstice', () => {
    expect(sunPosition(172, 12).daylight).toBe(1);
  });

  it('is dark at midnight and bright at noon on every day of the year', () => {
    for (let day = 1; day <= 365; day += 30) {
      expect(sunPosition(day, 0).daylight).toBe(0);
      expect(sunPosition(day, 12).daylight).toBeGreaterThan(0.9);
    }
  });
});

describe('sky colors', () => {
  it('returns a dark sky at night and a bright one at noon', () => {
    const night = skyColors(0);
    const noon = skyColors(1);
    expect(night.sky).not.toBe(noon.sky);
    expect(noon.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(noon.ambient).toBeGreaterThan(night.ambient);
  });

  it('interpolates monotonically between the two ends', () => {
    let previous = -1;
    for (let d = 0; d <= 1.0001; d += 0.1) {
      const { sunIntensity } = skyColors(d);
      expect(sunIntensity).toBeGreaterThanOrEqual(previous);
      previous = sunIntensity;
    }
  });
});
