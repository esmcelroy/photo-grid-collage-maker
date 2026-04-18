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
}

const analysisCache = new Map<string, PhotoAnalysis>()

export function getCachedAnalysis(photoId: string): PhotoAnalysis | undefined {
  return analysisCache.get(photoId)
}

export function clearAnalysisCache() {
  analysisCache.clear()
}

async function detectSalientRegion(dataUrl: string): Promise<DetectedRegion[]> {
  const img = new Image()
  img.src = dataUrl
  await new Promise(resolve => { img.onload = resolve })

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
}

async function detectFaces(dataUrl: string): Promise<DetectedRegion[]> {
  if (typeof FaceDetector === 'undefined') return []

  try {
    const detector = new FaceDetector({ maxDetectedFaces: 10 })
    const img = new Image()
    img.src = dataUrl
    await new Promise(resolve => { img.onload = resolve })

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

export async function analyzePhoto(photoId: string, dataUrl: string): Promise<PhotoAnalysis> {
  const [faces, salient] = await Promise.all([
    detectFaces(dataUrl),
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

  return { photoId, regions, subjectCenter, analyzedAt: Date.now() }
}

export async function analyzePhotoWithCache(photoId: string, dataUrl: string): Promise<PhotoAnalysis> {
  const cached = analysisCache.get(photoId)
  if (cached) return cached

  const analysis = await analyzePhoto(photoId, dataUrl)
  analysisCache.set(photoId, analysis)
  return analysis
}

export function calculateSmartPosition(analysis: PhotoAnalysis): string {
  const x = Math.round(analysis.subjectCenter.x * 100)
  const y = Math.round(analysis.subjectCenter.y * 100)

  // If center is already near 50%, return default
  if (Math.abs(x - 50) < 5 && Math.abs(y - 50) < 5) {
    return '50% 50%'
  }

  return `${x}% ${y}%`
}
