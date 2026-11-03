// Typed client for the ML detection Web Worker
// Provides Promise-based API wrapping postMessage/onmessage
// Supports face detection (Standard) and combined face+object detection (Advanced)

import type { FaceBox, ObjectBox, WorkerResponse, ModelSelection } from '@/workers/ml-worker'

export type { FaceBox, ObjectBox }

export type WorkerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CombinedDetectionResult {
  faces: FaceBox[]
  objects: ObjectBox[]
}

type PendingDetection = {
  resolve: (result: FaceBox[] | CombinedDetectionResult) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let status: WorkerStatus = 'idle'
let currentModel: ModelSelection = 'face'
let initPromise: Promise<void> | null = null
const pendingDetections = new Map<string, PendingDetection>()
const statusListeners = new Set<(status: WorkerStatus) => void>()

function setStatus(newStatus: WorkerStatus) {
  status = newStatus
  statusListeners.forEach(fn => fn(newStatus))
}

export function getWorkerStatus(): WorkerStatus {
  return status
}

export function getWorkerModel(): ModelSelection {
  return currentModel
}

export function onWorkerStatusChange(fn: (status: WorkerStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

function handleWorkerMessage(e: MessageEvent<WorkerResponse>) {
  const msg = e.data

  switch (msg.type) {
    case 'loading':
      setStatus('loading')
      break

    case 'face-ready':
    case 'object-ready':
      // Intermediate progress — still loading
      break

    case 'ready':
      setStatus('ready')
      break

    case 'init-error':
      setStatus('error')
      // Reject all pending detections
      for (const [, pending] of pendingDetections) {
        pending.reject(new Error(msg.message ?? 'Worker initialization failed'))
      }
      pendingDetections.clear()
      break

    case 'result':
      if (msg.photoId) {
        const pending = pendingDetections.get(msg.photoId)
        if (pending) {
          pending.resolve(msg.faces ?? [])
          pendingDetections.delete(msg.photoId)
        }
      }
      break

    case 'combined-result':
      if (msg.photoId) {
        const pending = pendingDetections.get(msg.photoId)
        if (pending) {
          pending.resolve({ faces: msg.faces ?? [], objects: msg.objects ?? [] })
          pendingDetections.delete(msg.photoId)
        }
      }
      break

    case 'error':
      if (msg.photoId) {
        const pending = pendingDetections.get(msg.photoId)
        if (pending) {
          pending.reject(new Error(msg.message ?? 'Detection failed'))
          pendingDetections.delete(msg.photoId)
        }
      }
      break
  }
}

export async function initMLWorker(model: ModelSelection = 'face'): Promise<void> {
  // If already initialized with the same model, reuse
  if (initPromise && currentModel === model && status === 'ready') return
  // If requesting a different model, dispose and reinitialize
  if (worker && currentModel !== model) {
    disposeMLWorker()
  }

  if (initPromise) return initPromise

  currentModel = model
  initPromise = new Promise<void>((resolve, reject) => {
    try {
      // Classic worker (not module) so importScripts() is available.
      // MediaPipe's bundled WASM loader uses importScripts() to load
      // the vision runtime from CDN — module workers don't have it.
      worker = new Worker(
        new URL('../workers/ml-worker.ts', import.meta.url),
      )

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        handleWorkerMessage(e)
        if (e.data.type === 'ready') resolve()
        if (e.data.type === 'init-error') reject(new Error(e.data.message))
      }

      worker.onerror = (err) => {
        setStatus('error')
        reject(new Error(err.message || 'Worker failed to load'))
      }

      worker.postMessage({ type: 'init', model })
    } catch (err) {
      setStatus('error')
      initPromise = null
      reject(err)
    }
  })

  try {
    await initPromise
    // After init, switch to persistent message handler
    if (worker) worker.onmessage = handleWorkerMessage
  } catch {
    initPromise = null
    throw new Error('ML Worker initialization failed')
  }
}

/**
 * Detect faces in a photo using the ML worker.
 * Returns normalized bounding boxes (0-1 range).
 * Worker must be initialized first via initMLWorker().
 */
export async function detectFacesML(photoId: string, dataUrl: string): Promise<FaceBox[]> {
  if (!worker || status !== 'ready') {
    throw new Error('ML Worker not ready')
  }

  const detectionWorker = worker
  const imageBitmap = await dataUrlToImageBitmap(dataUrl)
  if (worker !== detectionWorker || status !== 'ready') {
    imageBitmap.close()
    throw new Error('ML Worker changed during image preparation')
  }

  return new Promise<FaceBox[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingDetections.delete(photoId)
      reject(new Error('Face detection timeout'))
    }, 30000)

    pendingDetections.set(photoId, {
      resolve: (result) => {
        clearTimeout(timeout)
        // For face-only mode, result is FaceBox[]
        if (Array.isArray(result)) {
          resolve(result)
        } else {
          resolve(result.faces)
        }
      },
      reject: (err) => {
        clearTimeout(timeout)
        reject(err)
      },
    })

    try {
      detectionWorker.postMessage(
        { type: 'detect', photoId, imageData: imageBitmap },
        [imageBitmap] // Transfer ownership
      )
    } catch (error) {
      pendingDetections.delete(photoId)
      clearTimeout(timeout)
      imageBitmap.close()
      reject(error)
    }
  })
}

/**
 * Detect both faces and objects in a photo (Advanced mode).
 * Returns combined results for region merging.
 * Worker must be initialized with model='both' via initMLWorker('both').
 */
export async function detectCombined(photoId: string, dataUrl: string): Promise<CombinedDetectionResult> {
  if (!worker || status !== 'ready') {
    throw new Error('ML Worker not ready')
  }

  if (currentModel !== 'both' && currentModel !== 'object') {
    throw new Error('Worker not initialized with object detection model')
  }

  const detectionWorker = worker
  const imageBitmap = await dataUrlToImageBitmap(dataUrl)
  if (worker !== detectionWorker || status !== 'ready') {
    imageBitmap.close()
    throw new Error('ML Worker changed during image preparation')
  }

  return new Promise<CombinedDetectionResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingDetections.delete(photoId)
      reject(new Error('Combined detection timeout'))
    }, 45000) // Slightly longer for two models

    pendingDetections.set(photoId, {
      resolve: (result) => {
        clearTimeout(timeout)
        if (Array.isArray(result)) {
          resolve({ faces: result, objects: [] })
        } else {
          resolve(result)
        }
      },
      reject: (err) => {
        clearTimeout(timeout)
        reject(err)
      },
    })

    try {
      detectionWorker.postMessage(
        { type: 'detect', photoId, imageData: imageBitmap },
        [imageBitmap]
      )
    } catch (error) {
      pendingDetections.delete(photoId)
      clearTimeout(timeout)
      imageBitmap.close()
      reject(error)
    }
  })
}

// Inference does not need export-resolution pixels. Bound the bitmap before
// transfer so both MediaPipe runtimes also upload only a small working image.
const MAX_DETECTION_DIMENSION = 1024

async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const image = new Image()
  const canvas = document.createElement('canvas')
  try {
    image.src = dataUrl
    await image.decode()
    const scale = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare image for detection')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await createImageBitmap(canvas)
  } finally {
    // Safari can retain canvas backing stores until explicitly reset.
    canvas.width = 0
    canvas.height = 0
    image.removeAttribute('src')
  }
}

export function disposeMLWorker(): void {
  if (worker) {
    worker.postMessage({ type: 'dispose' })
    worker.terminate()
    worker = null
  }
  initPromise = null
  setStatus('idle')
  pendingDetections.clear()
}

/**
 * Check if the native FaceDetector API is available.
 * When available, we skip the ML worker entirely (zero download).
 */
export function hasNativeFaceDetector(): boolean {
  return typeof (globalThis as Record<string, unknown>).FaceDetector !== 'undefined'
}
