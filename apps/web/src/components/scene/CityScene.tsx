'use client';

import { buildRoadGraph, createProjector, RoadClass, WORLD_EXTENT_M } from '@aether/shared-types';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { type TimeScale, useHud } from '../../state/hud';
import { CameraRig } from './CameraRig';
import { skyColors, sunPosition } from './DayNight';
import { Landmarks } from './Landmarks';
import { OsmCity } from './OsmCity';
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

/** Where the camera orbits, and the point aerial perspective is measured from. */
const FOCUS = new THREE.Vector3(200, 0, 300);

/** Shadow map resolution, and the world-space size of one texel within it. */
const SHADOW_MAP_SIZE = 2048;
const SHADOW_TEXEL_M = WORLD_EXTENT_M / SHADOW_MAP_SIZE;

/**
 * Drives sun, ambient light, sky, and fog from one clock.
 *
 * Kept as a single component so the four cannot drift out of sync — four
 * independent effects would eventually disagree about what time it is.
 */
function DayNightCycle({ paused, speed }: { paused: boolean; speed: TimeScale }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { scene, camera } = useThree();

  // Start at 08:00 on the June solstice: long shadows, sun well up.
  const clock = useRef({ hours: 8 });
  // Fog distances track the live camera radius. The previous fixed 2100-5460 m
  // band was calibrated to a constant that stopped existing when the camera
  // became user-controlled: below 2100 m there was no atmosphere at all, and
  // at full zoom-out the city was 100% fogged. Aerial perspective should be a
  // property of how far you are looking, not a fixed world distance.
  const fog = useMemo(() => new THREE.Fog('#a8c4d8', 1, 1), []);

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
      // Time scale multiplies the view clock so the day cycle visibly runs
      // faster, rather than the control being decorative.
      clock.current.hours = (clock.current.hours + delta * HOURS_PER_SECOND * speed) % 24;
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

    // Aerial perspective scales to how far the camera is actually looking, so
    // depth reads at street level and ridgelines still separate from across the
    // valley. Near is a fraction of the view distance, far well beyond it.
    fog.near = camera.position.distanceTo(FOCUS) * 0.55;
    fog.far = camera.position.distanceTo(FOCUS) * 2.6;
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={0.5} />
      {/* Shadow frustum sized to the city so the map casts rather than the
          default tight box, which would leave most of it unshadowed. */}
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-WORLD_EXTENT_M / 2}
        shadow-camera-right={WORLD_EXTENT_M / 2}
        shadow-camera-top={WORLD_EXTENT_M / 2}
        shadow-camera-bottom={-WORLD_EXTENT_M / 2}
        shadow-camera-near={100}
        shadow-camera-far={8000}
        // Bias derived from the texel footprint rather than a magic number.
        // The previous -0.0005 spanned 4.0 m of depth across a 7900 m range,
        // which both over-corrects (peter-panning) and leaves acne on surfaces
        // angled away from the light. normalBias is the one that matters for
        // sloped terrain; the small constant handles the depth axis.
        shadow-bias={-0.00005}
        shadow-normalBias={SHADOW_TEXEL_M * 2}
      />
    </group>
  );
}

export function CityScene() {
  // Read from the HUD store rather than a prop, so the pause control and the
  // clock cannot disagree: there is one source and both read it.
  const paused = useHud((s) => s.paused);
  const timeScale = useHud((s) => s.timeScale);

  return (
    <>
      <DayNightCycle paused={paused} speed={timeScale} />
      {/*
        The probe paints a fixed black node at z-index 9999 over the top-left
        corner. It exists for runtime verification and must not ship: gate it
        the same way preserveDrawingBuffer is gated in page.tsx.
      */}
      {process.env.NODE_ENV !== 'production' && <SceneProbe />}
      <CameraRig />
      <Terrain />
      <OsmCity />
      <Landmarks />
    </>
  );
}
