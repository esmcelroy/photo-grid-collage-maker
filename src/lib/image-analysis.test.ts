import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import {
  classifyOrientation,
  calculateAspectRatio,
  measureSharpness,
  smartCropToObjectPosition,
} from './image-analysis'

describe('classifyOrientation', () => {
  it('classifies tall images as portrait', () => {
    expect(classifyOrientation(1000, 1500)).toBe('portrait')
    expect(classifyOrientation(800, 1200)).toBe('portrait')
  })

  it('classifies wide images as landscape', () => {
    expect(classifyOrientation(1920, 1080)).toBe('landscape')
    expect(classifyOrientation(1600, 900)).toBe('landscape')
  })

  it('classifies near-square images as square', () => {
    expect(classifyOrientation(1000, 1000)).toBe('square')
    expect(classifyOrientation(1000, 1100)).toBe('square')
    expect(classifyOrientation(1100, 1000)).toBe('square')
  })

  it('uses 1.2 and 0.8 thresholds', () => {
    // height/width = 1.19 → square (just under portrait threshold)
    expect(classifyOrientation(100, 119)).toBe('square')
    // height/width = 1.2 → portrait
    expect(classifyOrientation(100, 120)).toBe('portrait')
    // height/width = 0.81 → square (just above landscape threshold)
    expect(classifyOrientation(100, 81)).toBe('square')
    // height/width = 0.8 → landscape
    expect(classifyOrientation(100, 80)).toBe('landscape')
  })
})

describe('calculateAspectRatio', () => {
  it('returns width/height ratio', () => {
    expect(calculateAspectRatio(1920, 1080)).toBeCloseTo(16 / 9, 2)
    expect(calculateAspectRatio(1080, 1920)).toBeCloseTo(9 / 16, 2)
    expect(calculateAspectRatio(1000, 1000)).toBe(1)
  })

  it('handles zero width', () => {
    expect(calculateAspectRatio(0, 100)).toBe(1)
  })
})

describe('measureSharpness', () => {
  function createImageData(
    width: number,
    height: number,
    fill: number[] = [128, 128, 128, 255],
  ): ImageData {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = fill[0]
      data[i * 4 + 1] = fill[1]
      data[i * 4 + 2] = fill[2]
      data[i * 4 + 3] = fill[3]
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData
  }

  it('returns 0 for uniform images', () => {
    const result = measureSharpness(createImageData(50, 50))
    expect(result).toBe(0)
  })

  it('returns 0 for images too small to analyze', () => {
    expect(measureSharpness(createImageData(2, 2))).toBe(0)
    expect(measureSharpness(createImageData(1, 10))).toBe(0)
  })

  it('returns higher value for high-contrast images', () => {
    const w = 50, h = 50
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        // Create a region with sharp edges: bright square on dark background
        if (x >= 10 && x < 30 && y >= 10 && y < 30) {
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
    const sharp = measureSharpness({ data, width: w, height: h, colorSpace: 'srgb' } as ImageData)
    const uniform = measureSharpness(createImageData(w, h))
    expect(sharp).toBeGreaterThan(uniform)
  })

  it('detects edges as sharper than smooth gradients', () => {
    const w = 20, h = 20
    // Hard edge: left half black, right half white
    const edgeData = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const val = x < w / 2 ? 0 : 255
        edgeData[i] = val
        edgeData[i + 1] = val
        edgeData[i + 2] = val
        edgeData[i + 3] = 255
      }
    }

    // Smooth gradient
    const gradData = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const val = Math.round((x / w) * 255)
        gradData[i] = val
        gradData[i + 1] = val
        gradData[i + 2] = val
        gradData[i + 3] = 255
      }
    }

    const edgeScore = measureSharpness({ data: edgeData, width: w, height: h, colorSpace: 'srgb' } as ImageData)
    const gradScore = measureSharpness({ data: gradData, width: w, height: h, colorSpace: 'srgb' } as ImageData)
    expect(edgeScore).toBeGreaterThan(gradScore)
  })
})

describe('smartCropToObjectPosition', () => {
  it('returns 50% 50% for centered crops', () => {
    expect(smartCropToObjectPosition({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 })).toBe('50% 50%')
  })

  it('returns offset for off-center crops', () => {
    expect(smartCropToObjectPosition({ x: 0, y: 0, width: 0.5, height: 0.5 })).toBe('25% 25%')
  })

  it('handles right-bottom bias', () => {
    expect(smartCropToObjectPosition({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 })).toBe('75% 75%')
  })

  it('returns 50% 50% for near-center results', () => {
    // Center at 52%, 48% → within 5% tolerance → returns default
    expect(smartCropToObjectPosition({ x: 0.27, y: 0.23, width: 0.5, height: 0.5 })).toBe('50% 50%')
  })
})
