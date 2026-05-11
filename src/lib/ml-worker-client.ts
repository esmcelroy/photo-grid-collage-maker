// Typed client for the ML face detection Web Worker
// Provides Promise-based API wrapping postMessage/onmessage

import type { FaceBox, WorkerResponse } from '@/workers/ml-worker'

export type WorkerStatus = 'idle' | 'loading' | 'ready' | 'error'

type PendingDetection = {
  resolve: (faces: FaceBox[]) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let status: WorkerStatus = 'idle'
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

export async function initMLWorker(): Promise<void> {
  if (initPromise) return initPromise
  if (status === 'ready') return

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

      worker.postMessage({ type: 'init' })
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

  // Convert data URL to ImageBitmap for transfer to worker
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const imageBitmap = await createImageBitmap(blob)

  return new Promise<FaceBox[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingDetections.delete(photoId)
      reject(new Error('Face detection timeout'))
    }, 30000)

    pendingDetections.set(photoId, {
      resolve: (faces) => {
        clearTimeout(timeout)
        resolve(faces)
      },
      reject: (err) => {
        clearTimeout(timeout)
        reject(err)
      },
    })

    worker!.postMessage(
      { type: 'detect', photoId, imageData: imageBitmap },
      [imageBitmap] // Transfer ownership
    )
  })
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
