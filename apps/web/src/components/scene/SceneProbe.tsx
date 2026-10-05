'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';

/**
 * Publishes scene diagnostics into the DOM for runtime verification.
 *
 * Browser assertions cannot reach inside the R3F store from outside React, so
 * "did it actually render?" needs numbers this component emits. It writes to a
 * DOM node rather than `window` because a DOM read is unambiguous across the
 * automation bridge, whereas a global read proved unreliable to interpret.
 */
const PROBE_ID = 'aether-scene-probe';

export function SceneProbe() {
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    const publish = () => {
      let meshes = 0;
      let triangles = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        const geo = mesh.geometry;
        if (!geo) return;
        triangles += geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
      });

      let node = document.getElementById(PROBE_ID);
      if (node === null) {
        node = document.createElement('div');
        node.id = PROBE_ID;
        node.style.cssText =
          'position:fixed;left:0;top:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:3px;pointer-events:none';
        document.body.appendChild(node);
      }
      node.textContent = [
        `meshes=${meshes}`,
        `tris=${Math.round(triangles)}`,
        `draws=${gl.info.render.calls}`,
        `drawn=${gl.info.render.triangles}`,
        `bg=${scene.background instanceof THREE.Color ? scene.background.getHexString() : 'none'}`,
        `cam=${Math.round(camera.position.x)},${Math.round(camera.position.y)},${Math.round(camera.position.z)}`,
        `lost=${gl.getContext().isContextLost()}`,
      ].join(' ');
    };

    publish();
    const id = setInterval(publish, 400);
    return () => {
      clearInterval(id);
      document.getElementById(PROBE_ID)?.remove();
    };
  }, [scene, camera, gl]);

  return null;
}
