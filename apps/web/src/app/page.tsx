'use client';

import { buildLandmarks, buildRoadGraph, createProjector } from '@aether/shared-types';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { Hud } from '../components/Hud';
import { CityScene } from '../components/scene/CityScene';

const project = createProjector();
const graph = buildRoadGraph(project);
const landmarks = buildLandmarks(project);

export default function Page() {
  return (
    <>
      <Canvas
        className="aether-canvas"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 1, far: 20000, position: [2100, 2300, 2100] }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          // ACES rolls off highlights instead of clipping them. Without tone
          // mapping a sun intensity of 2.5 drives lit surfaces past 1.0 and they
          // flatten to white, which is what made every landmark read as a
          // featureless silhouette at noon.
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          // Verification only. Keeping the drawing buffer alive costs a copy
          // every frame, so it is dev-only; production screenshots come from
          // the composited canvas instead.
          preserveDrawingBuffer: process.env.NODE_ENV !== 'production',
        }}
      >
        <Suspense fallback={null}>
          <CityScene />
        </Suspense>
      </Canvas>

      <Hud
        landmarkCount={landmarks.length}
        nodeCount={graph.nodes.length}
        segmentCount={graph.segments.length}
      />
    </>
  );
}
