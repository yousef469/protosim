import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  getSpawnedObjects, subscribeSpawnedObjects, updateSpawnedObject,
  getPlacementMode, getPlaceType, addSpawnedObject,
  type SpawnedObject,
} from '../../rl/sceneObjects';
import { robotViewState } from '../../rl/vision';

const GEOMETRIES: Record<SpawnedObject['type'], THREE.BufferGeometry> = {
  sphere: new THREE.SphereGeometry(1, 16, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
};

const COLORS: Record<SpawnedObject['type'], string> = {
  sphere: '#ff4444',
  box: '#4488ff',
  cylinder: '#44cc44',
};

const meshes = new Map<number, THREE.Mesh>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectPt = new THREE.Vector3();

let dragId: number | null = null;
let dragOffset = new THREE.Vector3();

export function SpawnedObjects() {
  const { scene, camera, gl } = useThree();
  const tickRef = useRef(0);

  useEffect(() => {
    const unsub = subscribeSpawnedObjects(() => {
      tickRef.current++;
      syncMeshes(scene);
    });

    syncMeshes(scene);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      pointer.x = (e.clientX / gl.domElement.clientWidth) * 2 - 1;
      pointer.y = -(e.clientY / gl.domElement.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // Check if clicked on an existing object
      const meshList = [...meshes.values()];
      const hits = raycaster.intersectObjects(meshList);
      if (hits.length > 0) {
        const hit = hits[0];
        for (const [id, mesh] of meshes) {
          if (mesh === hit.object) {
            dragId = id;
            dragOffset.copy(hit.point).sub(mesh.position);
            return;
          }
        }
      }

      // Placement mode — place on ground
      if (getPlacementMode() && getPlaceType()) {
        const planeHit = raycaster.ray.intersectPlane(plane, intersectPt);
        if (planeHit) {
          // Only place if in front of robot (positive forward direction)
          const f = robotViewState.forward;
          const dx = intersectPt.x - robotViewState.position[0];
          const dz = intersectPt.z - robotViewState.position[2];
          const dot = dx * f[0] + dz * f[2];
          if (dot > 0.3) {
            addSpawnedObject({
              type: getPlaceType()!,
              x: intersectPt.x,
              y: 0.15,
              z: intersectPt.z,
              color: COLORS[getPlaceType()!],
              size: 0.15,
            });
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragId === null) return;

      pointer.x = (e.clientX / gl.domElement.clientWidth) * 2 - 1;
      pointer.y = -(e.clientY / gl.domElement.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const planeHit = raycaster.ray.intersectPlane(plane, intersectPt);
      if (planeHit) {
        const mesh = meshes.get(dragId);
        if (mesh) {
          mesh.position.x = intersectPt.x - dragOffset.x;
          mesh.position.z = intersectPt.z - dragOffset.z;
        }
      }
    };

    const onPointerUp = () => {
      if (dragId !== null) {
        const mesh = meshes.get(dragId);
        if (mesh) {
          updateSpawnedObject(dragId, {
            x: mesh.position.x,
            y: 0.15,
            z: mesh.position.z,
          });
        }
        dragId = null;
      }
    };

    gl.domElement.addEventListener('pointerdown', onPointerDown);
    gl.domElement.addEventListener('pointermove', onPointerMove);
    gl.domElement.addEventListener('pointerup', onPointerUp);

    return () => {
      unsub();
      gl.domElement.removeEventListener('pointerdown', onPointerDown);
      gl.domElement.removeEventListener('pointermove', onPointerMove);
      gl.domElement.removeEventListener('pointerup', onPointerUp);
      for (const [, mesh] of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      meshes.clear();
    };
  }, [scene, camera, gl]);

  return null;
}

function syncMeshes(scene: THREE.Scene) {
  const current = getSpawnedObjects();
  const currentIds = new Set(current.map(o => o.id));

  for (const [id, mesh] of meshes) {
    if (!currentIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      meshes.delete(id);
    }
  }

  for (const obj of current) {
    let mesh = meshes.get(obj.id);
    if (!mesh) {
      const geo = GEOMETRIES[obj.type].clone();
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: obj.color }));
      mesh.castShadow = true;
      meshes.set(obj.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(obj.x, obj.y, obj.z);
    mesh.scale.setScalar(obj.size);
    (mesh.material as THREE.MeshStandardMaterial).color.set(obj.color);
  }
}
