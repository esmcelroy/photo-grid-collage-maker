// Web Worker for ML-based face detection using MediaPipe
// Runs off-main-thread to avoid blocking UI on mobile devices

// Workaround: MediaPipe WASM references `document` during initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof document === 'undefined') (globalThis as any).document = {}

import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '0.10.35'
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

export interface WorkerRequest {
  type: 'init' | 'detect' | 'dispose'
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

export interface WorkerResponse {
  type: 'ready' | 'loading' | 'result' | 'error' | 'init-error'
  photoId?: string
  faces?: FaceBox[]
  message?: string
}

let detector: FaceDetector | null = null

async function initDetector(): Promise<void> {
  postMessage({ type: 'loading' } satisfies WorkerResponse)

  const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
  detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'IMAGE',
  })

  postMessage({ type: 'ready' } satisfies WorkerResponse)
}

function detectFaces(photoId: string, imageBitmap: ImageBitmap): void {
  if (!detector) {
    postMessage({ type: 'error', photoId, message: 'Detector not initialized' } satisfies WorkerResponse)
    return
  }

  try {
    // Create OffscreenCanvas and draw the image
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imageBitmap, 0, 0)
    imageBitmap.close()

    const result = detector.detect(canvas)
    const faces: FaceBox[] = result.detections.map(d => {
      const box = d.boundingBox!
      return {
        x: box.originX / canvas.width,
        y: box.originY / canvas.height,
        width: box.width / canvas.width,
        height: box.height / canvas.height,
        confidence: d.categories[0]?.score ?? 0.9,
      }
    })

    postMessage({ type: 'result', photoId, faces } satisfies WorkerResponse)
  } catch (err) {
    postMessage({
      type: 'error',
      photoId,
      message: err instanceof Error ? err.message : 'Detection failed',
    } satisfies WorkerResponse)
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, photoId, imageData } = e.data

  switch (type) {
    case 'init':
      try {
        await initDetector()
      } catch (err) {
        postMessage({
          type: 'init-error',
          message: err instanceof Error ? err.message : 'Failed to initialize face detector',
        } satisfies WorkerResponse)
      }
      break

    case 'detect':
      if (photoId && imageData) {
        detectFaces(photoId, imageData)
      }
      break

    case 'dispose':
      detector?.close()
      detector = null
      break
  }
}
