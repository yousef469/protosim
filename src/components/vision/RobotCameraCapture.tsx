import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { robotViewState } from '../../rl/vision';

const CAPTURE_SIZE = 224;
const CAPTURE_EVERY_N = 5;

export function RobotCameraCapture() {
  const { gl, scene } = useThree();
  const robotCam = useMemo(() => new THREE.PerspectiveCamera(70, 1, 0.05, 50), []);
  const renderTarget = useMemo(
    () => new THREE.WebGLRenderTarget(CAPTURE_SIZE, CAPTURE_SIZE),
    [],
  );
  const frameCount = useRef(0);
  const pixels = useRef(new Uint8Array(CAPTURE_SIZE * CAPTURE_SIZE * 4));

  useFrame(() => {
    // Follow robot position
    const p = robotViewState.position;
    robotCam.position.set(p[0], p[1] + 0.4, p[2] - 0.3);
    robotCam.lookAt(p[0], p[1] + 0.2, p[2] + 1);

    // Render scene from robot POV into render target
    gl.setRenderTarget(renderTarget);
    gl.render(scene, robotCam);
    gl.setRenderTarget(null);

    // Read pixels every N frames (GPU→CPU sync is slow)
    frameCount.current++;
    if (frameCount.current % CAPTURE_EVERY_N === 0) {
      gl.readRenderTargetPixels(renderTarget, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE, pixels.current);

      // Flip Y axis (OpenGL origin is bottom-left, ImageData is top-left)
      const swapped = new Uint8Array(CAPTURE_SIZE * CAPTURE_SIZE * 4);
      for (let y = 0; y < CAPTURE_SIZE; y++) {
        for (let x = 0; x < CAPTURE_SIZE; x++) {
          const srcIdx = (y * CAPTURE_SIZE + x) * 4;
          const dstIdx = ((CAPTURE_SIZE - 1 - y) * CAPTURE_SIZE + x) * 4;
          swapped[dstIdx] = pixels.current[srcIdx];
          swapped[dstIdx + 1] = pixels.current[srcIdx + 1];
          swapped[dstIdx + 2] = pixels.current[srcIdx + 2];
          swapped[dstIdx + 3] = 255;
        }
      }

      robotViewState.imageData = new ImageData(
        new Uint8ClampedArray(swapped.buffer),
        CAPTURE_SIZE,
        CAPTURE_SIZE,
      );
    }
  }, -1);

  return null;
}
