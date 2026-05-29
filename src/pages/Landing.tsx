import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LandingPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white flex flex-col transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <header className="border-b border-gray-700/50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">ProtoSim</span>
          <span className="text-[11px] text-gray-400">AI in your browser</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center px-4 py-12">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-3 transition-all duration-700 delay-100 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            What do you want to do?
          </h1>
          <p className={`text-sm text-gray-400 max-w-lg mx-auto transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            Train AI agents with reinforcement learning, or discover pre-trained models for your projects.
          </p>
        </div>

        <div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-4 w-full">
          <button
            onClick={() => navigate('/editor')}
            className={`group bg-white/5 hover:bg-blue-600/20 border border-gray-700/50 hover:border-blue-500/50 rounded-2xl p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/5 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            <div className="text-3xl mb-4 transition-transform duration-300 group-hover:scale-110">🧠</div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
              Reinforcement Learning
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Train robots with PPO in your browser. MuJoCo physics, TF.js neural networks,
              hot-swappable architectures. Pick a robot, set a goal, watch it learn.
            </p>
            <div className="mt-4 text-sm font-medium text-blue-400 group-hover:text-blue-300 transition-all group-hover:translate-x-1">
              Open RL Lab →
            </div>
          </button>

          <button
            onClick={() => navigate('/models')}
            className={`group bg-white/5 hover:bg-purple-600/20 border border-gray-700/50 hover:border-purple-500/50 rounded-2xl p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/5 delay-[350ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            <div className="text-3xl mb-4 transition-transform duration-300 group-hover:scale-110">📦</div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition-colors">
              Model Hub
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Browse and download pre-trained models for vision, RL, text, and robotics.
              One-click install for TF.js models. Curated by category and benchmark.
            </p>
            <div className="mt-4 text-sm font-medium text-purple-400 group-hover:text-purple-300 transition-all group-hover:translate-x-1">
              Explore Models →
            </div>
          </button>
        </div>

        <div className={`max-w-2xl mx-auto mt-10 text-center transition-all duration-700 delay-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-[11px] text-gray-500">
            Built for the <span className="text-gray-400">World Product Day 2026</span> — Everyone Ships Now challenge.
          </p>
        </div>
      </div>
    </div>
  );
}
