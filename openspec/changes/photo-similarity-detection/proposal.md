## Why

The current layout arrangement algorithm (`suggestPhotoArrangement`) assigns photos to grid slots based on orientation matching and sharpness — but has zero awareness of whether photos are similar to each other. When users upload burst shots from a phone camera or multiple photos from the same scene, visually near-identical images end up in adjacent grid cells, producing monotonous collages.

Additionally, when photos happen to have similar color palettes, they can cluster together in the grid creating muddy visual zones instead of a vibrant, varied composition.

Adding photo similarity detection and diversity-aware placement makes every collage look deliberately curated — with no manual effort from the user.

## What Changes

- Add a perceptual fingerprinting step to the existing photo analysis pipeline (dHash + color histogram, pure Canvas API)
- Enhance `suggestPhotoArrangement()` in `layout-scoring.ts` to cluster near-duplicates, prefer the sharpest variant for hero slots, and run a diversity-optimizing swap pass that maximizes visual difference between adjacent grid cells
- Zero new npm dependencies — implemented entirely with Canvas ImageData operations

## Capabilities

### New Capabilities
- **Perceptual Hashing (dHash)**: Generate a 64-bit difference hash for each photo during analysis, enabling O(1) similarity comparison via Hamming distance
- **Color Histogram Fingerprint**: Compute a compact HSL histogram (24 bins) for each photo, enabling color-palette similarity scoring between any two photos
- **Duplicate Clustering**: Group photos with Hamming distance ≤ 5 into clusters, identify the sharpest representative of each cluster
- **Adjacency-Aware Placement**: After initial orientation-based assignment, perform greedy swap optimization to minimize similarity between photos in adjacent grid cells

### Modified Capabilities
- **Image Analysis** (`src/lib/image-analysis.ts`): Extended to compute dHash and color histogram during `analyzePhoto()`; new fields on `ImageAnalysis` interface
- **Layout Scoring** (`src/lib/layout-scoring.ts`): `suggestPhotoArrangement()` enhanced with duplicate clustering + adjacency swap optimization; `PhotoCharacteristics` gains fingerprint fields
- **Photo Analysis Cache**: Fingerprints stored alongside existing analysis results in the per-photo cache

## Impact

- Affected code: `image-analysis.ts`, `layout-scoring.ts`, new `photo-similarity.ts` module
- Affected tests: Unit tests for hashing/clustering/swap logic, existing layout-scoring tests (additive, no breaking changes)
- New dependencies: None — pure Canvas API
- Bundle size: ~2KB (algorithm code only)
- Performance: <2ms per photo for fingerprinting, <5ms total for arrangement optimization
- No UI changes — this is silent quality improvement to auto-layout results

## Technical Design

### dHash Algorithm (Difference Hash)

Downscale to 9×8 grayscale → compare each pixel to its right neighbor → 64 bits:

```
Input photo → canvas.drawImage(img, 0, 0, 9, 8)
           → getImageData() → grayscale
           → for each row, for each col:
               hash[bit++] = pixel[x] > pixel[x+1] ? 1 : 0
           → 64-bit BigInt
```

Hamming distance ≤ 5 = near-duplicate burst shot.
Hamming distance 6-12 = same scene, different angle.

### Color Histogram

Quantize each pixel to HSL → 12 hue bins × 2 lightness bins = 24 bins:

```
Input photo → canvas.drawImage(img, 0, 0, 32, 32)
           → getImageData() → for each pixel:
               hsl = rgbToHsl(r, g, b)
               hueBin = floor(hsl.h / 30)    // 12 bins
               lightBin = hsl.l > 0.5 ? 1 : 0 // 2 bins
               histogram[hueBin * 2 + lightBin]++
           → normalize to sum=1.0
           → Float32Array[24]
```

Histogram distance: `1 - cosineSimilarity(histA, histB)` — range [0, 1].

### Adjacency Graph

Derived from CSS grid-template-areas:

```
areas: ['a b c', 'a d d']

Adjacent pairs: (a,b), (a,d), (b,c), (b,d), (c,d)
```

Two area names are adjacent if they occupy horizontally or vertically neighboring cells in the grid.

### Swap Optimization

```
1. Start with current assignment (orientation + sharpness based)
2. Compute combined similarity for each adjacent pair:
     sim(A,B) = 0.4 × colorHistDist(A,B) + 0.3 × (hammingDist(A,B) / 64)
                + 0.3 × |luminance(A) - luminance(B)|
3. Total score = sum of sim(adjacent pairs) — HIGHER is MORE diverse
4. For each pair of slots (i,j):
     - Trial swap photos in slots i and j
     - Recompute total diversity score
     - Accept swap if score improves AND orientation constraints not severely violated
5. Repeat until no improving swaps found (typically 1-3 passes)
```
