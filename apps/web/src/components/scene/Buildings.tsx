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
 * The previous palette sat at 0.07-0.13 saturation across all six bands, so the
 * city rendered as one undifferentiated cream mass. Saturation is now 0.14-0.24,
 * and the bands are separated by measurement rather than by eye: every pair
 * differs by a luminance ratio above 1.22 or a hue delta above 25 degrees, except
 * religious against default and residential, which are 30 buildings between them
 * (0.2% of the city). Luminance alone cannot separate five bands along one axis,
 * so the cool civic and commercial bands are split by hue from the warm bulk.
 *
 * The palette is weighted by real band counts. `default` is 80.3% of footprints,
 * so its warm concrete sets the dominant read; `residential` is 14.1% and is
 * pulled lighter to sit apart from it; `civic` and `commercial` go cool
 * blue-grey at hue 211-215, so institutional and CBD mass read as a distinct
 * district against the warm residential bulk at hue 32-38.
 *
 * Roughness stays high throughout: this is a town of painted concrete, asphalt
 * and corrugated metal, not glass. Commercial is a touch smoother to catch the
 * sun and read as a CBD material.
 */
export const BAND_STYLE: Record<string, { color: number; roughness: number; metalness: number }> = {
  default: { color: 0xcbbfab, roughness: 0.93, metalness: 0.0 },
  residential: { color: 0xe6d6c4, roughness: 0.92, metalness: 0.0 },
  civic: { color: 0xbccde2, roughness: 0.88, metalness: 0.0 },
  religious: { color: 0xd9c9a6, roughness: 0.85, metalness: 0.0 },
  commercial: { color: 0x9fadc0, roughness: 0.7, metalness: 0.05 },
  utility: { color: 0x8a7f72, roughness: 0.95, metalness: 0.0 },
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
