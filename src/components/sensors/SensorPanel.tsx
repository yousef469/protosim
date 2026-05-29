import { useState } from 'react';

const SENSOR_TYPES = [
  { id: 'camera', label: 'Camera', color: 'blue' },
  { id: 'imu', label: 'IMU', color: 'green' },
  { id: 'distance', label: 'Distance', color: 'purple' },
];

type SensorId = 'camera' | 'imu' | 'distance';

export function SensorPanel() {
  const [enabled, setEnabled] = useState<Set<SensorId>>(
    new Set(['camera', 'imu', 'distance'])
  );

  const toggle = (id: SensorId) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabled(next);
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sensors</h3>
      </div>
      <div className="p-3 space-y-2">
        {SENSOR_TYPES.map((s) => {
          const isOn = enabled.has(s.id as SensorId);
          return (
            <label
              key={s.id}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(s.id as SensorId)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={isOn ? 'text-gray-800' : 'text-gray-400'}>{s.label}</span>
              {isOn && (
                <span className="ml-auto text-xs text-gray-400">waiting...</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
