export interface SpawnedObject {
  id: number;
  type: 'sphere' | 'box' | 'cylinder';
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

let nextId = 1;
const objects: SpawnedObject[] = [];
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

export function addSpawnedObject(obj: Omit<SpawnedObject, 'id'>) {
  objects.push({ ...obj, id: nextId++ });
  notify();
}

export function removeSpawnedObject(id: number) {
  const idx = objects.findIndex(o => o.id === id);
  if (idx !== -1) {
    objects.splice(idx, 1);
    notify();
  }
}

export function getSpawnedObjects(): SpawnedObject[] {
  return objects;
}

export function subscribeSpawnedObjects(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
