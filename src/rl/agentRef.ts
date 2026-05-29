import { PPOAgent } from './PPO';

export let currentAgent: PPOAgent | null = null;

export function setCurrentAgent(agent: PPOAgent | null) {
  currentAgent = agent;
}
