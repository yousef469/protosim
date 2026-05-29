import { create } from 'zustand';
import type { TrainingTaskId } from '../rl/tasks';
import type { ArchitectureId, ArchConfig } from '../rl/architectures';
import { DEFAULT_ARCH_CONFIG } from '../rl/architectures';

export interface EpisodeData {
  episode: number;
  reward: number;
  length: number;
  timestamp: number;
}

export interface RlState {
  isTraining: boolean;
  currentEpisode: number;
  totalEpisodes: number;
  episodeRewards: EpisodeData[];
  bestReward: number;
  modelXML: string | null;
  modelName: string;
  trainingSpeed: number;
  trainingTask: TrainingTaskId;
  customRewardCode: string;
  architecture: ArchitectureId;
  archConfig: ArchConfig;
  setTraining: (v: boolean) => void;
  setCurrentEpisode: (n: number) => void;
  setTotalEpisodes: (n: number) => void;
  addEpisodeReward: (data: EpisodeData) => void;
  setBestReward: (r: number) => void;
  setModelXML: (xml: string | null) => void;
  setModelName: (name: string) => void;
  setTrainingSpeed: (speed: number) => void;
  setTrainingTask: (task: TrainingTaskId) => void;
  setCustomRewardCode: (code: string) => void;
  setArchitecture: (arch: ArchitectureId) => void;
  setArchConfig: (config: Partial<ArchConfig>) => void;
  reset: () => void;
}

const useRlStore = create<RlState>((set) => ({
  isTraining: false,
  currentEpisode: 0,
  totalEpisodes: 500,
  episodeRewards: [],
  bestReward: -Infinity,
  modelXML: null,
  modelName: '',
  trainingSpeed: 1,
  trainingTask: 'walk',
  customRewardCode: '',
  architecture: 'mlp',
  archConfig: { ...DEFAULT_ARCH_CONFIG },
  setTraining: (v) => set({ isTraining: v }),
  setCurrentEpisode: (n) => set({ currentEpisode: n }),
  setTotalEpisodes: (n) => set({ totalEpisodes: n }),
  addEpisodeReward: (data) => set((s) => ({
    episodeRewards: [...s.episodeRewards, data],
    bestReward: Math.max(s.bestReward, data.reward),
  })),
  setBestReward: (r) => set({ bestReward: r }),
  setModelXML: (xml) => set({ modelXML: xml }),
  setModelName: (name) => set({ modelName: name }),
  setTrainingSpeed: (speed) => set({ trainingSpeed: speed }),
  setTrainingTask: (task) => set({ trainingTask: task }),
  setCustomRewardCode: (code) => set({ customRewardCode: code }),
  setArchitecture: (arch) => set({ architecture: arch }),
  setArchConfig: (config) => set((s) => ({ archConfig: { ...s.archConfig, ...config } })),
  reset: () => set({
    isTraining: false,
    currentEpisode: 0,
    episodeRewards: [],
    bestReward: -Infinity,
    modelXML: null,
    modelName: '',
  }),
}));

export default useRlStore;
