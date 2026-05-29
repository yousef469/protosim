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
  quaternion: new Float32Array([0, 0, 1, 0]),
  imageData: null as ImageData | null,
  detections: [] as Detection[],
  visionModel: null as VisionModelInfo | null,
};

const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
];

export async function loadVisionModel(modelId: string): Promise<tf.LayersModel | tf.GraphModel | null> {
  robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: true };
  try {
    const model = await tf.loadGraphModel(`indexeddb://protosim/${modelId}`);
    robotViewState.visionModel = { id: modelId, name: modelId, loaded: true, loading: false };
    return model;
  } catch {
    try {
      const model = await tf.loadLayersModel(`indexeddb://protosim/${modelId}`);
      robotViewState.visionModel = { id: modelId, name: modelId, loaded: true, loading: false };
      return model;
    } catch (err) {
      robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: false };
      console.error('Failed to load vision model:', err);
      return null;
    }
  }
}

let detectionModel: tf.LayersModel | tf.GraphModel | null = null;

export async function runDetection(imageData: ImageData): Promise<Detection[]> {
  if (!detectionModel) return [];

  const input = tf.browser.fromPixels(imageData).expandDims(0).toFloat();
  const resized = tf.image.resizeBilinear(input as unknown as tf.Tensor4D, [300, 300]);
  const normalized = resized.div(255.0);

  const result = detectionModel.predict(normalized) as tf.Tensor | tf.Tensor[];

  let detections: Detection[] = [];

  if (Array.isArray(result)) {
    boxesLoop:
    for (const candidate of result) {
      const shape = candidate.shape;
      if (shape.length === 3 && shape[2] === 4) {
        // boxes tensor [1, N, 4]
        const scores = await (result[0] as tf.Tensor).array() as number[][][];
        const boxes = await (candidate as tf.Tensor).array() as number[][][];
        const batchScores = scores[0] || [];
        const batchBoxes = boxes[0] || [];
        const numBoxes = Math.min(batchScores.length, batchBoxes.length);
        for (let i = 0; i < numBoxes; i++) {
          const score = batchScores[i][1];
          if (score > 0.5) {
            detections.push({
              bbox: batchBoxes[i] as [number, number, number, number],
              class: 'object',
              score,
            });
          }
        }
        break boxesLoop;
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
