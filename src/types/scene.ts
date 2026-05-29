export interface PhysicsBody {
  id: string;
  type: 'dynamic' | 'static';
  shape: 'box' | 'sphere' | 'cylinder' | 'capsule';
  mass: number;
  friction: number;
  restitution: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  dimensions?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
}

export interface BodyState {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
}

export interface SceneNode {
  id: string;
  name: string;
  type: 'mesh' | 'group' | 'light' | 'sensor';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
}
