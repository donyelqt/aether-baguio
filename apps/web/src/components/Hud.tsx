'use client';

import { TIME_SCALES, useHud } from '../state/hud';
import { LANDMARK_NAMES } from './scene/Landmarks';
import { ROAD_COLOR } from './scene/roads';

/**
 * Operator HUD.
 *
 * A readout over a live 3D scene, not a page. Three constraints drive every
 * decision here:
 *
 * 1. It floats over a scene that swings from night to bright daylight, so every
 *    text sits on a panel rather than relying on a text-shadow for legibility.
 *    Measured over the daylight sky (#87b8e0), bare text fails at 1.81:1; the
 *    panel clears AA at 10.97:1 over the same sky.
 * 2. Panels must not eat camera drags. They are `pointer-events: none` with
 *    controls re-enabled individually, so a drag starting on a panel still
 *    reaches the canvas.
 * 3. The legend reads its colours from ROAD_COLOR rather than restating them,
 *    so it cannot drift from what is actually rendered.
 */

/** Legend swatches come from the renderer, never from a copied literal. */
const ROAD_LEGEND = [
  { label: 'Arterial', roadClass: 'arterial' },
  { label: 'Collector', roadClass: 'collector' },
  { label: 'Local', roadClass: 'local' },
] as const satisfies readonly { label: string; roadClass: keyof typeof ROAD_COLOR }[];

function toCssHex(packed: number): string {
  return `#${packed.toString(16).padStart(6, '0')}`;
}

export function Hud({
  landmarkCount,
  nodeCount,
  segmentCount,
}: {
  landmarkCount: number;
  nodeCount: number;
  segmentCount: number;
}) {
  const paused = useHud((s) => s.paused);
  const timeScale = useHud((s) => s.timeScale);
  const setTimeScale = useHud((s) => s.setTimeScale);
  const togglePause = useHud((s) => s.togglePause);

  return (
    <>
      <header className="hud__brand">
        <h1 className="hud__title">AETHER</h1>
        <p className="hud__subtitle">Central Baguio</p>
      </header>

      <div className="hud__panel hud__panel--stats">
        <dl className="hud__stats">
          <div className="hud__row">
            <dt className="hud__label">Landmarks</dt>
            <dd className="hud__value">{landmarkCount}</dd>
          </div>
          <div className="hud__row">
            <dt className="hud__label">Road nodes</dt>
            <dd className="hud__value">{nodeCount}</dd>
          </div>
          <div className="hud__row">
            <dt className="hud__label">Road segments</dt>
            <dd className="hud__value">{segmentCount}</dd>
          </div>
          <div className="hud__row">
            <dt className="hud__label">Agents</dt>
            <dd className="hud__value hud__value--pending">0</dd>
          </div>
        </dl>
        <p className="hud__note">Agent simulation begins in the next build.</p>
      </div>

      <div className="hud__panel hud__panel--controls">
        <fieldset className="hud__group">
          <legend className="hud__groupLabel">Time scale</legend>
          <div className="hud__buttons">
            {TIME_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`hud__button${timeScale === scale && !paused ? ' hud__button--on' : ''}`}
                aria-pressed={timeScale === scale && !paused}
                onClick={() => setTimeScale(scale)}
              >
                {scale}x
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          className={`hud__button hud__button--wide${paused ? ' hud__button--on' : ''}`}
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <ul className="hud__keys">
          <li>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            <span>Move</span>
          </li>
          <li>
            <kbd>Drag</kbd>
            <span>Orbit</span>
          </li>
          <li>
            <kbd>Right-drag</kbd>
            <span>Pan</span>
          </li>
          <li>
            <kbd>Wheel</kbd>
            <span>Zoom</span>
          </li>
          <li>
            <kbd>Q</kbd>
            <kbd>E</kbd>
            <span>Height</span>
          </li>
        </ul>
      </div>

      <div className="hud__panel hud__panel--legend">
        <span className="hud__groupLabel">Road classes</span>
        <ul className="hud__legend">
          {ROAD_LEGEND.map(({ label, roadClass }) => (
            <li key={roadClass} className="hud__legendRow">
              <span
                className="hud__swatch"
                style={{ background: toCssHex(ROAD_COLOR[roadClass]) }}
              />
              {label}
            </li>
          ))}
        </ul>
        <p className="hud__note">{`${LANDMARK_NAMES.length} places modelled, all within 250 m of a road.`}</p>
      </div>
    </>
  );
}
