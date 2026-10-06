'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { BUILDING_STATS } from './buildings.generated';
import type { BandMesh } from './buildingWorker';

/**
 * Building masses, extruded from real OpenStreetMap footprints.
 *
 * Replaces the landmark boxes. Each band is one merged BufferGeometry, so the
 * whole city costs five draw calls rather than one per building.
 *
 * The extrusion runs in a worker. Half a million triangles built on the main
 * thread would stall first paint; here the main thread renders terrain and
 * roads immediately, and the buildings arrive a frame or two later.
 */

export interface BuildingMeshes {
  band: string;
  geometry: THREE.BufferGeometry;
  triangles: number;
  count: number;
}

/**
 * Per-band material.
 *
 * Roughness is high throughout: this is a town of painted concrete, asphalt
 * and corrugated metal, not glass. The commercial band is a touch smoother to
 * catch the sun and read as a distinct CBD material.
 */
const BAND_STYLE: Record<string, { color: number; roughness: number; metalness: number }> = {
  residential: { color: 0xd8cdbc, roughness: 0.92, metalness: 0.0 },
  default: { color: 0xcfc5b6, roughness: 0.93, metalness: 0.0 },
  civic: { color: 0xc4bfb2, roughness: 0.88, metalness: 0.0 },
  religious: { color: 0xdcd3c2, roughness: 0.85, metalness: 0.0 },
  commercial: { color: 0xb9bfc6, roughness: 0.7, metalness: 0.05 },
  utility: { color: 0x9a958c, roughness: 0.95, metalness: 0.0 },
};

function toGeometry(mesh: BandMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function Buildings() {
  const [meshes, setMeshes] = useState<BuildingMeshes[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Module workers are not bundled by default in Next.js, so the worker is
    // instantiated from a URL rather than imported.
    const worker = new Worker(new URL('./buildingWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<{ meshes: BandMesh[] }>) => {
      setMeshes(
        event.data.meshes.map((m) => ({
          band: m.band,
          geometry: toGeometry(m),
          triangles: m.triangles,
          count: m.count,
        })),
      );
      worker.terminate();
    };
    worker.onerror = () => {
      setFailed(true);
      worker.terminate();
    };
    worker.postMessage({});

    return () => worker.terminate();
  }, []);

  // The map renders without buildings rather than blocking on them.
  if (failed || meshes === null) return null;

  return (
    <group>
      {meshes.map((m) => {
        // Every generated band has an entry; the fallback guards against a new
        // band appearing without a style rather than silently defaulting.
        const style = BAND_STYLE[m.band] ?? { color: 0xcfc5b6, roughness: 0.93, metalness: 0.0 };
        return (
          <mesh key={m.band} geometry={m.geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={style.color}
              roughness={style.roughness}
              metalness={style.metalness}
              vertexColors
            />
          </mesh>
        );
      })}
    </group>
  );
}

export { BUILDING_STATS };
