import useSimulationStore from '../store/simulationStore';
import useSceneStore from '../store/sceneStore';

type UserAPI = Record<string, (...args: unknown[]) => unknown>;

class SimulationController {
  private physicsWorker: Worker | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private rafId: number | null = null;
  private lastFrame = 0;
  private stepAccumulator = 0;
  private stepSize = 1 / 60;

  private userAPI: UserAPI = {};
  private pendingCommands: Array<() => void> = [];
  private timers: Array<{ time: number; fn: () => void }> = [];
  private simTime = 0;

  async init(): Promise<void> {
    if (this._isInitialized) return;

    this.physicsWorker = new Worker(
      new URL('../workers/physics.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.physicsWorker.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'ready':
          this._isInitialized = true;
          useSimulationStore.getState().addLog('Physics engine ready', 'success');
          break;
        case 'physics_state':
          useSceneStore.getState().updateBodyStates(msg.data.bodies);
          break;
        case 'error':
          useSimulationStore.getState().addLog(`Physics error: ${msg.data.message}`, 'error');
          break;
      }
    };

    this.physicsWorker.postMessage({ type: 'init' });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (this._isInitialized) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  addBody(def: {
    id: string;
    type?: 'dynamic' | 'static';
    shape: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'convexHull';
    mass?: number;
    friction?: number;
    restitution?: number;
    position?: { x: number; y: number; z: number };
    dimensions?: { x: number; y: number; z: number };
    radius?: number;
    height?: number;
    vertices?: number[];
    noSelfCollide?: number;
  }) {
    this.physicsWorker?.postMessage({
      type: 'add_body',
      data: {
        id: def.id,
        type: def.type || 'dynamic',
        shape: def.shape,
        mass: def.mass ?? 1,
        friction: def.friction ?? 0.5,
        restitution: def.restitution ?? 0.3,
        position: def.position || { x: 0, y: 2, z: 0 },
        dimensions: def.dimensions,
        radius: def.radius,
        height: def.height,
        vertices: def.vertices,
        noSelfCollide: def.noSelfCollide,
      },
    });
  }

  removeBody(id: string) {
    this.physicsWorker?.postMessage({ type: 'remove_body', data: { id } });
  }

  clearBodies() {
    this.physicsWorker?.postMessage({ type: 'reset' });
    useSceneStore.getState().reset();
  }

  applyForce(bodyId: string, force: { x: number; y: number; z: number }) {
    this.physicsWorker?.postMessage({ type: 'apply_force', data: { bodyId, force } });
  }

  applyTorque(bodyId: string, torque: { x: number; y: number; z: number }) {
    this.physicsWorker?.postMessage({ type: 'apply_torque', data: { bodyId, torque } });
  }

  teleportBody(bodyId: string, position: { x: number; y: number; z: number }) {
    this.physicsWorker?.postMessage({
      type: 'set_body_transform',
      data: { id: bodyId, position },
    });
  }

  createJoint(def: {
    bodyId1: string;
    bodyId2: string;
    jointType: 'fixed' | 'revolute';
    anchor: { x: number; y: number; z: number };
    axis?: { x: number; y: number; z: number };
  }) {
    this.physicsWorker?.postMessage({ type: 'create_joint', data: def });
  }

  setUserAPI(api: UserAPI) {
    this.userAPI = api;
  }

  runUserCode(code: string) {
    const store = useSimulationStore.getState();
    store.addLog('Executing user code...', 'info');

    this.simTime = 0;
    this.timers = [];
    this.pendingCommands = [];

    try {
      const wrappedAPI = this.userAPI;
      const apiKeys = Object.keys(wrappedAPI);
      const apiValues = Object.values(wrappedAPI);

      const fn = new Function(
        ...apiKeys,
        'log',
        'wait',
        'motor',
        'getPosition',
        code
      );

      const motor = (targetName: string, speed: number) => {
        const torque = { x: 0, y: 0, z: speed * 5 };
        const state = useSceneStore.getState();
        for (const [id] of state.bodyStates) {
          if (id.includes(targetName) || id === targetName) {
            this.applyTorque(id, torque);
            const pos = state.bodyStates.get(id)?.position;
            if (pos) {
              store.addLog(`motor(${targetName}): torque ${(speed * 5).toFixed(1)} at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`, 'info');
            }
            return;
          }
        }
        store.addLog(`motor("${targetName}"): no body found`, 'error');
      };

      const getPosition = (id: string) => {
        const state = useSceneStore.getState().bodyStates.get(id);
        return state ? state.position : null;
      };

      const log = (msg: string) => {
        useSimulationStore.getState().addLog(String(msg), 'info');
      };

      const wait = (ms: number) => {
        return new Promise<void>((resolve) => {
          this.timers.push({ time: this.simTime + ms / 1000, fn: resolve });
        });
      };

      store.addLog('Starting execution...', 'success');

      const result = fn(...apiValues, log, wait, motor, getPosition);

      if (result instanceof Promise) {
        result.catch((err: Error) => {
          store.addLog(`Error: ${err.message}`, 'error');
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      store.addLog(`Execution error: ${message}`, 'error');
    }
  }

  async start() {
    if (this._isRunning) return;
    if (!this._isInitialized) await this.init();

    this._isRunning = true;
    useSimulationStore.getState().setRunning(true);
    useSimulationStore.getState().addLog('Simulation started', 'success');

    this.lastFrame = performance.now();
    this.stepAccumulator = 0;
    this.loop(this.lastFrame);
  }

  private loop = (now: number) => {
    if (!this._isRunning) return;

    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.stepAccumulator += dt;
    this.simTime += dt;

    const speed = useSimulationStore.getState().simulationSpeed;

    while (this.stepAccumulator >= this.stepSize / speed) {
      this.physicsWorker?.postMessage({ type: 'step' });
      this.stepAccumulator -= this.stepSize / speed;

      const completed = this.timers.filter((t) => t.time <= this.simTime);
      this.timers = this.timers.filter((t) => t.time > this.simTime);
      for (const t of completed) t.fn();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  stop() {
    this._isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    useSimulationStore.getState().setRunning(false);
    useSimulationStore.getState().addLog('Simulation stopped', 'warning');
  }

  pause() {
    this._isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    useSimulationStore.getState().setPaused(true);
    useSimulationStore.getState().addLog('Simulation paused', 'warning');
  }

  resume() {
    if (this._isRunning) return;
    this._isRunning = true;
    useSimulationStore.getState().setPaused(false);
    useSimulationStore.getState().addLog('Simulation resumed', 'success');
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  reset() {
    this.stop();
    this.physicsWorker?.postMessage({ type: 'reset' });
    useSceneStore.getState().reset();
    useSimulationStore.getState().reset();
    this.simTime = 0;
    this.timers = [];
    this.pendingCommands = [];
    useSimulationStore.getState().addLog('Simulation reset', 'info');
  }

  get isRunning() { return this._isRunning; }
  get isInitialized() { return this._isInitialized; }

  dispose() {
    this.stop();
    this.physicsWorker?.terminate();
    this.physicsWorker = null;
    this._isInitialized = false;
  }
}

let instance: SimulationController | null = null;

export function getSimulationController(): SimulationController {
  if (!instance) instance = new SimulationController();
  return instance;
}

export { SimulationController };
