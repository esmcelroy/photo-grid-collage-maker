import { describe, it, expect } from '@jest/globals'
import {
  analyzeSlotOrientations,
  scoreLayout,
  rankLayouts,
  suggestPhotoArrangement,
} from './layout-scoring'
import type { PhotoCharacteristics } from './layout-scoring'
import type { GridLayout } from './types'

function makeLayout(overrides: Partial<GridLayout> & Pick<GridLayout, 'id' | 'areas' | 'gridTemplate'>): GridLayout {
  return {
    name: overrides.id,
    photoCount: new Set(overrides.areas.join(' ').split(' ').filter(a => a !== '.')).size,
    ...overrides,
  }
}

describe('analyzeSlotOrientations', () => {
  it('classifies slots in side-by-side layout with landscape container', () => {
    const layout = makeLayout({
      id: 'test-horiz',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
      aspectRatio: '16/9',
    })
    const orientations = analyzeSlotOrientations(layout)
    // Container 16:9, each slot gets 8:9 ≈ 0.89 → square
    expect(orientations.get('a')).toBe('square')
    expect(orientations.get('b')).toBe('square')
  })

  it('classifies slots in stacked layout with portrait container', () => {
    const layout = makeLayout({
      id: 'test-vert',
      gridTemplate: '1fr 1fr / 1fr',
      areas: ['a', 'b'],
      aspectRatio: '3/4',
    })
    const orientations = analyzeSlotOrientations(layout)
    // Container 3:4, each slot gets 3:(4/2) = 3:2 = 1.5 → landscape
    expect(orientations.get('a')).toBe('landscape')
    expect(orientations.get('b')).toBe('landscape')
  })

  it('classifies spanning areas correctly with aspect ratio', () => {
    const layout = makeLayout({
      id: 'test-hero',
      gridTemplate: '1fr 1fr / 2fr 1fr',
      areas: ['a b', 'a c'],
      aspectRatio: '4/3',
    })
    const orientations = analyzeSlotOrientations(layout)
    // 'a' spans 2 rows, 1 wide col (2fr of 3fr total) → (2/3 * 4/3) / (2/2) = 0.89 → square
    expect(orientations.get('a')).toBe('square')
  })

  it('handles single-cell layout', () => {
    const layout = makeLayout({
      id: 'single',
      gridTemplate: '1fr',
      areas: ['a'],
    })
    const orientations = analyzeSlotOrientations(layout)
    expect(orientations.get('a')).toBe('square')
  })

  it('without aspect ratio defaults to square container', () => {
    const layout = makeLayout({
      id: 'no-ar',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
    })
    const orientations = analyzeSlotOrientations(layout)
    // In square container, each slot is 0.5:1 = portrait
    expect(orientations.get('a')).toBe('portrait')
    expect(orientations.get('b')).toBe('portrait')
  })
})

describe('scoreLayout', () => {
  const portraitPhotos: PhotoCharacteristics[] = [
    { photoId: 'p1', orientation: 'portrait', aspectRatio: 0.75, sharpnessScore: 300 },
    { photoId: 'p2', orientation: 'portrait', aspectRatio: 0.67, sharpnessScore: 250 },
  ]

  const landscapePhotos: PhotoCharacteristics[] = [
    { photoId: 'l1', orientation: 'landscape', aspectRatio: 1.78, sharpnessScore: 400 },
    { photoId: 'l2', orientation: 'landscape', aspectRatio: 1.33, sharpnessScore: 350 },
  ]

  it('scores portrait-container layouts higher for portrait photos via aspect ratio alignment', () => {
    const portraitLayout = makeLayout({
      id: 'portrait-container',
      gridTemplate: '1fr 1fr / 1fr',
      areas: ['a', 'b'],
      aspectRatio: '3/4',
    })
    const landscapeLayout = makeLayout({
      id: 'landscape-container',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
      aspectRatio: '16/9',
    })

    const portraitScore = scoreLayout(portraitLayout, portraitPhotos)
    const landscapeScore = scoreLayout(landscapeLayout, portraitPhotos)
    expect(portraitScore.score).toBeGreaterThan(landscapeScore.score)
  })

  it('scores landscape-container layouts higher for landscape photos', () => {
    const landscapeLayout = makeLayout({
      id: 'landscape-container',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
      aspectRatio: '16/9',
    })
    const portraitLayout = makeLayout({
      id: 'portrait-container',
      gridTemplate: '1fr 1fr / 1fr',
      areas: ['a', 'b'],
      aspectRatio: '3/4',
    })

    const landscapeScore = scoreLayout(landscapeLayout, landscapePhotos)
    const portraitScore = scoreLayout(portraitLayout, landscapePhotos)
    expect(landscapeScore.score).toBeGreaterThan(portraitScore.score)
  })

  it('gives bonus for hero slot with sharp photo', () => {
    const heroLayout = makeLayout({
      id: 'hero',
      gridTemplate: '1fr 1fr / 2fr 1fr',
      areas: ['a b', 'a c'],
      aspectRatio: '4/3',
    })

    const sharpPhotos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 500 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 100 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
    ]

    const result = scoreLayout(heroLayout, sharpPhotos)
    expect(result.reasons).toContain('Hero slot for sharp photo')
  })

  it('returns non-negative scores', () => {
    const layout = makeLayout({
      id: 'test',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 'p1', orientation: 'portrait', aspectRatio: 0.5, sharpnessScore: 0 },
      { photoId: 'p2', orientation: 'portrait', aspectRatio: 0.5, sharpnessScore: 0 },
    ]
    const result = scoreLayout(layout, photos)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})

describe('rankLayouts', () => {
  it('returns layouts sorted by score descending', () => {
    const layouts = [
      makeLayout({ id: 'horiz', gridTemplate: '1fr 1fr', areas: ['a b'], aspectRatio: '16/9' }),
      makeLayout({ id: 'vert', gridTemplate: '1fr 1fr / 1fr', areas: ['a', 'b'], aspectRatio: '3/4' }),
    ]
    const photos: PhotoCharacteristics[] = [
      { photoId: 'p1', orientation: 'portrait', aspectRatio: 0.75, sharpnessScore: 200 },
      { photoId: 'p2', orientation: 'portrait', aspectRatio: 0.67, sharpnessScore: 150 },
    ]

    const ranked = rankLayouts(layouts, photos)
    expect(ranked.length).toBe(2)
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score)
  })

  it('handles empty layouts array', () => {
    const photos: PhotoCharacteristics[] = [
      { photoId: 'p1', orientation: 'square', aspectRatio: 1, sharpnessScore: 200 },
    ]
    expect(rankLayouts([], photos)).toEqual([])
  })
})

describe('suggestPhotoArrangement', () => {
  it('matches photos to slots by orientation when possible', () => {
    // 3x2 grid with a tall left column (portrait slot) and two right cells
    const layout = makeLayout({
      id: 'mixed',
      gridTemplate: '1fr 1fr / 1fr 1fr',
      areas: ['a b', 'a c'],
      aspectRatio: '1/1', // Square container: 'a' is 0.5:1 = portrait
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 'portrait', orientation: 'portrait', aspectRatio: 0.75, sharpnessScore: 300 },
      { photoId: 'land1', orientation: 'landscape', aspectRatio: 1.5, sharpnessScore: 200 },
      { photoId: 'land2', orientation: 'landscape', aspectRatio: 1.8, sharpnessScore: 100 },
    ]

    const arrangement = suggestPhotoArrangement(layout, photos)
    // 'a' spans 2 rows in a square container → portrait slot → should get portrait photo
    expect(arrangement.get('a')).toBe('portrait')
    expect(arrangement.size).toBe(3)
  })

  it('fills remaining slots by sharpness', () => {
    const layout = makeLayout({
      id: 'equal',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 'blurry', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 'sharp', orientation: 'square', aspectRatio: 1, sharpnessScore: 500 },
    ]

    const arrangement = suggestPhotoArrangement(layout, photos)
    expect(arrangement.size).toBe(2)
    // Both are square, slots are landscape, so both go to second pass (sharpness sort)
    const values = [...arrangement.values()]
    expect(values).toContain('sharp')
    expect(values).toContain('blurry')
  })
})
