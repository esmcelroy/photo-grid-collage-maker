import { describe, it, expect } from '@jest/globals'
import {
  containmentRatio,
  suppressRedundantPersons,
  mergeDetections,
  computeWeightedCentroid,
  computeEnclosingBbox,
  getClassWeight,
  CLASS_WEIGHTS,
} from './region-merge'
import type { ObjectBox, WeightedRegion } from './region-merge'
import type { FaceBox } from '@/workers/ml-worker'

describe('region-merge', () => {
  describe('containmentRatio', () => {
    it('returns 1.0 when smaller bbox fully contained in larger', () => {
      const face: FaceBox = { x: 0.3, y: 0.1, width: 0.1, height: 0.1, confidence: 0.9 }
      const person: FaceBox = { x: 0.2, y: 0.0, width: 0.3, height: 0.6, confidence: 0.85 }
      expect(containmentRatio(face, person)).toBeCloseTo(1.0)
    })

    it('returns 0 when bboxes do not overlap', () => {
      const a: FaceBox = { x: 0.0, y: 0.0, width: 0.2, height: 0.2, confidence: 0.9 }
      const b: FaceBox = { x: 0.5, y: 0.5, width: 0.2, height: 0.2, confidence: 0.8 }
      expect(containmentRatio(a, b)).toBe(0)
    })

    it('returns partial value for partial overlap', () => {
      const a: FaceBox = { x: 0.0, y: 0.0, width: 0.4, height: 0.4, confidence: 0.9 }
      const b: FaceBox = { x: 0.2, y: 0.2, width: 0.4, height: 0.4, confidence: 0.8 }
      // Intersection: 0.2×0.2 = 0.04, smaller area = 0.16, ratio = 0.25
      expect(containmentRatio(a, b)).toBeCloseTo(0.25)
    })

    it('handles identical bboxes (ratio = 1.0)', () => {
      const box: FaceBox = { x: 0.3, y: 0.3, width: 0.2, height: 0.2, confidence: 0.9 }
      expect(containmentRatio(box, box)).toBeCloseTo(1.0)
    })

    it('returns 0 for zero-area bbox', () => {
      const a: FaceBox = { x: 0.5, y: 0.5, width: 0, height: 0, confidence: 0.9 }
      const b: FaceBox = { x: 0.3, y: 0.3, width: 0.4, height: 0.4, confidence: 0.8 }
      expect(containmentRatio(a, b)).toBe(0)
    })
  })

  describe('suppressRedundantPersons', () => {
    it('suppresses person bbox when face is contained within it', () => {
      const faces: FaceBox[] = [
        { x: 0.35, y: 0.1, width: 0.1, height: 0.1, confidence: 0.95 },
      ]
      const objects: ObjectBox[] = [
        { x: 0.2, y: 0.0, width: 0.4, height: 0.7, confidence: 0.85, class: 'person', classIndex: 0 },
        { x: 0.6, y: 0.3, width: 0.2, height: 0.2, confidence: 0.9, class: 'dog', classIndex: 17 },
      ]
      const result = suppressRedundantPersons(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].class).toBe('dog')
    })

    it('keeps person bbox when no overlapping face', () => {
      const faces: FaceBox[] = [
        { x: 0.0, y: 0.0, width: 0.1, height: 0.1, confidence: 0.9 },
      ]
      const objects: ObjectBox[] = [
        { x: 0.5, y: 0.3, width: 0.3, height: 0.5, confidence: 0.8, class: 'person', classIndex: 0 },
      ]
      const result = suppressRedundantPersons(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].class).toBe('person')
    })

    it('always keeps non-person objects regardless of overlap', () => {
      const faces: FaceBox[] = [
        { x: 0.3, y: 0.3, width: 0.1, height: 0.1, confidence: 0.9 },
      ]
      const objects: ObjectBox[] = [
        { x: 0.25, y: 0.25, width: 0.2, height: 0.2, confidence: 0.85, class: 'cat', classIndex: 15 },
      ]
      const result = suppressRedundantPersons(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].class).toBe('cat')
    })

    it('handles multiple people with multiple faces', () => {
      const faces: FaceBox[] = [
        { x: 0.1, y: 0.1, width: 0.08, height: 0.08, confidence: 0.92 },
        { x: 0.5, y: 0.1, width: 0.08, height: 0.08, confidence: 0.88 },
      ]
      const objects: ObjectBox[] = [
        { x: 0.05, y: 0.0, width: 0.25, height: 0.6, confidence: 0.8, class: 'person', classIndex: 0 },
        { x: 0.45, y: 0.0, width: 0.25, height: 0.6, confidence: 0.8, class: 'person', classIndex: 0 },
        { x: 0.8, y: 0.4, width: 0.15, height: 0.15, confidence: 0.9, class: 'dog', classIndex: 17 },
      ]
      const result = suppressRedundantPersons(faces, objects)
      // Both persons suppressed (faces inside them), dog kept
      expect(result).toHaveLength(1)
      expect(result[0].class).toBe('dog')
    })
  })

  describe('mergeDetections', () => {
    it('returns face regions with weight 1.0 when only faces detected', () => {
      const faces: FaceBox[] = [
        { x: 0.3, y: 0.2, width: 0.15, height: 0.15, confidence: 0.95 },
      ]
      const objects: ObjectBox[] = []
      const result = mergeDetections(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].weight).toBe(1.0)
      expect(result[0].source).toBe('face')
    })

    it('returns object regions with class weight when only objects detected', () => {
      const faces: FaceBox[] = []
      const objects: ObjectBox[] = [
        { x: 0.4, y: 0.3, width: 0.2, height: 0.3, confidence: 0.88, class: 'dog', classIndex: 17 },
      ]
      const result = mergeDetections(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].weight).toBe(0.9) // dog weight
      expect(result[0].source).toBe('object')
    })

    it('filters out zero-weight objects (furniture)', () => {
      const faces: FaceBox[] = []
      const objects: ObjectBox[] = [
        { x: 0.0, y: 0.0, width: 0.5, height: 0.5, confidence: 0.9, class: 'chair', classIndex: 56 },
        { x: 0.5, y: 0.3, width: 0.2, height: 0.2, confidence: 0.85, class: 'cat', classIndex: 15 },
      ]
      const result = mergeDetections(faces, objects)
      expect(result).toHaveLength(1)
      expect(result[0].class).toBe('cat')
    })

    it('merges faces and objects with person suppression', () => {
      const faces: FaceBox[] = [
        { x: 0.3, y: 0.1, width: 0.1, height: 0.1, confidence: 0.95 },
      ]
      const objects: ObjectBox[] = [
        { x: 0.2, y: 0.0, width: 0.35, height: 0.7, confidence: 0.85, class: 'person', classIndex: 0 },
        { x: 0.6, y: 0.4, width: 0.2, height: 0.25, confidence: 0.9, class: 'dog', classIndex: 17 },
      ]
      const result = mergeDetections(faces, objects)
      // face + dog (person suppressed)
      expect(result).toHaveLength(2)
      expect(result[0].source).toBe('face')
      expect(result[1].class).toBe('dog')
    })

    it('returns empty array when nothing detected', () => {
      expect(mergeDetections([], [])).toHaveLength(0)
    })
  })

  describe('computeWeightedCentroid', () => {
    it('returns center (0.5, 0.5) for empty regions', () => {
      const result = computeWeightedCentroid([])
      expect(result.x).toBe(0.5)
      expect(result.y).toBe(0.5)
    })

    it('returns center of single region', () => {
      const regions: WeightedRegion[] = [{
        x: 0.2, y: 0.3, width: 0.2, height: 0.2,
        confidence: 0.9, weight: 1.0, source: 'face',
      }]
      const result = computeWeightedCentroid(regions)
      expect(result.x).toBeCloseTo(0.3)  // 0.2 + 0.2/2
      expect(result.y).toBeCloseTo(0.4)  // 0.3 + 0.2/2
    })

    it('weights centroid toward higher-weight region', () => {
      const regions: WeightedRegion[] = [
        { x: 0.1, y: 0.1, width: 0.1, height: 0.1, confidence: 0.9, weight: 1.0, source: 'face' },
        { x: 0.7, y: 0.7, width: 0.1, height: 0.1, confidence: 0.9, weight: 0.2, source: 'object' },
      ]
      const result = computeWeightedCentroid(regions)
      // Face has 5x the weight, so centroid should be much closer to face
      expect(result.x).toBeLessThan(0.4)
      expect(result.y).toBeLessThan(0.4)
    })

    it('accounts for confidence in weighting', () => {
      const regions: WeightedRegion[] = [
        { x: 0.0, y: 0.0, width: 0.2, height: 0.2, confidence: 0.5, weight: 1.0, source: 'face' },
        { x: 0.8, y: 0.8, width: 0.2, height: 0.2, confidence: 1.0, weight: 1.0, source: 'object' },
      ]
      const result = computeWeightedCentroid(regions)
      // Second region has higher confidence, so centroid pulls toward it
      expect(result.x).toBeGreaterThan(0.5)
      expect(result.y).toBeGreaterThan(0.5)
    })
  })

  describe('computeEnclosingBbox', () => {
    it('returns null for empty regions', () => {
      expect(computeEnclosingBbox([])).toBeNull()
    })

    it('returns null when all regions below threshold', () => {
      const regions: WeightedRegion[] = [{
        x: 0.3, y: 0.3, width: 0.1, height: 0.1,
        confidence: 0.1, weight: 0.1, source: 'object',
      }]
      expect(computeEnclosingBbox(regions)).toBeNull()
    })

    it('returns bbox of single significant region', () => {
      const regions: WeightedRegion[] = [{
        x: 0.2, y: 0.3, width: 0.3, height: 0.4,
        confidence: 0.9, weight: 1.0, source: 'face',
      }]
      const result = computeEnclosingBbox(regions)
      expect(result!.x).toBeCloseTo(0.2)
      expect(result!.y).toBeCloseTo(0.3)
      expect(result!.width).toBeCloseTo(0.3)
      expect(result!.height).toBeCloseTo(0.4)
    })

    it('encloses multiple regions', () => {
      const regions: WeightedRegion[] = [
        { x: 0.1, y: 0.1, width: 0.2, height: 0.2, confidence: 0.9, weight: 1.0, source: 'face' },
        { x: 0.6, y: 0.5, width: 0.2, height: 0.3, confidence: 0.8, weight: 0.9, source: 'object' },
      ]
      const result = computeEnclosingBbox(regions)
      expect(result!.x).toBeCloseTo(0.1)
      expect(result!.y).toBeCloseTo(0.1)
      expect(result!.width).toBeCloseTo(0.7)  // 0.8 - 0.1
      expect(result!.height).toBeCloseTo(0.7) // 0.8 - 0.1
    })
  })

  describe('getClassWeight', () => {
    it('returns correct weight for known classes', () => {
      expect(getClassWeight('dog')).toBe(0.9)
      expect(getClassWeight('cat')).toBe(0.9)
      expect(getClassWeight('person')).toBe(0.2)
      expect(getClassWeight('cake')).toBe(0.6)
      expect(getClassWeight('chair')).toBe(0.0)
    })

    it('returns default weight (0.3) for unknown classes', () => {
      expect(getClassWeight('unknown_object')).toBe(0.3)
      expect(getClassWeight('')).toBe(0.3)
    })

    it('has all expected high-priority classes', () => {
      expect(CLASS_WEIGHTS['dog']).toBeGreaterThanOrEqual(0.7)
      expect(CLASS_WEIGHTS['cat']).toBeGreaterThanOrEqual(0.7)
      expect(CLASS_WEIGHTS['horse']).toBeGreaterThanOrEqual(0.7)
    })

    it('has zero weight for all furniture/background', () => {
      const backgroundClasses = ['chair', 'couch', 'bed', 'dining table', 'toilet', 'sink']
      for (const cls of backgroundClasses) {
        expect(CLASS_WEIGHTS[cls]).toBe(0.0)
      }
    })
  })
})
