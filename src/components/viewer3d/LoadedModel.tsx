import { useRef, Suspense, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF, TransformControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import * as THREE from 'three';
import type { LoadedModel as ModelData, MeshPart } from '../../store/modelStore';
import type { BodyState } from '../../types/scene';
import useModelStore from '../../store/modelStore';
import useSceneStore from '../../store/sceneStore';
import { getSimulationController } from '../../core/SimulationController';

function ModelFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#888" wireframe />
    </mesh>
  );
}

function GltfRenderer({ url, modelId }: { url: string; modelId: string }) {
  const { scene } = useGLTF(url);
  const addedRef = useRef(false);

  useEffect(() => {
    if (addedRef.current) return;
    addedRef.current = true;

    const parts: MeshPart[] = [];
    let allVerts: number[] = [];

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;

        const v = Array.from(pos.array);
        allVerts.push(...v);

        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        mesh.getWorldQuaternion(worldQuat);

        const parent = mesh.parent;
        let parentPartId: string | null = null;
        if (parent && parent !== scene && parent.isObject3D) {
          parentPartId = `${modelId}_${parent.name || ''}`;
        }

        parts.push({
          id: `${modelId}_${mesh.name || `mesh_${parts.length}`}`,
          name: mesh.name || `mesh_${parts.length}`,
          vertices: v,
          position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
        parentId: parentPartId,
        physicsType: 'none',
        isWheel: false,
      });
    }
  });

    if (parts.length > 0) {
      useModelStore.getState().updateModelParts(modelId, parts);
    }
    if (allVerts.length > 0) {
      useModelStore.getState().updateModelVertices(modelId, allVerts);
    }
  }, [scene, modelId]);

  return <primitive object={scene.clone()} />;
}

function StlRenderer({ url, modelId }: { url: string; modelId: string }) {
  const geometry = useLoader(STLLoader, url);
  const addedRef = useRef(false);

  useEffect(() => {
    if (addedRef.current) return;
    addedRef.current = true;
    const pos = geometry.getAttribute('position');
    if (pos) {
      useModelStore.getState().updateModelVertices(modelId, Array.from(pos.array));
    }
  }, [geometry, modelId]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#4a90e2" metalness={0.3} roughness={0.5} />
    </mesh>
  );
}

function ObjRenderer({ url, modelId }: { url: string; modelId: string }) {
  const obj = useLoader(OBJLoader, url);
  const addedRef = useRef(false);

  useEffect(() => {
    if (addedRef.current) return;
    addedRef.current = true;

    const parts: MeshPart[] = [];
    let allVerts: number[] = [];

    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;

        const v = Array.from(pos.array);
        allVerts.push(...v);

        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        mesh.getWorldQuaternion(worldQuat);

        const parent = mesh.parent;
        let parentPartId: string | null = null;
        if (parent && parent !== obj && parent.isObject3D) {
          parentPartId = `${modelId}_${parent.name || ''}`;
        }

        parts.push({
          id: `${modelId}_${mesh.name || `mesh_${parts.length}`}`,
          name: mesh.name || `mesh_${parts.length}`,
          vertices: v,
          position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
        parentId: parentPartId,
        physicsType: 'none',
        isWheel: false,
      });
    }
  });

    if (parts.length > 0) {
      useModelStore.getState().updateModelParts(modelId, parts);
    }
    if (allVerts.length > 0) {
      useModelStore.getState().updateModelVertices(modelId, allVerts);
    }
  }, [obj, modelId]);

  return <primitive object={obj} />;
}

function PrimitiveRenderer({ type, modelId }: { type: string; modelId: string }) {
  const geometry = useMemo(() => {
    switch (type) {
      case 'box': return new THREE.BoxGeometry(0.6, 0.4, 0.8);
      case 'sphere': return new THREE.SphereGeometry(0.3, 24, 24);
      case 'cylinder': return new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24);
      default: return new THREE.BoxGeometry(0.6, 0.4, 0.8);
    }
  }, [type]);

  useEffect(() => {
    const pos = geometry.getAttribute('position');
    if (pos) {
      useModelStore.getState().updateModelVertices(modelId, Array.from(pos.array));
    }
  }, [geometry, modelId]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={type === 'box' ? '#4a90e2' : type === 'sphere' ? '#e74c3c' : '#2ecc71'} />
    </mesh>
  );
}

function FormatRenderer({ model }: { model: ModelData }) {
  switch (model.format) {
    case 'gltf': case 'glb': return <GltfRenderer url={model.url} modelId={model.id} />;
    case 'stl': return <StlRenderer url={model.url} modelId={model.id} />;
    case 'obj': return <ObjRenderer url={model.url} modelId={model.id} />;
    case 'primitive': return <PrimitiveRenderer type={model.url} modelId={model.id} />;
    default: return <ModelFallback />;
  }
}

function syncChildMesh(
  obj: THREE.Object3D,
  parts: NonNullable<ModelData['meshParts']>,
  states: Map<string, BodyState>,
  parentInv: THREE.Matrix4,
  tmpMat: THREE.Matrix4,
  tmpVec: THREE.Vector3,
  tmpQuat: THREE.Quaternion,
) {
  if ((obj as THREE.Mesh).isMesh) {
    const mesh = obj as THREE.Mesh;
    const part = parts.find((p) => p.name === mesh.name);
    if (part) {
      const body = states.get(part.id);
      if (body && mesh.parent) {
        const pMat = mesh.parent.matrixWorld;
        // localMatrix = inverse(parentWorld) * bodyWorldMatrix
        parentInv.copy(pMat).invert();
        tmpMat.identity();
        tmpMat.compose(
          tmpVec.set(body.position.x, body.position.y, body.position.z),
          tmpQuat.set(body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w),
          tmpVec.set(1, 1, 1),
        );
        tmpMat.premultiply(parentInv);
        mesh.position.setFromMatrixPosition(tmpMat);
        mesh.quaternion.setFromRotationMatrix(tmpMat);
      }
    }
    return;
  }
  for (const child of obj.children) {
    syncChildMesh(child, parts, states, parentInv, tmpMat, tmpVec, tmpQuat);
  }
}

export function LoadedModel({ data }: { data: ModelData }) {
  const groupRef = useRef<THREE.Group>(null);
  const isSelected = useModelStore((s) => s.selectedModelId === data.id);
  const selectModel = useModelStore((s) => s.selectModel);
  const transformMode = useModelStore((s) => s.transformMode);
  const setIsTransforming = useModelStore((s) => s.setIsTransforming);
  const editorMode = useModelStore((s) => s.editorMode);
  const isDragging = useRef(false);

  const parentInv = useRef(new THREE.Matrix4());
  const tmpMat = useRef(new THREE.Matrix4());
  const tmpVec = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());

  useFrame(() => {
    const g = groupRef.current;
    if (!g || isDragging.current) return;

    if (editorMode === 'simulation') {
      const states = useSceneStore.getState().bodyStates;

      if (data.meshParts && data.meshParts.length > 1) {
        g.position.set(data.position.x, data.position.y, data.position.z);
        for (const child of g.children) {
          syncChildMesh(child, data.meshParts, states, parentInv.current, tmpMat.current, tmpVec.current, tmpQuat.current);
        }
        return;
      }

      const body = states.get(data.bodyId);
      if (body) {
        g.position.set(body.position.x, body.position.y, body.position.z);
        g.quaternion.set(body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w);
        return;
      }
    }
    g.position.set(data.position.x, data.position.y, data.position.z);
  });

  const handleDragStart = () => {
    isDragging.current = true;
    setIsTransforming(true);
  };

  const handleDragEnd = () => {
    isDragging.current = false;
    setIsTransforming(false);
    const g = groupRef.current;
    if (!g) return;
    const pos = g.position;
    useModelStore.getState().updateModelPosition(data.id, { x: pos.x, y: pos.y, z: pos.z });
    getSimulationController().teleportBody(data.bodyId, { x: pos.x, y: pos.y, z: pos.z });
  };

  return (
    <>
      <group
        ref={groupRef}
        scale={[data.scale.x, data.scale.y, data.scale.z]}
        onClick={(e) => {
          e.stopPropagation();
          selectModel(data.id);
        }}
      >
        <Suspense fallback={<ModelFallback />}>
          <FormatRenderer model={data} />
        </Suspense>
        {isSelected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(0.8, 0.8, 0.8)]} />
            <lineBasicMaterial color="#ffaa00" />
          </lineSegments>
        )}
      </group>
      {isSelected && editorMode === 'design' && transformMode !== 'physics' && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  );
}
