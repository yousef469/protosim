import type { SimulationController } from '../../core/SimulationController';
import type { TransformMode, EditorMode } from '../../store/modelStore';

interface ToolbarProps {
  controller: SimulationController | null;
  isRunning: boolean;
  isPaused: boolean;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
  transformMode?: TransformMode;
  onTransformModeChange?: (mode: TransformMode) => void;
}

const MODES: { mode: TransformMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
  { mode: 'physics', label: 'Physics' },
];

export function Toolbar({
  controller, isRunning, isPaused, editorMode, onEditorModeChange,
  onRun, onStop, onReset,
  transformMode = 'translate', onTransformModeChange,
}: ToolbarProps) {
  return (
    <div className="h-11 bg-white border-b border-gray-200 flex items-center px-3 gap-2">
      {/* Mode tabs */}
      <div className="flex bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => onEditorModeChange('design')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            editorMode === 'design'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Design
        </button>
        <button
          onClick={() => onEditorModeChange('simulation')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            editorMode === 'simulation'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Simulation
        </button>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Design mode controls */}
      {editorMode === 'design' && (
        <>
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => onTransformModeChange?.(mode)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                transformMode === mode
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </>
      )}

      {/* Simulation mode controls */}
      {editorMode === 'simulation' && (
        <>
          <button
            onClick={onRun}
            className={`px-3 py-1 rounded text-xs font-medium text-white ${
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
            className="px-3 py-1 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40"
          >
            ⏹ Stop
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1 rounded text-xs font-medium text-white bg-gray-600 hover:bg-gray-700"
          >
            ↺ Reset
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        <span>
          {editorMode === 'simulation' ? (
            <>Status: {!controller?.isInitialized ? 'Initializing...' : isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}</>
          ) : (
            'Design mode'
          )}
        </span>
      </div>
    </div>
  );
}
