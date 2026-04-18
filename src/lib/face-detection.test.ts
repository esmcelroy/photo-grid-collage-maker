import { jest } from '@jest/globals'
import {
  calculateSmartPosition,
  analyzePhoto,
  analyzePhotoWithCache,
  clearAnalysisCache,
  getCachedAnalysis,
} from './face-detection'
import type { PhotoAnalysis } from './face-detection'

// Mock FaceDetector as unavailable
Object.defineProperty(globalThis, 'FaceDetector', { value: undefined, writable: true })

// Minimal canvas/Image mocks for jsdom
function createMockImageData(width: number, height: number, fill: number[] = [128, 128, 128, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = fill[3]
  }
  return { data, width, height }
}

// We need to mock canvas since jsdom doesn't support it
const mockGetImageData = jest.fn<(x: number, y: number, w: number, h: number) => ImageData>()
const mockDrawImage = jest.fn()
const mockGetContext = jest.fn().mockReturnValue({
  drawImage: mockDrawImage,
  getImageData: mockGetImageData,
})

beforeEach(() => {
  clearAnalysisCache()
  mockGetImageData.mockReset()
  mockDrawImage.mockReset()

  // Mock createElement for canvas
  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: mockGetContext,
      } as unknown as HTMLCanvasElement
    }
    return document.createElement.call(document, tag) as HTMLElement
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

// Helper to mock Image loading
function mockImageLoad(width: number, height: number) {
  jest.spyOn(globalThis, 'Image').mockImplementation(() => {
    const img = { width: 0, height: 0, src: '', onload: null as (() => void) | null }
    setTimeout(() => {
      img.width = width
      img.height = height
      img.onload?.()
    }, 0)
    return img as unknown as HTMLImageElement
  })
}

describe('calculateSmartPosition', () => {
  it('returns default for center subjects', () => {
    const analysis: PhotoAnalysis = {
      photoId: 'test',
      regions: [{ x: 0.4, y: 0.4, width: 0.2, height: 0.2, type: 'salient-region', confidence: 0.7 }],
      subjectCenter: { x: 0.5, y: 0.5 },
      analyzedAt: Date.now(),
    }
    expect(calculateSmartPosition(analysis)).toBe('50% 50%')
  })

  it('returns default for near-center subjects', () => {
    const analysis: PhotoAnalysis = {
      photoId: 'test',
      regions: [{ x: 0.43, y: 0.43, width: 0.1, height: 0.1, type: 'salient-region', confidence: 0.7 }],
      subjectCenter: { x: 0.48, y: 0.48 },
      analyzedAt: Date.now(),
    }
    expect(calculateSmartPosition(analysis)).toBe('50% 50%')
  })

  it('returns offset position for off-center subjects', () => {
    const analysis: PhotoAnalysis = {
      photoId: 'test',
      regions: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, type: 'face', confidence: 0.9 }],
      subjectCenter: { x: 0.2, y: 0.2 },
      analyzedAt: Date.now(),
    }
    expect(calculateSmartPosition(analysis)).toBe('20% 20%')
  })

  it('handles bottom-right subjects', () => {
    const analysis: PhotoAnalysis = {
      photoId: 'test',
      regions: [{ x: 0.6, y: 0.7, width: 0.3, height: 0.2, type: 'salient-region', confidence: 0.7 }],
      subjectCenter: { x: 0.75, y: 0.8 },
      analyzedAt: Date.now(),
    }
    expect(calculateSmartPosition(analysis)).toBe('75% 80%')
  })

  it('returns default when no regions', () => {
    const analysis: PhotoAnalysis = {
      photoId: 'test',
      regions: [],
      subjectCenter: { x: 0.5, y: 0.5 },
      analyzedAt: Date.now(),
    }
    expect(calculateSmartPosition(analysis)).toBe('50% 50%')
  })
})

describe('analyzePhotoWithCache', () => {
  it('caches analysis results', async () => {
    mockImageLoad(100, 100)
    // Return uniform image data (no edges)
    mockGetImageData.mockReturnValue(createMockImageData(100, 100) as unknown as ImageData)

    const result1 = await analyzePhotoWithCache('photo-1', 'data:image/png;base64,abc')
    expect(result1.photoId).toBe('photo-1')

    const result2 = await analyzePhotoWithCache('photo-1', 'data:image/png;base64,abc')
    expect(result2).toBe(result1) // same reference = cache hit
  })

  it('returns different results for different photos', async () => {
    mockImageLoad(100, 100)
    mockGetImageData.mockReturnValue(createMockImageData(100, 100) as unknown as ImageData)

    const result1 = await analyzePhotoWithCache('photo-a', 'data:image/png;base64,abc')
    const result2 = await analyzePhotoWithCache('photo-b', 'data:image/png;base64,def')
    expect(result1.photoId).toBe('photo-a')
    expect(result2.photoId).toBe('photo-b')
  })
})

describe('clearAnalysisCache', () => {
  it('clears cached analyses', async () => {
    mockImageLoad(100, 100)
    mockGetImageData.mockReturnValue(createMockImageData(100, 100) as unknown as ImageData)

    await analyzePhotoWithCache('photo-x', 'data:image/png;base64,abc')
    expect(getCachedAnalysis('photo-x')).toBeDefined()

    clearAnalysisCache()
    expect(getCachedAnalysis('photo-x')).toBeUndefined()
  })
})

describe('analyzePhoto', () => {
  it('returns empty regions for uniform images', async () => {
    mockImageLoad(100, 100)
    // Uniform gray — no edges
    mockGetImageData.mockReturnValue(createMockImageData(100, 100, [128, 128, 128, 255]) as unknown as ImageData)

    const result = await analyzePhoto('uniform', 'data:image/png;base64,abc')
    expect(result.subjectCenter).toEqual({ x: 0.5, y: 0.5 })
  })

  it('detects salient regions in non-uniform images', async () => {
    mockImageLoad(50, 50)

    // Create image data with a bright spot in the top-left corner
    const w = 50, h = 50
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        // Create a high-contrast region in top-left quadrant
        if (x < 15 && y < 15) {
          data[i] = 255
          data[i + 1] = 255
          data[i + 2] = 255
        } else {
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
        data[i + 3] = 255
      }
    }
    mockGetImageData.mockReturnValue({ data, width: w, height: h } as unknown as ImageData)

    const result = await analyzePhoto('contrast', 'data:image/png;base64,xyz')
    expect(result.regions.length).toBeGreaterThan(0)
    expect(result.regions[0].type).toBe('salient-region')
    // Subject center should be biased toward the top-left where the contrast edge is
    expect(result.subjectCenter.x).toBeLessThan(0.5)
    expect(result.subjectCenter.y).toBeLessThan(0.5)
  })

  it('falls back gracefully when FaceDetector is unavailable', async () => {
    mockImageLoad(100, 100)
    mockGetImageData.mockReturnValue(createMockImageData(100, 100) as unknown as ImageData)

    // FaceDetector is undefined (set at module level)
    const result = await analyzePhoto('no-face', 'data:image/png;base64,abc')
    expect(result.photoId).toBe('no-face')
    // Should still return a valid analysis
    expect(result.subjectCenter).toBeDefined()
  })
})
