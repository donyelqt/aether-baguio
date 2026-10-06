'use client';

import { WORLD_EXTENT_M } from '@aether/shared-types';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';

import { groundAt } from './Terrain';

/**
 * Observer camera — PRD FR-5.1.
 *
 * Orbit/pan/zoom around a focus point rather than a first-person fly camera.
 * For inspecting a city from outside, orbit is the right primitive: the focus
 * point stays meaningful while the operator changes scale, and there is no
 * horizon-locked motion sickness to tune away.
 *
 * Input model (PRD §4.1): left-drag orbits, right-drag or shift-drag pans,
 * wheel zooms. Keyboard moves the focus point directly.
 */

const MIN_RADIUS_M = 40;
const MAX_RADIUS_M = WORLD_EXTENT_M * 1.1;
const MIN_POLAR_DEG = 4;
const MAX_POLAR_DEG = 86;

/** Metres of pan per pixel of drag. */
const PAN_SENSITIVITY = 6;

/** Radians of orbit per pixel of drag. */
const ORBIT_SENSITIVITY = 0.005;

/** Focus movement in metres per second while a key is held. */
const KEY_PAN_SPEED = 420;

/** Ground clearance kept below the focus, so the camera never buries itself. */
const MIN_CLEARANCE_M = 12;

interface CameraState {
  /** Point on the ground the camera orbits. */
  focusX: number;
  focusZ: number;
  /** Distance from focus. */
  radius: number;
  /** Angle above the horizon, radians. 0 = top-down. */
  polar: number;
  /** Compass angle around the focus, radians. */
  azimuth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function CameraRig({ autoOrbit = false }: { autoOrbit?: boolean }) {
  const { camera, gl } = useThree();

  const state = useRef<CameraState>({
    // Opens looking at the CBD from the south-east, so Burnham, Session Road,
    // and the Cathedral ridge are all in frame on load.
    focusX: 200,
    focusZ: 300,
    radius: 1500,
    polar: (58 * Math.PI) / 180,
    azimuth: (215 * Math.PI) / 180,
  });

  const drag = useRef<{ button: number; lastX: number; lastY: number } | null>(null);
  const keys = useRef(new Set<string>());

  const applyToCamera = useCallback(() => {
    const s = state.current;
    const sinPolar = Math.sin(s.polar);
    camera.position.set(
      s.focusX + s.radius * sinPolar * Math.sin(s.azimuth),
      // Target sits a little above the ground so the focus point is the surface.
      groundAt(s.focusX, s.focusZ) + s.radius * Math.cos(s.polar),
      s.focusZ + s.radius * sinPolar * Math.cos(s.azimuth),
    );
    // Never let the camera go under the terrain it is looking at.
    const floor = groundAt(camera.position.x, camera.position.z) + MIN_CLEARANCE_M;
    if (camera.position.y < floor) camera.position.y = floor;

    camera.lookAt(s.focusX, groundAt(s.focusX, s.focusZ) + 10, s.focusZ);
  }, [camera]);

  // --- pointer input -------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      el.setPointerCapture(event.pointerId);
      drag.current = { button: event.button, lastX: event.clientX, lastY: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      const d = drag.current;
      if (d === null) return;
      const dx = event.clientX - d.lastX;
      const dy = event.clientY - d.lastY;
      d.lastX = event.clientX;
      d.lastY = event.clientY;

      const s = state.current;
      // Right button or shift pans; left orbits. Matches the convention every
      // map tool uses, so it needs no explanation.
      if (d.button === 2 || event.shiftKey) {
        // Pan in the camera's ground plane, scaled by zoom so the drag distance
        // on screen matches the distance travelled in the world.
        const scale = (s.radius * PAN_SENSITIVITY * Math.PI) / 180 / 40;
        const sinAz = Math.sin(s.azimuth);
        const cosAz = Math.cos(s.azimuth);
        s.focusX -= (dx * cosAz - dy * sinAz) * scale;
        s.focusZ += (dx * sinAz + dy * cosAz) * scale;
        s.focusX = clamp(s.focusX, -WORLD_EXTENT_M / 2, WORLD_EXTENT_M / 2);
        s.focusZ = clamp(s.focusZ, -WORLD_EXTENT_M / 2, WORLD_EXTENT_M / 2);
      } else {
        s.azimuth -= dx * ORBIT_SENSITIVITY;
        s.polar = clamp(
          s.polar - dy * ORBIT_SENSITIVITY,
          (MIN_POLAR_DEG * Math.PI) / 180,
          (MAX_POLAR_DEG * Math.PI) / 180,
        );
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      drag.current = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const s = state.current;
      // Exponential so each notch feels the same at every zoom level.
      s.radius = clamp(s.radius * Math.exp(event.deltaY * 0.0012), MIN_RADIUS_M, MAX_RADIUS_M);
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl]);

  // --- keyboard ------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Do not steal keys from form fields or scrollable panels.
      const target = event.target as HTMLElement | null;
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      keys.current.add(event.code);
      if (event.code === 'Space') event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    // Releasing focus must not leave a key stuck down, which would drift the
    // camera forever.
    const onBlur = () => keys.current.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, delta) => {
    const s = state.current;
    const k = keys.current;

    // WASD pans the focus point in world space; Q/E raise and lower it.
    let dx = 0;
    let dz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) dz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) dx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) dx += 1;

    if (dx !== 0 || dz !== 0) {
      // Scale with radius so the on-screen speed feels constant at any zoom.
      const speed = KEY_PAN_SPEED * (s.radius / 1500) * delta;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      const sinAz = Math.sin(s.azimuth);
      const cosAz = Math.cos(s.azimuth);
      s.focusX = clamp(
        s.focusX + (dx * cosAz - dz * sinAz) * speed,
        -WORLD_EXTENT_M / 2,
        WORLD_EXTENT_M / 2,
      );
      s.focusZ = clamp(
        s.focusZ + (dx * sinAz + dz * cosAz) * speed,
        -WORLD_EXTENT_M / 2,
        WORLD_EXTENT_M / 2,
      );
    }

    if (k.has('KeyQ')) s.radius = clamp(s.radius * 0.94, MIN_RADIUS_M, MAX_RADIUS_M);
    if (k.has('KeyE')) s.radius = clamp(s.radius * 1.06, MIN_RADIUS_M, MAX_RADIUS_M);

    if (autoOrbit) s.azimuth += delta * 0.02;

    applyToCamera();
  });

  return null;
}
