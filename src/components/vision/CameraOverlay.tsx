import { useRef, useEffect } from 'react';
import { robotViewState } from '../../rl/vision';

export function CameraOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const draw = () => {
      if (!running) return;

      if (robotViewState.captureActive && robotViewState.imageData) {
        canvas.width = robotViewState.imageData.width;
        canvas.height = robotViewState.imageData.height;
        ctx.putImageData(robotViewState.imageData, 0, 0);

        for (const d of robotViewState.detections) {
          const [y1, x1, y2, x2] = d.bbox;
          const w = (x2 - x1) * canvas.width;
          const h = (y2 - y1) * canvas.height;
          const x = x1 * canvas.width;
          const y = y1 * canvas.height;

          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.fillRect(x, y - 14, ctx.measureText(d.class).width + 8, 14);

          ctx.fillStyle = '#000';
          ctx.font = '10px monospace';
          ctx.fillText(`${d.class} ${(d.score * 100).toFixed(0)}%`, x + 4, y - 3);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  if (!robotViewState.captureActive) return null;

  return (
    <div className="fixed bottom-3 right-3 w-44 h-44 rounded-lg border-2 border-green-500 shadow-xl bg-black z-50 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
      <div className="absolute top-1 left-1.5 text-[9px] text-green-400 font-mono bg-black/60 px-1 rounded">
        ROBOT CAM
      </div>
    </div>
  );
}
