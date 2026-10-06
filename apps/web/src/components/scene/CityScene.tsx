'use client';

import { buildRoadGraph, createProjector, RoadClass, WORLD_EXTENT_M } from '@aether/shared-types';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { skyColors, sunPosition } from './DayNight';
import { Landmarks } from './Landmarks';
import { buildRoadGeometry, ROAD_COLOR } from './roads';
import { SceneProbe } from './SceneProbe';
import { Terrain } from './Terrain';

/**
 * The city scene.
 *
 * Assembles terrain, roads, and landmarks, and drives the day/night cycle from
 * a single clock so the sun, sky, and fog always agree with each other.
 *
 * Draw-call budget: terrain (1) + three road classes (3) + one mesh per
 * landmark (11) + lights. Far inside the 120 budget in NFR-3; landmarks move to
 * InstancedMesh in Phase 1 when the agent count makes the difference.
 */

/** Simulated hours per real second. The clock is a view concern, not sim state. */
const HOURS_PER_SECOND = 0.9;

const project = createProjector();
const graph = buildRoadGraph(project);

const ROAD_CLASSES = [RoadClass.ARTERIAL, RoadClass.COLLECTOR, RoadClass.LOCAL] as const;

/** Distance the observer camera sits from the city centre; drives fog placement. */
const CAMERA_DISTANCE_M = 2100;

function Roads() {
  const geometries = useMemo(
    () => ROAD_CLASSES.map((rc) => buildRoadGeometry(graph.nodes, graph.segments, rc)),
    [],
  );

  return (
    <group>
      {ROAD_CLASSES.map((rc, i) => (
        <mesh key={rc} geometry={geometries[i]} receiveShadow>
          <meshStandardMaterial color={ROAD_COLOR[rc]} roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Drives sun, ambient light, sky, and fog from one clock.
 *
 * Kept as a single component so the four cannot drift out of sync — four
 * independent effects would eventually disagree about what time it is.
 */
function DayNightCycle({ paused }: { paused: boolean }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();

  // Start at 08:00 on the June solstice: long shadows, sun well up.
  const clock = useRef({ hours: 8 });
  const fog = useMemo(
    () => new THREE.Fog('#a8c4d8', CAMERA_DISTANCE_M, CAMERA_DISTANCE_M * 2.6),
    [],
  );

  useEffect(() => {
    scene.fog = fog;
    scene.background = new THREE.Color('#87b8e0');
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fog]);

  useFrame((_, delta) => {
    if (!paused) {
      clock.current.hours = (clock.current.hours + delta * HOURS_PER_SECOND) % 24;
    }
    const { x, y, z, daylight } = sunPosition(172, clock.current.hours);
    const colors = skyColors(daylight);

    const sun = sunRef.current;
    if (sun) {
      sun.position.set(x * 3000, Math.max(1, y * 3000), z * 3000);
      sun.color.set(colors.sun);
      sun.intensity = colors.sunIntensity;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = colors.ambient;
    }
    if (scene.background instanceof THREE.Color) scene.background.set(colors.sky);
    fog.color.set(colors.fog);
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={0.5} />
      {/* Shadow frustum sized to the city so the map casts rather than the
          default tight box, which would leave most of it unshadowed. */}
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-WORLD_EXTENT_M / 2}
        shadow-camera-right={WORLD_EXTENT_M / 2}
        shadow-camera-top={WORLD_EXTENT_M / 2}
        shadow-camera-bottom={-WORLD_EXTENT_M / 2}
        shadow-camera-near={100}
        shadow-camera-far={8000}
        shadow-bias={-0.0005}
      />
    </group>
  );
}

export function CityScene({ paused = false }: { paused?: boolean }) {
  return (
    <>
      <DayNightCycle paused={paused} />
      <SceneProbe />
      <CameraRig />
      <Terrain />
      <Roads />
      <Landmarks />
    </>
  );
}
