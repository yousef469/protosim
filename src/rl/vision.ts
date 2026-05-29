import * as tf from '@tensorflow/tfjs';

export interface Detection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface VisionModelInfo {
  id: string;
  name: string;
  loaded: boolean;
  loading: boolean;
}

export const robotViewState = {
  position: new Float32Array([0, 0, 0]),
  forward: new Float32Array([0, 0, -1]),
  quaternion: new Float32Array([0, 0, 1, 0]),
  imageData: null as ImageData | null,
  detections: [] as Detection[],
  visionModel: null as VisionModelInfo | null,
  captureActive: false,
};

// Maps COCO-SSD model class index (0-90) to class name. Indexes with gaps (12,26,etc) → null.
const COCO_CLASSES: (string | null)[] = (() => {
  const names: (string | null)[] = new Array(91).fill(null);
  const entries: [number, string][] = [
    [1, 'person'], [2, 'bicycle'], [3, 'car'], [4, 'motorcycle'],
    [5, 'airplane'], [6, 'bus'], [7, 'train'], [8, 'truck'], [9, 'boat'],
    [10, 'traffic light'], [11, 'fire hydrant'], [13, 'stop sign'],
    [14, 'parking meter'], [15, 'bench'], [16, 'bird'], [17, 'cat'],
    [18, 'dog'], [19, 'horse'], [20, 'sheep'], [21, 'cow'], [22, 'elephant'],
    [23, 'bear'], [24, 'zebra'], [25, 'giraffe'], [27, 'backpack'],
    [28, 'umbrella'], [31, 'handbag'], [32, 'tie'], [33, 'suitcase'],
    [34, 'frisbee'], [35, 'skis'], [36, 'snowboard'], [37, 'sports ball'],
    [38, 'kite'], [39, 'baseball bat'], [40, 'baseball glove'],
    [41, 'skateboard'], [42, 'surfboard'], [43, 'tennis racket'],
    [44, 'bottle'], [46, 'wine glass'], [47, 'cup'], [48, 'fork'],
    [49, 'knife'], [50, 'spoon'], [51, 'bowl'], [52, 'banana'],
    [53, 'apple'], [54, 'sandwich'], [55, 'orange'], [56, 'broccoli'],
    [57, 'carrot'], [58, 'hot dog'], [59, 'pizza'], [60, 'donut'],
    [61, 'cake'], [62, 'chair'], [63, 'couch'], [64, 'potted plant'],
    [65, 'bed'], [67, 'dining table'], [70, 'toilet'], [72, 'tv'],
    [73, 'laptop'], [74, 'mouse'], [75, 'remote'], [76, 'keyboard'],
    [77, 'cell phone'], [78, 'microwave'], [79, 'oven'], [80, 'toaster'],
    [81, 'sink'], [82, 'refrigerator'], [84, 'book'], [85, 'clock'],
    [86, 'vase'], [87, 'scissors'], [88, 'teddy bear'], [89, 'hair drier'],
    [90, 'toothbrush'],
  ];
  for (const [idx, name] of entries) names[idx] = name;
  return names;
})();

export async function loadVisionModel(modelId: string, fallbackUrl?: string): Promise<tf.LayersModel | tf.GraphModel | null> {
  robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: true };

  // Try loading from IndexedDB first
  for (const loader of ['graph', 'layers'] as const) {
    try {
      const fn = loader === 'graph' ? tf.loadGraphModel : tf.loadLayersModel;
      const model = await fn(`indexeddb://protosim/${modelId}`);
      robotViewState.visionModel = { id: modelId, name: modelId, loaded: true, loading: false };
      return model;
    } catch {
      // try next loader
    }
  }

  // Fallback: download from URL and save to IndexedDB
  if (fallbackUrl) {
    try {
      let model: tf.LayersModel | tf.GraphModel;
      try {
        model = await tf.loadGraphModel(fallbackUrl);
      } catch {
        model = await tf.loadLayersModel(fallbackUrl);
      }
      await model.save(`indexeddb://protosim/${modelId}`);
      robotViewState.visionModel = { id: modelId, name: modelId, loaded: true, loading: false };
      return model;
    } catch (err) {
      robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: false };
      console.error('Failed to load vision model:', err);
      return null;
    }
  }

  robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: false };
  return null;
}

let detectionModel: tf.LayersModel | tf.GraphModel | null = null;

export async function runDetection(imageData: ImageData): Promise<Detection[]> {
  if (!detectionModel) return [];

  const input = tf.browser.fromPixels(imageData).slice([0, 0, 0], [224, 224, 3]).expandDims(0).toFloat();
  const resized = tf.image.resizeBilinear(input as unknown as tf.Tensor4D, [300, 300]);
  const normalized = resized.div(255.0);

  const result = detectionModel.predict(normalized) as tf.Tensor | tf.Tensor[];

  let detections: Detection[] = [];

  if (Array.isArray(result) && result.length >= 2) {
    // COCO-SSD output: [scores(1,N,91), boxes(1,N,4)]
    const scoresArr = await (result[0] as tf.Tensor).array() as number[][][];
    const boxesArr = await (result[1] as tf.Tensor).array() as number[][][];

    const batchScores = scoresArr[0] || [];
    const batchBoxes = boxesArr[0] || [];
    const numBoxes = Math.min(batchScores.length, batchBoxes.length);

    for (let i = 0; i < numBoxes; i++) {
      const classProbs = batchScores[i];
      // Find class with max score (skip background at index 0)
      let bestClass = 0, bestScore = 0;
      for (let c = 1; c < classProbs.length; c++) {
        if (classProbs[c] > bestScore) {
          bestScore = classProbs[c];
          bestClass = c;
        }
      }
      if (bestScore > 0.4) {
        detections.push({
          bbox: batchBoxes[i] as [number, number, number, number],
          class: COCO_CLASSES[bestClass] || 'unknown',
          score: bestScore,
        });
      }
    }
  }

  tf.dispose([input, resized, normalized, ...(Array.isArray(result) ? result : [result])]);

  robotViewState.detections = detections;
  return detections;
}

export function setDetectionModel(model: tf.LayersModel | tf.GraphModel | null) {
  detectionModel = model;
}
