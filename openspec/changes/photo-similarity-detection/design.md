# Photo Similarity Detection — Design

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     analyzePhoto() pipeline                       │
│                                                                   │
│  Existing steps:              New steps:                          │
│  ┌──────────────┐            ┌────────────────────┐              │
│  │  sharpness   │            │  dHash fingerprint  │              │
│  │  (Laplacian) │            │  (9×8 grayscale)    │              │
│  ├──────────────┤            ├────────────────────┤              │
│  │  smartCrop   │            │  color histogram    │              │
│  │  (smartcrop) │            │  (32×32 → 24 bins)  │              │
│  ├──────────────┤            └────────────────────┘              │
│  │  colors      │                                                │
│  │  (colorthief)│            All Canvas API — no new deps         │
│  ├──────────────┤                                                │
│  │  face/object │                                                │
│  │  (ML worker) │                                                │
│  └──────────────┘                                                │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼ PhotoCharacteristics[] (with fingerprints)
┌──────────────────────────────────────────────────────────────────┐
│                suggestPhotoArrangement() — ENHANCED               │
│                                                                   │
│  Step 1: Orientation matching          (existing, unchanged)      │
│  Step 2: Sharpness-based fill          (existing, unchanged)      │
│  Step 3: Duplicate clustering          (NEW)                      │
│           └─ group by dHash hamming ≤ 5                           │
│           └─ promote sharpest per cluster to hero slot            │
│  Step 4: Adjacency swap optimization   (NEW)                      │
│           └─ build adjacency graph from grid areas                │
│           └─ greedy swap to maximize neighbor diversity            │
│           └─ similarity = 0.4×colorDist + 0.3×hashDist            │
│                         + 0.3×luminanceDiff                       │
└──────────────────────────────────────────────────────────────────┘
```

## Module: photo-similarity.ts

New file containing all fingerprinting and similarity logic.

### dHash Implementation

```typescript
// Downscale to 9×8, compare horizontal neighbors → 64 bits
function computeDHash(imageData: ImageData): bigint

// Count differing bits between two hashes
function hammingDistance(a: bigint, b: bigint): number

// Threshold constants
const DUPLICATE_THRESHOLD = 5   // hamming ≤ 5 = near-duplicate
const SIMILAR_THRESHOLD = 12    // hamming ≤ 12 = same scene
```

**Why dHash over aHash or pHash:**
- dHash captures gradient direction (better than average luminance)
- Resistant to brightness/contrast adjustments
- Simpler than DCT-based pHash, comparable accuracy for burst detection
- 64 operations on 9×8 = 72 pixels — trivially fast

### Color Histogram Implementation

```typescript
// Downscale to 32×32, quantize to 24 HSL bins
function computeColorHistogram(imageData: ImageData): Float32Array

// Cosine similarity between two histograms
function histogramSimilarity(a: Float32Array, b: Float32Array): number

// Distance = 1 - similarity, range [0, 1]
function histogramDistance(a: Float32Array, b: Float32Array): number
```

**Why HSL over RGB:**
- Hue is perceptually meaningful (red, blue, green)
- Separates color identity from lighting conditions
- 12 hue bins × 2 lightness bins = compact yet discriminating

### Combined Similarity Metric

```typescript
function photoSimilarity(a: PhotoFingerprint, b: PhotoFingerprint): number {
  const hashDist = hammingDistance(a.dHash, b.dHash) / 64  // normalize to 0-1
  const colorDist = histogramDistance(a.histogram, b.histogram)
  const lumDist = Math.abs(a.luminance - b.luminance)

  // Combined: lower = more similar
  return 0.4 * colorDist + 0.3 * hashDist + 0.3 * lumDist
}
```

## Duplicate Clustering

```typescript
interface PhotoCluster {
  representative: string  // photoId of sharpest in cluster
  members: string[]       // all photoIds in cluster
}

function clusterDuplicates(
  photos: PhotoCharacteristics[]
): PhotoCluster[]
```

**Algorithm:** Union-Find with dHash Hamming distance ≤ 5 as the merge predicate. O(n²) pairwise comparison — fine for n ≤ 16 photos.

**Behavior:**
- Clusters with 1 member → no change (unique photo)
- Clusters with 2+ members → sharpest becomes "representative" (priority for hero slots)
- Non-representatives are still placed, just deprioritized for large/prominent slots

## Adjacency Graph

```typescript
function buildAdjacencyGraph(areas: string[]): Map<string, Set<string>>
```

**Algorithm:** Scan the grid row by row. For each cell `(r, c)`:
- If `cell[r][c] !== cell[r][c+1]` → they're horizontally adjacent
- If `cell[r][c] !== cell[r+1][c]` → they're vertically adjacent
- Deduplicate (set of pairs, unordered)

**Example:**
```
areas: ['a b c', 'a d d']

Scan:
  (0,0)='a', (0,1)='b' → adjacent(a,b)
  (0,1)='b', (0,2)='c' → adjacent(b,c)
  (0,0)='a', (1,0)='a' → same (skip)
  (0,1)='b', (1,1)='d' → adjacent(b,d)
  (0,2)='c', (1,2)='d' → adjacent(c,d)
  (1,0)='a', (1,1)='d' → adjacent(a,d)

Result: {a: {b,d}, b: {a,c,d}, c: {b,d}, d: {a,b,c}}
```

## Swap Optimization

```typescript
function optimizeForDiversity(
  assignment: Map<string, string>,      // area → photoId
  adjacency: Map<string, Set<string>>,  // area → neighboring areas
  photos: Map<string, PhotoFingerprint>, // photoId → fingerprint
  orientationFit: Map<string, boolean>  // area → does current photo match slot orientation?
): Map<string, string>
```

**Algorithm:**

```
totalDiversity = sum of photoSimilarity(photo[a], photo[b])
                 for all adjacent (a, b)

for each pair of slots (i, j):
  // Trial swap
  tempAssignment = swap(assignment, i, j)

  // Check orientation constraint:
  // Allow swap only if it doesn't increase orientation mismatches
  orientationPenalty = countMismatches(tempAssignment) - countMismatches(assignment)
  if (orientationPenalty > 0) continue

  // Check diversity improvement
  newDiversity = recompute total diversity
  if (newDiversity > totalDiversity):
    accept swap
    totalDiversity = newDiversity

repeat until no swaps improve (max 3 passes for 16-photo safety)
```

**Complexity:** O(n² × m) where n = slots, m = adjacency edges. For 16 photos: ~256 × ~30 = ~7,680 comparisons. Each comparison is a few arithmetic ops on cached fingerprints. Well under 5ms.

## Integration Points

### ImageAnalysis Interface Extension

```typescript
interface ImageAnalysis {
  // ... existing fields ...
  dHash: bigint
  colorHistogram: Float32Array
}
```

### PhotoCharacteristics Extension

```typescript
interface PhotoCharacteristics {
  // ... existing fields ...
  dHash?: bigint
  colorHistogram?: Float32Array
}
```

Both fields optional for backward compatibility — old cached analyses without fingerprints simply skip the diversity optimization.

## Performance Budget

| Operation | Per photo | 16 photos | When |
|-----------|-----------|-----------|------|
| dHash computation | <1ms | <16ms | During analyzePhoto() |
| Color histogram | <1ms | <16ms | During analyzePhoto() |
| Duplicate clustering | — | <1ms | During suggestPhotoArrangement() |
| Adjacency graph build | — | <1ms | During suggestPhotoArrangement() |
| Swap optimization | — | <5ms | During suggestPhotoArrangement() |
| **Total new overhead** | **<2ms** | **<39ms** | |

All operations run on the main thread (too fast to justify worker overhead). The existing analysis pipeline already downscales images — we reuse the same canvas.

## Error Handling

- If dHash computation fails (malformed image) → set `dHash = 0n`, skip that photo in clustering
- If color histogram fails → set `histogram = null`, exclude from diversity scoring
- If no fingerprints available on any photos → `suggestPhotoArrangement()` behaves exactly as before (graceful no-op)
- Swap optimization has hard limit of 3 passes to prevent runaway loops
