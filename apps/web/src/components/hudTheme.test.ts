import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HUD visual contract.
 *
 * The brutalist theme is only correct if the paper/ink pairings hold WCAG and the
 * panels stay opaque. Both are measured here rather than left to review, because
 * a translucent panel silently inherits whatever is behind it: white over the
 * daylight sky measures 2.11:1, which fails outright, and no amount of careful
 * colour picking fixes a panel that is 40% transparent.
 *
 * Tokens are parsed out of globals.css so this cannot drift from the stylesheet.
 */

const CSS_PATH = join(process.cwd(), 'src/app/globals.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** Value of a `--token:` declaration in the :root block. */
function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (match?.[1] === undefined) throw new Error(`token --${name} not found`);
  return match[1];
}

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.1 relative luminance. */
const relativeLuminance = (hex: string): number => {
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio, rounded down to avoid float noise. */
const contrast = (a: string, b: string): number => {
  const sorted = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((sorted[0] ?? 1) + 0.05) / ((sorted[1] ?? 1) + 0.05);
};

/** The scene's brightest sky, used to prove panels cannot be translucent. */
const DAYLIGHT_SKY = '#87b8e0';

describe('HUD palette', () => {
  it('keeps body text on paper at AA or better', () => {
    // 4.5:1 is the AA floor for text under 18.66px bold / 24px regular.
    expect(contrast(token('hud-ink'), token('hud-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('hud-muted'), token('hud-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('hud-blue'), token('hud-paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps reversed button text readable', () => {
    expect(contrast(token('hud-paper'), token('hud-blue'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('hud-ink'), token('hud-sky'))).toBeGreaterThanOrEqual(4.5);
  });

  it('holds AA on the brightest sky the scene renders', () => {
    // Ink is the only HUD colour permitted to sit directly on the scene.
    expect(contrast(token('hud-ink'), DAYLIGHT_SKY)).toBeGreaterThanOrEqual(4.5);
    // Paper must not, which is exactly why panels cannot be translucent.
    expect(contrast(token('hud-paper'), DAYLIGHT_SKY)).toBeLessThan(4.5);
  });

  it('renders panels opaque', () => {
    // The rule above states paper cannot survive translucency. Enforce it in CSS.
    const panelRule = css.match(/\.hud__panel,\s*\.hud__brand\s*\{([^}]*)\}/);
    expect(panelRule?.[1], 'panel rule not found').toBeDefined();
    const body = panelRule?.[1] ?? '';
    expect(body).toContain('var(--hud-paper)');
    expect(body).not.toMatch(/rgba\(/);
    expect(body).not.toMatch(/\/\s*\d+%\s*\)/); // no alpha channel
    expect(body).not.toContain('backdrop-filter');
  });

  it('uses a square corner, which is what makes it brutalist', () => {
    expect(css).toContain('--hud-radius: 0px');
    // Anchored to the declaration: a bare /radius/ also matches prose in comments.
    // \s* is greedy but the lookahead re-checks, so anchor on the value directly.
    expect(css).not.toMatch(/--hud-radius:\s+[^0\s][^;]*;/);
  });

  it('gives every panel a hard ink border and block shadow', () => {
    expect(css).toContain('border: 2px solid var(--hud-ink)');
    expect(css).toContain('box-shadow: var(--hud-shadow)');
    // A blurred shadow would soften the entire point of the style.
    expect(css).not.toMatch(/box-shadow:[^;]*blur/);
  });

  it('keeps the brand and the scene on the same colour scheme', () => {
    // color-scheme: light makes the browser render form controls and scrollbars
    // to match; left on dark it undercuts the paper theme.
    expect(css).toContain('color-scheme: light');
    expect(css).not.toMatch(/--hud-text\b/);
    expect(css).not.toMatch(/--hud-surface\b/);
    expect(css).not.toMatch(/--hud-border\b/);
  });

  it('does not let the brand collide with the controls on a phone', () => {
    // Regression: both were at 1rem/1rem and the controls covered the wordmark
    // completely at 390px, hiding 126x65 of brand panel.
    const mobile = css.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/);
    expect(mobile?.[1], 'mobile breakpoint not found').toBeDefined();
    const block = mobile?.[1] ?? '';
    const controls = block.match(/\.hud__panel--controls\s*\{([^}]*)\}/);
    expect(controls?.[1], 'mobile controls rule missing').toBeDefined();
    // Brand sits at top:1rem with a 65px box, so controls must start below it.
    expect(controls?.[1]).toMatch(/top:\s*(?!1rem)/);
  });

  it('shows a visible focus ring on every control', () => {
    // Keyboard-only navigation is a requirement, and an invisible ring makes a
    // focusable control unusable without a mouse.
    expect(css).toMatch(
      /\.hud__button:focus-visible\s*\{[^}]*outline:\s*\d+px solid var\(--hud-blue\)/,
    );
  });

  it('keeps the pressed offset under reduced motion', () => {
    // The 2px offset is the only cue separating a latched control from a raised
    // one. It is a static state, not motion, so it must survive the media query.
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
    const body = reduced?.[1] ?? '';
    expect(body).toContain('.hud__button');
    // The blanket transform reset that used to live here is gone.
    expect(body).not.toMatch(/\.hud__button:active\s*\{[^}]*transform:\s*none/);
  });
});
