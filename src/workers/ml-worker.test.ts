import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import type { WorkerRequest, WorkerResponse } from '@/workers/ml-worker'

const faceDetect = jest.fn(() => ({ detections: [{
  boundingBox: { originX: 126, originY: 54, width: 200, height: 90 },
  categories: [{ score: 0.83 }],
}] }))
const objectDetect = jest.fn(() => ({ detections: [{
  boundingBox: { originX: 250, originY: 125, width: 400, height: 250 },
  categories: [{ score: 0.71, categoryName: 'person', index: 3 }],
}] }))
const replies: WorkerResponse[] = []

jest.unstable_mockModule('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceDetector: { createFromOptions: async () => ({ detect: faceDetect, close: () => {} }) },
  ObjectDetector: { createFromOptions: async () => ({ detect: objectDetect, close: () => {} }) },
}))
globalThis.postMessage = ((reply: WorkerResponse) => { replies.push(reply) }) as typeof postMessage
await import('@/workers/ml-worker')

async function send(request: WorkerRequest) {
  await self.onmessage!.call(self, new MessageEvent('message', { data: request }))
}

function bitmap() {
  let width = 1000
  let height = 500
  return {
    get width() { return width },
    get height() { return height },
    close() { width = 0; height = 0 },
  } as ImageBitmap
}

describe('ML worker detection protocol', () => {
  beforeEach(async () => {
    await send({ type: 'dispose' })
    replies.length = 0
  })

  it('returns normalized face and object results and releases the transferred image', async () => {
    await send({ type: 'init', model: 'both' })
    const image = bitmap()
    await send({ type: 'detect', photoId: 'photo', imageData: image })
    expect(replies[replies.length - 1]).toEqual({
      type: 'combined-result', photoId: 'photo',
      faces: [{ x: 0.126, y: 0.108, width: 0.2, height: 0.18, confidence: 0.83 }],
      objects: [{ x: 0.25, y: 0.25, width: 0.4, height: 0.5, confidence: 0.71, class: 'person', classIndex: 3 }],
    })
    expect([image.width, image.height]).toEqual([0, 0])
  })

  it.each([false, true])('returns an error and releases the image when inference cannot run (initialized: %s)', async initialized => {
    if (initialized) {
      await send({ type: 'init', model: 'both' })
      objectDetect.mockImplementationOnce(() => { throw new Error('Inference failed') })
    }
    const image = bitmap()
    await send({ type: 'detect', photoId: 'photo', imageData: image })
    expect(replies[replies.length - 1]).toEqual({
      type: 'error', photoId: 'photo', message: initialized ? 'Inference failed' : 'No detector initialized',
    })
    expect([image.width, image.height]).toEqual([0, 0])
  })
})
