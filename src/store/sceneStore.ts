import { create } from 'zustand';
import type { BodyState, SceneNode } from '../types/scene';

interface SceneStore {
  bodyStates: Map<string, BodyState>;
  sceneNodes: SceneNode[];
  deviceModelUrl: string | null;

  updateBodyState: (bodyId: string, state: BodyState) => void;
  updateBodyStates: (states: BodyState[]) => void;
  removeBodyState: (bodyId: string) => void;
  setDeviceModel: (url: string | null) => void;
  reset: () => void;
}

const useSceneStore = create<SceneStore>((set) => ({
  bodyStates: new Map(),
  sceneNodes: [],
  deviceModelUrl: null,

  updateBodyState: (bodyId, state) => set((prev) => {
    const next = new Map(prev.bodyStates);
    next.set(bodyId, state);
    return { bodyStates: next };
  }),

  updateBodyStates: (states) => set((prev) => {
    const next = new Map(prev.bodyStates);
    for (const s of states) next.set(s.id, s);
    return { bodyStates: next };
  }),

  removeBodyState: (bodyId) => set((prev) => {
    const next = new Map(prev.bodyStates);
    next.delete(bodyId);
    return { bodyStates: next };
  }),

  setDeviceModel: (url) => set({ deviceModelUrl: url }),
  reset: () => set({ bodyStates: new Map(), sceneNodes: [], deviceModelUrl: null }),
}));

export default useSceneStore;
