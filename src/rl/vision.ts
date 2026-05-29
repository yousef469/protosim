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
  quaternion: new Float32Array([0, 0, 0, 1]),
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

export async function loadVisionModel(modelId: string): Promise<tf.LayersModel | null> {
  robotViewState.visionModel = { id: modelId, name: modelId, loaded: false, loading: true };
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

let detectionModel: tf.LayersModel | null = null;

export async function runDetection(imageData: ImageData): Promise<Detection[]> {
  if (!detectionModel) return [];

  const input = tf.browser.fromPixels(imageData).expandDims(0).toFloat();
  const resized = tf.image.resizeBilinear(input as unknown as tf.Tensor3D, [224, 224]);
  const normalized = resized.div(255.0);

  const result = detectionModel.predict(normalized) as tf.Tensor;

  let detections: Detection[] = [];

  // COCO-SSD returns boxes, scores, classes
  if (Array.isArray(result)) {
    const r = result as unknown as tf.Tensor[];
    const boxesTensor = r[0];
    const scoresTensor = r[1];
    const classesTensor = r[2];
    const boxes = await boxesTensor.array() as number[][][];
    const scores = await scoresTensor.array() as number[][];
    const classes = await classesTensor.array() as number[][];

    const batchBoxes = boxes[0] || [];
    const batchScores = scores[0] || [];
    const batchClasses = classes[0] || [];

    detections = batchBoxes
      .map((box, i) => ({
        bbox: box as [number, number, number, number],
        class: COCO_CLASSES[Math.round(batchClasses[i])] || 'unknown',
        score: batchScores[i],
      }))
      .filter(d => d.score > 0.3);
  }

  tf.dispose([input, resized, normalized]);
  if (Array.isArray(result)) result.forEach(t => t.dispose());
  else result.dispose();

  robotViewState.detections = detections;
  return detections;
}

export function setDetectionModel(model: tf.LayersModel | null) {
  detectionModel = model;
}
