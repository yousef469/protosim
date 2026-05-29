import { useEffect, useRef } from 'react';
import useSimulationStore from '../../store/simulationStore';

export function Console() {
  const consoleOutput = useSimulationStore((s) => s.consoleOutput);
  const clearConsole = useSimulationStore((s) => s.clearConsole);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleOutput.length]);

  const levelColors: Record<string, string> = {
    info: 'text-gray-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-green-400',
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Console</span>
        <button
          onClick={clearConsole}
          className="px-2 py-0.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {consoleOutput.length === 0 && (
          <div className="text-gray-600 italic">No output. Press Run to start.</div>
        )}
        {consoleOutput.map((entry) => (
          <div key={entry.id} className={levelColors[entry.level] || 'text-gray-400'}>
            <span className="text-gray-600">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>{' '}
            {entry.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
