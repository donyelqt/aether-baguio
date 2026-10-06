import {
  generateHeightfield,
  type Heightfield,
  sampleHeight,
  WORLD_EXTENT_M,
} from '@aether/shared-types';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrainGeometry } from './terrainGeometry';

/**
 * Guards the terrain mesh's orientation.
 *
 * Regression: the vertex loop once derived z as `half - row * step`, but
 * PlaneGeometry rotated -90° about X puts vertex row 0 at -Z. That mirrored the
 * terrain north-south and detached every road and landmark from the ground it
 * belongs to — invisible in a wide shot, obvious at street level.
 *
 * These tests call the production builder rather than reimplementing it. An
 * earlier version duplicated the loop, which made it blind to the bug: the same
 * mistake in the helper cancelled out against the same mistake in the code.
 */

const field: Heightfield = generateHeightfield(WORLD_EXTENT_M, 64, 1337);

describe('terrain orientation', () => {
  it('establishes the PlaneGeometry orientation this depends on', () => {
    // If three.js ever changes its vertex order, this fails first and the fix
    // is re-derivation rather than a silent mirror.
    const probe = new THREE.PlaneGeometry(1000, 1000, 4, 4);
    probe.rotateX(-Math.PI / 2);
    const p = probe.attributes.position as THREE.BufferAttribute;
    expect(p.getZ(0)).toBeLessThan(0);
    expect(p.getZ(4 * 4)).toBeGreaterThan(0);
  });

  it('writes each vertex height from the field at that vertex position', () => {
    const geo = buildTerrainGeometry(field);
    const pos = geo.attributes.position as THREE.BufferAttribute;

    // Sample vertices across the whole grid, reading XZ from the geometry so
    // no assumption about vertex order leaks into the assertion.
    for (const idx of [0, 1, 63, 64, 1000, 2000, pos.count - 1]) {
      expect(pos.getY(idx)).toBeCloseTo(sampleHeight(field, pos.getX(idx), pos.getZ(idx)), 3);
    }
  });

  it('is not mirrored north-south', () => {
    const geo = buildTerrainGeometry(field);
    const pos = geo.attributes.position as THREE.BufferAttribute;

    // The south-west corner vertex must carry the field's height for that
    // corner. A mirrored mesh would put the north-west value there instead.
    const swCorner = sampleHeight(field, -WORLD_EXTENT_M / 2, -WORLD_EXTENT_M / 2);
    const nwField = sampleHeight(field, -WORLD_EXTENT_M / 2, WORLD_EXTENT_M / 2);
    // The terrain is asymmetric along z, so these genuinely differ.
    expect(Math.abs(swCorner - nwField)).toBeGreaterThan(1);

    // Vertex row 0 sits at the south edge, so it must match the south sample.
    expect(pos.getY(0)).toBeCloseTo(sampleHeight(field, pos.getX(0), pos.getZ(0)), 3);
  });

  it('produces upward-facing normals', () => {
    const geo = buildTerrainGeometry(field);
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    let up = 0;
    for (let i = 0; i < normals.count; i++) {
      if (normals.getY(i) > 0) up++;
    }
    expect(up / normals.count).toBeGreaterThan(0.95);
  });

  it('agrees with the ground sampler roads and landmarks use', () => {
    // Roads call groundAt(), which is sampleHeight on this same field. If the
    // mesh disagreed, roads would float or sink — the failure that motivated
    // this file. Compared at grid vertices so the tolerance is meaningful.
    const geo = buildTerrainGeometry(field);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    let maxDelta = 0;
    for (let idx = 0; idx < pos.count; idx += 37) {
      const expected = sampleHeight(field, pos.getX(idx), pos.getZ(idx));
      maxDelta = Math.max(maxDelta, Math.abs(pos.getY(idx) - expected));
    }
    expect(maxDelta).toBeLessThan(0.001);
  });

  it('has a bounding sphere that covers the mesh', () => {
    const geo = buildTerrainGeometry(field);
    expect(geo.boundingSphere).not.toBeNull();
    // Radius must at least reach the corner distance from the centre.
    expect(geo.boundingSphere!.radius).toBeGreaterThan(WORLD_EXTENT_M * 0.6);
  });
});
