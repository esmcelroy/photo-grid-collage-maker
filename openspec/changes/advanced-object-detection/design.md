# Advanced Object Detection — Design

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        App.tsx                                     │
│  useEffect: init worker with model='both' when mode='advanced'   │
└──────────────┬───────────────────────────────────────────────────┘
               │ postMessage({ type: 'init', model: 'both' })
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      ml-worker.ts                                  │
│                                                                    │
│  ┌────────────────┐        ┌─────────────────────┐                │
│  │  FaceDetector   │        │  ObjectDetector      │                │
│  │  (BlazeFace)    │        │  (EfficientDet-Lite0)│                │
│  │  ~200KB model   │        │  ~4.3MB model        │                │
│  └───────┬─────────┘        └──────────┬───────────┘                │
│          │                             │                           │
│          └──────────┬──────────────────┘                           │
│                     ▼                                              │
│          ┌─────────────────────┐                                   │
│          │ Shared WASM Runtime │                                    │
│          │ (~11MB, cached)     │                                    │
│          └─────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────┘
               │ postMessage({ type: 'combined-result', ... })
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   ml-worker-client.ts                              │
│  Receives combined face + object results, passes to pipeline      │
└──────────────┬───────────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    face-detection.ts                               │
│  mergeDetections() → weighted centroid → DetectedRegion[]         │
│  Feeds into existing analyzePhoto() pipeline                      │
└──────────────────────────────────────────────────────────────────┘
```

## Worker Lifecycle

### Mode Transitions

```
User selects "Advanced" in CustomizationControls
       │
       ▼
App.tsx detects mode change → disposes old worker
       │
       ▼
Creates new worker → sends { type: 'init', model: 'both' }
       │
       ▼
Worker loads WASM runtime (cached after first Standard use)
       │
       ├──▶ Loads BlazeFace model (~200KB) → postMessage({ type: 'face-ready' })
       │
       └──▶ Loads EfficientDet model (~4.3MB) → postMessage({ type: 'object-ready' })
       │
       ▼
When BOTH ready → postMessage({ type: 'ready' })
```

### Detection Flow (per photo)

```
Client sends: { type: 'detect', photoId, imageData }
       │
       ▼
Worker runs BOTH detectors on same ImageBitmap:
  1. FaceDetector.detect(canvas) → faces[]
  2. ObjectDetector.detect(canvas) → objects[]
       │
       ▼
Worker sends: { type: 'combined-result', photoId, faces, objects }
```

## Merge Algorithm Detail

### containmentRatio(smaller, larger)

```typescript
function containmentRatio(a: BBox, b: BBox): number {
  const interX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const interY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const interArea = interX * interY
  const smallerArea = Math.min(a.width * a.height, b.width * b.height)
  return smallerArea > 0 ? interArea / smallerArea : 0
}
```

### Suppression Logic

```typescript
function suppressRedundantPersons(
  faces: FaceBox[],
  objects: ObjectBox[]
): ObjectBox[] {
  return objects.filter(obj => {
    if (obj.class !== 'person') return true
    // Keep person only if no face is contained within it
    return !faces.some(face => containmentRatio(face, obj) > 0.5)
  })
}
```

### Weighted Centroid

```typescript
function computeWeightedCentroid(regions: WeightedRegion[]): { x: number; y: number } {
  const totalWeight = regions.reduce((sum, r) => sum + r.weight * r.confidence, 0)
  if (totalWeight === 0) return { x: 0.5, y: 0.5 }
  return {
    x: regions.reduce((sum, r) => sum + (r.x + r.width / 2) * r.weight * r.confidence, 0) / totalWeight,
    y: regions.reduce((sum, r) => sum + (r.y + r.height / 2) * r.weight * r.confidence, 0) / totalWeight,
  }
}
```

## Model Loading Strategy

### Progressive Enhancement

| User path | Downloads | Total new data |
|-----------|-----------|----------------|
| Basic → Advanced | WASM + BlazeFace + EfficientDet | ~15.5MB |
| Standard → Advanced | EfficientDet only (WASM cached) | ~4.3MB |
| Advanced (return visit) | All cached | 0MB |

### Download Progress UX

- Show determinate progress bar during model download
- Display estimated size: "Downloading object detection model (4.3 MB)..."
- Allow cancellation (dispose worker, revert to Standard)
- Cache model via browser HTTP cache (Google Storage CDN sets appropriate headers)

## Class Weight Rationale

The weight table optimizes for **personal photo collections** — the primary use case:

- **Faces (1.0)**: Always the most important subject in personal photos
- **Pets (0.9)**: Second most common "subject" in personal collections
- **Food (0.6)**: Popular subject for event/celebration photos
- **Vehicles (0.4)**: Sometimes the subject (car shows, road trips)
- **Person without face (0.2)**: Low because face detection is more precise — this only matters when face detector misses (back of head, distance)
- **Furniture/background (0.0)**: Never the intended subject

## Error Handling

- If ObjectDetector fails to load but FaceDetector succeeds → operate in face-only mode (equivalent to Standard), show toast
- If both fail → fall back to Basic mode (existing behavior)
- If object detection throws on a specific photo → return face-only results for that photo
- Network timeout on model download → show retry option, stay in Standard mode

## CSP Compatibility

No CSP changes needed:
- Object model served from `storage.googleapis.com` (already allowed via `connect-src`)
- Uses same WASM runtime (already allowed via `wasm-unsafe-eval`)
- Same CDN origin for WASM files (cdn.jsdelivr.net already in `script-src`)
