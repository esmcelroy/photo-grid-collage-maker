## Why

The "Advanced" detection mode is currently disabled ("Coming soon") in the Smart Layout feature. Standard mode only detects faces — meaning pet photos, food photography, landscape-with-subjects, and other non-portrait content falls back to basic edge detection for positioning. Users uploading diverse photo sets get poor auto-positioning for any photo without a human face.

Adding object detection enables the app to identify dogs, cats, food, vehicles, and 90 COCO object classes — keeping all subjects properly framed in their collage slots, not just faces.

## What Changes

- Extend the existing ML Web Worker (`ml-worker.ts`) to load MediaPipe's EfficientDet-Lite0 object detection model alongside the existing BlazeFace face model
- Run both detectors in Advanced mode and merge results using containment-ratio de-duplication and class-weighted scoring
- Enable the "Advanced" radio button in CustomizationControls with download size disclosure
- The existing layout scoring pipeline (`layout-scoring.ts`, `face-detection.ts`) receives merged `DetectedRegion[]` — no changes needed downstream

## Capabilities

### New Capabilities
- **Object Detection**: Detect 90 COCO object classes (person, cat, dog, food, etc.) using EfficientDet-Lite0 via MediaPipe Tasks Vision in the existing Web Worker
- **Region Merging**: Combine face + object detections with overlap suppression and class-based weighting to produce a single optimal subject centroid per photo
- **Progressive Model Loading**: Advanced mode only downloads the object model (~4.3MB) incrementally — WASM runtime is already cached from Standard mode usage

### Modified Capabilities
- **ML Worker** (`src/workers/ml-worker.ts`): Extended to handle `init` with model selection (`'face'` | `'object'` | `'both'`), loads ObjectDetector alongside FaceDetector
- **Face Detection Pipeline** (`src/lib/face-detection.ts`): Advanced mode path calls both detectors, merges results via `mergeDetections()`, returns unified `DetectedRegion[]`
- **Detection Mode UI** (`src/components/CustomizationControls.tsx`): Advanced radio button enabled with model size info and download progress indication
- **Worker Client** (`src/lib/ml-worker-client.ts`): Supports new message types for object detection init and combined results

## Impact

- Affected code: `ml-worker.ts`, `ml-worker-client.ts`, `face-detection.ts`, `CustomizationControls.tsx`, `App.tsx` (worker init logic)
- Affected tests: Unit tests for merge algorithm, integration tests for worker communication, possibly E2E for mode switching
- New dependency: None (uses existing `@mediapipe/tasks-vision` package — ObjectDetector is already bundled)
- CSP: No changes needed (same CDN origins, same WASM runtime)
- Bundle size: No increase (model downloaded at runtime from Google Storage CDN)
- Performance: ~40ms per photo in Advanced mode (5ms face + 35ms object), acceptable for non-realtime analysis

## Technical Design

### De-Duplication: Containment Ratio

Traditional IoU fails because face bboxes are much smaller than person bboxes. We use **containment ratio** instead:

```
containment = intersection(face, person) / area(face)
```

If containment > 0.5 AND the object class is "person", the person bbox is suppressed (face is more precise for positioning).

### Class Weight Table

| Source | Class | Weight | Rationale |
|--------|-------|--------|-----------|
| BlazeFace | face | 1.0 | Always primary subject indicator |
| EfficientDet | person (no face overlap) | 0.2 | Face is better when available |
| EfficientDet | cat / dog | 0.9 | Very likely the photo subject |
| EfficientDet | food / cake / bowl | 0.6 | Often the subject of a photo |
| EfficientDet | vehicle / sports | 0.4 | Sometimes the subject |
| EfficientDet | furniture / background | 0.0 | Never the positioning target |
| EfficientDet | other | 0.3 | Conservative default |

### Merge Algorithm

1. Run BlazeFace → face regions
2. Run EfficientDet → object regions
3. Suppress person bboxes that contain a detected face (containment > 0.5)
4. Weight remaining regions by class table × detection confidence
5. Compute weighted centroid → single `subjectCenter`
6. Compute enclosing bbox of significant regions → single `DetectedRegion`
7. Feed into existing `analyzePhoto()` pipeline — downstream unchanged

### Worker Protocol Extension

```typescript
// New init options
{ type: 'init', model: 'face' | 'object' | 'both' }

// New response types
{ type: 'object-ready' }
{ type: 'object-result', photoId, objects: ObjectBox[] }

// ObjectBox extends FaceBox with class info
interface ObjectBox extends FaceBox {
  class: string      // COCO class name
  classIndex: number // COCO class index
}
```
