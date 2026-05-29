import { create } from 'zustand';

const DEFAULT_CODE = `// ProtoSim — Control your device with JavaScript
// Available API:
//   motor(id, speed)     — Set motor speed (-100 to 100)
//   wait(ms)             — Wait milliseconds
//   getPosition(id)      — Get body position {x, y, z}
//   log(message)         — Print to console

// Example: Drive a robot
log("Starting simulation...");

// Spin the left wheel
motor("left_wheel", 50);

// After 1 second, add right wheel
wait(1000);
motor("right_wheel", 50);

// After 2 more seconds, turn
wait(2000);
motor("left_wheel", 20);
motor("right_wheel", 80);

log("Running!");
`;

interface EditorStore {
  code: string;
  language: 'javascript' | 'python';
  fontSize: number;
  wordWrap: boolean;

  setCode: (code: string) => void;
  setLanguage: (lang: 'javascript' | 'python') => void;
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  reset: () => void;
}

const useEditorStore = create<EditorStore>((set) => ({
  code: DEFAULT_CODE,
  language: 'javascript',
  fontSize: 14,
  wordWrap: true,

  setCode: (code) => set({ code }),
  setLanguage: (language) => set({ language }),
  setFontSize: (fontSize) => set({ fontSize }),
  setWordWrap: (wordWrap) => set({ wordWrap }),
  reset: () => set({
    code: DEFAULT_CODE,
    language: 'javascript',
    fontSize: 14,
    wordWrap: true,
  }),
}));

export default useEditorStore;
