import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import useSimulationStore from '../../store/simulationStore';
import { robotViewState, loadVisionModel, setDetectionModel } from '../../rl/vision';
import { modelHubData } from '../../data/modelHubData';

interface InstalledModel {
  id: string;
  name: string;
}

const INSTALLED_KEY = 'protosim_installed_models';

function getInstalledFromStorage(): InstalledModel[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.map(id => ({
      id,
      name: modelHubData.find(m => m.id === id)?.name || id,
    }));
  } catch {
    return [];
  }
}

export function VisionDashboard() {
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>(getInstalledFromStorage);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelState, setModelState] = useState<'none' | 'loading' | 'loaded' | 'error'>('none');
  const [enabled, setEnabled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const addLog = useCallback((msg: string, level?: 'info' | 'success' | 'warning' | 'error') => {
    useSimulationStore.getState().addLog(msg, level);
  }, []);

  const handleLoad = useCallback(async () => {
    if (!selectedModel) return;
    setModelState('loading');
    addLog(`Loading "${selectedModel}" for vision...`, 'info');
    try {
      const entry = modelHubData.find(m => m.id === selectedModel);
      const model = await loadVisionModel(selectedModel, entry?.modelUrl);
      if (model) {
        setDetectionModel(model);
        setModelState('loaded');
        addLog(`"${selectedModel}" loaded — robot vision active`, 'success');
      } else {
        setModelState('error');
        addLog(`Failed to load "${selectedModel}"`, 'error');
      }
    } catch {
      setModelState('error');
    }
  }, [selectedModel, addLog]);

  const handleToggle = useCallback(() => {
    setEnabled((e) => {
      if (!e) {
        // Clear previous detections when enabling
        robotViewState.detections = [];
      }
      return !e;
    });
  }, []);

  // Render loop — draw camera frame + detections
  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const draw = () => {
      if (!running) return;

      if (robotViewState.imageData) {
        canvas.width = robotViewState.imageData.width;
        canvas.height = robotViewState.imageData.height;
        ctx.putImageData(robotViewState.imageData, 0, 0);

        // Draw detections
        for (const d of robotViewState.detections) {
          const [y1, x1, y2, x2] = d.bbox;
          const w = (x2 - x1) * canvas.width;
          const h = (y2 - y1) * canvas.height;
          const x = x1 * canvas.width;
          const y = y1 * canvas.height;

          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.fillRect(x, y - 14, ctx.measureText(d.class).width + 8, 14);

          ctx.fillStyle = '#000';
          ctx.font = '10px monospace';
          ctx.fillText(`${d.class} ${(d.score * 100).toFixed(0)}%`, x + 4, y - 3);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [enabled]);

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200 text-[11px]">
      <div className="p-2.5 border-b border-gray-200">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Robot Vision
        </h3>
      </div>

      <div className="p-2.5 space-y-2 flex-1 flex flex-col">
        {/* Model selector */}
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 font-medium">Vision Model</label>
          <select
            value={selectedModel}
            onChange={(e) => { setSelectedModel(e.target.value); setModelState('none'); }}
            className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-800 focus:outline-none focus:border-purple-400"
          >
            <option value="">— Select installed model —</option>
            {installedModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {installedModels.length === 0 && (
            <p className="text-[10px] text-gray-400 italic">
              No models installed. Go to Model Hub → install a vision model first.
            </p>
          )}
        </div>

        {/* Load button */}
        {selectedModel && modelState === 'none' && (
          <button
            onClick={handleLoad}
            className="w-full py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-medium"
          >
            Load Model
          </button>
        )}
        {modelState === 'loading' && (
          <p className="text-[10px] text-yellow-600">Loading model...</p>
        )}
        {modelState === 'loaded' && (
          <p className="text-[10px] text-green-600">Model ready ✓</p>
        )}
        {modelState === 'error' && (
          <p className="text-[10px] text-red-600">Failed to load model</p>
        )}

        {/* Enable toggle */}
        {modelState === 'loaded' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={handleToggle}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className={`text-[11px] ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>
              Camera Feed {enabled ? '(active)' : '(off)'}
            </span>
          </label>
        )}

        {/* Camera feed canvas */}
        {enabled && (
          <div className="flex-1 min-h-0 rounded border border-gray-200 overflow-hidden bg-gray-900 flex items-center justify-center relative">
            {!robotViewState.imageData && (
              <div className="text-center">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-[10px] text-gray-400">Waiting for camera feed...</p>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className={`max-w-full max-h-full object-contain ${robotViewState.imageData ? '' : 'hidden'}`}
              width={224}
              height={224}
            />
          </div>
        )}

        {/* Status */}
        {enabled && (
          <div className="text-[10px] text-gray-400">
            {robotViewState.detections.length > 0
              ? `Detected: ${robotViewState.detections.map(d => d.class).join(', ')}`
              : 'No detections'}
          </div>
        )}
      </div>
    </div>
  );
}
