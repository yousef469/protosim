import { useState, useCallback, type DragEvent } from 'react';
import { detectFormat } from '../../lib/modelLoader';
import useModelStore, { generateModelId } from '../../store/modelStore';
import { getSimulationController } from '../../core/SimulationController';
import useSimulationStore from '../../store/simulationStore';

export function ModelDropZone() {
  const [dragging, setDragging] = useState(false);
  const addModel = useModelStore((s) => s.addModel);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);

    // Pendo: track model file drop
    (window as any).pendo?.track('model_file_dropped', {
      fileCount: files.length,
      fileNames: files.map(f => f.name).join(', ').substring(0, 200),
      fileFormats: files.map(f => detectFormat(f.name) || 'unknown').join(', '),
    });

    for (const file of files) {
      const format = detectFormat(file.name);
      if (!format) {
        useSimulationStore.getState().addLog(`Unsupported format: ${file.name}`, 'warning');
        continue;
      }

      const url = URL.createObjectURL(file);
      const id = generateModelId();
      const name = file.name.replace(/\.[^/.]+$/, '');

      addModel({ id, name, format, url, bodyId: `${id}_body`, parentId: null });

      const ctrl = getSimulationController();
      ctrl.addBody({
        id: `${id}_body`,
        shape: 'box',
        dimensions: { x: 0.8, y: 0.8, z: 0.8 },
        position: { x: 0, y: 2, z: 0 },
        mass: 1,
      });

      useSimulationStore.getState().addLog(`Loaded: ${file.name}`, 'success');
    }
  }, [addModel]);

  return (
    <>
      {dragging && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="absolute inset-0 z-50 flex items-center justify-center bg-blue-900/40 backdrop-blur-sm"
        >
          <div className="bg-white rounded-xl p-8 shadow-2xl border-2 border-dashed border-blue-400 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-lg font-semibold text-gray-800">Drop your model here</p>
            <p className="text-sm text-gray-500 mt-1">GLTF, GLB, STL, OBJ, URDF supported</p>
          </div>
        </div>
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="hidden"
      />
    </>
  );
}
