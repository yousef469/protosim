import { useRef, useState } from 'react';
import { detectFormat } from '../../lib/modelLoader';
import useModelStore, { generateModelId, type PhysicsType } from '../../store/modelStore';
import { getSimulationController } from '../../core/SimulationController';
import { getMuJoCoController } from '../../mujoco/MuJoCoController';
import { sampleRobots } from '../../mujoco/sampleRobots';
import useSimulationStore from '../../store/simulationStore';
import useRlStore from '../../store/rlStore';

const PRIMITIVES = [
  { id: 'box', label: 'Box', icon: '⬜' },
  { id: 'sphere', label: 'Sphere', icon: '⚪' },
  { id: 'cylinder', label: 'Cylinder', icon: '🧊' },
];

export function ModelLibrary() {
  const models = useModelStore((s) => s.models);
  const removeModel = useModelStore((s) => s.removeModel);
  const addModel = useModelStore((s) => s.addModel);
  const selectModel = useModelStore((s) => s.selectModel);
  const reparentModel = useModelStore((s) => s.reparentModel);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mjcfInputRef = useRef<HTMLInputElement>(null);
  const [mjcfLoaded, setMjcfLoaded] = useState(false);
  const [mjcfName, setMjcfName] = useState('');

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const rootModels = models.filter((m) => !m.parentId);
  const childrenOf = (parentId: string) => models.filter((m) => m.parentId === parentId);

  const addPrimitive = (type: string) => {
    const id = generateModelId();
    const bodyId = `${id}_body`;
    const shape = type === 'box' ? 'box' : type === 'sphere' ? 'sphere' : 'cylinder';
    const dims = type === 'box' ? { x: 0.6, y: 0.4, z: 0.8 } : undefined;
    const radius = type === 'sphere' ? 0.3 : type === 'cylinder' ? 0.3 : undefined;
    const height = type === 'cylinder' ? 0.6 : undefined;

    addModel({
      id, name: type.charAt(0).toUpperCase() + type.slice(1),
      format: 'primitive', url: type, bodyId, parentId: null,
      position: { x: (Math.random() - 0.5) * 2, y: 2, z: (Math.random() - 0.5) * 2 },
    });

    const ctrl = getSimulationController();
    ctrl.addBody({
      id: bodyId, shape: shape as 'box' | 'sphere' | 'cylinder',
      dimensions: dims, radius, height, mass: 1,
    });
    useSimulationStore.getState().addLog(`Added ${type} primitive`, 'info');
  };

  const handleMjcfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const xmlExts = /\.(xml|mjcf)$/i;
    const meshExts = /\.(stl|obj|msh|dae|ply)$/i;

    const xmlFiles = files.filter(f => xmlExts.test(f.name));
    const meshFileList = files.filter(f => meshExts.test(f.name));

    if (!xmlFiles.length) {
      useSimulationStore.getState().addLog('No XML/MJCF file found in folder', 'error');
      e.target.value = '';
      return;
    }

    // Let user pick which XML is the root
    let rootXmlFile: File;
    if (xmlFiles.length === 1) {
      rootXmlFile = xmlFiles[0];
    } else {
      const names = xmlFiles.map(f => f.name);
      const choice = window.prompt(
        `Multiple XML files found. Enter the root XML to load:\n\n${names.join('\n')}`,
        'g1.xml'
      );
      const picked = xmlFiles.find(f => f.name === choice);
      if (!picked) {
        useSimulationStore.getState().addLog('No valid XML selected', 'error');
        e.target.value = '';
        return;
      }
      rootXmlFile = picked;
    }

    const rootXmlContent = await rootXmlFile.text();
    const xmlName = rootXmlFile.name.replace(/\.[^/.]+$/, '');

    // Build meshFiles map (bare filename → bytes)
    const meshFiles = new Map<string, Uint8Array>();
    await Promise.all(
      meshFileList.map(async f => {
        const buf = await f.arrayBuffer();
        meshFiles.set(f.name, new Uint8Array(buf));
      })
    );

    // Build allXmls map (bare filename → text) for ALL XMLs
    // so <include file="g1.xml"/> resolves in MEMFS
    const allXmls = new Map<string, string>();
    await Promise.all(
      xmlFiles.map(async f => {
        allXmls.set(f.name, await f.text());
      })
    );

    console.log(`[Upload] root: ${rootXmlFile.name}, XMLs: ${allXmls.size}, meshes: ${meshFiles.size}`);

    const ctrl = getMuJoCoController();
    try {
      await ctrl.loadXML(rootXmlContent, meshFiles.size > 0 ? meshFiles : undefined, allXmls);
      setMjcfLoaded(true);
      setMjcfName(xmlName);
      useRlStore.getState().setModelXML(rootXmlContent);
      useRlStore.getState().setModelName(xmlName);
      useSimulationStore.getState().addLog(`Loaded robot: ${xmlName} + ${meshFiles.size} meshes + ${allXmls.size} XMLs`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useSimulationStore.getState().addLog(`Robot error: ${msg}`, 'error');
    }
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
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
        id: `${id}_body`, shape: 'box',
        dimensions: { x: 0.8, y: 0.8, z: 0.8 },
        position: { x: 0, y: 2, z: 0 }, mass: 1,
      });
      useSimulationStore.getState().addLog(`Loaded: ${file.name}`, 'success');
    }
    e.target.value = '';
  };

  const handleRemove = (id: string, bodyId: string) => {
    const childIds = models.filter(m => m.parentId === id).map(m => m.id);
    for (const cid of childIds) {
      const cm = models.find(m => m.id === cid);
      if (cm) getSimulationController().removeBody(cm.bodyId);
    }
    removeModel(id);
    getSimulationController().removeBody(bodyId);
  };

  const renderModelItem = (m: typeof models[0], depth = 0) => (
    <div key={m.id}>
      <div
        onClick={() => selectModel(selectedModelId === m.id ? null : m.id)}
        className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer transition-colors ${
          selectedModelId === m.id
            ? 'bg-blue-50 ring-1 ring-blue-300'
            : 'hover:bg-gray-100'
        }`}
        style={{ marginLeft: depth * 12 }}
      >
        <span className="text-xs flex-shrink-0">{m.format === 'primitive' ? '⬜' : '📦'}</span>
        <span className="flex-1 text-[11px] text-gray-700 truncate">{m.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleRemove(m.id, m.bodyId); }}
          className="text-[10px] text-red-400 hover:text-red-600 px-0.5 flex-shrink-0"
        >
          ✕
        </button>
      </div>
      {childrenOf(m.id).map((child) => renderModelItem(child, depth + 1))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-2.5 border-b border-gray-200">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Models</h3>
      </div>

      <div className="p-2.5 space-y-1.5 border-b border-gray-200">
        <div className="grid grid-cols-3 gap-1">
          {PRIMITIVES.map((p) => (
            <button
              key={p.id}
              onClick={() => addPrimitive(p.id)}
              className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <span className="text-sm">{p.icon}</span>
              <span className="text-[9px] text-gray-600">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-2.5 border-b border-gray-200 space-y-1.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-2 border-2 border-dashed border-gray-300 rounded hover:border-blue-400 hover:bg-blue-50 transition-colors text-center"
        >
          <span className="text-[11px] text-gray-500">+ Upload Model</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb,.stl,.obj,.urdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => mjcfInputRef.current?.click()}
          className="w-full p-2 border-2 border-dashed border-orange-300 rounded hover:border-orange-400 hover:bg-orange-50 transition-colors text-center"
        >
          <span className="text-[11px] text-orange-600">+ Load MJCF Robot</span>
        </button>
        <input
          ref={mjcfInputRef}
          type="file"
          // @ts-ignore webkitdirectory is non-standard but supported everywhere
          webkitdirectory=""
          onChange={handleMjcfUpload}
          className="hidden"
        />
        {mjcfLoaded && (
          <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
            <span>✓</span>
            <span className="truncate">{mjcfName}</span>
          </div>
        )}

        <div className="pt-1 space-y-1">
          <span className="text-[10px] text-gray-400 font-medium">Demo Robots</span>
          {sampleRobots.map((r) => (
            <button
              key={r.name}
              onClick={async () => {
                const ctrl = getMuJoCoController();
                try {
                  await ctrl.loadXML(r.xml);
                  setMjcfLoaded(true);
                  setMjcfName(r.name);
                  useRlStore.getState().setModelXML(r.xml);
                  useRlStore.getState().setModelName(r.name);
                  useSimulationStore.getState().addLog(`Loaded sample: ${r.name}`, 'success');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  useSimulationStore.getState().addLog(`Sample error: ${msg}`, 'error');
                }
              }}
              className="w-full text-left px-2 py-1.5 rounded border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              title={r.desc}
            >
              <span className="text-[11px] font-medium text-gray-700">{r.name}</span>
              <span className="text-[9px] text-gray-400 block">{r.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Property inspector for selected model */}
      {selectedModel && (
        <div className="p-2.5 border-b border-gray-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700">{selectedModel.name}</span>
            <span className="text-[10px] text-gray-400">{selectedModel.format}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 uppercase w-3">{axis}</span>
                <input
                  type="number"
                  step={0.1}
                  value={Number(selectedModel.position[axis]).toFixed(1)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    const newPos = { ...selectedModel.position, [axis]: val };
                    useModelStore.getState().updateModelPosition(selectedModel.id, newPos);
                    getSimulationController().teleportBody(selectedModel.bodyId, newPos);
                  }}
                  className="w-full px-1 py-0.5 border border-gray-200 rounded text-[10px] font-mono"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Parent:</span>
            <select
              value={selectedModel.parentId || ''}
              onChange={(e) => reparentModel(selectedModel.id, e.target.value || null)}
              className="flex-1 text-[10px] px-1 py-0.5 border border-gray-200 rounded"
            >
              <option value="">None (root)</option>
              {models.filter(m => m.id !== selectedModel.id && !selectedModel.parentId?.startsWith(m.id)).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Physics type controls */}
          <div className="pt-1 border-t border-gray-100">
            <span className="text-[10px] text-gray-400 font-medium">Physics</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-400">Type:</span>
              <select
                value={selectedModel.physicsType || 'none'}
                onChange={(e) => useModelStore.getState().setPhysicsType(selectedModel.id, e.target.value as PhysicsType)}
                className="flex-1 text-[10px] px-1 py-0.5 border border-gray-200 rounded"
              >
                <option value="none">None</option>
                <option value="static">Static</option>
                <option value="dynamic">Dynamic</option>
              </select>
            </div>
          </div>

          {/* Per-part physics controls for multi-mesh models */}
          {selectedModel.meshParts && selectedModel.meshParts.length > 1 && (
            <div className="pt-1 space-y-1">
              <span className="text-[10px] text-gray-400 font-medium">Parts</span>
              {selectedModel.meshParts.map((part) => (
                <div key={part.id} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500 w-20 truncate" title={part.name}>{part.name}</span>
                  <select
                    value={part.physicsType}
                    onChange={(e) => useModelStore.getState().setPartPhysicsType(selectedModel.id, part.id, e.target.value as PhysicsType)}
                    className="flex-1 text-[9px] px-1 py-0.5 border border-gray-200 rounded"
                  >
                    <option value="none">None</option>
                    <option value="static">Static</option>
                    <option value="dynamic">Dynamic</option>
                  </select>
                  <label className="flex items-center gap-0.5 text-[9px] text-gray-400">
                    <input
                      type="checkbox"
                      checked={part.isWheel}
                      onChange={(e) => useModelStore.getState().setPartWheel(selectedModel.id, part.id, e.target.checked)}
                      className="w-2.5 h-2.5"
                    />
                    wheel
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Model list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
        {models.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-4">
            No models loaded
          </p>
        )}
        {rootModels.map((m) => renderModelItem(m))}
      </div>
    </div>
  );
}
