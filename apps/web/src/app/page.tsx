'use client';

import { buildLandmarks, buildRoadGraph, createProjector } from '@aether/shared-types';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
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
          // Required for screenshot verification: without it the drawing buffer
          // is discarded after compositing, so a canvas readback or screenshot
          // captures black rather than the rendered frame.
          preserveDrawingBuffer: true,
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
