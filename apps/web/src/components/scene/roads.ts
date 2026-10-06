'use client';

import { ROAD_WIDTH_M, type RoadClassValue } from '@aether/shared-types';
import * as THREE from 'three';
import { groundAt } from './Terrain';

/**
 * Roads as draped ribbons.
 *
 * Each segment becomes a quad strip whose corners sit on the sampled terrain, so
 * a road follows the ground instead of cutting through it or floating above.
 *
 * Every road is merged into a single BufferGeometry, grouped by class. That
 * keeps the scene at three draw calls for the whole network rather than one per
 * segment, which matters against the 120-draw-call budget in NFR-3.
 */

/**
 * Road surface by class.
 *
 * The colours are warm asphalt rather than blue-grey. The previous palette was
 * cool, which fought the warm building concrete and read as a separate system;
 * against warm ground and warm buildings the roads are now the one cool-neutral
 * line, so the network reads as cut through the city rather than laid on it.
 *
 * Class separation is measured, not eyeballed. The old palette put arterial at
 * luminance 0.287 and local at 0.088, but both were cool grey at saturation
 * ~0.07, and at viewing distance they merged into one mat. These span 0.065 to
 * 0.144 with warm bias (R >= B), and arterial/local is now a 2.22x luminance
 * ratio against 0.95x before, where the classes were effectively the same tone.
 *
 * The classes deliberately straddle the ground rather than all sitting below it.
 * The terrain band measures 77-116 in byte luminance, so arterial at 164 is a
 * light concrete cutting and local at 72 is dark asphalt: the network reads as
 * a single system with hierarchy, rather than three lines of the same weight.
 */
export const ROAD_COLOR: Record<RoadClassValue, number> = {
  arterial: 0xa8a49c,
  collector: 0x75726c,
  local: 0x4a4844,
};

/** Lift above the terrain, in metres, to avoid z-fighting with the ground. */
const LIFT_M = 0.35;

/**
 * Builds a triangle strip for one segment.
 *
 * The two edges are offset perpendicular to the segment direction in the XZ
 * plane. Elevation is sampled per-vertex rather than per-segment, so a road
 * climbing a slope does not become a flat ribbon hovering over the hill.
 */
function ribbonForSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
): { positions: number[]; indices: number[] } {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { positions: [], indices: [] };

  // Unit normal in the XZ plane.
  const nx = -dz / len;
  const nz = dx / len;
  const hw = width / 2;

  // Extend slightly past the junction so segments meet without visible gaps.
  const ex = (dx / len) * 0.5;
  const ez = (dz / len) * 0.5;
  const ax2 = ax - ex;
  const az2 = az - ez;
  const bx2 = bx + ex;
  const bz2 = bz + ez;

  const positions: number[] = [];
  // Explicitly typed corner pairs: destructuring an array element widens to
  // `number | undefined` under noUncheckedIndexedAccess.
  const corners: Array<[number, number]> = [
    [ax2 + nx * hw, az2 + nz * hw],
    [ax2 - nx * hw, az2 - nz * hw],
    [bx2 + nx * hw, bz2 + nz * hw],
    [bx2 - nx * hw, bz2 - nz * hw],
  ];
  for (const [px, pz] of corners) {
    positions.push(px, groundAt(px, pz) + LIFT_M, pz);
  }

  // Two triangles across the strip.
  const indices = [0, 2, 1, 1, 2, 3];
  return { positions, indices };
}

/** Merges all segments of a class into one geometry. */
export function buildRoadGeometry(
  nodes: readonly { id: number; x: number; z: number }[],
  segments: readonly { from: number; to: number; roadClass: RoadClassValue }[],
  roadClass: RoadClassValue,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  const width = ROAD_WIDTH_M[roadClass];

  for (const seg of segments) {
    if (seg.roadClass !== roadClass) continue;
    const a = nodes.find((n) => n.id === seg.from);
    const b = nodes.find((n) => n.id === seg.to);
    if (a === undefined || b === undefined) continue;

    const { positions: p, indices: i } = ribbonForSegment(a.x, a.z, b.x, b.z, width);
    if (p.length === 0) continue;

    positions.push(...p);
    for (const idx of i) indices.push(idx + vertexOffset);
    vertexOffset += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
