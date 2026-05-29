import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as tf from '@tensorflow/tfjs';
import useSimulationStore from '../store/simulationStore';
import { modelHubData, categories, type ModelCategory, type TfjsSupport } from '../data/modelHubData';
import { datasetHubData } from '../data/datasetHubData';

const tfjsBadge: Record<TfjsSupport, { label: string; color: string }> = {
  native: { label: 'TF.js Native', color: 'bg-green-600' },
  converted: { label: 'Convertible', color: 'bg-yellow-600' },
  none: { label: 'External', color: 'bg-gray-600' },
};

const INSTALLED_KEY = 'protosim_installed_models';

function getInstalled(): Set<string> {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveInstalled(ids: Set<string>) {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify([...ids]));
}

type Tab = 'models' | 'datasets';

export function ModelHubPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('models');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ModelCategory | 'all'>('all');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(getInstalled);
  const addLog = useCallback((msg: string, level?: 'info' | 'success' | 'warning' | 'error') => {
    useSimulationStore.getState().addLog(msg, level);
  }, []);

  const handleInstall = async (m: typeof modelHubData[number]) => {
    if (installed.has(m.id)) {
      addLog(`"${m.name}" is already installed`, 'info');
      return;
    }

    // External / converted models → open source link
    if (!m.modelUrl) {
      window.open(m.source, '_blank');
      return;
    }

    setDownloading(m.id);
    addLog(`Downloading "${m.name}"...`, 'info');

    try {
      const model = await tf.loadLayersModel(m.modelUrl);
      await model.save(`indexeddb://protosim/${m.id}`);
      model.dispose();

      const updated = new Set(installed);
      updated.add(m.id);
      setInstalled(updated);
      saveInstalled(updated);
      addLog(`"${m.name}" installed successfully`, 'success');

      // Pendo: track model installation
      (window as any).pendo?.track('model_installed', {
        modelId: m.id,
        modelName: m.name,
        modelCategory: m.category,
        tfjsSupport: m.tfjs,
        framework: m.framework,
      });
    } catch (err) {
      addLog(`Failed to install "${m.name}": ${err instanceof Error ? err.message : err}`, 'error');

      // Pendo: track model install failure
      (window as any).pendo?.track('model_install_failed', {
        modelId: m.id,
        modelName: m.name,
        modelCategory: m.category,
        errorMessage: String(err instanceof Error ? err.message : err).substring(0, 200),
      });
    } finally {
      setDownloading(null);
    }
  };

  const filtered = modelHubData.filter((m) => {
    if (activeCategory !== 'all' && m.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q) && !m.tags.some(t => t.includes(q))) return false;
    }
    return true;
  });

  // Pendo: debounced tracking of model hub searches
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!search && activeCategory === 'all') return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      (window as any).pendo?.track('model_hub_searched', {
        searchQuery: search || '',
        activeCategory,
        activeTab: tab,
        resultCount: filtered.length,
      });
    }, 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, activeCategory, tab, filtered.length]);

  const filteredDatasets = datasetHubData.filter((d) => {
    if (search) {
      const q = search.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !d.description.toLowerCase().includes(q) && !d.tags.some(t => t.includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Header tab={tab} onTabChange={setTab} onBack={() => navigate('/')} search={search} onSearchChange={setSearch} />

      <div className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
        {tab === 'models' ? (
          <>
            <div className="flex gap-1 mb-6 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-sm">No models match your search.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                {filtered.map((m, i) => (
                  <div key={m.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-slide-up">
                    <ModelCard model={m} downloading={downloading === m.id} installed={installed.has(m.id)} onInstall={handleInstall} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {filteredDatasets.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-sm">No datasets match your search.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                {filteredDatasets.map((d, i) => (
                  <div key={d.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-slide-up">
                    <DatasetCard dataset={d} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Header({ tab, onTabChange, onBack, search, onSearchChange }: {
  tab: Tab; onTabChange: (t: Tab) => void; onBack: () => void;
  search: string; onSearchChange: (v: string) => void;
}) {
  return (
    <header className="border-b border-gray-700/50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div className="flex rounded-lg bg-gray-800 p-0.5">
          <button
            onClick={() => onTabChange('models')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === 'models' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Models
          </button>
          <button
            onClick={() => onTabChange('datasets')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === 'datasets' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Datasets
          </button>
        </div>
        <div className="flex-1" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={tab === 'models' ? 'Search models...' : 'Search datasets...'}
          className="w-48 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
      </div>
    </header>
  );
}

function ModelCard({ model, downloading, installed, onInstall }: {
  model: typeof modelHubData[number];
  downloading: boolean;
  installed: boolean;
  onInstall: (m: typeof modelHubData[number]) => void;
}) {
  const badge = tfjsBadge[model.tfjs];
  const hasModelUrl = !!model.modelUrl;

  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col hover:border-gray-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-sm group-hover:text-white transition-colors">{model.name}</h3>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed mb-3 flex-1">
        {model.description}
      </p>

      <div className="flex flex-wrap gap-1 mb-3">
        {model.tags.map((tag) => (
          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
            {tag}
          </span>
        ))}
      </div>

      {model.benchmark && (
        <div className="text-[10px] text-gray-500 mb-3 font-mono">{model.benchmark}</div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{model.framework}</span>

        {downloading ? (
          <span className="text-[10px] text-yellow-400 font-medium">Downloading...</span>
        ) : installed ? (
          <span className="text-[10px] text-green-400 font-medium">Installed ✓</span>
        ) : (
          <button
            onClick={() => onInstall(model)}
            className={`text-[10px] font-medium px-3 py-1 rounded-lg transition-colors ${
              hasModelUrl
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {hasModelUrl ? 'Install' : 'View Source'}
          </button>
        )}
      </div>
    </div>
  );
}

function DatasetCard({ dataset }: { dataset: typeof datasetHubData[number] }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col hover:border-gray-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-sm group-hover:text-white transition-colors">{dataset.name}</h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300">
          {dataset.format}
        </span>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed mb-3 flex-1">
        {dataset.description}
      </p>

      <div className="flex flex-wrap gap-1 mb-3">
        {dataset.tags.map((tag) => (
          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="text-[10px] text-gray-500">
          <span>{dataset.source}</span>
          <span className="ml-2 opacity-50">{dataset.size}</span>
        </div>
        <a
          href={dataset.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          View Source
        </a>
      </div>
    </div>
  );
}
