import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { ROAD_COLOR } from './scene/roads';

/**
 * The HUD legend shipped stale colour literals after PR #18 retuned the road
 * palette, so the legend described something that was no longer on screen.
 * These assert the HUD reads ROAD_COLOR rather than restating it.
 *
 * The HUD is a client component and this environment has no DOM, so the check
 * is on the source: a literal colour in the legend would reintroduce the bug.
 */

const hudSource = readFileSync(fileURLToPath(new URL('./Hud.tsx', import.meta.url)), 'utf-8');

describe('road legend stays in sync with the renderer', () => {
  it('reads swatch colours from ROAD_COLOR, not from literals', () => {
    // The old bug: `#3a3a3c / #4a4a4d / #58585c` hardcoded in the HUD while the
    // scene rendered `#8f9299 / #6e7278 / #51545a`.
    expect(hudSource).toContain('ROAD_COLOR[');
  });

  it('contains no hardcoded hex colours in rendered output', () => {
    // Any '#rrggbb' the HUD renders is a colour that can drift from the
    // renderer. Comments are excluded on purpose: one records the measured
    // daylight sky for context, and it is not user-visible.
    const markup = hudSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const literals = markup.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(literals).toEqual([]);
  });

  it('keeps the road classes distinguishable in luminance', () => {
    // A legend needs its entries to be told apart at a glance.
    const lum = (hex: number): number => {
      const r = (hex >> 16) & 255;
      const g = (hex >> 8) & 255;
      const b = hex & 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const values = Object.values(ROAD_COLOR).map(lum);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(50);
  });
});

describe('hud copy avoids the banned patterns', () => {
  it('contains no em-dash or en-dash', () => {
    // Section 9.G is a hard ban on U+2014 and U+2013 anywhere visible.
    expect(hudSource).not.toMatch(/[\u2014\u2013]/);
  });

  it('does not join lists with a middle dot', () => {
    // Section 9.F rations the middle dot to one per line; a joined list of
    // names produces several at once.
    expect(hudSource).not.toContain("join(' · ')");
  });

  it('does not advertise build status as a label', () => {
    expect(hudSource.toLowerCase()).not.toContain('phase 0');
  });
});
