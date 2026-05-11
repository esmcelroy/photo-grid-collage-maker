// Region merging for Advanced object detection mode
// Combines face detections (BlazeFace) with object detections (EfficientDet)
// using containment-ratio de-duplication and class-weighted scoring

import type { FaceBox } from '@/workers/ml-worker'

export interface ObjectBox extends FaceBox {
  class: string
  classIndex: number
}

export interface WeightedRegion {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  weight: number
  source: 'face' | 'object'
  class?: string
}

// Class weights optimized for personal photo collections
// Higher weight = more likely to be the intended subject
export const CLASS_WEIGHTS: Record<string, number> = {
  // People (face detection is more precise, so person bbox gets low weight)
  person: 0.2,

  // Pets — very common photo subjects
  cat: 0.9,
  dog: 0.9,
  bird: 0.7,
  horse: 0.7,

  // Food — popular for event/celebration photos
  cake: 0.6,
  pizza: 0.6,
  sandwich: 0.5,
  donut: 0.5,
  bowl: 0.4,
  cup: 0.3,
  'wine glass': 0.4,
  bottle: 0.3,

  // Vehicles — sometimes the subject
  car: 0.4,
  motorcycle: 0.5,
  bicycle: 0.4,
  airplane: 0.5,
  boat: 0.5,
  truck: 0.3,
  bus: 0.3,

  // Sports/recreation
  'sports ball': 0.5,
  'tennis racket': 0.4,
  surfboard: 0.5,
  skateboard: 0.4,
  snowboard: 0.5,
  kite: 0.4,

  // Personal items
  handbag: 0.2,
  backpack: 0.2,
  umbrella: 0.2,
  tie: 0.2,
  suitcase: 0.3,

  // Electronics
  laptop: 0.3,
  'cell phone': 0.2,
  tv: 0.3,
  keyboard: 0.1,
  mouse: 0.1,

  // Furniture/background — never the positioning target
  chair: 0.0,
  couch: 0.0,
  bed: 0.0,
  'dining table': 0.0,
  toilet: 0.0,
  sink: 0.0,
  refrigerator: 0.0,
  oven: 0.0,
  microwave: 0.0,
  bench: 0.0,
  'potted plant': 0.1,
  vase: 0.2,
  clock: 0.1,
  'traffic light': 0.0,
  'fire hydrant': 0.0,
  'stop sign': 0.0,
  'parking meter': 0.0,

  // Books/media
  book: 0.3,
}

const DEFAULT_WEIGHT = 0.3

export function getClassWeight(className: string): number {
  return CLASS_WEIGHTS[className] ?? DEFAULT_WEIGHT
}

/**
 * Compute how much of the smaller bbox is contained within the larger one.
 * Returns 0-1 where 1 means fully contained.
 * Unlike IoU, this correctly handles face-inside-person (small inside large).
 */
export function containmentRatio(a: FaceBox, b: FaceBox): number {
  const interLeft = Math.max(a.x, b.x)
  const interTop = Math.max(a.y, b.y)
  const interRight = Math.min(a.x + a.width, b.x + b.width)
  const interBottom = Math.min(a.y + a.height, b.y + b.height)

  if (interRight <= interLeft || interBottom <= interTop) return 0

  const interArea = (interRight - interLeft) * (interBottom - interTop)
  const aArea = a.width * a.height
  const bArea = b.width * b.height
  const smallerArea = Math.min(aArea, bArea)

  return smallerArea > 0 ? interArea / smallerArea : 0
}

/**
 * Remove "person" object detections that overlap with detected faces.
 * A person bbox is redundant when a face is contained within it —
 * the face provides more precise positioning.
 */
export function suppressRedundantPersons(
  faces: FaceBox[],
  objects: ObjectBox[]
): ObjectBox[] {
  return objects.filter(obj => {
    if (obj.class !== 'person') return true
    // Keep person only if no face has >50% containment within it
    return !faces.some(face => containmentRatio(face, obj) > 0.5)
  })
}

/**
 * Merge face and object detections into weighted regions.
 * Returns unified DetectedRegion-compatible results for the positioning pipeline.
 */
export function mergeDetections(
  faces: FaceBox[],
  objects: ObjectBox[]
): WeightedRegion[] {
  // Suppress person bboxes that are redundant with face detections
  const keptObjects = suppressRedundantPersons(faces, objects)

  // Build weighted region list
  const regions: WeightedRegion[] = [
    ...faces.map(f => ({
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      confidence: f.confidence,
      weight: 1.0,
      source: 'face' as const,
      class: 'face',
    })),
    ...keptObjects
      .filter(o => getClassWeight(o.class) > 0)
      .map(o => ({
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        confidence: o.confidence,
        weight: getClassWeight(o.class),
        source: 'object' as const,
        class: o.class,
      })),
  ]

  return regions
}

/**
 * Compute a weighted centroid from merged regions.
 * Each region contributes based on its weight × confidence.
 */
export function computeWeightedCentroid(
  regions: WeightedRegion[]
): { x: number; y: number } {
  if (regions.length === 0) return { x: 0.5, y: 0.5 }

  const totalWeight = regions.reduce(
    (sum, r) => sum + r.weight * r.confidence,
    0
  )

  if (totalWeight === 0) return { x: 0.5, y: 0.5 }

  return {
    x: regions.reduce(
      (sum, r) => sum + (r.x + r.width / 2) * r.weight * r.confidence,
      0
    ) / totalWeight,
    y: regions.reduce(
      (sum, r) => sum + (r.y + r.height / 2) * r.weight * r.confidence,
      0
    ) / totalWeight,
  }
}

/**
 * Compute bounding box that encloses all significant regions.
 * Only includes regions with effective weight (weight × confidence) above threshold.
 */
export function computeEnclosingBbox(
  regions: WeightedRegion[],
  threshold = 0.2
): { x: number; y: number; width: number; height: number } | null {
  const significant = regions.filter(r => r.weight * r.confidence > threshold)

  if (significant.length === 0) return null

  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const r of significant) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
