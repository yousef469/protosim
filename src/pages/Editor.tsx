import { useEffect, useState, useCallback, useRef } from 'react';
import { SceneViewer } from '../components/viewer3d/SceneViewer';
import { Toolbar } from '../components/layout/Toolbar';
import { TrainingDashboard } from '../components/training/TrainingDashboard';
import { MuJoCoRenderer } from '../mujoco/MuJoCoRenderer';
import { ToastOverlay } from '../components/editor/ToastOverlay';
import { CACHE_KEY, sampleRobots, loadBuiltInRobot } from '../mujoco/sampleRobots';
import { getMuJoCoController, type MuJoCoController as MuJoCoControllerType } from '../mujoco/MuJoCoController';
import { PPOAgent, type Transition } from '../rl/PPO';
import { setCurrentAgent } from '../rl/agentRef';
import { robotViewState } from '../rl/vision';
import { RobotCameraCapture } from '../components/vision/RobotCameraCapture';
import { SpawnedObjects } from '../components/vision/SpawnedObjects';
import { VisionDashboard } from '../components/vision/VisionDashboard';
import { computeReward } from '../rl/tasks';
import useSimulationStore from '../store/simulationStore';
import useRlStore from '../store/rlStore';

export function EditorPage() {
  const [mjCtrl, setMjCtrl] = useState<MuJoCoControllerType | null>(null);
  const [useMujoco, setUseMujoco] = useState(false);
  const [robotName, setRobotName] = useState<string | null>(null);
  const [loadingRobot, setLoadingRobot] = useState(false);
  const { isRunning } = useSimulationStore();
  const { isTraining, modelXML, currentEpisode, totalEpisodes, trainingSpeed, addEpisodeReward, setCurrentEpisode } = useRlStore();
  const trainingLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ppoRef = useRef<PPOAgent | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'training' | 'vision'>('training');
  const loadFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mj = getMuJoCoController();
    mj.init().then(() => setMjCtrl(mj));
  }, []);

  const selectRobot = useCallback(async (robotId: string) => {
    const robot = sampleRobots.find(r => r.id === robotId);
    if (!robot || !mjCtrl) return;
    setLoadingRobot(true);
    try {
      const xml = await loadBuiltInRobot(robot, mjCtrl, (msg, type) => useSimulationStore.getState().addLog(msg, type));
      setRobotName(robot.name);
      useRlStore.getState().setModelXML(xml);
      useRlStore.getState().setModelName(robot.name);
      setUseMujoco(true);
      useSimulationStore.getState().addLog(`Loaded robot: ${robot.name}`, 'success');
    } catch (err) {
      useSimulationStore.getState().addLog(`Load error: ${err}`, 'error');
    }
    setLoadingRobot(false);
  }, [mjCtrl]);

  const handleLoadRobotFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !mjCtrl) return;

    const getPath = (f: File) => (f as any).webkitRelativePath || f.name;
    const allXmls = new Map<string, string>();
    const meshes = new Map<string, Uint8Array>();
    let rootFile: File | null = null;

    for (const f of Array.from(files)) {
      const path = getPath(f);
      if (/\.(xml|mjcf)$/i.test(f.name)) {
        allXmls.set(path, await f.text());
        if (/^scene\.xml$/i.test(path.replace(/^.*[/\\]/, ''))) rootFile = f;
      } else if (/\.(stl|obj|msh|dae|ply)$/i.test(f.name)) {
        meshes.set(path, new Uint8Array(await f.arrayBuffer()));
      }
    }

    if (!rootFile) {
      const firstXml = Array.from(allXmls.entries()).find(([k]) => /\.(xml|mjcf)$/i.test(k));
      if (!firstXml) {
        useSimulationStore.getState().addLog('No XML/MJCF file found', 'error');
        return;
      }
      rootFile = Array.from(files).find(f => getPath(f) === firstXml[0]) || null;
    }
    if (!rootFile) {
      useSimulationStore.getState().addLog('No XML/MJCF file found', 'error');
      return;
    }

    const rootPath = getPath(rootFile);
    const rootText = allXmls.get(rootPath)!;
    const name = rootFile.name.replace(/\.[^/.]+$/, '');
    setRobotName(name);
    useRlStore.getState().setModelName(name);

    try {
      await mjCtrl.loadXML(rootText, meshes, allXmls);
      useRlStore.getState().setModelXML(rootText);
      setUseMujoco(true);
      useSimulationStore.getState().addLog(`Loaded robot: ${name}`, 'success');
    } catch (err) {
      useSimulationStore.getState().addLog(`Load error: ${err}`, 'error');
    }
  }, [mjCtrl]);

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

    const { architecture, archConfig } = useRlStore.getState();
    const dimKey = `${obsDim}x${actDim}-${architecture}-${archConfig.hiddenSize}-${archConfig.numLayers}`;
    if (!ppoRef.current || dimKeyRef.current !== dimKey) {
      if (ppoRef.current) { ppoRef.current.dispose(); setCurrentAgent(null); }
      const agent = new PPOAgent({ obsDim, actDim, architecture, archConfig });
      try {
        const saved = localStorage.getItem(CACHE_KEY);
        if (saved) {
          const result = agent.loadSerialized(saved);
          if (result.ok) {
            useSimulationStore.getState().addLog('Loaded saved best weights', 'info');
          } else if (result.mismatch) {
            useSimulationStore.getState().addLog(`Saved weights incompatible: ${result.mismatch}`, 'warning');
            useRlStore.getState().setBestReward(-Infinity);
          }
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

        if (step < episodeLen) scheduleNext();
        else finishEpisode();
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
      if (trainingLoopRef.current) { clearTimeout(trainingLoopRef.current); trainingLoopRef.current = null; }
    };
  }, [isTraining, modelXML, mjCtrl]);

  const handleRun = useCallback(() => {
    if (useMujoco && mjCtrl) {
      useSimulationStore.getState().addLog('MuJoCo simulation ready', 'success');
    }
  }, [useMujoco, mjCtrl]);

  const handleStop = useCallback(() => {
    if (useMujoco) useRlStore.getState().setTraining(false);
  }, [useMujoco]);

  const handleReset = useCallback(() => {
    if (useMujoco && mjCtrl) {
      mjCtrl.reset();
      useRlStore.getState().setTraining(false);
      useRlStore.getState().setCurrentEpisode(0);
      useSimulationStore.getState().addLog('Simulation reset', 'info');
    }
  }, [useMujoco, mjCtrl]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {!mjCtrl && (
        <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium">Loading MuJoCo physics engine...</p>
            <p className="text-[11px] text-gray-400 mt-1">Initializing WASM module</p>
          </div>
        </div>
      )}

      {loadingRobot && (
        <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium">Loading robot...</p>
          </div>
        </div>
      )}

      <Toolbar
        controller={null}
        isRunning={isRunning}
        isPaused={false}
        onRun={handleRun}
        onStop={handleStop}
        onReset={handleReset}
        onLoadRobot={() => loadFileInputRef.current?.click()}
        robotName={robotName}
      />

      <input
        ref={loadFileInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={(e) => handleLoadRobotFiles(e.target.files)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {useMujoco ? (
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
          <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
            <div className="p-3 border-b border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Built-in Robots</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {sampleRobots.map((robot) => (
                <button
                  key={robot.id}
                  onClick={() => selectRobot(robot.id)}
                  disabled={loadingRobot}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50 group"
                >
                  <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700">{robot.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{robot.desc}</p>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100">
              <button
                onClick={() => loadFileInputRef.current?.click()}
                className="w-full px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                + Load Custom Robot
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="flex-1">
            <SceneViewer>
              {useMujoco && mjCtrl && (
                <>
                  <MuJoCoRenderer ctrl={mjCtrl} />
                  <SpawnedObjects />
                  <RobotCameraCapture />
                </>
              )}
            </SceneViewer>
          </div>
        </div>
      </div>

      <ToastOverlay />
    </div>
  );
}
