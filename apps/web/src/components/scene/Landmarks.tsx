'use client';

import {
  buildLandmarks,
  buildRoadGraph,
  clearLandmarksFromRoads,
  createProjector,
  type Landmark,
} from '@aether/shared-types';
import { useMemo } from 'react';
import * as THREE from 'three';
import { groundAt } from './Terrain';

/**
 * Landmark meshes.
 *
 * Each landmark is a box standing on the sampled terrain. Parks and terrain
 * features are flat patches instead of volumes, because giving a park a height
 * would misrepresent it — Burnham Park is a lawn, not a building.
 *
 * Boxes rather than imported GLB assets: at this distance the silhouette is all
 * that reads, and a box costs one draw call and zero bytes of payload. Real
 * assets are a Phase 1 concern once the camera can get close enough to see them.
 */

const COLOR: Record<Landmark['kind'], number> = {
  park: 0x4f7a3f,
  civic: 0xb9b3a6,
  religious: 0xd8d2c4,
  commercial: 0x8f9aa8,
  nature: 0x466b38,
};

/** Thin slab so flat features read as ground cover rather than as objects. */
const FLAT_THICKNESS_M = 0.6;

const project = createProjector();
// Clear structures off the carriageways before rendering: OSM places many buildings
// on a street centre line, and a 90 m box straddling an 11 m road looks broken.
const graph = buildRoadGraph(project);
const landmarks = clearLandmarksFromRoads(buildLandmarks(project), graph.nodes, graph.segments);

interface LandmarkMesh {
  landmark: Landmark;
  isFlat: boolean;
}

function meshes(): LandmarkMesh[] {
  return landmarks.map((landmark) => ({
    landmark,
    isFlat: landmark.kind === 'park' || landmark.kind === 'nature',
  }));
}

function Box({ landmark, isFlat }: { landmark: Landmark; isFlat: boolean }) {
  const geometry = useMemo(() => {
    const w = landmark.halfWidth * 2;
    const d = landmark.halfDepth * 2;
    const h = isFlat ? FLAT_THICKNESS_M : landmark.height;
    return new THREE.BoxGeometry(w, h, d);
  }, [landmark, isFlat]);

  // Sit the base on the terrain at the landmark's own position. Sampling the
  // centre only would let a wide building on a slope clip into the ground at
  // one end, so the base is pushed down to the lowest corner it spans.
  const y = useMemo(() => {
    const { x, z, halfWidth: hw, halfDepth: hd } = landmark;
    const corners = [
      groundAt(x - hw, z - hd),
      groundAt(x + hw, z - hd),
      groundAt(x - hw, z + hd),
      groundAt(x + hw, z + hd),
    ];
    const lowest = Math.min(...corners);
    const h = isFlat ? FLAT_THICKNESS_M : landmark.height;
    return lowest + h / 2;
  }, [landmark, isFlat]);

  return (
    <mesh
      geometry={geometry}
      position={[landmark.x, y, landmark.z]}
      castShadow={!isFlat}
      receiveShadow
    >
      <meshStandardMaterial
        color={COLOR[landmark.kind]}
        roughness={isFlat ? 0.98 : 0.75}
        metalness={0}
      />
    </mesh>
  );
}

export function Landmarks() {
  return (
    <group>
      {meshes().map(({ landmark, isFlat }) => (
        <Box key={landmark.id} landmark={landmark} isFlat={isFlat} />
      ))}
    </group>
  );
}

/** Landmark names for the HUD, in map order. */
export const LANDMARK_NAMES = landmarks.map((l) => l.name);
