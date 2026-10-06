'use client';

import { BASE_ELEVATION_M, RIDGE_HEIGHT_M } from '@aether/shared-types';
import * as THREE from 'three';

/**
 * Terrain surface colouring.
 *
 * A single flat green over 7 km reads as an unfinished block, which is what the
 * terrain looked like: no variation at all, so the ridges had nothing to
 * separate them from the valley floor.
 *
 * Two signals drive the colour, both derived from the heightfield rather than
 * painted on:
 *
 * - **Altitude.** Valley floor, mid slope, then exposed rock near the ridge.
 * - **Slope.** Steep faces read as rock or scree regardless of height, which is
 *   what gives the ridges their form.
 *
 * Vertex colours rather than a texture: no asset to load, no UVs to author, and
 * the result is derived from the same field the geometry is built from, so it
 * cannot drift out of sync with the surface.
 */

/** Valley floor: Baguio's pine-and-grass shelf. */
const LOW = new THREE.Color('#4a6b3f');
/** Mid slope, warmer and drier. */
const MID = new THREE.Color('#6f7a4a');
/** Exposed ridge. */
const HIGH = new THREE.Color('#8d8b7a');
/** Rock on steep faces at any altitude. */
const ROCK = new THREE.Color('#7a7368');

/**
 * Slope at which a face is treated as rock, from the surface normal's Y.
 *
 * Measured rather than assumed: across the whole 7168 m field the generated
 * terrain's normals span only 0.965 to 1.000, because the bowl is deliberately
 * smooth (relief is damped inside the bowl and the ridge rise is spread over
 * kilometres). An earlier threshold of 0.86 was never reached by any vertex,
 * which made the rock blend dead code and left the ridges flat green.
 */
const ROCK_NORMAL_Y = 0.985;

/** Normal-Y span the rock blend covers, from the measured minimum. */
const STEEP_FLOOR_Y = 0.962;

export function terrainColorAt(height: number, normalY: number): THREE.Color {
  // Altitude ramp, normalised across the field's own range so it stays correct
  // if the ridge height changes.
  const t = THREE.MathUtils.clamp((height - BASE_ELEVATION_M) / (RIDGE_HEIGHT_M * 0.85), 0, 1);
  const base = t < 0.5 ? LOW.clone().lerp(MID, t * 2) : MID.clone().lerp(HIGH, (t - 0.5) * 2);

  // Blend toward rock by how far the surface tips away from flat.
  const steepness = THREE.MathUtils.clamp(
    (ROCK_NORMAL_Y - normalY) / (ROCK_NORMAL_Y - STEEP_FLOOR_Y),
    0,
    1,
  );
  return base.lerp(ROCK, steepness * 0.85);
}

/**
 * Builds the geometry's colour attribute from the heightfield.
 *
 * Normals are read back off the built geometry rather than recomputed, so the
 * shading can never disagree with what is actually rendered.
 */
export function applyTerrainColours(geometry: THREE.BufferGeometry): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    terrainColorAt(position.getY(i), normal.getY(i)).toArray(colours, i * 3);
  }
  void colour;

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}
