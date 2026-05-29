import { useEffect, useState, useCallback, useRef } from 'react';
import { SceneViewer } from '../components/viewer3d/SceneViewer';
import { CodeEditor } from '../components/editor/CodeEditor';
import { Console } from '../components/editor/Console';
import { Toolbar } from '../components/layout/Toolbar';
import { SensorPanel } from '../components/sensors/SensorPanel';
import { ModelLibrary } from '../components/models/ModelLibrary';
import { ModelDropZone } from '../components/models/ModelDropZone';
import { TrainingDashboard } from '../components/training/TrainingDashboard';
import { MuJoCoRenderer } from '../mujoco/MuJoCoRenderer';
import { ToastOverlay } from '../components/editor/ToastOverlay';
import { CACHE_KEY } from '../mujoco/sampleRobots';
import { getSimulationController, type SimulationController } from '../core/SimulationController';
import { getMuJoCoController, type MuJoCoController as MuJoCoControllerType } from '../mujoco/MuJoCoController';
import { PPOAgent, type Transition } from '../rl/PPO';
import { setCurrentAgent } from '../rl/agentRef';
import { robotViewState } from '../rl/vision';
import { RobotCameraCapture } from '../components/vision/RobotCameraCapture';
import { VisionDashboard } from '../components/vision/VisionDashboard';
import { computeReward } from '../rl/tasks';
import useSimulationStore from '../store/simulationStore';
import useEditorStore from '../store/editorStore';
import useModelStore, { type EditorMode } from '../store/modelStore';
import useSceneStore from '../store/sceneStore';
import useRlStore from '../store/rlStore';

export function EditorPage() {
  const [controller, setController] = useState<SimulationController | null>(null);
  const [mjCtrl, setMjCtrl] = useState<MuJoCoControllerType | null>(null);
  const [useMujoco, setUseMujoco] = useState(false);
  const { isRunning, isPaused } = useSimulationStore();
  const { code } = useEditorStore();
  const editorMode = useModelStore((s) => s.editorMode);
  const setEditorMode = useModelStore((s) => s.setEditorMode);
  const transformMode = useModelStore((s) => s.transformMode);
  const setTransformMode = useModelStore((s) => s.setTransformMode);
  const models = useModelStore((s) => s.models);
  const { isTraining, modelXML, currentEpisode, totalEpisodes, trainingSpeed, addEpisodeReward, setCurrentEpisode } = useRlStore();
  const trainingLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ppoRef = useRef<PPOAgent | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'training' | 'vision'>('training');

  useEffect(() => {
    const ctrl = getSimulationController();
    setController(ctrl);
    ctrl.init();
    const mj = getMuJoCoController();
    mj.init().then(() => setMjCtrl(mj));
    return () => ctrl.dispose();
  }, []);

  // Training loop
  const episodeRef = useRef(0);
  const dimKeyRef = useRef('');

  useEffect(() => {
    if (!isTraining || !modelXML || !mjCtrl?.isLoaded) {
      if (trainingLoopRef.current) {
        clearTimeout(trainingLoopRef.current);
        trainingLoopRef.current = null;
      }
      return;
    }

    const mj = mjCtrl;
    const obsDim = mj.modelNq + mj.modelNv;
    const actDim = mj.modelNu;
    if (obsDim === 0 || actDim === 0) {
      useSimulationStore.getState().addLog('Training: model has no joints or actuators', 'error');
      useRlStore.getState().setTraining(false);
      return;
    }

    // Recreate PPO agent if model dimensions or architecture changed
    const { architecture, archConfig } = useRlStore.getState();
    const dimKey = `${obsDim}x${actDim}-${architecture}-${archConfig.hiddenSize}-${archConfig.numLayers}`;
    if (!ppoRef.current || dimKeyRef.current !== dimKey) {
      if (ppoRef.current) { ppoRef.current.dispose(); setCurrentAgent(null); }
      const agent = new PPOAgent({ obsDim, actDim, architecture, archConfig });
      // Restore best weights from localStorage
      try {
        const saved = localStorage.getItem(CACHE_KEY);
        if (saved && agent.loadSerialized(saved)) {
          useSimulationStore.getState().addLog('Loaded saved best weights', 'info');
        }
      } catch {}
      ppoRef.current = agent;
      setCurrentAgent(agent);
      dimKeyRef.current = dimKey;
      useSimulationStore.getState().addLog(`Created PPO agent (obs=${obsDim}, act=${actDim}, arch=${architecture})`, 'info');
    }
    const agent = ppoRef.current;

    const episodeLen = 200;
    episodeRef.current = currentEpisode;

    useSimulationStore.getState().addLog(`Starting PPO training (obs=${obsDim}, act=${actDim}, arch=${architecture})`, 'success');

    const runEpisode = () => {
      if (!mj.isLoaded || !useRlStore.getState().isTraining) return;

      mj.reset();
      agent.resetHistory();
      const transitions: Transition[] = [];
      let epReward = 0;
      let step = 0;

      const stepEpisode = () => {
        if (!useRlStore.getState().isTraining) return;

        for (let i = 0; i < 10 && step < episodeLen; i++, step++) {
          const state = mj.getState();
          if (!state) return scheduleNext();

          const obs = new Float32Array(obsDim);
          for (let j = 0; j < mj.modelNq; j++) obs[j] = state.qpos[j] as number;
          for (let j = 0; j < mj.modelNv; j++) obs[mj.modelNq + j] = state.qvel[j] as number;

          const { action, logProb, value, modelInput } = agent.getAction(obs);
          mj.setAllCtrl(action);
          mj.step();

          const nextState = mj.getState();
          const { trainingTask, customRewardCode } = useRlStore.getState();
          const reward = computeReward(trainingTask, nextState, mj, customRewardCode);
          epReward += reward;
          transitions.push({ obs: modelInput, action, reward, done: step === episodeLen - 1, value, logProb });
        }

        if (step < episodeLen) {
          scheduleNext();
        } else {
          finishEpisode();
        }
      };

      const scheduleNext = () => {
        const speed = useRlStore.getState().trainingSpeed;
        trainingLoopRef.current = setTimeout(stepEpisode, Math.max(1, Math.round(10 / speed)));
      };

      const finishEpisode = () => {
        const { policyLoss, valueLoss } = agent.update(transitions);
        const avgReward = epReward / episodeLen;
        episodeRef.current++;

        const prevBest = useRlStore.getState().bestReward;
        setCurrentEpisode(episodeRef.current);
        addEpisodeReward({ episode: episodeRef.current, reward: avgReward, length: episodeLen, timestamp: Date.now() });
        if (avgReward > prevBest) {
          const serialized = agent.saveSerialized(avgReward);
          try { localStorage.setItem('protosim_best_weights', serialized); } catch {}
        }

        useSimulationStore.getState().addLog(
          `Ep ${episodeRef.current}: reward=${avgReward.toFixed(3)}, policy=${policyLoss.toFixed(4)}, value=${valueLoss.toFixed(4)}`,
          'info',
        );

        if (episodeRef.current >= useRlStore.getState().totalEpisodes) {
          useRlStore.getState().setTraining(false);
          useSimulationStore.getState().addLog('Training complete!', 'success');
        } else {
          trainingLoopRef.current = setTimeout(runEpisode, 0);
        }
      };

      stepEpisode();
    };

    trainingLoopRef.current = setTimeout(runEpisode, 0);

    return () => {
      if (trainingLoopRef.current) {
        clearTimeout(trainingLoopRef.current);
        trainingLoopRef.current = null;
      }
    };
  }, [isTraining, modelXML, mjCtrl]);

  const hasMujocoModel = useRlStore((s) => s.modelXML !== null);

  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    setEditorMode(mode);

    if (mode === 'simulation' && hasMujocoModel && mjCtrl) {
      useSimulationStore.getState().addLog('MuJoCo simulation mode — robot loaded', 'success');
      if (controller) controller.clearBodies();
      if (!mjCtrl.isLoaded) {
        const xml = useRlStore.getState().modelXML;
        if (xml) mjCtrl.loadXML(xml).catch((err) =>
          useSimulationStore.getState().addLog(`Reload error: ${err}`, 'error')
        );
      }
      setUseMujoco(true);
      return;
    }

    if (mode === 'simulation' && controller) {
      setUseMujoco(false);
      // Create physics bodies only for models explicitly marked as physics objects
      let bodyCount = 0;
      for (const m of useModelStore.getState().models) {
        if (m.meshParts && m.meshParts.length > 1) {
          // Per-part physics: only create bodies for marked parts
          const activeParts = m.meshParts.filter((p) => p.physicsType !== 'none');
          if (activeParts.length === 0) continue;

          const collisionGroup = m.meshParts.length > 1 ? 1 : undefined;
          for (const part of activeParts) {
            controller.addBody({
              id: part.id,
              type: part.physicsType as 'dynamic' | 'static',
              shape: 'convexHull',
              vertices: part.vertices,
              position: {
                x: part.position.x + m.position.x,
                y: part.position.y + m.position.y,
                z: part.position.z + m.position.z,
              },
              mass: Math.max(0.5, part.vertices.length / 3000),
              noSelfCollide: collisionGroup,
            });
            bodyCount++;
          }

          // Find the first non-wheel part as root, or use the first active part
          const rootPart = activeParts.find((p) => !p.isWheel) || activeParts[0];
          for (const part of activeParts) {
            if (part.id === rootPart.id) continue;
            controller.createJoint({
              bodyId1: rootPart.id,
              bodyId2: part.id,
              jointType: part.isWheel ? 'revolute' : 'fixed',
              anchor: {
                x: part.position.x + m.position.x,
                y: part.position.y + m.position.y,
                z: part.position.z + m.position.z,
              },
              axis: { x: 1, y: 0, z: 0 },
            });
          }

          useSimulationStore.getState().addLog(`${m.name}: ${activeParts.length} physics parts`, 'success');
        } else if (m.physicsType !== 'none') {
          controller.addBody({
            id: m.bodyId,
            type: m.physicsType as 'dynamic' | 'static',
            shape: 'convexHull',
            vertices: m.vertices,
            position: m.position,
            mass: m.vertices ? Math.max(0.5, m.vertices.length / 3000) : 1,
          });
          bodyCount++;
        }
      }

      if (bodyCount === 0) {
        useSimulationStore.getState().addLog('No physics objects — mark parts in Design mode with the Physics tool', 'warning');
      }

      controller.start();
      useSimulationStore.getState().addLog('Simulation mode — physics running', 'success');
    } else {
      if (useMujoco) {
        useRlStore.getState().setTraining(false);
        setUseMujoco(false);
      }
      if (controller) {
        controller.clearBodies();
        controller.pause();
      }
      useSimulationStore.getState().addLog('Design mode — editing', 'info');
    }
  }, [controller, mjCtrl, hasMujocoModel, setEditorMode, useMujoco]);

  const handleRun = useCallback(() => {
    if (useMujoco && mjCtrl) {
      useSimulationStore.getState().addLog('Starting MuJoCo simulation...', 'success');
      return;
    }
    if (!controller) return;
    if (isRunning && !isPaused) controller.pause();
    else if (isPaused) controller.resume();
    else {
      controller.start();
      controller.runUserCode(code);
    }
  }, [controller, isRunning, isPaused, code, useMujoco, mjCtrl]);

  const handleStop = useCallback(() => {
    if (useMujoco) {
      useRlStore.getState().setTraining(false);
      return;
    }
    controller?.stop();
  }, [controller, useMujoco]);

  const handleReset = useCallback(() => {
    if (useMujoco && mjCtrl) {
      mjCtrl.reset();
      useRlStore.getState().setTraining(false);
      useRlStore.getState().setCurrentEpisode(0);
      useSimulationStore.getState().addLog('MuJoCo simulation reset', 'info');
      return;
    }
    if (editorMode === 'simulation') {
      controller?.stop();
      for (const m of models) {
        if (m.meshParts && m.meshParts.length > 1) {
          const activeParts = m.meshParts.filter((p) => p.physicsType !== 'none');
          for (const part of activeParts) {
            controller?.teleportBody(part.id, {
              x: part.position.x + m.position.x,
              y: part.position.y + m.position.y,
              z: part.position.z + m.position.z,
            });
          }
        } else if (m.physicsType !== 'none') {
          controller?.teleportBody(m.bodyId, m.position);
        }
      }
      useSimulationStore.getState().reset();
      useSimulationStore.getState().addLog('Simulation reset', 'info');
    }
  }, [controller, editorMode, models, useMujoco, mjCtrl]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Loading overlay for MuJoCo initialization */}
      {editorMode === 'simulation' && !mjCtrl && (
        <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium">Loading MuJoCo physics engine...</p>
            <p className="text-[11px] text-gray-400 mt-1">Initializing WASM module</p>
          </div>
        </div>
      )}

      <Toolbar
        controller={controller}
        isRunning={isRunning}
        isPaused={isPaused}
        editorMode={editorMode}
        onEditorModeChange={handleEditorModeChange}
        onRun={handleRun}
        onStop={handleStop}
        onReset={handleReset}
        transformMode={transformMode}
        onTransformModeChange={setTransformMode}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {editorMode === 'design' ? (
          <div className="w-64 flex-shrink-0 border-r border-gray-200">
            <ModelLibrary />
          </div>
        ) : useMujoco ? (
          <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setSidebarTab('training')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-all duration-150 ${
                  sidebarTab === 'training'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                Training
              </button>
              <button
                onClick={() => setSidebarTab('vision')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-all duration-150 ${
                  sidebarTab === 'vision'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                Vision
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {sidebarTab === 'training' ? <TrainingDashboard /> : <VisionDashboard />}
            </div>
          </div>
        ) : (
          <div className="w-56 flex-shrink-0 border-r border-gray-200">
            <SensorPanel />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 relative">
          {editorMode === 'design' && <ModelDropZone />}
          <div className="flex-1">
            <SceneViewer>
              {useMujoco && mjCtrl && (
                <>
                  <MuJoCoRenderer ctrl={mjCtrl} />
                  <RobotCameraCapture />
                </>
              )}
            </SceneViewer>
          </div>
        </div>

        {editorMode === 'simulation' && !useMujoco && (
          <div className="w-96 flex-shrink-0 flex flex-col border-l border-gray-200 bg-white">
            <div className="flex-1 min-h-0">
              <CodeEditor />
            </div>
            <div className="h-48 border-t border-gray-200">
              <Console />
            </div>
          </div>
        )}
      </div>
      <ToastOverlay />
    </div>
  );
}
