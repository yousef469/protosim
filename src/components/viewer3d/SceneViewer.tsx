import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import useModelStore from '../../store/modelStore';
import { LoadedModel } from './LoadedModel';

function LoadedModels() {
  const models = useModelStore((s) => s.models);
  return (
    <group>
      {models.map((m) => (
        <LoadedModel key={m.id} data={m} />
      ))}
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <meshStandardMaterial color="#e8e8e8" />
    </mesh>
  );
}

function EventCatcher() {
  const selectModel = useModelStore((s) => s.selectModel);
  return (
    <mesh
      visible={false}
      onClick={(e) => { e.stopPropagation(); selectModel(null); }}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </mesh>
  );
}

function Controls() {
  const { camera } = useThree();
  const isTransforming = useModelStore((s) => s.isTransforming);
  if (!camera) return null;
  return (
    <OrbitControls
      enabled={!isTransforming}
      enablePan={!isTransforming}
      enableZoom={!isTransforming}
      enableRotate={!isTransforming}
      minDistance={0.5}
      maxDistance={50}
      maxPolarAngle={Math.PI / 2}
    />
  );
}

export function SceneViewer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <Ground />
        <LoadedModels />
        {children}
        <EventCatcher />
        <Grid args={[20, 20]} cellSize={1} cellThickness={0.5} cellColor="#6b7280" sectionSize={5} sectionThickness={1} sectionColor="#374151" fadeDistance={30} />
        <Controls />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
