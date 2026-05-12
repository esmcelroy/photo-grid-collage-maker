import { describe, expect, it, beforeEach } from '@jest/globals'
import {
  DUPLICATE_THRESHOLD,
  SIMILAR_THRESHOLD,
  hammingDistance,
  rgbToHsl,
  histogramSimilarity,
  histogramDistance,
  photoSimilarity,
  computeDHash,
  computeColorHistogram,
  clusterDuplicates,
  buildAdjacencyGraph,
  optimizeForDiversity,
  type PhotoFingerprint,
  type PhotoWithFingerprint,
  type PhotoCluster,
} from '@/lib/photo-similarity'

// ---------------------------------------------------------------------------
// Helper: create a mock canvas that returns controlled pixel data
// jsdom has no real Canvas, so we mock getContext → getImageData
// ---------------------------------------------------------------------------
function createMockCanvas(
  width: number,
  height: number,
  pixelData: Uint8ClampedArray
): HTMLCanvasElement {
  const imageData = { data: pixelData, width, height }
  const ctx = {
    drawImage: () => {},
    getImageData: () => imageData,
  }
  return {
    width,
    height,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement
}

/**
 * Build RGBA pixel buffer filled with a single colour.
 */
function solidPixels(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  return buf
}

// ===========================================================================
// Constants
// ===========================================================================
describe('constants', () => {
  it('DUPLICATE_THRESHOLD is 5', () => {
    expect(DUPLICATE_THRESHOLD).toBe(5)
  })

  it('SIMILAR_THRESHOLD is 12', () => {
    expect(SIMILAR_THRESHOLD).toBe(12)
  })
})

// ===========================================================================
// hammingDistance
// ===========================================================================
describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance(0xABCDn, 0xABCDn)).toBe(0)
  })

  it('returns 64 when all bits differ (0 vs 2^64-1)', () => {
    const allOnes = (1n << 64n) - 1n
    expect(hammingDistance(0n, allOnes)).toBe(64)
  })

  it('returns 1 for a single-bit difference', () => {
    expect(hammingDistance(0b1000n, 0b0000n)).toBe(1)
  })

  it('counts differing bits correctly for 0b1010 vs 0b0101', () => {
    // 1010 vs 0101 → all 4 bits differ
    expect(hammingDistance(0b1010n, 0b0101n)).toBe(4)
  })

  it('returns exactly 5 at the duplicate threshold boundary', () => {
    // 0b11111 has 5 set bits → XOR with 0 gives hamming 5
    expect(hammingDistance(0b11111n, 0n)).toBe(5)
    expect(hammingDistance(0b11111n, 0n)).toBeLessThanOrEqual(DUPLICATE_THRESHOLD)
  })
})

// ===========================================================================
// rgbToHsl
// ===========================================================================
describe('rgbToHsl', () => {
  it('converts pure red (255,0,0) → h≈0, s=1, l=0.5', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0, 0)
    expect(s).toBeCloseTo(1, 5)
    expect(l).toBeCloseTo(0.5, 5)
  })

  it('converts pure green (0,255,0) → h≈120, s=1, l=0.5', () => {
    const { h, s, l } = rgbToHsl(0, 255, 0)
    expect(h).toBeCloseTo(120, 0)
    expect(s).toBeCloseTo(1, 5)
    expect(l).toBeCloseTo(0.5, 5)
  })

  it('converts pure blue (0,0,255) → h≈240, s=1, l=0.5', () => {
    const { h, s, l } = rgbToHsl(0, 0, 255)
    expect(h).toBeCloseTo(240, 0)
    expect(s).toBeCloseTo(1, 5)
    expect(l).toBeCloseTo(0.5, 5)
  })

  it('converts white (255,255,255) → l=1', () => {
    const { l } = rgbToHsl(255, 255, 255)
    expect(l).toBeCloseTo(1, 5)
  })

  it('converts black (0,0,0) → l=0', () => {
    const { l } = rgbToHsl(0, 0, 0)
    expect(l).toBeCloseTo(0, 5)
  })

  it('converts gray (128,128,128) → s=0', () => {
    const { s } = rgbToHsl(128, 128, 128)
    expect(s).toBeCloseTo(0, 5)
  })
})

// ===========================================================================
// histogramSimilarity
// ===========================================================================
describe('histogramSimilarity', () => {
  it('returns 1.0 for identical histograms', () => {
    const h = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(histogramSimilarity(h, h)).toBeCloseTo(1.0, 5)
  })

  it('returns 0.0 for orthogonal histograms (no overlap)', () => {
    const a = new Float32Array(24)
    const b = new Float32Array(24)
    a[0] = 1.0
    b[1] = 1.0
    expect(histogramSimilarity(a, b)).toBeCloseTo(0.0, 5)
  })

  it('returns 0.0 when both histograms are all zeros', () => {
    const z = new Float32Array(24)
    expect(histogramSimilarity(z, z)).toBeCloseTo(0.0, 5)
  })
})

// ===========================================================================
// histogramDistance
// ===========================================================================
describe('histogramDistance', () => {
  it('returns 0.0 for identical histograms', () => {
    const h = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(histogramDistance(h, h)).toBeCloseTo(0.0, 5)
  })

  it('returns 1.0 for orthogonal histograms', () => {
    const a = new Float32Array(24)
    const b = new Float32Array(24)
    a[0] = 1.0
    b[1] = 1.0
    expect(histogramDistance(a, b)).toBeCloseTo(1.0, 5)
  })
})

// ===========================================================================
// photoSimilarity
// ===========================================================================
describe('photoSimilarity', () => {
  it('returns 0.0 for identical fingerprints', () => {
    const fp: PhotoFingerprint = {
      dHash: 0xABCDEFn,
      colorHistogram: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      luminance: 0.5,
    }
    expect(photoSimilarity(fp, fp)).toBeCloseTo(0.0, 5)
  })

  it('returns close to 1.0 for maximally different fingerprints', () => {
    const a: PhotoFingerprint = {
      dHash: 0n,
      colorHistogram: new Float32Array(24),
      luminance: 0,
    }
    // Set one bin for a so histogram is not all-zero
    a.colorHistogram[0] = 1.0

    const b: PhotoFingerprint = {
      dHash: (1n << 64n) - 1n, // all 64 bits set
      colorHistogram: new Float32Array(24),
      luminance: 1,
    }
    b.colorHistogram[1] = 1.0

    const score = photoSimilarity(a, b)
    // 0.4*1.0 + 0.3*(64/64) + 0.3*|0-1| = 0.4 + 0.3 + 0.3 = 1.0
    expect(score).toBeCloseTo(1.0, 1)
  })

  it('weights correctly: 40% color, 30% hash, 30% luminance', () => {
    // Only luminance differs
    const base: PhotoFingerprint = {
      dHash: 0n,
      colorHistogram: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      luminance: 0,
    }
    const lumDiff: PhotoFingerprint = {
      ...base,
      luminance: 1,
    }
    const score = photoSimilarity(base, lumDiff)
    // colorDist=0, hashDist=0, lumDist=1 → 0.4*0 + 0.3*0 + 0.3*1 = 0.3
    expect(score).toBeCloseTo(0.3, 5)
  })
})

// ===========================================================================
// computeDHash (with mocked canvas)
// ===========================================================================
describe('computeDHash', () => {
  it('returns a bigint', () => {
    // 9×8 grayscale canvas with gradient pixels
    const pixels = new Uint8ClampedArray(9 * 8 * 4)
    for (let i = 0; i < 9 * 8; i++) {
      const v = i * 3 // gradient
      pixels[i * 4] = v
      pixels[i * 4 + 1] = v
      pixels[i * 4 + 2] = v
      pixels[i * 4 + 3] = 255
    }
    const canvas = createMockCanvas(9, 8, pixels)
    const hash = computeDHash(canvas)
    expect(typeof hash).toBe('bigint')
  })

  it('returns consistent output for same pixel data', () => {
    const pixels = solidPixels(9, 8, 100, 100, 100)
    const c1 = createMockCanvas(9, 8, pixels)
    const c2 = createMockCanvas(9, 8, new Uint8ClampedArray(pixels))
    expect(computeDHash(c1)).toBe(computeDHash(c2))
  })

  it('returns different output for different pixel data', () => {
    const dark = solidPixels(9, 8, 0, 0, 0)
    const bright = new Uint8ClampedArray(9 * 8 * 4)
    // Create a gradient so bits differ
    for (let i = 0; i < 9 * 8; i++) {
      const v = i % 2 === 0 ? 200 : 50
      bright[i * 4] = v
      bright[i * 4 + 1] = v
      bright[i * 4 + 2] = v
      bright[i * 4 + 3] = 255
    }
    const c1 = createMockCanvas(9, 8, dark)
    const c2 = createMockCanvas(9, 8, bright)
    expect(computeDHash(c1)).not.toBe(computeDHash(c2))
  })
})

// ===========================================================================
// computeColorHistogram (with mocked canvas)
// ===========================================================================
describe('computeColorHistogram', () => {
  it('returns a Float32Array of length 24', () => {
    const pixels = solidPixels(32, 32, 128, 64, 64)
    const canvas = createMockCanvas(32, 32, pixels)
    const hist = computeColorHistogram(canvas)
    expect(hist).toBeInstanceOf(Float32Array)
    expect(hist.length).toBe(24)
  })

  it('values sum to approximately 1.0', () => {
    const pixels = solidPixels(32, 32, 200, 100, 50)
    const canvas = createMockCanvas(32, 32, pixels)
    const hist = computeColorHistogram(canvas)
    const sum = hist.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 3)
  })

  it('pure red image has non-zero value only in hue bin 0', () => {
    const pixels = solidPixels(32, 32, 255, 0, 0)
    const canvas = createMockCanvas(32, 32, pixels)
    const hist = computeColorHistogram(canvas)

    // Red → h=0, hueBin=0, l=0.5 → lightBin=0, index = 0*2+0 = 0
    expect(hist[0]).toBeGreaterThan(0)

    // All other bins should be 0
    for (let i = 1; i < 24; i++) {
      expect(hist[i]).toBeCloseTo(0, 5)
    }
  })
})

// ===========================================================================
// Helper: create a PhotoWithFingerprint for testing
// ===========================================================================
function makePhoto(
  photoId: string,
  dHash: bigint,
  sharpnessScore: number,
  orientation: 'portrait' | 'landscape' | 'square' = 'landscape',
): PhotoWithFingerprint {
  return {
    photoId,
    fingerprint: {
      dHash,
      colorHistogram: new Float32Array(24),
      luminance: 0.5,
    },
    sharpnessScore,
    orientation,
  }
}

function makeFP(dHash: bigint, luminance = 0.5): PhotoFingerprint {
  const hist = new Float32Array(24)
  hist[0] = 1.0
  return { dHash, colorHistogram: hist, luminance }
}

// ===========================================================================
// clusterDuplicates
// ===========================================================================
describe('clusterDuplicates', () => {
  it('returns empty array for empty input', () => {
    expect(clusterDuplicates([])).toEqual([])
  })

  it('returns N single-member clusters when all photos are unique', () => {
    const photos = [
      makePhoto('a', 0n, 0.8),
      makePhoto('b', (1n << 64n) - 1n, 0.9), // max distance from 0n
      makePhoto('c', 0xFFFF0000FFFFn, 0.7),
    ]
    const clusters = clusterDuplicates(photos)
    expect(clusters).toHaveLength(3)
    for (const cluster of clusters) {
      expect(cluster.members).toHaveLength(1)
      expect(cluster.representative).toBe(cluster.members[0])
    }
  })

  it('groups two identical photos into one cluster with sharpest as representative', () => {
    const photos = [
      makePhoto('blurry', 0xABCDn, 0.3),
      makePhoto('sharp', 0xABCDn, 0.9),
    ]
    const clusters = clusterDuplicates(photos)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].representative).toBe('sharp')
    expect(clusters[0].members).toContain('blurry')
    expect(clusters[0].members).toContain('sharp')
  })

  it('groups three near-duplicates (hash distance ≤ 5) into one cluster', () => {
    // 0b11111 has 5 bits set → distance from 0n is exactly 5
    const photos = [
      makePhoto('a', 0n, 0.5),
      makePhoto('b', 0b11n, 0.7),   // distance 2 from a
      makePhoto('c', 0b111n, 0.9),  // distance 3 from a, distance 1 from b
    ]
    const clusters = clusterDuplicates(photos)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].representative).toBe('c') // highest sharpness
    expect(clusters[0].members).toHaveLength(3)
  })

  it('handles transitive clustering: A≈B and B≈C but A≉C → still one cluster', () => {
    // A=0, B has 5 bits set (dist 5 from A)
    // C has 4 bits in common with B, plus 4 new bits → dist 4 from B, dist 9 from A
    const a = 0n
    const b = 0b11111n // 5 bits differ from a
    // c shares 3 bits with b, adds 5 new ones: dist from b = 2+5=7… let me be precise
    // b = 0b011111, c = 0b011100 | 0b1100000 = 0b1111100
    // b XOR c = 0b11111 XOR 0b1111100 = 0b1100011 → 4 bits → dist 4 from b ✓
    // a XOR c = 0 XOR 0b1111100 = 0b1111100 → 5 bits... still ≤5
    // Need bigger gap. Let's use:
    // b = 0b11111 (5 bits), c = 0b11111_11100 has bits 2..9 set (8 bits)
    // b XOR c = 0b11111 XOR 0b1111111100 = 0b1111100011 → 5+2=7 bits. Too many.
    // Simpler approach: b = 0b11111, c = 0b11111_11000
    // b XOR c = 0b11111 XOR 0b1111111000 = 0b1100000111... let me just compute.
    // Use specific values and verify:
    const b2 = 0b0000011111n  // bits 0-4
    const c2 = 0b0011111100n  // bits 2-7 (6 bits set)
    // b2 XOR c2: bits 0,1 (only in b) + 5,6,7 (only in c) = 5 bits → dist 5
    // a XOR c2 = c2 = 6 bits set → dist 6 > 5
    expect(hammingDistance(a, b2)).toBeLessThanOrEqual(DUPLICATE_THRESHOLD)
    expect(hammingDistance(b2, c2)).toBeLessThanOrEqual(DUPLICATE_THRESHOLD)
    expect(hammingDistance(a, c2)).toBeGreaterThan(DUPLICATE_THRESHOLD)

    const photos = [
      makePhoto('pa', a, 0.5),
      makePhoto('pb', b2, 0.8),
      makePhoto('pc', c2, 0.6),
    ]
    const clusters = clusterDuplicates(photos)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].representative).toBe('pb') // highest sharpness
  })

  it('separates distinct groups: 2 similar + 1 different → 2 clusters', () => {
    const photos = [
      makePhoto('a', 0n, 0.5),
      makePhoto('b', 0b11n, 0.9), // near-duplicate of a
      makePhoto('c', (1n << 64n) - 1n, 0.7), // completely different
    ]
    const clusters = clusterDuplicates(photos)
    expect(clusters).toHaveLength(2)

    const bigCluster = clusters.find(c => c.members.length === 2)!
    const smallCluster = clusters.find(c => c.members.length === 1)!
    expect(bigCluster.members).toContain('a')
    expect(bigCluster.members).toContain('b')
    expect(bigCluster.representative).toBe('b')
    expect(smallCluster.members).toContain('c')
    expect(smallCluster.representative).toBe('c')
  })
})

// ===========================================================================
// buildAdjacencyGraph
// ===========================================================================
describe('buildAdjacencyGraph', () => {
  it('simple 2×2 grid has correct adjacencies', () => {
    const adj = buildAdjacencyGraph(['a b', 'c d'])
    expect(adj.get('a')).toEqual(new Set(['b', 'c']))
    expect(adj.get('b')).toEqual(new Set(['a', 'd']))
    expect(adj.get('c')).toEqual(new Set(['a', 'd']))
    expect(adj.get('d')).toEqual(new Set(['b', 'c']))
  })

  it('hero layout does not create self-adjacency', () => {
    const adj = buildAdjacencyGraph(['a b', 'a c'])
    expect(adj.get('a')).toEqual(new Set(['b', 'c']))
    expect(adj.get('b')!.has('a')).toBe(true)
    expect(adj.get('c')!.has('a')).toBe(true)
    expect(adj.get('a')!.has('a')).toBe(false) // no self-loop
  })

  it('single cell has no neighbors', () => {
    const adj = buildAdjacencyGraph(['a'])
    expect(adj.get('a')).toEqual(new Set())
  })

  it('1×3 row: a↔b, b↔c, not a↔c', () => {
    const adj = buildAdjacencyGraph(['a b c'])
    expect(adj.get('a')).toEqual(new Set(['b']))
    expect(adj.get('b')).toEqual(new Set(['a', 'c']))
    expect(adj.get('c')).toEqual(new Set(['b']))
  })

  it('complex layout with spanning areas', () => {
    // ['a a b', 'c d b']
    // Row 0: a a b → a≠b at (0,1)→(0,2)
    // Row 1: c d b → c≠d at (1,0)→(1,1), d≠b at (1,1)→(1,2)
    // Vertical: (0,0)a→(1,0)c, (0,1)a→(1,1)d, (0,2)b→(1,2)b (same, skip)
    const adj = buildAdjacencyGraph(['a a b', 'c d b'])
    expect(adj.get('a')!.has('b')).toBe(true)
    expect(adj.get('a')!.has('c')).toBe(true)
    expect(adj.get('a')!.has('d')).toBe(true)
    expect(adj.get('b')!.has('a')).toBe(true)
    expect(adj.get('b')!.has('d')).toBe(true)
    expect(adj.get('c')!.has('d')).toBe(true)
    expect(adj.get('a')!.has('a')).toBe(false)
    expect(adj.get('b')!.has('b')).toBe(false)
  })
})

// ===========================================================================
// optimizeForDiversity
// ===========================================================================
describe('optimizeForDiversity', () => {
  it('returns original assignment when fingerprints map is empty', () => {
    const assignment = new Map([['a', 'p1'], ['b', 'p2']])
    const adjacency = new Map([['a', new Set(['b'])], ['b', new Set(['a'])]])
    const result = optimizeForDiversity(
      assignment,
      adjacency,
      new Map(), // empty fingerprints
      new Map([['a', 'landscape' as const], ['b', 'landscape' as const]]),
      new Map([['p1', 'landscape' as const], ['p2', 'landscape' as const]]),
    )
    expect(result).toEqual(assignment)
  })

  it('swaps adjacent identical-fingerprint photos with non-adjacent diverse one', () => {
    // Layout: a↔b, b↔c (a and c are NOT adjacent)
    // Assign identical photos to a and b, diverse photo to c
    const adjacency = buildAdjacencyGraph(['a b c'])
    const fp1 = makeFP(0n, 0.5)
    const fp2 = makeFP(0n, 0.5) // identical to fp1
    const fp3 = makeFP((1n << 64n) - 1n, 0.0) // very different

    const assignment = new Map([['a', 'p1'], ['b', 'p2'], ['c', 'p3']])
    const fingerprints = new Map([['p1', fp1], ['p2', fp2], ['p3', fp3]])
    const slotO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['a', 'landscape'], ['b', 'landscape'], ['c', 'landscape'],
    ])
    const photoO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['p1', 'landscape'], ['p2', 'landscape'], ['p3', 'landscape'],
    ])

    const result = optimizeForDiversity(assignment, adjacency, fingerprints, slotO, photoO)

    // After optimization, p1 and p2 (identical) should NOT both be adjacent
    // The optimizer should swap so that p3 is between them
    const aPhoto = result.get('a')!
    const bPhoto = result.get('b')!
    // b is adjacent to both a and c, so b should ideally be p3 (diverse)
    // or at least the adjacent pair a-b should not both be identical
    // We just verify diversity improved: b's photo differs from at least one neighbor
    const bFP = fingerprints.get(bPhoto)!
    const aFP = fingerprints.get(aPhoto)!
    const diversityAB = photoSimilarity(aFP, bFP)
    // The original diversity between a-b was 0 (identical). After swap it should be > 0
    expect(diversityAB).toBeGreaterThan(0)
  })

  it('does not change an already-diverse assignment', () => {
    const adjacency = buildAdjacencyGraph(['a b'])
    const fp1 = makeFP(0n, 0.0)
    const fp2 = makeFP((1n << 64n) - 1n, 1.0)
    const assignment = new Map([['a', 'p1'], ['b', 'p2']])
    const fingerprints = new Map([['p1', fp1], ['p2', fp2]])
    const slotO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['a', 'landscape'], ['b', 'landscape'],
    ])
    const photoO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['p1', 'landscape'], ['p2', 'landscape'],
    ])

    const result = optimizeForDiversity(assignment, adjacency, fingerprints, slotO, photoO)
    expect(result).toEqual(assignment)
  })

  it('respects orientation constraint: does not swap portrait into landscape slot', () => {
    // Two slots: a=landscape, b=portrait
    // Two photos: p1=landscape (in a), p2=portrait (in b) — perfect match
    // Even if swapping would improve diversity, orientations would mismatch
    const adjacency = buildAdjacencyGraph(['a b'])
    const fp1 = makeFP(0n, 0.5)
    const fp2 = makeFP(0n, 0.5) // identical — swap would be desired for diversity
    const assignment = new Map([['a', 'p1'], ['b', 'p2']])
    const fingerprints = new Map([['p1', fp1], ['p2', fp2]])
    const slotO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['a', 'landscape'], ['b', 'portrait'],
    ])
    const photoO = new Map<string, 'portrait' | 'landscape' | 'square'>([
      ['p1', 'landscape'], ['p2', 'portrait'],
    ])

    const result = optimizeForDiversity(assignment, adjacency, fingerprints, slotO, photoO)
    // Swap would put portrait p2 into landscape slot a — mismatch increases — should not swap
    expect(result.get('a')).toBe('p1')
    expect(result.get('b')).toBe('p2')
  })

  it('handles single slot with no optimization possible', () => {
    const adjacency = new Map([['a', new Set<string>()]])
    const fp1 = makeFP(0n)
    const assignment = new Map([['a', 'p1']])
    const fingerprints = new Map([['p1', fp1]])
    const slotO = new Map<string, 'portrait' | 'landscape' | 'square'>([['a', 'landscape']])
    const photoO = new Map<string, 'portrait' | 'landscape' | 'square'>([['p1', 'landscape']])

    const result = optimizeForDiversity(assignment, adjacency, fingerprints, slotO, photoO)
    expect(result).toEqual(assignment)
  })

  it('converges within max 3 passes (does not loop forever)', () => {
    // Create a scenario with many slots — just verify it returns in reasonable time
    const areas = ['a b c d']
    const adjacency = buildAdjacencyGraph(areas)
    const assignment = new Map<string, string>()
    const fingerprints = new Map<string, PhotoFingerprint>()
    const slotO = new Map<string, 'portrait' | 'landscape' | 'square'>()
    const photoO = new Map<string, 'portrait' | 'landscape' | 'square'>()

    for (const name of ['a', 'b', 'c', 'd']) {
      const pid = `p_${name}`
      assignment.set(name, pid)
      fingerprints.set(pid, makeFP(BigInt(name.charCodeAt(0)), name.charCodeAt(0) / 255))
      slotO.set(name, 'landscape')
      photoO.set(pid, 'landscape')
    }

    const start = Date.now()
    const result = optimizeForDiversity(assignment, adjacency, fingerprints, slotO, photoO)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000) // should be nearly instant
    expect(result.size).toBe(4)
  })
})
