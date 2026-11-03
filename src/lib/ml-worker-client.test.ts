import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { WorkerRequest } from '@/workers/ml-worker'

// Mock the worker constructor globally
const mockPostMessage = jest.fn()
const mockTerminate = jest.fn()
let mockOnMessage: ((e: MessageEvent) => void) | null = null

jest.unstable_mockModule('@/workers/ml-worker', () => ({}))

// Mock Worker constructor
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage = mockPostMessage
  terminate = mockTerminate

  constructor() {
    // Capture references so tests can simulate messages
    setTimeout(() => {
      mockOnMessage = this.onmessage
    }, 0)
  }
}

// @ts-expect-error - Mock Worker class
globalThis.Worker = MockWorker

const {
  initMLWorker,
  disposeMLWorker,
  getWorkerStatus,
  hasNativeFaceDetector,
  detectFacesML,
  detectCombined,
} = await import('@/lib/ml-worker-client')

describe('ml-worker-client', () => {
  beforeEach(() => {
    disposeMLWorker()
    mockPostMessage.mockClear()
    mockTerminate.mockClear()
    mockOnMessage = null
  })

  describe('getWorkerStatus', () => {
    it('starts as idle', () => {
      expect(getWorkerStatus()).toBe('idle')
    })
  })

  describe('hasNativeFaceDetector', () => {
    it('returns false when FaceDetector is not defined', () => {
      expect(hasNativeFaceDetector()).toBe(false)
    })

    it('returns true when FaceDetector is defined', () => {
      ;(globalThis as Record<string, unknown>).FaceDetector = class {}
      expect(hasNativeFaceDetector()).toBe(true)
      delete (globalThis as Record<string, unknown>).FaceDetector
    })
  })

  describe('initMLWorker', () => {
    it('sends init message to worker', async () => {
      const promise = initMLWorker()

      // Wait for constructor to finish
      await new Promise(r => setTimeout(r, 10))

      // Simulate worker responding with ready
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }

      await promise
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'init', model: 'face' })
      expect(getWorkerStatus()).toBe('ready')
    })

    it('deduplicates concurrent init calls', async () => {
      const p1 = initMLWorker()
      const p2 = initMLWorker()

      // Both should be the same promise reference
      // But if not, at least both should resolve
      await new Promise(r => setTimeout(r, 10))
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }
      await Promise.all([p1, p2])
      expect(getWorkerStatus()).toBe('ready')
    })
  })

  describe('disposeMLWorker', () => {
    it('terminates the worker and resets status', async () => {
      const promise = initMLWorker()
      await new Promise(r => setTimeout(r, 10))
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }
      await promise

      disposeMLWorker()
      expect(mockTerminate).toHaveBeenCalled()
      expect(getWorkerStatus()).toBe('idle')
    })

    it('is safe to call when no worker exists', () => {
      expect(() => disposeMLWorker()).not.toThrow()
      expect(getWorkerStatus()).toBe('idle')
    })
  })

  describe('worker message handling', () => {
    it('sets status to loading when worker reports loading', async () => {
      const promise = initMLWorker()
      await new Promise(r => setTimeout(r, 10))

      // Simulate loading then ready
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'loading' } }))
        expect(getWorkerStatus()).toBe('loading')
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }
      await promise
      expect(getWorkerStatus()).toBe('ready')
    })

    it('sets status to error on init-error', async () => {
      const promise = initMLWorker()
      await new Promise(r => setTimeout(r, 10))

      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', {
          data: { type: 'init-error', message: 'WASM load failed' },
        }))
      }
      await expect(promise).rejects.toThrow()
      expect(getWorkerStatus()).toBe('error')
    })

    it('skips init when already ready', async () => {
      // First init
      const p1 = initMLWorker()
      await new Promise(r => setTimeout(r, 10))
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }
      await p1

      // Second init should return immediately
      mockPostMessage.mockClear()
      await initMLWorker()
      expect(mockPostMessage).not.toHaveBeenCalled()
    })
  })

  describe('onWorkerStatusChange', () => {
    it('notifies listeners of status changes', async () => {
      const { onWorkerStatusChange } = await import('@/lib/ml-worker-client')
      const statuses: string[] = []
      const unsub = onWorkerStatusChange(s => statuses.push(s))

      const promise = initMLWorker()
      await new Promise(r => setTimeout(r, 10))
      if (mockOnMessage) {
        mockOnMessage(new MessageEvent('message', { data: { type: 'loading' } }))
        mockOnMessage(new MessageEvent('message', { data: { type: 'ready' } }))
      }
      await promise

      expect(statuses).toContain('loading')
      expect(statuses).toContain('ready')
      unsub()
    })
  })

  describe('bounded detection images', () => {
    const NativeImage = globalThis.Image
    const originalCreateBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
    const decodeImage = jest.fn<() => Promise<void>>()
    let width = 4032
    let height = 3024
    let preparedBitmap: ImageBitmap

    beforeEach(() => {
      decodeImage.mockReset().mockResolvedValue(undefined)
      globalThis.Image = jest.fn(() => {
        const image = new NativeImage()
        Object.defineProperties(image, {
          naturalWidth: { value: width },
          naturalHeight: { value: height },
          decode: { value: decodeImage },
        })
        return image
      }) as unknown as typeof Image
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as unknown as CanvasRenderingContext2D)
      Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        value: async (source: Blob | HTMLCanvasElement) => {
          let bitmapWidth = source instanceof Blob ? width : source.width
          let bitmapHeight = source instanceof Blob ? height : source.height
          preparedBitmap = {
            get width() { return bitmapWidth },
            get height() { return bitmapHeight },
            close() { bitmapWidth = 0; bitmapHeight = 0 },
          } as ImageBitmap
          return preparedBitmap
        },
      })
    })

    afterEach(() => {
      globalThis.Image = NativeImage
      if (originalCreateBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalCreateBitmap)
      else delete (globalThis as Record<string, unknown>).createImageBitmap
      mockPostMessage.mockReset()
      jest.restoreAllMocks()
    })

    async function ready(model: 'face' | 'both') {
      const initialization = initMLWorker(model)
      await new Promise(resolve => setTimeout(resolve, 10))
      mockOnMessage!(new MessageEvent('message', { data: { type: 'ready' } }))
      await initialization
    }

    it.each([
      ['face', 4032, 3024, 1024, 768],
      ['both', 3000, 5000, 614, 1024],
      ['both', 173, 281, 173, 281],
    ] as const)('bounds %s inference for %i × %i without upscaling or changing normalized results', async (model, w, h, expectedWidth, expectedHeight) => {
      width = w
      height = h
      await ready(model)
      let transferredSize: number[] = []
      const faces = [{ x: 0.2, y: 0.3, width: 0.1, height: 0.4, confidence: 0.9 }]
      mockPostMessage.mockImplementation((message: unknown) => {
        const request = message as WorkerRequest
        if (request.type !== 'detect') return
        transferredSize = [request.imageData!.width, request.imageData!.height]
        mockOnMessage!(new MessageEvent('message', {
          data: { type: model === 'face' ? 'result' : 'combined-result', photoId: request.photoId, faces, objects: [] },
        }))
      })

      const result = await (model === 'face' ? detectFacesML('photo', 'data:image/jpeg;base64,AAAA') : detectCombined('photo', 'data:image/jpeg;base64,AAAA'))
      expect(transferredSize).toEqual([expectedWidth, expectedHeight])
      expect(result).toEqual(model === 'face' ? faces : { faces, objects: [] })
    })

    it('rejects an obsolete image after disposal and releases its bitmap', async () => {
      await ready('both')
      let finishDecoding!: () => void
      decodeImage.mockImplementation(() => new Promise(resolve => { finishDecoding = resolve }))
      const detection = detectCombined('photo', 'data:image/jpeg;base64,AAAA')
      const rejection = expect(detection).rejects.toThrow('ML Worker changed during image preparation')
      disposeMLWorker()
      finishDecoding()
      await rejection
      expect([preparedBitmap.width, preparedBitmap.height]).toEqual([0, 0])
    })

    it('rejects failed transfers immediately and releases the untransferred bitmap', async () => {
      await ready('both')
      mockPostMessage.mockImplementation(() => { throw new Error('Transfer failed') })
      await expect(detectCombined('photo', 'data:image/jpeg;base64,AAAA')).rejects.toThrow('Transfer failed')
      expect([preparedBitmap.width, preparedBitmap.height]).toEqual([0, 0])
      mockPostMessage.mockReset()
    })
  })
})
