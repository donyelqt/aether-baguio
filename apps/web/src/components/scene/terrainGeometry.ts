'use client';

import { type Heightfield, sampleHeight } from '@aether/shared-types';
import * as THREE from 'three';

/**
 * Builds the terrain mesh geometry.
 *
 * This lives apart from the React component so tests exercise the same code the
 * renderer runs. An earlier version duplicated this logic inside the test, which
 * made the test blind to the exact bug it was written for: a shared mistake in
 * the vertex loop cancels out when the test derives its coordinates the same
 * wrong way.
 *
 * Orientation, which is the whole point of extracting this:
 *
 * PlaneGeometry's vertex row 0 sits at -Z after `rotateX(-PI / 2)` — verified
 * against three 0.186, where vertex [0,0] lands at z = -extent/2 and
 * [res-1,0] at z = +extent/2. The heightfield is indexed the other way round
 * (its row 0 is north), so z rises with row. Deriving it the other direction
 * mirrors the terrain north-south and silently detaches every road and
 * landmark from the ground beneath it.
 */
export function buildTerrainGeometry(field: Heightfield): THREE.BufferGeometry {
  const res = field.res;
  const half = field.extentM / 2;

  const geo = new THREE.PlaneGeometry(field.extentM, field.extentM, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let row = 0; row < res; row++) {
    const z = -half + (row / (res - 1)) * field.extentM;
    for (let col = 0; col < res; col++) {
      const x = -half + (col / (res - 1)) * field.extentM;
      pos.setY(row * res + col, sampleHeight(field, x, z));
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
