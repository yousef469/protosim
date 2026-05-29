import * as tf from '@tensorflow/tfjs';
import {
  type ArchitectureId,
  type ArchConfig,
  DEFAULT_ARCH_CONFIG,
  isTemporal,
  modelInputDim,
  buildActor,
  buildCritic,
  prepareObservation,
} from './architectures';

export interface PPOParams {
  obsDim: number;
  actDim: number;
  hiddenSize?: number;
  lr?: number;
  gamma?: number;
  gaeLambda?: number;
  clipEpsilon?: number;
  entropyCoef?: number;
  valueCoef?: number;
  updateEpochs?: number;
  batchSize?: number;
  architecture?: ArchitectureId;
  archConfig?: Partial<ArchConfig>;
}

export interface Transition {
  obs: Float32Array;
  action: Float32Array;
  reward: number;
  done: boolean;
  value: number;
  logProb: number;
}

export class PPOAgent {
  private actor: tf.LayersModel;
  private critic: tf.LayersModel;
  private params: Required<PPOParams>;
  private logStd: tf.Variable;
  private actorVars: tf.Variable[];
  private criticVars: tf.Variable[];
  private arch: ArchitectureId;
  private archConfig: ArchConfig;
  private historyBuffer: Float32Array[] = [];

  constructor(params: PPOParams) {
    this.arch = params.architecture ?? DEFAULT_ARCH_CONFIG as unknown as ArchitectureId;
    this.archConfig = { ...DEFAULT_ARCH_CONFIG, ...params.archConfig };
    this.params = {
      obsDim: params.obsDim,
      actDim: params.actDim,
      hiddenSize: params.hiddenSize ?? 64,
      lr: params.lr ?? 3e-4,
      gamma: params.gamma ?? 0.99,
      gaeLambda: params.gaeLambda ?? 0.95,
      clipEpsilon: params.clipEpsilon ?? 0.2,
      entropyCoef: params.entropyCoef ?? 0.01,
      valueCoef: params.valueCoef ?? 0.5,
      updateEpochs: params.updateEpochs ?? 10,
      batchSize: params.batchSize ?? 64,
      architecture: this.arch,
      archConfig: this.archConfig,
    };

    this.actor = buildActor(this.arch, this.archConfig, this.params.obsDim, this.params.actDim);
    this.critic = buildCritic(this.arch, this.archConfig, this.params.obsDim);
    this.logStd = tf.variable(tf.zeros([this.params.actDim]));
    this.actorVars = this.collectVars(this.actor);
    this.actorVars.push(this.logStd);
    this.criticVars = this.collectVars(this.critic);
  }

  private collectVars(model: tf.LayersModel): tf.Variable[] {
    return (model.trainableWeights as any[]).map(w => w.val as tf.Variable);
  }

  private get modelInputDim(): number {
    return modelInputDim(this.params.obsDim, this.arch, this.archConfig);
  }

  /** Feed the raw current observation, get action + value. Maintains history internally. */
  getAction(obs: Float32Array): { action: Float32Array; logProb: number; value: number; modelInput: Float32Array } {
    if (isTemporal(this.arch)) {
      this.historyBuffer.push(obs);
      if (this.historyBuffer.length > this.archConfig.historyLen) {
        this.historyBuffer.shift();
      }
    }

    const modelInput = prepareObservation(obs, this.historyBuffer, this.arch, this.archConfig);

    let mean: Float32Array;
    let value: number;
    tf.tidy(() => {
      const obsTensor = tf.tensor2d(modelInput, [1, this.modelInputDim]);
      mean = (this.actor.predict(obsTensor) as tf.Tensor2D).dataSync() as Float32Array;
      value = (this.critic.predict(obsTensor) as tf.Tensor2D).dataSync()[0];
    });

    const std = this.cachedStd();

    const action = new Float32Array(this.params.actDim);
    let logProb = 0;
    for (let i = 0; i < this.params.actDim; i++) {
      const z = boxMuller();
      const raw = mean[i] + z * std[i];
      action[i] = Math.tanh(raw);
      const a_clip = Math.max(-0.999, Math.min(0.999, action[i]));
      const atanh_a = 0.5 * Math.log((1 + a_clip) / (1 - a_clip));
      const z2 = ((atanh_a - mean[i]) / Math.max(std[i], 1e-8)) ** 2;
      logProb += -0.5 * z2 - 0.5 * Math.log(2 * Math.PI) - Math.log(Math.max(std[i], 1e-8));
      logProb -= Math.log(Math.max(1 - action[i] * action[i], 1e-8));
    }

    return { action, logProb, value, modelInput };
  }

  private _stdCache: Float32Array | null = null;

  private cachedStd(): Float32Array {
    if (!this._stdCache) {
      this._stdCache = tf.exp(this.logStd).dataSync() as Float32Array;
    }
    return this._stdCache;
  }

  private invalidateStd(): void {
    if (this._stdCache) { this._stdCache = null; }
  }

  getValue(obs: Float32Array): number {
    const modelInput = prepareObservation(obs, this.historyBuffer, this.arch, this.archConfig);
    return tf.tidy(() => {
      const obsTensor = tf.tensor2d(modelInput, [1, this.modelInputDim]);
      return (this.critic.predict(obsTensor) as tf.Tensor).dataSync()[0];
    });
  }

  resetHistory(): void {
    this.historyBuffer = [];
  }

  update(transitions: Transition[]): { policyLoss: number; valueLoss: number } {
    if (transitions.length < 2) return { policyLoss: 0, valueLoss: 0 };

    const n = transitions.length;
    const obsArr = transitions.map(t => Array.from(t.obs));
    const actArr = transitions.map(t => Array.from(t.action));
    const oldLpArr = transitions.map(t => t.logProb);
    const values = transitions.map(t => t.value);
    const advantages = this.computeGAE(
      transitions.map(t => t.reward),
      values,
      transitions.map(t => t.done),
    );
    const returns = advantages.map((adv, i) => adv + values[i]);

    const advMean = advantages.reduce((a, b) => a + b, 0) / n;
    const advStd = Math.sqrt(advantages.reduce((a, b) => a + (b - advMean) ** 2, 0) / n) || 1;
    const advNorm = advantages.map(a => (a - advMean) / advStd);

    const obsTensor = tf.tensor2d(obsArr, [n, this.modelInputDim]);
    const actTensor = tf.tensor2d(actArr, [n, this.params.actDim]);
    const oldLpTensor = tf.tensor1d(oldLpArr);
    const advTensor = tf.tensor1d(advNorm);
    const retTensor = tf.tensor1d(returns);

    const actorOpt = tf.train.adam(this.params.lr);
    const criticOpt = tf.train.adam(this.params.lr);
    const std = tf.exp(this.logStd);

    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let stepCount = 0;

    for (let epoch = 0; epoch < this.params.updateEpochs; epoch++) {
      const indices = tf.util.createShuffledIndices(n);

      for (let start = 0; start < n; start += this.params.batchSize) {
        const end = Math.min(start + this.params.batchSize, n);
        const batchIdx = new Int32Array(indices.slice(start, end));
        const bsz = batchIdx.length;
        stepCount++;

        const pLoss = actorOpt.minimize(() => {
          const obsBatch = tf.gather(obsTensor, batchIdx);
          const actBatch = tf.gather(actTensor, batchIdx);
          const oldLpBatch = tf.gather(oldLpTensor, batchIdx);
          const advBatch = tf.gather(advTensor, batchIdx);
          const meanBatch = this.actor.predict(obsBatch) as tf.Tensor2D;
          const diff = actBatch.sub(meanBatch);
          const logProb = tf.sum(
            diff.mul(diff).mul(-0.5).div(std.mul(std))
              .sub(tf.log(std).add(tf.scalar(0.5 * Math.log(2 * Math.PI))))
              .sub(tf.log(tf.ones([bsz, 1]).sub(actBatch.mul(actBatch)).add(tf.scalar(1e-8)))),
            1,
          );
          const ratio = tf.exp(logProb.sub(oldLpBatch));
          const surr1 = ratio.mul(advBatch);
          const surr2 = tf.clipByValue(ratio, 1 - this.params.clipEpsilon, 1 + this.params.clipEpsilon).mul(advBatch);
          return tf.neg(tf.mean(tf.minimum(surr1, surr2))) as tf.Scalar;
        }, true, this.actorVars);

        if (pLoss) totalPolicyLoss += pLoss.dataSync()[0];

        const vLoss = criticOpt.minimize(() => {
          const obsBatch = tf.gather(obsTensor, batchIdx);
          const retBatch = tf.gather(retTensor, batchIdx);
          const predBatch = this.critic.predict(obsBatch) as tf.Tensor;
          return tf.losses.meanSquaredError(retBatch.reshape(predBatch.shape), predBatch) as tf.Scalar;
        }, true, this.criticVars);

        if (vLoss) totalValueLoss += vLoss.dataSync()[0];
      }
    }

    obsTensor.dispose();
    actTensor.dispose();
    oldLpTensor.dispose();
    advTensor.dispose();
    retTensor.dispose();

    this.invalidateStd();

    return {
      policyLoss: totalPolicyLoss / stepCount,
      valueLoss: totalValueLoss / stepCount,
    };
  }

  private computeGAE(rewards: number[], values: number[], dones: boolean[]): number[] {
    const advantages = new Array(rewards.length).fill(0);
    let gae = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      const nextVal = t === rewards.length - 1 ? 0 : values[t + 1];
      const delta = rewards[t] + this.params.gamma * nextVal * (dones[t] ? 0 : 1) - values[t];
      gae = delta + this.params.gamma * this.params.gaeLambda * (dones[t] ? 0 : 1) * gae;
      advantages[t] = gae;
    }
    return advantages;
  }

  getWeights(): { actor: tf.Tensor[]; critic: tf.Tensor[]; logStd: number[] } {
    return {
      actor: this.actor.getWeights(),
      critic: this.critic.getWeights(),
      logStd: Array.from(this.logStd.dataSync()),
    };
  }

  setWeights(actorW: tf.Tensor[], criticW: tf.Tensor[], logStd: number[]): void {
    this.actor.setWeights(actorW);
    this.critic.setWeights(criticW);
    const d = tf.tensor1d(logStd);
    this.logStd.assign(tf.variable(d));
    d.dispose();
  }

  saveSerialized(reward?: number): string {
    const w = this.getWeights();
    return JSON.stringify({
      actor: w.actor.map(t => Array.from(t.dataSync())),
      critic: w.critic.map(t => Array.from(t.dataSync())),
      logStd: w.logStd,
      reward: reward ?? null,
      shapes: {
        actor: w.actor.map(t => t.shape),
        critic: w.critic.map(t => t.shape),
      },
    });
  }

  loadSerialized(json: string): boolean {
    try {
      const data = JSON.parse(json);
      const actorW = data.actor.map((vals: number[], i: number) => tf.tensor(vals, data.shapes.actor[i]));
      const criticW = data.critic.map((vals: number[], i: number) => tf.tensor(vals, data.shapes.critic[i]));
      this.actor.setWeights(actorW);
      this.critic.setWeights(criticW);
      const logStdTensor = tf.tensor1d(data.logStd);
      this.logStd.assign(tf.variable(logStdTensor));
      logStdTensor.dispose();
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.actor.dispose();
    this.critic.dispose();
    this.logStd.dispose();
  }
}

function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
