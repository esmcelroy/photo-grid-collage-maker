// Web Worker for ML-based detection using MediaPipe
// Supports face detection (BlazeFace) and object detection (EfficientDet-Lite0)
// Runs off-main-thread to avoid blocking UI on mobile devices

// Workaround: MediaPipe WASM references `document` during initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof document === 'undefined') (globalThis as any).document = {}

import { FilesetResolver, FaceDetector, ObjectDetector } from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '0.10.35'
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const OBJECT_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'

export type ModelSelection = 'face' | 'object' | 'both'

export interface WorkerRequest {
  type: 'init' | 'detect' | 'dispose'
  model?: ModelSelection
  photoId?: string
  imageData?: ImageBitmap
}

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface ObjectBox extends FaceBox {
  class: string
  classIndex: number
}

export interface WorkerResponse {
  type: 'ready' | 'loading' | 'result' | 'combined-result' | 'error' | 'init-error' | 'face-ready' | 'object-ready'
  photoId?: string
  faces?: FaceBox[]
  objects?: ObjectBox[]
  message?: string
}

let faceDetector: FaceDetector | null = null
let objectDetector: ObjectDetector | null = null
let activeModel: ModelSelection = 'face'

async function initDetector(model: ModelSelection = 'face'): Promise<void> {
  postMessage({ type: 'loading' } satisfies WorkerResponse)
  activeModel = model

  const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

  if (model === 'face' || model === 'both') {
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL },
      runningMode: 'IMAGE',
    })
    postMessage({ type: 'face-ready' } satisfies WorkerResponse)
  }

  if (model === 'object' || model === 'both') {
    objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: OBJECT_MODEL_URL },
      runningMode: 'IMAGE',
      maxResults: 10,
      scoreThreshold: 0.3,
    })
    postMessage({ type: 'object-ready' } satisfies WorkerResponse)
  }

  postMessage({ type: 'ready' } satisfies WorkerResponse)
}

function runFaceDetection(canvas: OffscreenCanvas): FaceBox[] {
  if (!faceDetector) return []
  const result = faceDetector.detect(canvas)
  return result.detections.map(d => {
    const box = d.boundingBox!
    return {
      x: box.originX / canvas.width,
      y: box.originY / canvas.height,
      width: box.width / canvas.width,
      height: box.height / canvas.height,
      confidence: d.categories[0]?.score ?? 0.9,
    }
  })
}

function runObjectDetection(canvas: OffscreenCanvas): ObjectBox[] {
  if (!objectDetector) return []
  const result = objectDetector.detect(canvas)
  return result.detections.map(d => {
    const box = d.boundingBox!
    const category = d.categories[0]
    return {
      x: box.originX / canvas.width,
      y: box.originY / canvas.height,
      width: box.width / canvas.width,
      height: box.height / canvas.height,
      confidence: category?.score ?? 0.5,
      class: category?.categoryName ?? 'unknown',
      classIndex: category?.index ?? -1,
    }
  })
}

function detect(photoId: string, imageBitmap: ImageBitmap): void {
  if (!faceDetector && !objectDetector) {
    postMessage({ type: 'error', photoId, message: 'No detector initialized' } satisfies WorkerResponse)
    return
  }

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imageBitmap, 0, 0)
    imageBitmap.close()

    if (activeModel === 'both') {
      const faces = runFaceDetection(canvas)
      const objects = runObjectDetection(canvas)
      postMessage({ type: 'combined-result', photoId, faces, objects } satisfies WorkerResponse)
    } else if (activeModel === 'object') {
      const objects = runObjectDetection(canvas)
      postMessage({ type: 'combined-result', photoId, faces: [], objects } satisfies WorkerResponse)
    } else {
      const faces = runFaceDetection(canvas)
      postMessage({ type: 'result', photoId, faces } satisfies WorkerResponse)
    }
  } catch (err) {
    postMessage({
      type: 'error',
      photoId,
      message: err instanceof Error ? err.message : 'Detection failed',
    } satisfies WorkerResponse)
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, model, photoId, imageData } = e.data

  switch (type) {
    case 'init':
      try {
        await initDetector(model)
      } catch (err) {
        postMessage({
          type: 'init-error',
          message: err instanceof Error ? err.message : 'Failed to initialize detector',
        } satisfies WorkerResponse)
      }
      break

    case 'detect':
      if (photoId && imageData) {
        detect(photoId, imageData)
      }
      break

    case 'dispose':
      faceDetector?.close()
      faceDetector = null
      objectDetector?.close()
      objectDetector = null
      break
  }
}
