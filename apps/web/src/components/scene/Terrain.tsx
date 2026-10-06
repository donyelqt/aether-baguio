'use client';

import {
  generateHeightfield,
  type Heightfield,
  sampleHeight,
  WORLD_EXTENT_M,
} from '@aether/shared-types';
import { useMemo } from 'react';
import { buildTerrainGeometry } from './terrainGeometry';
import { applyTerrainColours } from './terrainSurface';

/**
 * Terrain surface.
 *
 * The heightfield is generated once and shared with the roads and landmarks, so
 * geometry sits flush on the ground instead of floating above or sinking into
 * it. Three.js treats +y as up, so the local ENU frame (x east, z north) maps
 * directly onto the XZ ground plane with no axis conversion.
 */

/** Grid resolution. 192² is ~37k vertices, well inside the draw-call budget. */
const TERRAIN_RES = 192;

/** Fixed seed so the world is reproducible across sessions (NFR-1). */
const TERRAIN_SEED = 1337;

let cachedField: Heightfield | null = null;

function terrainField(): Heightfield {
  cachedField ??= generateHeightfield(WORLD_EXTENT_M, TERRAIN_RES, TERRAIN_SEED);
  return cachedField;
}

/** Shared accessor so roads and landmarks sample the identical surface. */
export function getTerrain(): Heightfield {
  return terrainField();
}

/** Ground height at a world position, in metres. */
export function groundAt(x: number, z: number): number {
  return sampleHeight(terrainField(), x, z);
}

export function Terrain() {
  // Geometry comes from the shared builder so the test suite exercises the
  // same code path the renderer does.
  const geometry = useMemo(() => {
    const field = terrainField();
    const geo = buildTerrainGeometry(field);
    applyTerrainColours(geo);
    return geo;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      {/* vertexColors lets the altitude and slope ramp reach the material; the
          base colour is only a fallback before the attribute is read. */}
      <meshStandardMaterial vertexColors color="#5f7d54" roughness={0.95} metalness={0} />
    </mesh>
  );
}
