import { useEffect, useState, useRef } from 'react';
import useSimulationStore from '../../store/simulationStore';

interface Toast {
  id: string;
  message: string;
  level: string;
}

export function ToastOverlay() {
  const logs = useSimulationStore((s) => s.consoleOutput);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const last = logs[logs.length - 1];
    if (!last || seenRef.current.has(last.id)) return;
    seenRef.current.add(last.id);

    const toast: Toast = { id: last.id, message: last.message, level: last.level };
    setToasts((prev) => [...prev.slice(-4), toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 4000);
  }, [logs]);

  const levelStyles: Record<string, string> = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600 text-black',
    error: 'bg-red-600',
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${levelStyles[t.level] || 'bg-gray-700'} text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg animate-slide-up max-w-64`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
