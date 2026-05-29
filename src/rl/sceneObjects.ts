export interface SpawnedObject {
  id: number;
  type: 'sphere' | 'box' | 'cylinder';
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

export type PlaceType = SpawnedObject['type'] | null;

let nextId = 1;
const objects: SpawnedObject[] = [];
const listeners: Set<() => void> = new Set();
let _placementMode = false;
let _placeType: PlaceType = null;

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

export function updateSpawnedObject(id: number, pos: { x: number; y: number; z: number }) {
  const obj = objects.find(o => o.id === id);
  if (obj) {
    obj.x = pos.x;
    obj.y = pos.y;
    obj.z = pos.z;
    notify();
  }
}

export function getSpawnedObjects(): SpawnedObject[] {
  return objects;
}

export function getPlacementMode() { return _placementMode; }
export function setPlacementMode(on: boolean) { _placementMode = on; notify(); }
export function getPlaceType() { return _placeType; }
export function setPlaceType(t: PlaceType) { _placeType = t; notify(); }

export function subscribeSpawnedObjects(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
