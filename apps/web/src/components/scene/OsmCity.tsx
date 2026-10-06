'use client';

import { useMemo } from 'react';
import { buildAreaGeometry, buildRoadGeometry, OSM_GREEN, OSM_WATER } from './osmGeometry';

/**
 * The city map, drawn from OpenStreetMap geometry.
 *
 * Burnham's 1905 plan is a radial town on a ridge, not a grid, and that is only
 * legible if the real street network is drawn: the diagonals following the ridges
 * are what make Baguio recognisable as Baguio.
 *
 * Everything merges per class, so the whole network is five draw calls.
 */

/** Green space sits just above the terrain, below the roads. */
const GREEN_LIFT_M = 0.2;
/** Water above green, below roads: the lake is inset in the lawn. */
const WATER_LIFT_M = 0.3;

const MATERIALS = {
  arterial: { color: 0x9aa0a8, roughness: 0.92 },
  collector: { color: 0x777d85, roughness: 0.93 },
  local: { color: 0x5d636b, roughness: 0.95 },
} as const;

export function OsmCity() {
  const geometries = useMemo(
    () => ({
      arterial: buildRoadGeometry('arterial'),
      collector: buildRoadGeometry('collector'),
      local: buildRoadGeometry('local'),
      green: buildAreaGeometry(OSM_GREEN, GREEN_LIFT_M),
      water: buildAreaGeometry(OSM_WATER, WATER_LIFT_M),
    }),
    [],
  );

  return (
    <group>
      <mesh geometry={geometries.green} receiveShadow>
        <meshStandardMaterial color="#3f6b34" roughness={0.97} metalness={0} />
      </mesh>

      <mesh geometry={geometries.water} receiveShadow>
        <meshStandardMaterial
          color="#2f5f7a"
          roughness={0.12}
          metalness={0.15}
          transparent
          opacity={0.92}
        />
      </mesh>

      {(['arterial', 'collector', 'local'] as const).map((cls) => (
        <mesh key={cls} geometry={geometries[cls]} receiveShadow>
          <meshStandardMaterial
            color={MATERIALS[cls].color}
            roughness={MATERIALS[cls].roughness}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

export { OSM_GREEN, OSM_WATER };
