import smartcrop from 'smartcrop'
import type { CropBoost } from 'smartcrop'

export type PhotoOrientation = 'portrait' | 'landscape' | 'square'

export interface ImageAnalysis {
  aspectRatio: number
  orientation: PhotoOrientation
  sharpnessScore: number
  smartCrop: { x: number; y: number; width: number; height: number }
  exifOrientation?: number
}

const PORTRAIT_THRESHOLD = 1.2
const LANDSCAPE_THRESHOLD = 0.8

export function classifyOrientation(width: number, height: number): PhotoOrientation {
  const ratio = height / width
  if (ratio >= PORTRAIT_THRESHOLD) return 'portrait'
  if (ratio <= LANDSCAPE_THRESHOLD) return 'landscape'
  return 'square'
}

export function calculateAspectRatio(width: number, height: number): number {
  if (width === 0) return 1
  return width / height
}

/**
 * Measures image sharpness using Laplacian variance.
 * Higher values = sharper image. Values below ~100 suggest blur.
 * Operates on a downsampled 256px canvas for consistent performance.
 */
export function measureSharpness(imageData: ImageData): number {
  const { data, width, height } = imageData
  if (width < 3 || height < 3) return 0

  let sum = 0
  let sumSq = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114

      const top = data[((y - 1) * width + x) * 4] * 0.299 +
        data[((y - 1) * width + x) * 4 + 1] * 0.587 +
        data[((y - 1) * width + x) * 4 + 2] * 0.114
      const bottom = data[((y + 1) * width + x) * 4] * 0.299 +
        data[((y + 1) * width + x) * 4 + 1] * 0.587 +
        data[((y + 1) * width + x) * 4 + 2] * 0.114
      const left = data[(y * width + (x - 1)) * 4] * 0.299 +
        data[(y * width + (x - 1)) * 4 + 1] * 0.587 +
        data[(y * width + (x - 1)) * 4 + 2] * 0.114
      const right = data[(y * width + (x + 1)) * 4] * 0.299 +
        data[(y * width + (x + 1)) * 4 + 1] * 0.587 +
        data[(y * width + (x + 1)) * 4 + 2] * 0.114

      const lap = Math.abs(4 * lum - top - bottom - left - right)
      sum += lap
      sumSq += lap * lap
      count++
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

/**
 * Uses smartcrop.js to find the optimal crop region for a photo.
 * Accepts optional face/region boosts to prioritize detected subjects.
 */
export async function getSmartCrop(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  boosts?: CropBoost[],
): Promise<{ x: number; y: number; width: number; height: number }> {
  try {
    const result = await smartcrop.crop(img, {
      width: targetWidth,
      height: targetHeight,
      boost: boosts,
    })
    return result.topCrop
  } catch {
    // Fallback: center crop
    return {
      x: Math.max(0, (img.naturalWidth - targetWidth) / 2),
      y: Math.max(0, (img.naturalHeight - targetHeight) / 2),
      width: Math.min(targetWidth, img.naturalWidth),
      height: Math.min(targetHeight, img.naturalHeight),
    }
  }
}

/**
 * Extracts EXIF orientation from a file/blob.
 * Returns undefined if EXIF data is unavailable.
 */
export async function getExifOrientation(file: File | Blob): Promise<number | undefined> {
  try {
    const exifr = await import('exifr')
    const data = await exifr.parse(file, ['Orientation'])
    return data?.Orientation
  } catch {
    return undefined
  }
}

/**
 * Analyzes an image element, computing aspect ratio, orientation,
 * sharpness, and smart crop in a single pass.
 */
export async function analyzeImage(
  img: HTMLImageElement,
  boosts?: CropBoost[],
): Promise<ImageAnalysis> {
  const { naturalWidth: w, naturalHeight: h } = img

  const aspectRatio = calculateAspectRatio(w, h)
  const orientation = classifyOrientation(w, h)

  // Compute sharpness on a downsampled canvas
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 256 / Math.max(w, h))
  canvas.width = Math.floor(w * scale)
  canvas.height = Math.floor(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const sharpnessScore = measureSharpness(imageData)

  // Smart crop for a square region (default; caller can override)
  const cropSize = Math.min(w, h)
  const smartCropResult = await getSmartCrop(img, cropSize, cropSize, boosts)

  // Normalize crop to 0-1 range
  const smartCrop = {
    x: smartCropResult.x / w,
    y: smartCropResult.y / h,
    width: smartCropResult.width / w,
    height: smartCropResult.height / h,
  }

  return { aspectRatio, orientation, sharpnessScore, smartCrop }
}

/**
 * Converts a smartcrop result to CSS object-position.
 * Centers the view on the crop region's center.
 */
export function smartCropToObjectPosition(
  smartCrop: { x: number; y: number; width: number; height: number },
): string {
  const centerX = Math.round((smartCrop.x + smartCrop.width / 2) * 100)
  const centerY = Math.round((smartCrop.y + smartCrop.height / 2) * 100)

  if (Math.abs(centerX - 50) < 5 && Math.abs(centerY - 50) < 5) {
    return '50% 50%'
  }
  return `${centerX}% ${centerY}%`
}
