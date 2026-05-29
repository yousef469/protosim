import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { getSpawnedObjects, subscribeSpawnedObjects, type SpawnedObject } from '../../rl/sceneObjects';

const GEOMETRIES: Record<SpawnedObject['type'], () => THREE.BufferGeometry> = {
  sphere: () => new THREE.SphereGeometry(1, 16, 16),
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
};

const objectMeshes = new Map<number, THREE.Mesh>();
let sceneRef: THREE.Scene | null = null;

export function SpawnedObjects() {
  const { scene } = useThree();
  const [, setTick] = useState(0);

  useEffect(() => {
    sceneRef = scene;

    const unsub = subscribeSpawnedObjects(() => {
      const current = getSpawnedObjects();
      const currentIds = new Set(current.map(o => o.id));

      // Remove stale meshes
      for (const [id, mesh] of objectMeshes) {
        if (!currentIds.has(id)) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          objectMeshes.delete(id);
        }
      }

      // Add/update meshes
      for (const obj of current) {
        let mesh = objectMeshes.get(obj.id);
        if (!mesh) {
          const geo = GEOMETRIES[obj.type]();
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: obj.color }));
          mesh.castShadow = true;
          objectMeshes.set(obj.id, mesh);
          scene.add(mesh);
        }
        mesh.position.set(obj.x, obj.y, obj.z);
        mesh.scale.setScalar(obj.size);
        (mesh.material as THREE.MeshStandardMaterial).color.set(obj.color);
      }

      setTick(t => t + 1);
    });

    return () => {
      unsub();
      for (const [id, mesh] of objectMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      objectMeshes.clear();
      sceneRef = null;
    };
  }, [scene]);

  return null;
}
