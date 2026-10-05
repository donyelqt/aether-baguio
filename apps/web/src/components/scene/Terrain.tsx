'use client';

import {
  generateHeightfield,
  type Heightfield,
  sampleHeight,
  WORLD_EXTENT_M,
} from '@aether/shared-types';
import { useMemo } from 'react';
import * as THREE from 'three';

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
  const geometry = useMemo(() => {
    const field = terrainField();
    const res = field.res;
    const half = field.extentM / 2;

    const geo = new THREE.PlaneGeometry(field.extentM, field.extentM, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);

    // PlaneGeometry is row-major with row 0 at +Z after the rotation, and the
    // heightfield is stored the same way, so rows map directly. Each vertex is
    // sampled rather than indexed: bilinear sampling costs nothing at build
    // time and keeps this correct regardless of field indexing conventions.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let row = 0; row < res; row++) {
      const z = half - (row / (res - 1)) * field.extentM;
      for (let col = 0; col < res; col++) {
        const x = -half + (col / (res - 1)) * field.extentM;
        pos.setY(row * res + col, sampleHeight(field, x, z));
      }
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#5f7d54" roughness={0.95} metalness={0} />
    </mesh>
  );
}
