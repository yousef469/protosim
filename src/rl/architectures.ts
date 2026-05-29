import * as tf from '@tensorflow/tfjs';

export type ArchitectureId = 'mlp' | 'residual_mlp' | 'lstm' | 'gru' | 'tcn';

export interface ArchConfig {
  hiddenSize: number;
  numLayers: number;
  activation: 'tanh' | 'relu' | 'elu';
  historyLen: number;
  kernelSize: number;
}

export const DEFAULT_ARCH_CONFIG: ArchConfig = {
  hiddenSize: 64,
  numLayers: 2,
  activation: 'tanh',
  historyLen: 16,
  kernelSize: 3,
};

export interface ArchitectureInfo {
  id: ArchitectureId;
  label: string;
  description: string;
  category: 'core' | 'temporal';
}

export const ARCHITECTURES: ArchitectureInfo[] = [
  {
    id: 'mlp',
    label: 'Vanilla MLP',
    description: 'Simple feed-forward dense layers. Fast, stable, stateless.',
    category: 'core',
  },
  {
    id: 'residual_mlp',
    label: 'Residual MLP',
    description: 'MLP with skip connections. Learns corrections on top of a base mapping.',
    category: 'core',
  },
  {
    id: 'lstm',
    label: 'LSTM',
    description: 'Long Short-Term Memory. Tracks long-term state via gated recurrence.',
    category: 'temporal',
  },
  {
    id: 'gru',
    label: 'GRU',
    description: 'Gated Recurrent Unit. Faster compact LSTM alternative.',
    category: 'temporal',
  },
  {
    id: 'tcn',
    label: 'TCN (Temporal ConvNet)',
    description: 'Causal dilated 1D convolutions over a fixed history window. Stable for locomotion.',
    category: 'temporal',
  },
];

export function isTemporal(id: ArchitectureId): boolean {
  return id === 'lstm' || id === 'gru' || id === 'tcn';
}

export function modelInputDim(obsDim: number, arch: ArchitectureId, config: ArchConfig): number {
  return isTemporal(arch) ? config.historyLen * obsDim : obsDim;
}

export function buildActor(
  arch: ArchitectureId,
  config: ArchConfig,
  obsDim: number,
  actDim: number,
): tf.LayersModel {
  const inputDim = modelInputDim(obsDim, arch, config);
  const input = tf.input({ shape: [inputDim] });

  let x: tf.SymbolicTensor;
  switch (arch) {
    case 'mlp':
      x = buildMLP(input, obsDim, config);
      break;
    case 'residual_mlp':
      x = buildResidualMLP(input, config);
      break;
    case 'lstm':
      x = buildLSTM(input, obsDim, config);
      break;
    case 'gru':
      x = buildGRU(input, obsDim, config);
      break;
    case 'tcn':
      x = buildTCN(input, obsDim, config);
      break;
  }

  const output = tf.layers.dense({ units: actDim, activation: 'linear' }).apply(x) as tf.SymbolicTensor;
  return tf.model({ inputs: input, outputs: output });
}

export function buildCritic(
  arch: ArchitectureId,
  config: ArchConfig,
  obsDim: number,
): tf.LayersModel {
  const inputDim = modelInputDim(obsDim, arch, config);
  const input = tf.input({ shape: [inputDim] });

  let x: tf.SymbolicTensor;
  switch (arch) {
    case 'mlp':
      x = buildMLP(input, obsDim, config);
      break;
    case 'residual_mlp':
      x = buildResidualMLP(input, config);
      break;
    case 'lstm':
      x = buildLSTM(input, obsDim, config);
      break;
    case 'gru':
      x = buildGRU(input, obsDim, config);
      break;
    case 'tcn':
      x = buildTCN(input, obsDim, config);
      break;
  }

  const output = tf.layers.dense({ units: 1, activation: 'linear' }).apply(x) as tf.SymbolicTensor;
  return tf.model({ inputs: input, outputs: output });
}

function buildMLP(input: tf.SymbolicTensor, _obsDim: number, config: ArchConfig): tf.SymbolicTensor {
  let x = input;
  for (let i = 0; i < config.numLayers; i++) {
    x = tf.layers.dense({ units: config.hiddenSize, activation: config.activation }).apply(x) as unknown as tf.SymbolicTensor;
  }
  return x;
}

function buildResidualMLP(input: tf.SymbolicTensor, config: ArchConfig): tf.SymbolicTensor {
  let x = tf.layers.dense({ units: config.hiddenSize, activation: config.activation }).apply(input) as unknown as tf.SymbolicTensor;
  for (let i = 1; i < config.numLayers; i++) {
    const skip = x;
    x = tf.layers.dense({ units: config.hiddenSize, activation: config.activation }).apply(x) as unknown as tf.SymbolicTensor;
    x = tf.layers.dense({ units: config.hiddenSize, activation: config.activation }).apply(x) as unknown as tf.SymbolicTensor;
    x = tf.layers.add().apply([x, skip]) as unknown as tf.SymbolicTensor;
  }
  return x;
}

function buildLSTM(input: tf.SymbolicTensor, obsDim: number, config: ArchConfig): tf.SymbolicTensor {
  let x = tf.layers.reshape({ targetShape: [config.historyLen, obsDim] }).apply(input) as unknown as tf.SymbolicTensor;
  for (let i = 0; i < config.numLayers; i++) {
    x = tf.layers.lstm({ units: config.hiddenSize, returnSequences: i < config.numLayers - 1 }).apply(x) as unknown as tf.SymbolicTensor;
  }
  return x;
}

function buildGRU(input: tf.SymbolicTensor, obsDim: number, config: ArchConfig): tf.SymbolicTensor {
  let x = tf.layers.reshape({ targetShape: [config.historyLen, obsDim] }).apply(input) as unknown as tf.SymbolicTensor;
  for (let i = 0; i < config.numLayers; i++) {
    x = tf.layers.gru({ units: config.hiddenSize, returnSequences: i < config.numLayers - 1 }).apply(x) as unknown as tf.SymbolicTensor;
  }
  return x;
}

function buildTCN(input: tf.SymbolicTensor, obsDim: number, config: ArchConfig): tf.SymbolicTensor {
  let x = tf.layers.reshape({ targetShape: [config.historyLen, obsDim] }).apply(input) as unknown as tf.SymbolicTensor;
  for (let i = 0; i < config.numLayers; i++) {
    const dilation = Math.pow(2, i);
    x = tf.layers.conv1d({
      filters: config.hiddenSize,
      kernelSize: config.kernelSize,
      dilationRate: dilation,
      padding: 'causal',
      activation: config.activation,
    }).apply(x) as unknown as tf.SymbolicTensor;
  }
  x = tf.layers.globalAveragePooling1d().apply(x) as unknown as tf.SymbolicTensor;
  return x;
}

export function prepareObservation(
  rawObs: Float32Array,
  historyBuffer: Float32Array[],
  arch: ArchitectureId,
  config: ArchConfig,
): Float32Array {
  if (!isTemporal(arch)) return rawObs;

  const buffer = [...historyBuffer];
  while (buffer.length < config.historyLen) {
    const pad = new Float32Array(rawObs.length);
    buffer.unshift(pad);
  }

  const flat = new Float32Array(config.historyLen * rawObs.length);
  let off = 0;
  for (const frame of buffer) {
    flat.set(frame, off);
    off += frame.length;
  }
  return flat;
}
