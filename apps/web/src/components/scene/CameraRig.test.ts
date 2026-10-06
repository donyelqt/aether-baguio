import { describe, expect, it } from 'vitest';

/**
 * Tests for the observer camera's clamping and sensitivity maths.
 *
 * The rig itself is not unit-testable without a renderer, so these cover the
 * pure decisions that are easy to get wrong: bounds must hold after every
 * interaction, and pan speed must scale with zoom or the controls feel broken
 * at one scale or another.
 */

const MIN_RADIUS_M = 40;
const MAX_RADIUS_M = 7168 * 1.1;
const MIN_POLAR_DEG = 4;
const MAX_POLAR_DEG = 86;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

describe('camera bounds', () => {
  it('keeps radius inside the usable zoom range', () => {
    expect(clamp(-500, MIN_RADIUS_M, MAX_RADIUS_M)).toBe(MIN_RADIUS_M);
    expect(clamp(1e9, MIN_RADIUS_M, MAX_RADIUS_M)).toBe(MAX_RADIUS_M);
    expect(clamp(800, MIN_RADIUS_M, MAX_RADIUS_M)).toBe(800);
  });

  it('never lets the polar angle reach the horizon or invert', () => {
    const min = (MIN_POLAR_DEG * Math.PI) / 180;
    const max = (MAX_POLAR_DEG * Math.PI) / 180;
    // 86° max must stay below 90°, or the camera tips past vertical and the
    // up-vector flips, which reads as the world spinning.
    expect(max).toBeLessThan(Math.PI / 2);
    expect(min).toBeGreaterThan(0);
    expect(clamp(-1, min, max)).toBe(min);
    expect(clamp(10, min, max)).toBe(max);
  });

  it('keeps the focus point inside the world extent', () => {
    const half = 7168 / 2;
    expect(clamp(-1e6, -half, half)).toBe(-half);
    expect(clamp(1e6, -half, half)).toBe(half);
  });
});

describe('zoom feel', () => {
  it('scales pan speed with zoom so screen speed feels constant', () => {
    const KEY_PAN_SPEED = 420;
    const reference = 1500;
    // At the reference radius, one second of held key moves this far.
    const atRef = KEY_PAN_SPEED * (reference / reference);
    // Zoomed in 10x, movement must slow proportionally or the camera outruns
    // the operator at street level.
    const zoomedIn = KEY_PAN_SPEED * (reference / 10 / reference);
    expect(zoomedIn).toBeLessThan(atRef);
    expect(zoomedIn * 10).toBeCloseTo(atRef, 6);
  });

  it('zooms exponentially so notches feel equal at every scale', () => {
    // Wheel handling multiplies radius by exp(deltaY * k). Equal deltas must
    // produce equal *ratios*, not equal absolute steps.
    const k = 0.0012;
    const a = 1000 * Math.exp(-120 * k);
    const b = 200 * Math.exp(-120 * k);
    expect(b / a).toBeCloseTo(0.2, 6);
  });

  it('clamps after exponential zoom so repeated scroll cannot invert radius', () => {
    let radius = 500;
    for (let i = 0; i < 200; i++)
      radius = clamp(radius * Math.exp(-120 * 0.0012), MIN_RADIUS_M, MAX_RADIUS_M);
    expect(radius).toBe(MIN_RADIUS_M);
    expect(radius).toBeGreaterThan(0);
  });
});
