# ProtoSim

Train AI agents with reinforcement learning in your browser. MuJoCo physics, TF.js neural networks, hot-swappable architectures — zero setup, no Python or CUDA required.

## Features

- **Reinforcement Learning** — PPO training for MuJoCo robots in your browser
- **Hot-swappable Architectures** — MLP, Residual MLP, LSTM, GRU, TCN
- **Multiple Task Goals** — Walk Forward, Balance, Stand Up, Custom reward
- **Model Hub** — Browse, install, and use pre-trained vision/RL/text models via IndexedDB
- **Robot Vision** — Live camera feed from the robot's perspective with object detection overlay
- **Checkpoint System** — Export/import trained model weights
- **Datasets Hub** — Curated dataset browser linked to sources

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS v4
- **Physics**: MuJoCo WASM (`@mujoco/mujoco`)
- **3D Rendering**: Three.js + React Three Fiber
- **AI**: TensorFlow.js (WebGL backend)
- **State**: Zustand

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deployment

```bash
npm run build
npm run preview
```

## Competition

Built for the Mind the Product — World Product Day 2026 "Everyone Ships Now" challenge.
