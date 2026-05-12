// ---------------------------------------------------------------------------
// Photo similarity detection – perceptual hashing & color fingerprinting
// ---------------------------------------------------------------------------

// ── Constants ──────────────────────────────────────────────────────────────
export const DUPLICATE_THRESHOLD = 5   // hamming ≤ 5 = near-duplicate
export const SIMILAR_THRESHOLD = 12    // hamming ≤ 12 = same scene

// ── Types ──────────────────────────────────────────────────────────────────
export interface PhotoFingerprint {
  dHash: bigint
  colorHistogram: Float32Array
  luminance: number
}

// ── RGB → HSL ──────────────────────────────────────────────────────────────
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60
  } else {
    h = ((rn - gn) / d + 4) * 60
  }

  return { h, s, l }
}

// ── Hamming distance ───────────────────────────────────────────────────────
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b
  let count = 0
  while (xor > 0n) {
    count += Number(xor & 1n)
    xor >>= 1n
  }
  return count
}

// ── dHash (difference hash) ────────────────────────────────────────────────
// Expects a canvas with the image already drawn. Reads pixels at 9×8 resolution.
export function computeDHash(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): bigint {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('Cannot get 2d context')

  const { data } = ctx.getImageData(0, 0, 9, 8)

  // Convert to grayscale row-major
  const gray = new Uint8Array(9 * 8)
  for (let i = 0; i < 72; i++) {
    const off = i * 4
    // ITU-R BT.601 luma
    gray[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2])
  }

  let hash = 0n
  let bit = 0
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (gray[y * 9 + x] > gray[y * 9 + x + 1]) {
        hash |= 1n << BigInt(bit)
      }
      bit++
    }
  }

  return hash
}

// ── Color histogram ────────────────────────────────────────────────────────
// 12 hue bins × 2 lightness bins = 24 bins, normalised to sum = 1.
export function computeColorHistogram(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Float32Array {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('Cannot get 2d context')

  const { data, width, height } = ctx.getImageData(0, 0, 32, 32)
  const totalPixels = width * height
  const histogram = new Float32Array(24)

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4
    const { h, l } = rgbToHsl(data[off], data[off + 1], data[off + 2])
    const hueBin = Math.min(Math.floor(h / 30), 11)
    const lightBin = l > 0.5 ? 1 : 0
    histogram[hueBin * 2 + lightBin]++
  }

  // Normalise
  const sum = histogram.reduce((a, b) => a + b, 0)
  if (sum > 0) {
    for (let i = 0; i < 24; i++) {
      histogram[i] /= sum
    }
  }

  return histogram
}

// ── Histogram similarity (cosine) ──────────────────────────────────────────
export function histogramSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0

  return dot / denom
}

// ── Histogram distance ─────────────────────────────────────────────────────
export function histogramDistance(a: Float32Array, b: Float32Array): number {
  return Math.max(0, Math.min(1, 1 - histogramSimilarity(a, b)))
}

// ── Combined photo similarity metric ───────────────────────────────────────
// Lower = more similar.  Range [0, 1].
// 0.4 × colorHistDist + 0.3 × (hammingDist / 64) + 0.3 × |lumA - lumB|
export function photoSimilarity(a: PhotoFingerprint, b: PhotoFingerprint): number {
  const colorDist = histogramDistance(a.colorHistogram, b.colorHistogram)
  const hashDist = hammingDistance(a.dHash, b.dHash) / 64
  const lumDist = Math.abs(a.luminance - b.luminance)

  return 0.4 * colorDist + 0.3 * hashDist + 0.3 * lumDist
}

// ── Types (clustering & optimization) ──────────────────────────────────────

export interface PhotoCluster {
  representative: string  // photoId of sharpest photo in cluster
  members: string[]       // all photoIds including representative
}

export interface PhotoWithFingerprint {
  photoId: string
  fingerprint: PhotoFingerprint
  sharpnessScore: number
  orientation: 'portrait' | 'landscape' | 'square'
}

// ── Duplicate Clustering (Union-Find) ──────────────────────────────────────

export function clusterDuplicates(photos: PhotoWithFingerprint[]): PhotoCluster[] {
  const n = photos.length
  if (n === 0) return []

  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = new Array(n).fill(0)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]] // path compression
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number): void {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    if (rank[ra] < rank[rb]) { parent[ra] = rb }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra }
    else { parent[rb] = ra; rank[ra]++ }
  }

  // O(n²) pairwise comparison
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hammingDistance(photos[i].fingerprint.dHash, photos[j].fingerprint.dHash) <= DUPLICATE_THRESHOLD) {
        union(i, j)
      }
    }
  }

  // Group by root
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  // Build clusters
  const clusters: PhotoCluster[] = []
  for (const indices of groups.values()) {
    let bestIdx = indices[0]
    for (const idx of indices) {
      if (photos[idx].sharpnessScore > photos[bestIdx].sharpnessScore) {
        bestIdx = idx
      }
    }
    clusters.push({
      representative: photos[bestIdx].photoId,
      members: indices.map(i => photos[i].photoId),
    })
  }

  return clusters
}

// ── Adjacency Graph ───────────────────────────────────────────────────────

export function buildAdjacencyGraph(areas: string[]): Map<string, Set<string>> {
  const grid = areas.map(row => row.split(' '))
  const numRows = grid.length
  const numCols = grid[0]?.length ?? 0

  // Collect all unique area names
  const allNames = new Set<string>()
  for (const row of grid) {
    for (const cell of row) {
      allNames.add(cell)
    }
  }

  const adj = new Map<string, Set<string>>()
  for (const name of allNames) {
    adj.set(name, new Set())
  }

  // Horizontal scan
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols - 1; c++) {
      const a = grid[r][c]
      const b = grid[r][c + 1]
      if (a !== b) {
        adj.get(a)!.add(b)
        adj.get(b)!.add(a)
      }
    }
  }

  // Vertical scan
  for (let r = 0; r < numRows - 1; r++) {
    for (let c = 0; c < numCols; c++) {
      const a = grid[r][c]
      const b = grid[r + 1][c]
      if (a !== b) {
        adj.get(a)!.add(b)
        adj.get(b)!.add(a)
      }
    }
  }

  return adj
}

// ── Diversity Score ────────────────────────────────────────────────────────

function computeDiversityScore(
  assignment: Map<string, string>,
  adjacency: Map<string, Set<string>>,
  fingerprints: Map<string, PhotoFingerprint>,
): number {
  let total = 0
  const counted = new Set<string>()
  for (const [area, neighbors] of adjacency) {
    for (const neighbor of neighbors) {
      const pairKey = [area, neighbor].sort().join(':')
      if (counted.has(pairKey)) continue
      counted.add(pairKey)
      const photoA = assignment.get(area)
      const photoB = assignment.get(neighbor)
      if (!photoA || !photoB) continue
      const fpA = fingerprints.get(photoA)
      const fpB = fingerprints.get(photoB)
      if (!fpA || !fpB) continue
      total += photoSimilarity(fpA, fpB)
    }
  }
  return total
}

// ── Orientation mismatch count ─────────────────────────────────────────────

function countOrientationMismatches(
  assignment: Map<string, string>,
  slotOrientations: Map<string, 'portrait' | 'landscape' | 'square'>,
  photoOrientations: Map<string, 'portrait' | 'landscape' | 'square'>,
): number {
  let mismatches = 0
  for (const [area, photoId] of assignment) {
    const slotO = slotOrientations.get(area)
    const photoO = photoOrientations.get(photoId)
    if (slotO && photoO && slotO !== photoO) {
      mismatches++
    }
  }
  return mismatches
}

// ── Swap Optimization ──────────────────────────────────────────────────────

export function optimizeForDiversity(
  assignment: Map<string, string>,
  adjacency: Map<string, Set<string>>,
  fingerprints: Map<string, PhotoFingerprint>,
  slotOrientations: Map<string, 'portrait' | 'landscape' | 'square'>,
  photoOrientations: Map<string, 'portrait' | 'landscape' | 'square'>,
): Map<string, string> {
  if (fingerprints.size === 0) return assignment

  const result = new Map(assignment)
  const areaList = Array.from(result.keys())
  const MAX_PASSES = 3

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let swapped = false

    for (let i = 0; i < areaList.length; i++) {
      for (let j = i + 1; j < areaList.length; j++) {
        const areaI = areaList[i]
        const areaJ = areaList[j]
        const photoI = result.get(areaI)!
        const photoJ = result.get(areaJ)!

        // Count mismatches before swap
        const mismatchesBefore = countOrientationMismatches(result, slotOrientations, photoOrientations)
        const scoreBefore = computeDiversityScore(result, adjacency, fingerprints)

        // Trial swap
        result.set(areaI, photoJ)
        result.set(areaJ, photoI)

        const mismatchesAfter = countOrientationMismatches(result, slotOrientations, photoOrientations)

        if (mismatchesAfter > mismatchesBefore) {
          // Revert — orientation constraint violated
          result.set(areaI, photoI)
          result.set(areaJ, photoJ)
          continue
        }

        const scoreAfter = computeDiversityScore(result, adjacency, fingerprints)

        if (scoreAfter > scoreBefore) {
          // Diversity improved (higher = more diverse = better)
          swapped = true
        } else {
          // Revert — no improvement
          result.set(areaI, photoI)
          result.set(areaJ, photoJ)
        }
      }
    }

    if (!swapped) break
  }

  return result
}
