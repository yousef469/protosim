import { create } from 'zustand';

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'physics';
export type PhysicsType = 'none' | 'static' | 'dynamic';

export interface MeshPart {
  id: string;
  name: string;
  vertices: number[];
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  parentId: string | null;
  physicsType: PhysicsType;
  isWheel: boolean;
}

export interface LoadedModel {
  id: string;
  name: string;
  format: 'gltf' | 'glb' | 'stl' | 'obj' | 'urdf' | 'primitive';
  url: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  bodyId: string;
  parentId: string | null;
  vertices?: number[];
  meshParts?: MeshPart[];
  physicsType: PhysicsType;
}

export type EditorMode = 'design' | 'simulation';

interface ModelStore {
  models: LoadedModel[];
  selectedModelId: string | null;
  transformMode: TransformMode;
  editorMode: EditorMode;
  isTransforming: boolean;
  addModel: (model: Omit<LoadedModel, 'position' | 'rotation' | 'scale' | 'physicsType'> & { position?: { x: number; y: number; z: number }; physicsType?: PhysicsType }) => void;
  removeModel: (id: string) => void;
  selectModel: (id: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setEditorMode: (mode: EditorMode) => void;
  setIsTransforming: (v: boolean) => void;
  reparentModel: (id: string, newParentId: string | null) => void;
  updateModelPosition: (id: string, pos: { x: number; y: number; z: number }) => void;
  updateModelTransform: (id: string, pos: { x: number; y: number; z: number }, rot: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }) => void;
  updateModelVertices: (id: string, vertices: number[]) => void;
  updateModelParts: (id: string, parts: MeshPart[]) => void;
  setPhysicsType: (id: string, physicsType: PhysicsType) => void;
  setPartPhysicsType: (modelId: string, partId: string, physicsType: PhysicsType) => void;
  setPartWheel: (modelId: string, partId: string, isWheel: boolean) => void;
  reset: () => void;
}

let modelCounter = 0;

const useModelStore = create<ModelStore>((set) => ({
  models: [],
  selectedModelId: null,
  transformMode: 'translate',
  editorMode: 'design',
  isTransforming: false,
  reparentModel: (id: string, newParentId: string | null) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, parentId: newParentId } : m
    ),
  })),
  addModel: (m) => set((state) => ({
    models: [...state.models, {
      ...m,
      parentId: m.parentId ?? null,
      position: m.position || { x: 0, y: 1.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      physicsType: 'none',
    }],
  })),
  removeModel: (id) => set((state) => ({
    models: state.models.filter((m) => m.id !== id),
    selectedModelId: state.selectedModelId === id ? null : state.selectedModelId,
  })),
  selectModel: (id) => set({ selectedModelId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setIsTransforming: (v) => set({ isTransforming: v }),
  updateModelPosition: (id, position) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, position } : m
    ),
  })),
  updateModelTransform: (id, position, rotation, scale) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, position, rotation, scale } : m
    ),
  })),
  updateModelVertices: (id, vertices) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, vertices } : m
    ),
  })),
  updateModelParts: (id, meshParts) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, meshParts } : m
    ),
  })),
  setPhysicsType: (id, physicsType) => set((state) => ({
    models: state.models.map((m) =>
      m.id === id ? { ...m, physicsType } : m
    ),
  })),
  setPartPhysicsType: (modelId, partId, physicsType) => set((state) => ({
    models: state.models.map((m) =>
      m.id !== modelId ? m : {
        ...m,
        meshParts: m.meshParts?.map((p) =>
          p.id !== partId ? p : { ...p, physicsType }
        ),
      }
    ),
  })),
  setPartWheel: (modelId, partId, isWheel) => set((state) => ({
    models: state.models.map((m) =>
      m.id !== modelId ? m : {
        ...m,
        meshParts: m.meshParts?.map((p) =>
          p.id !== partId ? p : { ...p, isWheel }
        ),
      }
    ),
  })),
  reset: () => set({ models: [], selectedModelId: null }),
}));

export function generateModelId(): string {
  modelCounter++;
  return `model_${modelCounter}_${Date.now()}`;
}

export { modelCounter };
export default useModelStore;
