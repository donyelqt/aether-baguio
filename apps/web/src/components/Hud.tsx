'use client';

import { LANDMARK_NAMES } from './scene/Landmarks';

const ROAD_LEGEND = [
  { label: 'Arterial', color: '#3a3a3c' },
  { label: 'Collector', color: '#4a4a4d' },
  { label: 'Local', color: '#58585c' },
];

/** Static readout for the world build. Live metrics arrive with the engine. */
export function Hud({
  landmarkCount,
  nodeCount,
  segmentCount,
}: {
  landmarkCount: number;
  nodeCount: number;
  segmentCount: number;
}) {
  return (
    <>
      <div className="hud">
        <h1 className="hud__title">AETHER</h1>
        <p className="hud__subtitle">Central Baguio · phase 0 world</p>
      </div>

      <div className="hud__panel">
        <div className="hud__row">
          <span className="hud__label">Landmarks</span>
          <span className="hud__value">{landmarkCount}</span>
        </div>
        <div className="hud__row">
          <span className="hud__label">Road nodes</span>
          <span className="hud__value">{nodeCount}</span>
        </div>
        <div className="hud__row">
          <span className="hud__label">Road segments</span>
          <span className="hud__value">{segmentCount}</span>
        </div>
        <div className="hud__row">
          <span className="hud__label">Agents</span>
          <span className="hud__value">—</span>
        </div>
      </div>

      <div className="hud__legend">
        <div>
          {ROAD_LEGEND.map((r) => (
            <span key={r.label}>
              <span className="hud__swatch" style={{ background: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
        <div style={{ marginTop: '0.4rem', opacity: 0.65 }}>
          {LANDMARK_NAMES.slice(0, 4).join(' · ')} +{LANDMARK_NAMES.length - 4} more
        </div>
      </div>
    </>
  );
}
