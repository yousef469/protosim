export type ModelFormat = 'gltf' | 'glb' | 'stl' | 'obj' | 'urdf';

const FORMAT_SIGNATURES: Record<string, string[]> = {
  gltf: ['gltf'],
  glb: ['glb'],
  stl: ['stl'],
  obj: ['obj', 'mtl'],
  urdf: ['urdf', 'xml'],
};

export function detectFormat(filename: string): ModelFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  for (const [format, exts] of Object.entries(FORMAT_SIGNATURES)) {
    if (exts.includes(ext)) return format as ModelFormat;
  }
  return null;
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}
