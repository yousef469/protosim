import type { SimulationController } from '../../core/SimulationController';

interface ToolbarProps {
  controller: SimulationController | null;
  isRunning: boolean;
  isPaused: boolean;
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
  onLoadRobot: () => void;
  robotName: string | null;
}

export function Toolbar({
  controller, isRunning, isPaused,
  onRun, onStop, onReset, onLoadRobot, robotName,
}: ToolbarProps) {
  return (
    <div className="h-11 bg-white border-b border-gray-200 flex items-center px-3 gap-2">
      <span className="text-sm font-bold tracking-tight text-gray-800 mr-2">ProtoSim</span>

      {/* Load Robot */}
      <button
        onClick={onLoadRobot}
        className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        + Load Robot
      </button>

      {robotName && (
        <span className="text-[11px] text-gray-400 ml-1 truncate max-w-32">{robotName}</span>
      )}

      <div className="w-px h-5 bg-gray-300 mx-2" />

      {/* Simulation controls */}
      <button
        onClick={onRun}
        className={`px-3 py-1 rounded text-xs font-medium text-white transition-colors ${
          isRunning && !isPaused
            ? 'bg-yellow-600 hover:bg-yellow-700'
            : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {isRunning && !isPaused ? '⏸ Pause' : isPaused ? '▶ Resume' : '▶ Run'}
      </button>
      <button
        onClick={onStop}
        disabled={!isRunning}
        className="px-3 py-1 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors"
      >
        ⏹ Stop
      </button>
      <button
        onClick={onReset}
        className="px-3 py-1 rounded text-xs font-medium text-white bg-gray-600 hover:bg-gray-700 transition-colors"
      >
        ↺ Reset
      </button>

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        <span>
          Status: {!controller?.isInitialized ? 'Initializing...' : isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
