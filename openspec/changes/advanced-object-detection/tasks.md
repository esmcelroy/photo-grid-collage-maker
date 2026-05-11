# Advanced Object Detection — Tasks

## Phase 5.1: Worker Extension

### Task 1: Extend ml-worker.ts to support ObjectDetector
- Import `ObjectDetector` from `@mediapipe/tasks-vision`
- Add `MODEL_URL_OBJECT` constant pointing to EfficientDet-Lite0 on Google Storage
- Modify `initDetector()` to accept model param: `'face'` | `'object'` | `'both'`
- When `'both'`: load both FaceDetector and ObjectDetector on shared FilesetResolver
- Add `detectObjects(photoId, imageBitmap)` function
- New message type: `'combined-result'` with both `faces[]` and `objects[]`
- Post `'face-ready'` and `'object-ready'` independently, then `'ready'` when both done
- Handle `'dispose'` for both detectors

### Task 2: Extend ml-worker-client.ts
- Add `ObjectBox` interface extending `FaceBox` with `class` and `classIndex`
- Update `WorkerResponse` type to include `'object-ready'` and `'combined-result'`
- Update `initMLWorker()` to accept model param and forward to worker
- Add `detectCombined(photoId, dataUrl)` function that returns `{ faces, objects }`
- Track ready state for both models independently

### Task 3: Add region merging logic
- Create `src/lib/region-merge.ts`:
  - `containmentRatio(a, b)` — compute overlap as fraction of smaller bbox
  - `suppressRedundantPersons(faces, objects)` — remove person bboxes overlapping faces
  - `CLASS_WEIGHTS` constant map
  - `mergeDetections(faces, objects)` — full pipeline returning `DetectedRegion[]`
  - `computeWeightedCentroid(regions)` — weighted center point
- Export types: `WeightedRegion`, `ObjectRegion`
- All coordinates normalized 0-1 (consistent with existing pipeline)

## Phase 5.2: Pipeline Integration

### Task 4: Wire Advanced mode in face-detection.ts
- In `detectFaces()`, add `advanced` branch:
  - Call `detectCombined()` from worker client
  - Pass results through `mergeDetections()` from region-merge.ts
  - Return merged `DetectedRegion[]` (same type as current)
- Graceful degradation: if object detector not ready, fall back to face-only

### Task 5: Update App.tsx worker init
- When `detectionMode === 'advanced'`: init worker with `model: 'both'`
- When `detectionMode === 'standard'`: init worker with `model: 'face'` (unchanged)
- Track loading state for progress indication
- Handle partial ready (face ready, objects still loading)

### Task 6: Enable Advanced UI in CustomizationControls
- Remove disabled state from Advanced radio button
- Add subtitle: "Face + object detection (~4MB download)"
- Show download progress when model is loading
- Add info tooltip explaining what Advanced detects

## Phase 5.3: Testing

### Task 7: Unit tests for region-merge.ts
- Test containmentRatio with various overlap scenarios
- Test suppressRedundantPersons with face-inside-person
- Test mergeDetections with:
  - Faces only (no objects) → same as Standard
  - Objects only (no faces) → weighted by class
  - Mixed faces + objects with overlapping persons
  - Empty inputs → null/fallback
  - Pet photo (dog detected, no face) → dog-centered
- Test class weight lookup for known and unknown classes

### Task 8: Integration tests for worker communication
- Test init with model='both' sends correct message
- Test combined-result parsing
- Test partial model load (face ready, object pending)
- Test error recovery (object model fails, face still works)

### Task 9: E2E validation
- Test mode switching to Advanced loads model
- Test photo analysis with Advanced mode produces different positioning than Standard (for pet/food photos)
- Verify no regressions on face-only photos

## Dependencies

```
Task 1 ──┐
          ├──▶ Task 4 ──▶ Task 5 ──▶ Task 6
Task 2 ──┤
          │
Task 3 ──┘
          │
          └──▶ Task 7
               Task 8 (depends on Tasks 1+2)
               Task 9 (depends on Tasks 4+5+6)
```

## Acceptance Criteria

- [ ] Advanced radio button enabled and functional
- [ ] Object detection model loads successfully (EfficientDet-Lite0)
- [ ] Pet photo (no faces): object detection finds subject, positions correctly
- [ ] Portrait photo: face detection still wins (person bbox suppressed)
- [ ] Mixed photo (person + pet): weighted centroid includes both
- [ ] Model download shows progress indication
- [ ] Graceful fallback to Standard if object model fails to load
- [ ] No regression on Standard or Basic modes
- [ ] All existing tests continue passing
- [ ] CSP unchanged — no new `unsafe-eval` or origin additions needed
