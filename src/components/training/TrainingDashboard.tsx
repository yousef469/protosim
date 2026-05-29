import { useEffect, useRef, useState } from 'react';
import useRlStore from '../../store/rlStore';
import useSimulationStore from '../../store/simulationStore';
import { TRAINING_TASKS } from '../../rl/tasks';
import { ARCHITECTURES, isTemporal } from '../../rl/architectures';
import { currentAgent } from '../../rl/agentRef';
import { CACHE_KEY } from '../../mujoco/sampleRobots';
import type { TrainingTaskId } from '../../rl/tasks';
import type { ArchitectureId } from '../../rl/architectures';

type CategoryTab = 'core' | 'temporal';

export function TrainingDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isTraining, currentEpisode, totalEpisodes,
    episodeRewards, bestReward, trainingSpeed,
    trainingTask, customRewardCode,
    architecture, archConfig,
    setTraining, setTrainingSpeed,
    setTrainingTask, setCustomRewardCode,
    setArchitecture, setArchConfig,
  } = useRlStore();

  const categories = ['core', 'temporal'] as CategoryTab[];
  const activeCategory: CategoryTab = ARCHITECTURES.find(a => a.id === architecture)?.category ?? 'core';
  const visibleArches = ARCHITECTURES.filter(a => a.category === activeCategory);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || episodeRewards.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 20, left: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    if (episodeRewards.length < 2) return;

    const rewards = episodeRewards.map(r => r.reward);
    const maxR = Math.max(...rewards, 1);
    const minR = Math.min(...rewards, 0);
    const range = maxR - minR || 1;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < episodeRewards.length; i++) {
      const x = pad.left + (i / (episodeRewards.length - 1)) * pw;
      const y = pad.top + ph - ((rewards[i] - minR) / range) * ph;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px monospace';
    ctx.fillText(maxR.toFixed(1), 2, pad.top + 8);
    ctx.fillText(minR.toFixed(1), 2, pad.top + ph);
    ctx.fillText('0', pad.left, pad.top + ph + 14);
    ctx.fillText(String(episodeRewards.length - 1), pad.left + pw - 20, pad.top + ph + 14);
  }, [episodeRewards]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasCheckpoint, setHasCheckpoint] = useState(() => !!localStorage.getItem(CACHE_KEY));
  const selectedTask = TRAINING_TASKS.find(t => t.id === trainingTask);

  // Keep hasCheckpoint in sync when new best weights are saved
  useEffect(() => {
    const check = () => setHasCheckpoint(!!localStorage.getItem(CACHE_KEY));
    window.addEventListener('storage', check);
    const id = setInterval(check, 2000);
    return () => { window.removeEventListener('storage', check); clearInterval(id); };
  }, []);

  const handleExport = () => {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) {
      useSimulationStore.getState().addLog('No checkpoint saved yet. Train until a best reward is recorded.', 'warning');
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkpoint_${bestReward === -Infinity ? 'untrained' : bestReward.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useSimulationStore.getState().addLog('Checkpoint exported', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      localStorage.setItem(CACHE_KEY, raw);
      setHasCheckpoint(true);
      e.target.value = '';

      // Restore reward from checkpoint metadata
      try {
        const data = JSON.parse(raw);
        if (typeof data.reward === 'number') {
          useRlStore.getState().setBestReward(data.reward);
        }
      } catch {}

      // Reload weights into the running agent if available
      if (currentAgent) {
        const ok = currentAgent.loadSerialized(raw);
        useSimulationStore.getState().addLog(
          ok ? 'Checkpoint loaded into running agent' : 'Failed to load checkpoint',
          ok ? 'success' : 'error',
        );
      } else {
        useSimulationStore.getState().addLog('Checkpoint saved — start training to apply', 'info');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Goal section */}
      <div className="p-2.5 border-b border-gray-200 space-y-2">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Training</h3>

        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 font-medium">Goal</span>
          <select
            value={trainingTask}
            onChange={(e) => setTrainingTask(e.target.value as TrainingTaskId)}
            disabled={isTraining}
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-white disabled:opacity-50"
          >
            {TRAINING_TASKS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {selectedTask && (
            <p className="text-[10px] text-gray-400 leading-tight">{selectedTask.description}</p>
          )}
        </div>

        {trainingTask === 'custom' && (
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-medium">Reward Function</span>
            <textarea
              value={customRewardCode}
              onChange={(e) => setCustomRewardCode(e.target.value)}
              disabled={isTraining}
              placeholder="// Return a number.\n// state.qvel, state.xpos, state.ctrl"
              rows={3}
              className="w-full text-[10px] font-mono px-2 py-1.5 border border-gray-200 rounded bg-gray-50 disabled:opacity-50 resize-none"
            />
          </div>
        )}
      </div>

      {/* Model architecture section */}
      <div className="p-2.5 border-b border-gray-200 space-y-2">
        <span className="text-[10px] text-gray-400 font-medium">Model Architecture</span>

        {/* Category tabs */}
        <div className="flex gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                const first = ARCHITECTURES.find(a => a.category === cat);
                if (first) setArchitecture(first.id);
              }}
              disabled={isTraining}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              {cat === 'core' ? 'Core (Stateless)' : 'Temporal (History)'}
            </button>
          ))}
        </div>

        {/* Architecture picker */}
        <div className="grid grid-cols-1 gap-1">
          {visibleArches.map((a) => (
            <button
              key={a.id}
              onClick={() => setArchitecture(a.id)}
              disabled={isTraining}
              className={`text-left px-2 py-1.5 rounded border text-[11px] transition-colors ${
                architecture === a.id
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <span className={`font-medium ${architecture === a.id ? 'text-blue-700' : 'text-gray-700'}`}>
                {a.label}
              </span>
              <span className="block text-[9px] text-gray-400">{a.description}</span>
            </button>
          ))}
        </div>

        {/* Config sliders */}
        <div className="space-y-1.5 pt-1">
          <Slider label="Hidden Size" value={archConfig.hiddenSize} min={16} max={512} step={16}
            onChange={(v) => setArchConfig({ hiddenSize: v })} disabled={isTraining} />
          <Slider label="Layers" value={archConfig.numLayers} min={1} max={6} step={1}
            onChange={(v) => setArchConfig({ numLayers: v })} disabled={isTraining} />
          <Slider label="History Length" value={archConfig.historyLen} min={4} max={64} step={4}
            onChange={(v) => setArchConfig({ historyLen: v })} disabled={isTraining || !isTemporal(architecture)} />
          {architecture === 'tcn' && (
            <Slider label="Kernel Size" value={archConfig.kernelSize} min={2} max={8} step={1}
              onChange={(v) => setArchConfig({ kernelSize: v })} disabled={isTraining} />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px bg-gray-200 text-[11px]">
        <div className="bg-white p-2">
          <span className="text-gray-400">Episode</span>
          <p className="font-semibold text-gray-800">{currentEpisode} / {totalEpisodes}</p>
        </div>
        <div className="bg-white p-2">
          <span className="text-gray-400">Best</span>
          <p className="font-semibold text-green-600">{bestReward === -Infinity ? '-' : bestReward.toFixed(2)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 p-2 relative">
        {episodeRewards.length < 2 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center">
              <p className="text-[11px] text-gray-400 font-medium">No training data yet</p>
              <p className="text-[9px] text-gray-300 mt-0.5">Click Start Training to begin</p>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Controls */}
      <div className="p-2.5 border-t border-gray-200 space-y-2">
        <Slider label="Speed" value={trainingSpeed} min={1} max={100} step={1}
          onChange={setTrainingSpeed} />
        <div className="flex gap-1.5">
          <button
            onClick={() => setTraining(!isTraining)}
            className={`flex-1 py-1.5 rounded text-xs font-medium text-white ${
              isTraining ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isTraining ? 'Stop' : 'Start Training'}
          </button>
        </div>

        {/* Checkpoint buttons */}
        <div className="flex gap-1.5 pt-1 border-t border-gray-100">
          <button onClick={handleExport} disabled={!hasCheckpoint}
            className={`flex-1 py-1 rounded text-[10px] font-medium ${
              hasCheckpoint
                ? 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                : 'text-gray-300 bg-gray-50 cursor-not-allowed'
            }`}
          >
            Export Checkpoint
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-1 rounded text-[10px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
          >
            Import Checkpoint
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-20 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 h-1 disabled:opacity-40"
      />
      <span className="text-[10px] text-gray-500 w-8 text-right">{value}</span>
    </div>
  );
}
