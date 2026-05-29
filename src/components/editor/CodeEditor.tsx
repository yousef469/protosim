import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import useEditorStore from '../../store/editorStore';

export function CodeEditor() {
  const { code, language, fontSize, wordWrap, setCode } = useEditorStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  }, []);

  const handleCopy = useCallback(() => {
    const val = editorRef.current?.getValue();
    if (val) navigator.clipboard.writeText(val);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-300 font-medium uppercase tracking-wide">
          {language === 'javascript' ? 'JavaScript' : 'Python'}
        </span>
        <div className="flex gap-1">
          <button onClick={handleFormat} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
            Format
          </button>
          <button onClick={handleCopy} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
            Copy
          </button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(val) => { if (val !== undefined) setCode(val); }}
          onMount={handleMount}
          options={{
            fontSize,
            wordWrap: wordWrap ? 'on' : 'off',
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            theme: 'vs-dark',
            tabSize: 2,
            insertSpaces: true,
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-gray-900">
              <div className="text-gray-400 text-sm">Loading editor...</div>
            </div>
          }
        />
      </div>
    </div>
  );
}
