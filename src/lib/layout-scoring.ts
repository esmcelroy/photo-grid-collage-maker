import type { GridLayout } from './types'
import type { PhotoOrientation } from './image-analysis'

export interface PhotoCharacteristics {
  photoId: string
  orientation: PhotoOrientation
  aspectRatio: number
  sharpnessScore: number
}

export interface LayoutScore {
  layoutId: string
  score: number
  reasons: string[]
}

/**
 * Analyzes grid-template-areas to determine the shape of each slot.
 * Accounts for the layout's container aspect ratio when available.
 * Returns orientation classification for each unique area name.
 */
export function analyzeSlotOrientations(layout: GridLayout): Map<string, PhotoOrientation> {
  const slots = new Map<string, PhotoOrientation>()
  const rows = layout.areas
  const numRows = rows.length
  const numCols = rows[0]?.split(' ').length ?? 0

  if (numRows === 0 || numCols === 0) return slots

  // Parse container aspect ratio (width/height)
  let containerAR = 1
  if (layout.aspectRatio) {
    const [aw, ah] = layout.aspectRatio.split('/').map(Number)
    if (ah > 0) containerAR = aw / ah
  }

  // Parse grid template to get row/col relative sizes
  const { rowSizes, colSizes } = parseGridSizes(layout.gridTemplate, numRows, numCols)
  const totalRowSize = rowSizes.reduce((a, b) => a + b, 0)
  const totalColSize = colSizes.reduce((a, b) => a + b, 0)

  // Collect unique areas and their spans
  const areaInfo = new Map<string, { occupiedRows: Set<number>; occupiedCols: Set<number> }>()

  for (let r = 0; r < rows.length; r++) {
    const cols = rows[r].split(' ')
    for (let c = 0; c < cols.length; c++) {
      const area = cols[c]
      if (area === '.') continue
      if (!areaInfo.has(area)) {
        areaInfo.set(area, { occupiedRows: new Set(), occupiedCols: new Set() })
      }
      const info = areaInfo.get(area)!
      info.occupiedRows.add(r)
      info.occupiedCols.add(c)
    }
  }

  for (const [area, { occupiedRows, occupiedCols }] of areaInfo) {
    const slotRowFraction = [...occupiedRows].reduce((sum, r) => sum + rowSizes[r], 0) / totalRowSize
    const slotColFraction = [...occupiedCols].reduce((sum, c) => sum + colSizes[c], 0) / totalColSize

    // Actual cell aspect ratio considering container shape
    const cellAR = (slotColFraction * containerAR) / slotRowFraction

    if (cellAR > 1.2) slots.set(area, 'landscape')
    else if (cellAR < 0.8) slots.set(area, 'portrait')
    else slots.set(area, 'square')
  }

  return slots
}

/**
 * Parse grid template string to extract relative row and column sizes.
 */
function parseGridSizes(
  gridTemplate: string,
  numRows: number,
  numCols: number,
): { rowSizes: number[]; colSizes: number[] } {
  const parts = gridTemplate.split('/')

  function parseFrValues(str: string, expected: number): number[] {
    const values = str.trim().split(/\s+/).map(v => {
      const match = v.match(/^(\d+(?:\.\d+)?)fr$/)
      return match ? parseFloat(match[1]) : 1
    })
    // Pad if fewer values than expected
    while (values.length < expected) values.push(1)
    return values.slice(0, expected)
  }

  if (parts.length === 2) {
    return {
      rowSizes: parseFrValues(parts[0], numRows),
      colSizes: parseFrValues(parts[1], numCols),
    }
  }

  // Single value = columns only, rows are equal
  return {
    rowSizes: Array(numRows).fill(1),
    colSizes: parseFrValues(parts[0], numCols),
  }
}

/**
 * Score a layout against a set of photo characteristics.
 * Higher scores = better fit.
 */
export function scoreLayout(
  layout: GridLayout,
  photos: PhotoCharacteristics[],
): LayoutScore {
  const reasons: string[] = []
  let score = 50 // Base score

  const slotOrientations = analyzeSlotOrientations(layout)
  const slotEntries = [...slotOrientations.entries()]

  // 1. Orientation match bonus: how well do photo orientations match slot shapes?
  const photoOrientations = photos.map(p => p.orientation)
  const portraitPhotos = photoOrientations.filter(o => o === 'portrait').length
  const landscapePhotos = photoOrientations.filter(o => o === 'landscape').length
  const portraitSlots = slotEntries.filter(([, o]) => o === 'portrait').length
  const landscapeSlots = slotEntries.filter(([, o]) => o === 'landscape').length

  // Perfect orientation match: all portrait photos can go in portrait slots
  const portraitMatch = Math.min(portraitPhotos, portraitSlots)
  const landscapeMatch = Math.min(landscapePhotos, landscapeSlots)
  const matchBonus = (portraitMatch + landscapeMatch) * 10
  if (matchBonus > 0) {
    score += matchBonus
    reasons.push(`${portraitMatch + landscapeMatch} orientation matches`)
  }

  // 2. Penalty for orientation mismatches
  const portraitMismatch = Math.abs(portraitPhotos - portraitSlots)
  const landscapeMismatch = Math.abs(landscapePhotos - landscapeSlots)
  const mismatchPenalty = (portraitMismatch + landscapeMismatch) * 3
  if (mismatchPenalty > 0) {
    score -= mismatchPenalty
  }

  // 3. Bonus for layouts with a hero/large slot when there's a sharp photo
  const hasLargeSlot = slotEntries.some(([area]) => {
    // Areas that span multiple cells are "large"
    return layout.areas.filter(row => row.includes(area)).length > 1 ||
      layout.areas.some(row => {
        const cells = row.split(' ')
        return cells.filter(c => c === area).length > 1
      })
  })
  const hasSharpPhoto = photos.some(p => p.sharpnessScore > 200)
  if (hasLargeSlot && hasSharpPhoto) {
    score += 5
    reasons.push('Hero slot for sharp photo')
  }

  // 4. Layout aspect ratio vs photo set tendency (strongest signal)
  if (layout.aspectRatio) {
    const [aw, ah] = layout.aspectRatio.split('/').map(Number)
    const layoutAR = aw / ah
    const avgPhotoAR = photos.reduce((sum, p) => sum + p.aspectRatio, 0) / photos.length

    if ((layoutAR > 1 && avgPhotoAR > 1) || (layoutAR < 1 && avgPhotoAR < 1)) {
      score += 20
      reasons.push('Aspect ratio alignment')
    } else if ((layoutAR > 1 && avgPhotoAR < 1) || (layoutAR < 1 && avgPhotoAR > 1)) {
      score -= 15
    }
  }

  return { layoutId: layout.id, score: Math.max(0, score), reasons }
}

/**
 * Rank all available layouts for a photo set, returning sorted by score (best first).
 */
export function rankLayouts(
  layouts: GridLayout[],
  photos: PhotoCharacteristics[],
): LayoutScore[] {
  return layouts
    .map(layout => scoreLayout(layout, photos))
    .sort((a, b) => b.score - a.score)
}

/**
 * Suggest optimal photo-to-slot assignment for a layout.
 * Places photos in slots that best match their orientation.
 */
export function suggestPhotoArrangement(
  layout: GridLayout,
  photos: PhotoCharacteristics[],
): Map<string, string> {
  const slotOrientations = analyzeSlotOrientations(layout)
  const assignment = new Map<string, string>() // areaName → photoId
  const assignedPhotos = new Set<string>()

  const areas = [...slotOrientations.entries()]

  // First pass: assign best orientation matches
  for (const [area, slotOrientation] of areas) {
    const bestMatch = photos.find(
      p => !assignedPhotos.has(p.photoId) && p.orientation === slotOrientation,
    )
    if (bestMatch) {
      assignment.set(area, bestMatch.photoId)
      assignedPhotos.add(bestMatch.photoId)
    }
  }

  // Second pass: fill remaining slots with sharpest unassigned photos
  const remaining = photos
    .filter(p => !assignedPhotos.has(p.photoId))
    .sort((a, b) => b.sharpnessScore - a.sharpnessScore)

  let remainIdx = 0
  for (const [area] of areas) {
    if (!assignment.has(area) && remainIdx < remaining.length) {
      assignment.set(area, remaining[remainIdx].photoId)
      remainIdx++
    }
  }

  return assignment
}
