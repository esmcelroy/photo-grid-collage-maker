# Photo Similarity Detection — Tasks

## Phase 1: Fingerprinting Module

### Task 1: Create photo-similarity.ts with hashing functions
- Create `src/lib/photo-similarity.ts`
- Implement `computeDHash(imageData: ImageData): bigint` — 9×8 grayscale difference hash
- Implement `hammingDistance(a: bigint, b: bigint): number` — popcount of XOR
- Implement `computeColorHistogram(imageData: ImageData): Float32Array` — 24-bin HSL histogram
- Implement `histogramSimilarity(a, b): number` — cosine similarity
- Implement `histogramDistance(a, b): number` — `1 - similarity`
- Export constants: `DUPLICATE_THRESHOLD = 5`, `SIMILAR_THRESHOLD = 12`
- All pure Canvas ImageData operations — zero dependencies

### Task 2: Unit tests for hashing functions
- Test `computeDHash` returns consistent hash for same image data
- Test `computeDHash` returns different hashes for different images
- Test `hammingDistance` with known bit patterns (0 distance, max distance, threshold boundary)
- Test `computeColorHistogram` produces normalized histogram (sum ≈ 1.0)
- Test `histogramSimilarity` of identical histograms = 1.0
- Test `histogramSimilarity` of orthogonal histograms = 0.0
- Test `histogramDistance` range [0, 1]

## Phase 2: Similarity & Clustering

### Task 3: Add combined similarity metric and clustering
- Implement `photoSimilarity(a, b): number` — weighted combination of hash, color, luminance distances
- Implement `clusterDuplicates(photos): PhotoCluster[]` — union-find with dHash Hamming ≤ 5
- Implement `buildAdjacencyGraph(areas: string[]): Map<string, Set<string>>` — derive from grid-template-areas
- Export `PhotoFingerprint` and `PhotoCluster` types

### Task 4: Unit tests for similarity and clustering
- Test `photoSimilarity` of identical fingerprints → 0 (minimum distance)
- Test `photoSimilarity` of maximally different fingerprints → close to 1
- Test `clusterDuplicates` with no duplicates → N single-member clusters
- Test `clusterDuplicates` with 3 near-identical photos → 1 cluster, sharpest as representative
- Test `clusterDuplicates` with transitive duplicates (A≈B, B≈C but A≉C) → all in one cluster
- Test `buildAdjacencyGraph` with simple 2×2 grid
- Test `buildAdjacencyGraph` with hero layout (multi-cell area)
- Test `buildAdjacencyGraph` with single-cell layout (no adjacency)

## Phase 3: Swap Optimization

### Task 5: Implement adjacency-aware swap optimization
- Implement `optimizeForDiversity(assignment, adjacency, fingerprints, slotOrientations): Map<string, string>`
- Greedy pairwise swap: accept if diversity score improves and orientation penalty doesn't increase
- Hard limit of 3 passes over all slot pairs
- Return optimized assignment map (area → photoId)

### Task 6: Unit tests for swap optimization
- Test with 2 photos, 2 adjacent slots — swap if same-color photos adjacent
- Test with 4 photos, 2×2 grid — verify diverse placement
- Test that orientation-matching constraint is respected (don't swap portrait into landscape slot)
- Test with no fingerprints available → returns original assignment unchanged
- Test convergence (doesn't loop forever, respects 3-pass limit)

## Phase 4: Pipeline Integration

### Task 7: Integrate fingerprinting into image analysis
- Extend `ImageAnalysis` interface with `dHash: bigint` and `colorHistogram: Float32Array`
- In `analyzePhoto()` (or the calling code in `face-detection.ts`), compute dHash and histogram using the existing downscaled canvas
- Extend `PhotoCharacteristics` with optional `dHash` and `colorHistogram` fields
- Pass fingerprints through to `suggestPhotoArrangement()`

### Task 8: Enhance suggestPhotoArrangement() with diversity logic
- After existing orientation matching + sharpness fill:
  1. Run `clusterDuplicates()` — promote sharpest per cluster to hero-eligible
  2. Build `adjacencyGraph()` from layout areas
  3. Run `optimizeForDiversity()` — swap to maximize neighbor variety
- Maintain backward compatibility: if no fingerprints present, skip new steps entirely
- Ensure all existing layout-scoring tests still pass

### Task 9: Integration tests
- Test full pipeline: upload 4 photos (2 near-duplicates) → verify duplicates not adjacent
- Test with all unique photos → verify arrangement is at least as good as before
- Test with single photo → no-op (no adjacency to optimize)
- Test with 16 photos → verify performance stays under 50ms total

## Dependencies

```
Task 1 ──▶ Task 2
Task 1 ──▶ Task 3 ──▶ Task 4
Task 3 ──▶ Task 5 ──▶ Task 6
Task 1 ──▶ Task 7
Task 5 + Task 7 ──▶ Task 8
Task 8 ──▶ Task 9
```

## Acceptance Criteria

- [ ] dHash produces consistent 64-bit fingerprints from ImageData
- [ ] Color histogram produces normalized 24-bin HSL distribution
- [ ] Burst shots (Hamming ≤ 5) correctly identified as duplicates
- [ ] Sharpest photo in each duplicate cluster prioritized for hero/large slots
- [ ] Adjacent grid cells have maximally diverse photos after optimization
- [ ] Orientation matching still takes priority over diversity swaps
- [ ] No new npm dependencies added
- [ ] Performance: <2ms per photo fingerprinting, <5ms arrangement optimization
- [ ] All existing tests continue passing
- [ ] Graceful no-op when fingerprints unavailable (backward compatible)
