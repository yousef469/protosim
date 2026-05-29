import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MuJoCoController } from './MuJoCoController';
import { robotViewState } from '../rl/vision';

const mjGEOM_PLANE = 0;
const mjGEOM_SPHERE = 2;
const mjGEOM_CAPSULE = 3;
const mjGEOM_CYLINDER = 5;
const mjGEOM_BOX = 6;
const mjGEOM_MESH = 7;
const mjGEOM_NONE = 1001;

interface GeomMesh {
  mesh: THREE.Mesh;
  type: number;
}

function buildMeshGeometry(
  model: any,
  geomIdx: number,
): THREE.BufferGeometry | null {
  const meshId = (model.geom_dataid as Int32Array)[geomIdx];
  if (meshId < 0) return null;

  const vertAdr = (model.mesh_vertadr as Int32Array)[meshId];
  const vertNum = (model.mesh_vertnum as Int32Array)[meshId];
  const faceAdr = (model.mesh_faceadr as Int32Array)[meshId];
  const faceNum = (model.mesh_facenum as Int32Array)[meshId];

  if (vertNum === 0 || faceNum === 0) return null;

  const verts = model.mesh_vert as Float32Array;
  const faces = model.mesh_face as Int32Array;

  const positions = new Float32Array(vertNum * 3);
  for (let i = 0; i < vertNum * 3; i++) {
    positions[i] = verts[vertAdr * 3 + i];
  }

  const indices = new Uint32Array(faceNum * 3);
  for (let i = 0; i < faceNum * 3; i++) {
    indices[i] = faces[faceAdr * 3 + i];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function createGeometry(
  type: number,
  sizeArr: Float64Array,
  i: number,
  model: any,
): THREE.BufferGeometry | null {
  const off = i * 3;
  const sx = sizeArr[off];
  const sy = sizeArr[off + 1];
  const sz = sizeArr[off + 2];

  switch (type) {
    case mjGEOM_PLANE:
      return new THREE.PlaneGeometry(sx * 2, sy * 2);
    case mjGEOM_SPHERE:
      return new THREE.SphereGeometry(sx, 24, 24);
    case mjGEOM_BOX:
      return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
    case mjGEOM_CYLINDER:
      return new THREE.CylinderGeometry(sx, sx, sy * 2, 24);
    case mjGEOM_CAPSULE:
      return createCapsuleGeometry(sx, sy * 2);
    case mjGEOM_MESH:
      return buildMeshGeometry(model, i);
    case mjGEOM_NONE:
      return null;
    default:
      return new THREE.SphereGeometry(0.05, 8, 8);
  }
}

export function MuJoCoRenderer({ ctrl }: { ctrl: MuJoCoController }) {
  const meshesRef = useRef<Map<number, GeomMesh>>(new Map());
  const sceneGroupRef = useRef<THREE.Group>(null);
  const initRef = useRef(false);

  useEffect(() => {
    initRef.current = false;
    return () => {
      const meshes = meshesRef.current;
      for (const [, gm] of meshes) {
        gm.mesh.geometry.dispose();
        if (Array.isArray(gm.mesh.material)) {
          gm.mesh.material.forEach(m => m.dispose());
        } else {
          (gm.mesh.material as THREE.Material).dispose();
        }
      }
      meshes.clear();
    };
  }, []);

  useFrame(() => {
    const sceneGroup = sceneGroupRef.current;
    if (!sceneGroup || !ctrl.isLoaded) return;

    const state = ctrl.getState();
    const model = (ctrl as any)._model;
    if (!state || !model) return;

    if (!initRef.current) {
      initRef.current = true;
      const g = (model.opt as any)?.gravity;
      const zUp = g && Math.abs(g[2]) > Math.abs(g[1]);
      sceneGroup.rotation.set(zUp ? -Math.PI / 2 : 0, 0, 0);
    }

    const ngeom = model.ngeom;
    const geomType = model.geom_type as Int32Array;
    const geomSize = model.geom_size as Float64Array;
    const geomRgba = model.geom_rgba as Float64Array;
    const xpos = state.geom_xpos;
    const xmat = state.geom_xmat;
    const meshes = meshesRef.current;

    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();

    for (let i = 0; i < ngeom; i++) {
      let gm = meshes.get(i);
      if (!gm) {
        const type = geomType[i];
        const geo = createGeometry(type, geomSize, i, model);
        if (!geo) continue;
        const rgba = rgbaFor(geomRgba, i);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
          opacity: rgba[3],
          transparent: rgba[3] < 1,
          roughness: 0.5,
          metalness: 0.3,
          side: type === mjGEOM_PLANE ? THREE.DoubleSide : THREE.FrontSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sceneGroup.add(mesh);
        gm = { mesh, type };
        meshes.set(i, gm);
      }

      const off = i * 3;
      const mOff = i * 9;
      pos.set(xpos[off], xpos[off + 1], xpos[off + 2]);

      m4.set(
        xmat[mOff + 0], xmat[mOff + 1], xmat[mOff + 2], pos.x,
        xmat[mOff + 3], xmat[mOff + 4], xmat[mOff + 5], pos.y,
        xmat[mOff + 6], xmat[mOff + 7], xmat[mOff + 8], pos.z,
        0, 0, 0, 1,
      );

      gm.mesh.position.setFromMatrixPosition(m4);
      gm.mesh.quaternion.setFromRotationMatrix(m4);
    }

    // Track robot head position for vision camera (highest non-plane geom)
    let maxY = -Infinity, headX = 0, headZ = 0;
    for (let i = 0; i < ngeom; i++) {
      if (geomType[i] === mjGEOM_PLANE || geomType[i] === mjGEOM_NONE) continue;
      const off = i * 3;
      const y = xpos[off + 1];
      if (y > maxY) {
        maxY = y;
        headX = xpos[off];
        headZ = xpos[off + 2];
      }
    }
    if (maxY > -Infinity) {
      robotViewState.position[0] = headX;
      robotViewState.position[1] = maxY;
      robotViewState.position[2] = headZ;
    }

    if (meshes.size > ngeom) {
      for (const [i, gm] of meshes) {
        if (i >= ngeom) {
          gm.mesh.geometry.dispose();
          (gm.mesh.material as THREE.Material).dispose();
          sceneGroup.remove(gm.mesh);
          meshes.delete(i);
        }
      }
    }
  });

  return <group ref={sceneGroupRef} />;
}

function rgbaFor(arr: Float64Array, i: number): [number, number, number, number] {
  const off = i * 4;
  return [arr[off], arr[off + 1], arr[off + 2], arr[off + 3]];
}

function createCapsuleGeometry(radius: number, height: number, segments = 12): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, segments, segments);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const y = arr[i + 1];
    if (y >= 0) arr[i + 1] = y + height / 2;
    else arr[i + 1] = y - height / 2;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
