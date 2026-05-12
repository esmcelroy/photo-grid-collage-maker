import type { GridLayout } from './types'
import type { PhotoOrientation } from './image-analysis'
import type { DominantColor, PhotoColorProfile } from './color-intelligence'
import { scoreColorHarmony } from './color-intelligence'
import type { PhotoFingerprint } from './photo-similarity'
import {
  clusterDuplicates,
  buildAdjacencyGraph,
  optimizeForDiversity,
} from './photo-similarity'

/**
 * Compute the fraction of total grid cells each area occupies.
 */
export function computeSlotSizes(areas: string[]): Map<string, number> {
  const cellCounts = new Map<string, number>()
  let totalCells = 0
  for (const row of areas) {
    const cells = row.split(' ')
    for (const cell of cells) {
      if (cell === '.') continue
      cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1)
      totalCells++
    }
  }
  const result = new Map<string, number>()
  for (const [area, count] of cellCounts) {
    result.set(area, count / totalCells)
  }
  return result
}

export interface PhotoCharacteristics {
  photoId: string
  orientation: PhotoOrientation
  aspectRatio: number
  sharpnessScore: number
  dominantColors?: DominantColor[]
  isDark?: boolean
  averageLuminance?: number
  dHash?: bigint
  colorHistogram?: Float32Array
}

export interface LayoutScore {
  layoutId: string
  score: number
  reasons: string[]
}

/**
 * Compute the numeric aspect ratio for each slot in a layout.
 * Parses grid template and areas to determine each slot's width/height ratio,
 * accounting for the container's own aspect ratio.
 */
export function computeSlotAspectRatios(layout: GridLayout): Map<string, number> {
  const result = new Map<string, number>()
  const rows = layout.areas
  const numRows = rows.length
  const numCols = rows[0]?.split(' ').length ?? 0

  if (numRows === 0 || numCols === 0) return result

  let containerAR = 1
  if (layout.aspectRatio) {
    const [aw, ah] = layout.aspectRatio.split('/').map(Number)
    if (ah > 0) containerAR = aw / ah
  }

  const { rowSizes, colSizes } = parseGridSizes(layout.gridTemplate, numRows, numCols)
  const totalRowSize = rowSizes.reduce((a, b) => a + b, 0)
  const totalColSize = colSizes.reduce((a, b) => a + b, 0)

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
    const cellAR = (slotColFraction * containerAR) / slotRowFraction
    result.set(area, cellAR)
  }

  return result
}

/**
 * Analyzes grid-template-areas to determine the shape of each slot.
 * Accounts for the layout's container aspect ratio when available.
 * Returns orientation classification for each unique area name.
 */
export function analyzeSlotOrientations(layout: GridLayout): Map<string, PhotoOrientation> {
  const slotARs = computeSlotAspectRatios(layout)
  const slots = new Map<string, PhotoOrientation>()

  for (const [area, cellAR] of slotARs) {
    if (cellAR > 1.2) slots.set(area, 'landscape')
    else if (cellAR < 0.8) slots.set(area, 'portrait')
    else slots.set(area, 'square')
  }

  return slots
}

/**
 * Score how well photo aspect ratios fit the layout's slot aspect ratios.
 * Uses sorted greedy matching for optimal assignment.
 */
export function scoreAspectRatioFit(
  layout: GridLayout,
  photos: PhotoCharacteristics[],
): number {
  const slotARs = computeSlotAspectRatios(layout)
  if (slotARs.size === 0 || photos.length === 0) return 0

  const sortedSlotARs = [...slotARs.values()].sort((a, b) => a - b)
  const sortedPhotoARs = photos.map(p => p.aspectRatio).sort((a, b) => a - b)

  // Match sorted lists (use min length if counts differ)
  const matchCount = Math.min(sortedSlotARs.length, sortedPhotoARs.length)
  let totalDistance = 0
  for (let i = 0; i < matchCount; i++) {
    totalDistance += Math.abs(sortedPhotoARs[i] - sortedSlotARs[i])
  }

  const avgDistance = totalDistance / matchCount

  if (avgDistance < 0.3) return 15
  if (avgDistance < 0.6) return 8
  if (avgDistance < 1.0) return 0
  return -10
}

/**
 * Score how well the composition balance of photos matches the layout structure.
 * Uniform photos suit grid layouts; varied photos suit hero layouts.
 */
export function scoreCompositionBalance(
  layout: GridLayout,
  photos: PhotoCharacteristics[],
): number {
  if (photos.length < 2) return 0

  // Compute sharpness coefficient of variation
  const sharpnesses = photos.map(p => p.sharpnessScore)
  const sharpMean = sharpnesses.reduce((a, b) => a + b, 0) / sharpnesses.length
  const sharpVariance = sharpnesses.reduce((sum, s) => sum + (s - sharpMean) ** 2, 0) / sharpnesses.length
  const sharpCoV = Math.sqrt(sharpVariance) / Math.max(sharpMean, 1)

  // Compute slot size coefficient of variation
  const slotSizes = computeSlotSizes(layout.areas)
  const slotFractions = [...slotSizes.values()]
  const slotMean = slotFractions.reduce((a, b) => a + b, 0) / slotFractions.length
  const slotVariance = slotFractions.reduce((sum, s) => sum + (s - slotMean) ** 2, 0) / slotFractions.length
  const slotCoV = Math.sqrt(slotVariance) / Math.max(slotMean, 0.001)

  if (sharpCoV < 0.3 && slotCoV < 0.1) return 10
  if (sharpCoV > 0.5 && slotCoV > 0.3) return 10
  if (sharpCoV < 0.3 && slotCoV > 0.3) return -8
  if (sharpCoV > 0.5 && slotCoV < 0.1) return -5
  return 0
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

  // 3. Scaled bonus for layouts with a hero/large slot when there's a sharp photo
  const slotSizes = computeSlotSizes(layout.areas)
  const maxSlotFraction = Math.max(...slotSizes.values())
  const hasLargeSlot = maxSlotFraction > (1 / slotSizes.size)
  if (hasLargeSlot) {
    const maxSharpness = Math.max(...photos.map(p => p.sharpnessScore))
    const heroBonus = Math.round(maxSlotFraction * (Math.min(maxSharpness, 300) / 300) * 25)
    if (heroBonus >= 2) {
      score += heroBonus
      reasons.push(`Hero slot for sharp photo (+${heroBonus})`)
    }
  }

  // 4. Per-slot aspect ratio fit
  const arFitScore = scoreAspectRatioFit(layout, photos)
  if (arFitScore !== 0) {
    score += arFitScore
    if (arFitScore > 0) reasons.push(arFitScore >= 15 ? 'Excellent AR fit' : 'Good AR fit')
  }

  // 5. Color harmony bonus/penalty (Phase 2)
  const colorProfiles: PhotoColorProfile[] = photos
    .filter(p => p.dominantColors && p.dominantColors.length > 0)
    .map(p => ({
      photoId: p.photoId,
      dominantColors: p.dominantColors!,
      isDark: p.isDark ?? false,
      averageLuminance: p.averageLuminance ?? 0.5,
    }))
  if (colorProfiles.length >= 2) {
    const colorBonus = scoreColorHarmony(colorProfiles)
    if (colorBonus !== 0) {
      score += colorBonus
      if (colorBonus > 0) reasons.push('Color harmony')
    }
  }

  // 6. Composition balance
  const compositionScore = scoreCompositionBalance(layout, photos)
  if (compositionScore !== 0) {
    score += compositionScore
    if (compositionScore > 0) reasons.push('Composition balance')
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
 * Places photos in slots that best match their orientation,
 * then optimizes for visual diversity between adjacent cells.
 */
export function suggestPhotoArrangement(
  layout: GridLayout,
  photos: PhotoCharacteristics[],
): Map<string, string> {
  const slotOrientations = analyzeSlotOrientations(layout)
  const assignment = new Map<string, string>() // areaName → photoId
  const assignedPhotos = new Set<string>()

  const areas = [...slotOrientations.entries()]

  // Check if fingerprints are available for diversity optimization
  const hasFingerprints = photos.some(p => p.dHash !== undefined && p.colorHistogram !== undefined)

  // If we have fingerprints, cluster duplicates and promote sharpest per cluster
  let photosForAssignment = photos
  if (hasFingerprints) {
    const clusters = clusterDuplicates(
      photos
        .filter(p => p.dHash !== undefined && p.colorHistogram !== undefined)
        .map(p => ({
          photoId: p.photoId,
          fingerprint: {
            dHash: p.dHash!,
            colorHistogram: p.colorHistogram!,
            luminance: p.averageLuminance ?? 0.5,
          },
          sharpnessScore: p.sharpnessScore,
          orientation: p.orientation,
        })),
    )

    // Sort photos: cluster representatives (sharpest per group) first
    const representatives = new Set(clusters.map(c => c.representative))
    photosForAssignment = [
      ...photos.filter(p => representatives.has(p.photoId))
        .sort((a, b) => b.sharpnessScore - a.sharpnessScore),
      ...photos.filter(p => !representatives.has(p.photoId))
        .sort((a, b) => b.sharpnessScore - a.sharpnessScore),
    ]
  }

  // First pass: assign best orientation matches (representatives prioritized)
  for (const [area, slotOrientation] of areas) {
    const bestMatch = photosForAssignment.find(
      p => !assignedPhotos.has(p.photoId) && p.orientation === slotOrientation,
    )
    if (bestMatch) {
      assignment.set(area, bestMatch.photoId)
      assignedPhotos.add(bestMatch.photoId)
    }
  }

  // Second pass: fill remaining slots with sharpest unassigned photos
  const remaining = photosForAssignment
    .filter(p => !assignedPhotos.has(p.photoId))
    .sort((a, b) => b.sharpnessScore - a.sharpnessScore)

  let remainIdx = 0
  for (const [area] of areas) {
    if (!assignment.has(area) && remainIdx < remaining.length) {
      assignment.set(area, remaining[remainIdx].photoId)
      remainIdx++
    }
  }

  // Sharpness-weighted swap pass: put sharper photos in larger slots
  const slotSizes = computeSlotSizes(layout.areas)
  const assignedEntries = [...assignment.entries()]
  for (let i = 0; i < assignedEntries.length; i++) {
    for (let j = i + 1; j < assignedEntries.length; j++) {
      const [area1, photoId1] = assignedEntries[i]
      const [area2, photoId2] = assignedEntries[j]
      const photo1 = photosForAssignment.find(p => p.photoId === photoId1)
      const photo2 = photosForAssignment.find(p => p.photoId === photoId2)
      if (!photo1 || !photo2) continue
      if (photo1.sharpnessScore <= 0 && photo2.sharpnessScore <= 0) continue

      const slot1Orientation = slotOrientations.get(area1)
      const slot2Orientation = slotOrientations.get(area2)

      // Skip if swapping would break orientation constraints
      const photo1MatchesSlot1 = photo1.orientation === slot1Orientation
      const photo2MatchesSlot2 = photo2.orientation === slot2Orientation
      const photo1MatchesSlot2 = photo1.orientation === slot2Orientation
      const photo2MatchesSlot1 = photo2.orientation === slot1Orientation
      // If current assignment has orientation matches that would be lost, skip
      if ((photo1MatchesSlot1 && !photo2MatchesSlot1) ||
          (photo2MatchesSlot2 && !photo1MatchesSlot2)) {
        continue
      }

      const size1 = slotSizes.get(area1) ?? 0
      const size2 = slotSizes.get(area2) ?? 0
      const sharp1 = Math.min(photo1.sharpnessScore, 300) / 300
      const sharp2 = Math.min(photo2.sharpnessScore, 300) / 300

      const currentFit = size1 * sharp1 + size2 * sharp2
      const swappedFit = size1 * sharp2 + size2 * sharp1

      if (swappedFit > currentFit) {
        assignment.set(area1, photoId2)
        assignment.set(area2, photoId1)
        assignedEntries[i] = [area1, photoId2]
        assignedEntries[j] = [area2, photoId1]
      }
    }
  }

  // Third pass: optimize for diversity between adjacent cells
  if (hasFingerprints && assignment.size >= 2) {
    const adjacency = buildAdjacencyGraph(layout.areas)
    const fingerprints = new Map<string, PhotoFingerprint>()
    const photoOrientations = new Map<string, PhotoOrientation>()
    for (const p of photos) {
      if (p.dHash !== undefined && p.colorHistogram !== undefined) {
        fingerprints.set(p.photoId, {
          dHash: p.dHash,
          colorHistogram: p.colorHistogram,
          luminance: p.averageLuminance ?? 0.5,
        })
      }
      photoOrientations.set(p.photoId, p.orientation)
    }

    return optimizeForDiversity(
      assignment,
      adjacency,
      fingerprints,
      slotOrientations,
      photoOrientations,
    )
  }

  return assignment
}
