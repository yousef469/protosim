import { create } from 'zustand';

export interface LogEntry {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: number;
}

interface SimulationStore {
  isRunning: boolean;
  isPaused: boolean;
  simulationSpeed: number;
  consoleOutput: LogEntry[];

  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setSimulationSpeed: (speed: number) => void;
  addLog: (message: string, level?: LogEntry['level']) => void;
  clearConsole: () => void;
  reset: () => void;
}

const useSimulationStore = create<SimulationStore>((set) => ({
  isRunning: false,
  isPaused: false,
  simulationSpeed: 1.0,
  consoleOutput: [],

  setRunning: (running) => set({ isRunning: running }),
  setPaused: (paused) => set({ isPaused: paused }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),

  addLog: (message, level = 'info') => set((state) => ({
    consoleOutput: [...state.consoleOutput.slice(-500), {
      id: Math.random().toString(36).slice(2),
      level,
      message,
      timestamp: Date.now(),
    }],
  })),

  clearConsole: () => set({ consoleOutput: [] }),
  reset: () => set({
    isRunning: false,
    isPaused: false,
    simulationSpeed: 1.0,
    consoleOutput: [],
  }),
}));

export default useSimulationStore;
