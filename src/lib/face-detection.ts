import type { PhotoOrientation } from './image-analysis'
import { smartCropToObjectPosition, analyzeImage } from './image-analysis'
import type { DominantColor } from './color-intelligence'
import { analyzeColors } from './color-intelligence'
import { detectFacesML, hasNativeFaceDetector, getWorkerStatus } from './ml-worker-client'
import type { DetectionMode } from '@/hooks/use-smart-position'

export interface DetectedRegion {
  x: number      // 0-1 normalized
  y: number      // 0-1 normalized
  width: number  // 0-1 normalized
  height: number // 0-1 normalized
  type: 'face' | 'salient-region'
  confidence: number
}

export interface PhotoAnalysis {
  photoId: string
  regions: DetectedRegion[]
  subjectCenter: { x: number, y: number } // weighted center of all detected subjects
  analyzedAt: number // timestamp
  // Enhanced analysis fields (Phase 1)
  aspectRatio?: number
  orientation?: PhotoOrientation
  sharpnessScore?: number
  smartCrop?: { x: number; y: number; width: number; height: number }
  exifOrientation?: number
  // Color intelligence fields (Phase 2)
  dominantColors?: DominantColor[]
  isDark?: boolean
  averageLuminance?: number
}

const analysisCache = new Map<string, PhotoAnalysis>()

export function getCachedAnalysis(photoId: string): PhotoAnalysis | undefined {
  return analysisCache.get(photoId)
}

export function clearAnalysisCache() {
  analysisCache.clear()
}

async function detectSalientRegion(dataUrl: string): Promise<DetectedRegion[]> {
  try {
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image failed to load'))
      setTimeout(() => reject(new Error('Image load timeout')), 15000)
    })

    const canvas = document.createElement('canvas')
  // Use smaller size for performance (max 200px)
  const scale = Math.min(200 / img.width, 200 / img.height, 1)
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  const w = canvas.width
  const h = canvas.height

  // Convert to grayscale
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }

  // Compute edge magnitude using simplified Sobel filter
  const edges = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
                 - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
                 - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)]
      const gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
                 + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)]
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  // Find threshold at top 20% of edge values
  const sorted = Float32Array.from(edges).sort()
  const threshold = sorted[Math.floor(sorted.length * 0.8)] || 0

  let sumX = 0, sumY = 0, sumWeight = 0
  let minX = w, maxX = 0, minY = h, maxY = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x] >= threshold && edges[y * w + x] > 0) {
        sumX += x * edges[y * w + x]
        sumY += y * edges[y * w + x]
        sumWeight += edges[y * w + x]
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (sumWeight === 0) return []

    return [{
      x: minX / w,
      y: minY / h,
      width: (maxX - minX) / w,
      height: (maxY - minY) / h,
      type: 'salient-region',
      confidence: 0.7,
    }]
  } catch {
    return []
  }
}

async function detectFacesNative(dataUrl: string): Promise<DetectedRegion[]> {
  if (typeof FaceDetector === 'undefined') return []

  try {
    const detector = new FaceDetector({ maxDetectedFaces: 10 })
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image failed to load'))
      setTimeout(() => reject(new Error('Image load timeout')), 15000)
    })

    const faces = await detector.detect(img)
    return faces.map(face => ({
      x: face.boundingBox.x / img.width,
      y: face.boundingBox.y / img.height,
      width: face.boundingBox.width / img.width,
      height: face.boundingBox.height / img.height,
      type: 'face' as const,
      confidence: 0.9,
    }))
  } catch {
    return []
  }
}

// Route face detection based on detection mode:
// - basic: skip face detection entirely
// - standard: use native FaceDetector on Chrome, ML worker on Safari/Firefox
// - advanced: reserved for Phase 5
async function detectFaces(dataUrl: string, mode: DetectionMode, photoId?: string): Promise<DetectedRegion[]> {
  if (mode === 'basic') return []

  // Standard mode: prefer native API, fall back to ML worker
  if (hasNativeFaceDetector()) {
    return detectFacesNative(dataUrl)
  }

  // Use ML worker if available
  if (getWorkerStatus() === 'ready') {
    try {
      const faces = await detectFacesML(photoId ?? 'unknown', dataUrl)
      return faces.map(f => ({
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        type: 'face' as const,
        confidence: f.confidence,
      }))
    } catch {
      return []
    }
  }

  return []
}

// Module-level detection mode — set before calling analyzePhoto
let currentDetectionMode: DetectionMode = 'basic'

export function setAnalysisDetectionMode(mode: DetectionMode): void {
  currentDetectionMode = mode
}

export async function analyzePhoto(photoId: string, dataUrl: string): Promise<PhotoAnalysis> {
  const [faces, salient] = await Promise.all([
    detectFaces(dataUrl, currentDetectionMode, photoId),
    detectSalientRegion(dataUrl),
  ])

  const regions = faces.length > 0 ? faces : salient

  // Calculate weighted subject center
  let subjectCenter = { x: 0.5, y: 0.5 }
  if (regions.length > 0) {
    const totalWeight = regions.reduce((sum, r) => sum + r.confidence, 0)
    subjectCenter = {
      x: regions.reduce((sum, r) => sum + (r.x + r.width / 2) * r.confidence, 0) / totalWeight,
      y: regions.reduce((sum, r) => sum + (r.y + r.height / 2) * r.confidence, 0) / totalWeight,
    }
  }

  // Enhanced analysis: aspect ratio, sharpness, smartcrop
  let enhancedFields: Partial<PhotoAnalysis> = {}
  try {
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image failed to load'))
      setTimeout(() => reject(new Error('Image load timeout')), 15000)
    })

    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (w > 0 && h > 0) {
      // Convert face regions to smartcrop boost format
      const boosts = faces.map(f => ({
        x: f.x * w,
        y: f.y * h,
        width: f.width * w,
        height: f.height * h,
        weight: 1.0,
      }))

      const analysis = await analyzeImage(img, boosts.length > 0 ? boosts : undefined)
      enhancedFields = {
        aspectRatio: analysis.aspectRatio,
        orientation: analysis.orientation,
        sharpnessScore: analysis.sharpnessScore,
        smartCrop: analysis.smartCrop,
      }

      // Color analysis (Phase 2)
      try {
        const colorData = await analyzeColors(img)
        enhancedFields.dominantColors = colorData.dominantColors
        enhancedFields.isDark = colorData.isDark
        enhancedFields.averageLuminance = colorData.averageLuminance
      } catch {
        // Color analysis is optional — fall back gracefully
      }

      // If smartcrop found a better position, use it as subjectCenter
      if (analysis.smartCrop) {
        const smartPos = smartCropToObjectPosition(analysis.smartCrop)
        if (smartPos !== '50% 50%' && regions.length === 0) {
          const [xStr, yStr] = smartPos.split(' ')
          const parsedX = parseInt(xStr) / 100
          const parsedY = parseInt(yStr) / 100
          if (!isNaN(parsedX) && !isNaN(parsedY)) {
            subjectCenter = { x: parsedX, y: parsedY }
          }
        }
      }
    }
  } catch {
    // Enhanced analysis is optional — fall back to basic analysis
  }

  return { photoId, regions, subjectCenter, analyzedAt: Date.now(), ...enhancedFields }
}

export async function analyzePhotoWithCache(photoId: string, dataUrl: string): Promise<PhotoAnalysis> {
  const cached = analysisCache.get(photoId)
  if (cached) return cached

  const analysis = await analyzePhoto(photoId, dataUrl)
  analysisCache.set(photoId, analysis)
  return analysis
}

export function calculateSmartPosition(analysis: PhotoAnalysis): string {
  // Prefer smartcrop-based positioning when available
  if (analysis.smartCrop) {
    return smartCropToObjectPosition(analysis.smartCrop)
  }

  const x = Math.round(analysis.subjectCenter.x * 100)
  const y = Math.round(analysis.subjectCenter.y * 100)

  // If center is already near 50%, return default
  if (Math.abs(x - 50) < 5 && Math.abs(y - 50) < 5) {
    return '50% 50%'
  }

  return `${x}% ${y}%`
}
