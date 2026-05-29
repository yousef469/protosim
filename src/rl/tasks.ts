import type { MuJoCoController } from '../mujoco/MuJoCoController';
import type { MuJoCoState } from '../mujoco/MuJoCoController';

export const TRAINING_TASKS = [
  {
    id: 'walk',
    label: 'Walk Forward',
    description: 'Move forward along the X axis while staying upright',
  },
  {
    id: 'balance',
    label: 'Balance',
    description: 'Stay upright with minimal movement — keep the robot stable',
  },
  {
    id: 'stand',
    label: 'Stand Up',
    description: 'Stand upright from any starting posture',
  },
  {
    id: 'custom',
    label: 'Custom (Code)',
    description: 'Use the reward function written in the code editor',
  },
] as const;

export type TrainingTaskId = (typeof TRAINING_TASKS)[number]['id'];

export function computeReward(
  taskId: TrainingTaskId,
  state: MuJoCoState | null,
  ctrl: MuJoCoController,
  customCode?: string,
): number {
  if (!state) return 0;

  switch (taskId) {
    case 'walk':
      return walkReward(state, ctrl);
    case 'balance':
      return balanceReward(state, ctrl);
    case 'stand':
      return standReward(state, ctrl);
    case 'custom':
      return customReward(state, ctrl, customCode);
    default:
      return 0;
  }
}

function walkReward(state: MuJoCoState, ctrl: MuJoCoController): number {
  let r = 0;
  // Forward velocity (X axis of root body)
  if (state.qvel.length >= 1) {
    r += (state.qvel[0] as number) * 0.5;
  }
  // Penalize large controls
  for (let i = 0; i < ctrl.modelNu; i++) {
    const c = state.ctrl[i] as number;
    r -= c * c * 0.01;
  }
  // Bonus for upright posture (root body height)
  if (state.xpos.length >= 3) {
    r += Math.max(0, (state.xpos[1] as number) - 0.5) * 0.2;
  }
  return r;
}

function balanceReward(state: MuJoCoState, ctrl: MuJoCoController): number {
  let r = 0;
  // Penalize movement (keep qvel small)
  for (let i = 0; i < ctrl.modelNv; i++) {
    r -= Math.abs(state.qvel[i] as number) * 0.1;
  }
  // Penalize large controls
  for (let i = 0; i < ctrl.modelNu; i++) {
    const c = state.ctrl[i] as number;
    r -= c * c * 0.02;
  }
  // Reward upright posture (root body height)
  if (state.xpos.length >= 3) {
    r += Math.max(0, (state.xpos[1] as number) - 0.5) * 0.5;
  }
  // Penalize horizontal drift
  if (state.xpos.length >= 3) {
    const drift = Math.abs(state.xpos[0] as number) + Math.abs(state.xpos[2] as number);
    r -= drift * 0.1;
  }
  return r;
}

function standReward(state: MuJoCoState, ctrl: MuJoCoController): number {
  let r = 0;
  // Reward height (encourage standing up)
  if (state.xpos.length >= 3) {
    r += Math.max(0, (state.xpos[1] as number) - 0.3) * 1.0;
  }
  // Penalize large controls
  for (let i = 0; i < ctrl.modelNu; i++) {
    const c = state.ctrl[i] as number;
    r -= c * c * 0.01;
  }
  // Small penalty for velocity (reward stability once standing)
  for (let i = 0; i < ctrl.modelNv; i++) {
    r -= Math.abs(state.qvel[i] as number) * 0.05;
  }
  return r;
}

function customReward(
  state: MuJoCoState,
  ctrl: MuJoCoController,
  code?: string,
): number {
  if (!code || code.trim().length === 0) return 0;
  try {
    const fn = new Function('state', 'ctrl', code);
    const result = fn(state, ctrl);
    return typeof result === 'number' && !Number.isNaN(result) ? result : 0;
  } catch {
    return 0;
  }
}
