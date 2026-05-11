import { jest, describe, it, expect, beforeEach } from '@jest/globals'

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
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'init' })
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
})
