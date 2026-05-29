export type ModelCategory = 'vision' | 'reinforcement-learning' | 'text' | 'robotics';
export type TfjsSupport = 'native' | 'converted' | 'none';

export interface ModelHubEntry {
  id: string;
  name: string;
  description: string;
  category: ModelCategory;
  tags: string[];
  benchmark?: string;
  source: string;
  tfjs: TfjsSupport;
  framework: string;
  parameters?: string;
  modelUrl?: string;
}

export const modelHubData: ModelHubEntry[] = [
  {
    id: 'coco-ssd',
    name: 'COCO-SSD',
    description: 'TF.js native object detection. Lightweight SSD MobileNet v2. Best choice for in-browser robot vision — works directly with TF.js WebGL. Detects 80 COCO classes.',
    category: 'vision',
    tags: ['detection', 'tfjs', 'lightweight'],
    benchmark: 'mAP: 29% (COCO)',
    source: 'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd',
    tfjs: 'native',
    framework: 'TensorFlow.js',
    parameters: '8M',
    modelUrl: 'https://storage.googleapis.com/tfjs-models/tfjs/coco-ssd/model.json',
  },
  {
    id: 'mobilenet-v2',
    name: 'MobileNet v2',
    description: 'Efficient image classifier. 1000 ImageNet classes. Use as a vision sensor for object recognition tasks in RL environments.',
    category: 'vision',
    tags: ['classification', 'lightweight', 'mobile'],
    benchmark: 'Top-1: 71.8%, Top-5: 91.0% (ImageNet)',
    source: 'https://github.com/tensorflow/tfjs-models/tree/master/mobilenet',
    tfjs: 'native',
    framework: 'TensorFlow.js',
    parameters: '3.5M',
    modelUrl: 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json',
  },
  {
    id: 'posenet',
    name: 'PoseNet',
    description: 'Real-time human pose estimation. Detects 17 body keypoints. Perfect for controlling robots with body movement.',
    category: 'vision',
    tags: ['pose', 'keypoints', 'real-time'],
    benchmark: 'PCKh: 91.5%',
    source: 'https://github.com/tensorflow/tfjs-models/tree/master/posenet',
    tfjs: 'native',
    framework: 'TensorFlow.js',
    modelUrl: 'https://storage.googleapis.com/tfjs-models/tfjs/posenet/model.json',
  },
  {
    id: 'yolov8',
    name: 'YOLOv8',
    description: 'Real-time object detection. Detect 80 classes from COCO. State-of-the-art speed and accuracy. Can be converted to TF.js.',
    category: 'vision',
    tags: ['detection', 'real-time', 'coco'],
    benchmark: 'mAP 50-95: 53.9% (COCO)',
    source: 'https://github.com/ultralytics/ultralytics',
    tfjs: 'converted',
    framework: 'PyTorch / ONNX',
    parameters: '25M (nano: 3.2M)',
  },
  {
    id: 'resnet50',
    name: 'ResNet-50',
    description: 'Deep image classifier. 50 layers, 1000 ImageNet classes. Heavy but accurate for complex vision tasks.',
    category: 'vision',
    tags: ['classification', 'deep', 'imagenet'],
    benchmark: 'Top-1: 76.0%, Top-5: 93.0% (ImageNet)',
    source: 'https://github.com/tensorflow/tfjs-models',
    tfjs: 'converted',
    framework: 'TensorFlow / PyTorch',
    parameters: '25.6M',
  },
  {
    id: 'bert-tiny',
    name: 'BERT-Tiny',
    description: 'Minimal BERT for text understanding. 2 layers, 128 hidden. Lightweight enough for browser use in language-based RL tasks.',
    category: 'text',
    tags: ['nlp', 'transformer', 'classification'],
    benchmark: 'GLUE: ~72%',
    source: 'https://huggingface.co/google/bert_uncased_L-2_H-128_A-2',
    tfjs: 'converted',
    framework: 'TensorFlow / PyTorch',
    parameters: '4.4M',
  },
  {
    id: 'gpt2-tiny',
    name: 'GPT-2 Tiny (DistilGPT2)',
    description: 'Lightweight text generation model. 2 layers, 128 embedding. Fun for dialogue agents or text-based RL environments.',
    category: 'text',
    tags: ['nlp', 'generation', 'transformer'],
    benchmark: 'Perplexity: ~35 (WikiText-2)',
    source: 'https://huggingface.co/distilgpt2',
    tfjs: 'converted',
    framework: 'TensorFlow / PyTorch',
    parameters: '16M',
  },
  {
    id: 'ppo-cartpole',
    name: 'PPO — Cartpole',
    description: 'Pre-trained PPO policy for cartpole swingup. Balanced pendulum policy ready to load into ProtoSim. Great starting point for RL.',
    category: 'reinforcement-learning',
    tags: ['ppo', 'cartpole', 'control'],
    benchmark: 'Reward: 800+ (swingup)',
    source: '#',
    tfjs: 'native',
    framework: 'TensorFlow.js',
  },
  {
    id: 'ppo-walker',
    name: 'PPO — Walker2D',
    description: 'Pre-trained PPO policy for Walker2D bipedal locomotion. Walks forward stably with smooth gait.',
    category: 'reinforcement-learning',
    tags: ['ppo', 'walker', 'locomotion'],
    benchmark: 'Reward: 3500+',
    source: '#',
    tfjs: 'native',
    framework: 'TensorFlow.js',
  },
  {
    id: 'ppo-g1',
    name: 'PPO — Unitree G1',
    description: 'Pre-trained PPO policy for Unitree G1 humanoid robot. Bipedal walking policy fine-tuned in MuJoCo.',
    category: 'reinforcement-learning',
    tags: ['ppo', 'humanoid', 'locomotion'],
    benchmark: 'Reward: 2800+',
    source: '#',
    tfjs: 'native',
    framework: 'TensorFlow.js',
  },
  {
    id: 'muJoCo-ant',
    name: 'MuJoCo Ant XML',
    description: 'Ant robot MuJoCo model. 4 legs, 8 actuated joints. Classic RL benchmark environment.',
    category: 'robotics',
    tags: ['muJoCo', 'quadruped', 'benchmark'],
    source: 'https://github.com/google-deepmind/mujoco_menagerie',
    tfjs: 'none',
    framework: 'MuJoCo XML',
  },
  {
    id: 'muJoCo-humanoid',
    name: 'MuJoCo Humanoid XML',
    description: 'Full humanoid MuJoCo model. 21 degrees of freedom. The classic Gym humanoid benchmark.',
    category: 'robotics',
    tags: ['muJoCo', 'humanoid', 'benchmark'],
    source: 'https://github.com/google-deepmind/mujoco_menagerie',
    tfjs: 'none',
    framework: 'MuJoCo XML',
  },
  {
    id: 'muJoCo-hopper',
    name: 'MuJoCo Hopper XML',
    description: 'One-legged hopper MuJoCo model. 3 actuated joints. Simple but classic RL environment.',
    category: 'robotics',
    tags: ['muJoCo', 'hopper', 'benchmark'],
    source: 'https://github.com/google-deepmind/mujoco_menagerie',
    tfjs: 'none',
    framework: 'MuJoCo XML',
  },
];

export const categories: { id: ModelCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'vision', label: 'Vision' },
  { id: 'reinforcement-learning', label: 'Reinforcement Learning' },
  { id: 'text', label: 'Text' },
  { id: 'robotics', label: 'Robotics' },
];
