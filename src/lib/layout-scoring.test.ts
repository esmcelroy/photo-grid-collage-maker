import { describe, it, expect } from '@jest/globals'
import {
  analyzeSlotOrientations,
  scoreLayout,
  rankLayouts,
  suggestPhotoArrangement,
  computeSlotSizes,
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
    expect(result.reasons.some(r => r.startsWith('Hero slot for sharp photo'))).toBe(true)
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

  it('places sharpest photo in the largest slot after sharpness-weighted swap', () => {
    // Layout with one large slot (a = 4 cells) and two small slots (b, c = 1 cell each)
    const layout = makeLayout({
      id: 'hero-swap',
      gridTemplate: '1fr 1fr / 1fr 1fr 1fr',
      areas: ['a a b', 'a a c'],
      aspectRatio: '3/2',
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 'medium', orientation: 'square', aspectRatio: 1, sharpnessScore: 100 },
      { photoId: 'sharp', orientation: 'square', aspectRatio: 1, sharpnessScore: 300 },
      { photoId: 'blurry', orientation: 'square', aspectRatio: 1, sharpnessScore: 20 },
    ]

    const arrangement = suggestPhotoArrangement(layout, photos)
    // The sharpest photo should end up in the largest slot 'a'
    expect(arrangement.get('a')).toBe('sharp')
  })

  it('preserves orientation constraints during sharpness-weighted swap', () => {
    // Layout: 'a' is portrait slot, 'b' and 'c' are landscape slots
    // ['a b b', 'a c c'] with 1/1 container:
    //   'a' = 1col/3, 2rows → AR = 0.33 → portrait
    //   'b' = 2cols/3, 1row → AR = 1.33 → landscape
    //   'c' = same as b → landscape
    const layout = makeLayout({
      id: 'orientation-constrained',
      gridTemplate: '1fr 1fr / 1fr 1fr 1fr',
      areas: ['a b b', 'a c c'],
      aspectRatio: '1/1',
    })
    // Portrait photo is very sharp and in portrait slot 'a' (small)
    // Landscape photos are less sharp and in landscape slots 'b','c' (large)
    // Swap should NOT move portrait photo into landscape slot even though it's sharper
    const photos: PhotoCharacteristics[] = [
      { photoId: 'portrait-sharp', orientation: 'portrait', aspectRatio: 0.7, sharpnessScore: 300 },
      { photoId: 'land1', orientation: 'landscape', aspectRatio: 1.8, sharpnessScore: 100 },
      { photoId: 'land2', orientation: 'landscape', aspectRatio: 1.5, sharpnessScore: 50 },
    ]

    const arrangement = suggestPhotoArrangement(layout, photos)
    // Portrait photo must stay in portrait slot 'a'
    expect(arrangement.get('a')).toBe('portrait-sharp')
  })
})

describe('computeSlotSizes', () => {
  it('returns equal fractions for a uniform grid', () => {
    const sizes = computeSlotSizes(['a b', 'c d'])
    expect(sizes.get('a')).toBeCloseTo(0.25)
    expect(sizes.get('b')).toBeCloseTo(0.25)
    expect(sizes.get('c')).toBeCloseTo(0.25)
    expect(sizes.get('d')).toBeCloseTo(0.25)
  })

  it('returns correct fractions for a hero layout', () => {
    const sizes = computeSlotSizes(['a a b', 'a a c'])
    expect(sizes.get('a')).toBeCloseTo(0.667, 2)
    expect(sizes.get('b')).toBeCloseTo(0.167, 2)
    expect(sizes.get('c')).toBeCloseTo(0.167, 2)
  })

  it('returns 1.0 for a single-area layout', () => {
    const sizes = computeSlotSizes(['a'])
    expect(sizes.get('a')).toBeCloseTo(1.0)
  })

  it('returns correct fractions for a 2x3 grid with one spanning area', () => {
    // 'a' spans 2 cells, 'b' spans 2 cells, 'c' and 'd' each span 1 cell
    const sizes = computeSlotSizes(['a a b', 'c d b'])
    expect(sizes.get('a')).toBeCloseTo(2 / 6)
    expect(sizes.get('b')).toBeCloseTo(2 / 6)
    expect(sizes.get('c')).toBeCloseTo(1 / 6)
    expect(sizes.get('d')).toBeCloseTo(1 / 6)
  })

  it('handles a layout where all slots are equal size', () => {
    const sizes = computeSlotSizes(['a b c', 'd e f'])
    for (const [, fraction] of sizes) {
      expect(fraction).toBeCloseTo(1 / 6)
    }
  })
})

describe('scoreLayout hero bonus scaling', () => {
  it('gives high bonus for large hero slot with very sharp photo (sharpness 300)', () => {
    // 'a' spans 4 of 6 cells = 0.667 fraction
    const heroLayout = makeLayout({
      id: 'big-hero',
      gridTemplate: '1fr 1fr / 1fr 1fr 1fr',
      areas: ['a a b', 'a a c'],
      aspectRatio: '3/2',
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 300 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
    ]
    const result = scoreLayout(heroLayout, photos)
    // heroBonus = round(0.667 * (300/300) * 25) = round(16.67) = 17
    expect(result.score).toBeGreaterThanOrEqual(50 + 15) // base + at least 15 from hero
    expect(result.reasons.some(r => r.startsWith('Hero slot for sharp photo'))).toBe(true)
  })

  it('gives small bonus for small hero slot with moderately sharp photo', () => {
    // 'a' spans 2 of 6 cells = 0.333 fraction
    const smallHeroLayout = makeLayout({
      id: 'small-hero',
      gridTemplate: '1fr 1fr / 1fr 1fr 1fr',
      areas: ['a b c', 'a d e'],
      aspectRatio: '3/2',
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 200 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's4', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's5', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
    ]
    const result = scoreLayout(smallHeroLayout, photos)
    // heroBonus = round(0.333 * (200/300) * 25) = round(5.55) = 6
    const heroReason = result.reasons.find(r => r.startsWith('Hero slot for sharp photo'))
    expect(heroReason).toBeDefined()
    // Extract the bonus from the reason string
    const bonusMatch = heroReason!.match(/\+(\d+)/)
    expect(bonusMatch).not.toBeNull()
    const bonus = parseInt(bonusMatch![1])
    expect(bonus).toBeGreaterThanOrEqual(3)
    expect(bonus).toBeLessThanOrEqual(8)
  })

  it('gives no hero bonus when layout has no large slot', () => {
    const equalLayout = makeLayout({
      id: 'equal',
      gridTemplate: '1fr 1fr',
      areas: ['a b'],
      aspectRatio: '2/1',
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'landscape', aspectRatio: 1.5, sharpnessScore: 400 },
      { photoId: 's2', orientation: 'landscape', aspectRatio: 1.5, sharpnessScore: 300 },
    ]
    const result = scoreLayout(equalLayout, photos)
    expect(result.reasons.some(r => r.startsWith('Hero slot for sharp photo'))).toBe(false)
  })

  it('gives no hero bonus when all photos have low sharpness', () => {
    const heroLayout = makeLayout({
      id: 'hero-low-sharp',
      gridTemplate: '1fr 1fr / 1fr 1fr',
      areas: ['a b', 'a c'],
      aspectRatio: '1/1',
    })
    const photos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 10 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 5 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 8 },
    ]
    const result = scoreLayout(heroLayout, photos)
    // heroBonus = round(0.5 * (10/300) * 25) = round(0.42) = 0, which is < 2
    expect(result.reasons.some(r => r.startsWith('Hero slot for sharp photo'))).toBe(false)
  })

  it('scales bonus higher for sharper photos (300 vs 100)', () => {
    const heroLayout = makeLayout({
      id: 'hero-scale',
      gridTemplate: '1fr 1fr / 1fr 1fr 1fr',
      areas: ['a a b', 'a a c'],
      aspectRatio: '3/2',
    })
    const sharpPhotos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 300 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
    ]
    const lessSharpPhotos: PhotoCharacteristics[] = [
      { photoId: 's1', orientation: 'square', aspectRatio: 1, sharpnessScore: 100 },
      { photoId: 's2', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
      { photoId: 's3', orientation: 'square', aspectRatio: 1, sharpnessScore: 50 },
    ]

    const sharpResult = scoreLayout(heroLayout, sharpPhotos)
    const lessSharpResult = scoreLayout(heroLayout, lessSharpPhotos)
    expect(sharpResult.score).toBeGreaterThan(lessSharpResult.score)
  })
})
