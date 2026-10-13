# Photo Grid Collage Maker — Project Overview

A fully client-side React application for composing 1–16 photos into a grid collage. Users choose layouts, reorder/edit photos, apply presets, adjust spacing/background/radius, and download exact-size PNG or JPEG files. There is no application backend or server-side photo storage.

## Architecture and ownership

```text
React components → useCollageApi → Dexie → IndexedDB
                         ↕
                   React Query cache
```

- `src/App.tsx` coordinates uploads, layouts, history, analysis, and export.
- `src/hooks/useCollageApi.ts` is the UI persistence boundary. React Query uses `['collage', sessionId]`; `localStorage` stores `collage-session-id`.
- `src/lib/db.ts` owns the `collage-maker` IndexedDB database and its `collages`, `photos`, and `photoPositions` tables. Photos are data URLs; positions include crop, rotation, and zoom.
- `src/main.tsx` provides React Query and the error boundary. Vite/Spark development integrations do not provide a production backend.
- `src/components/ui/` contains existing Radix/shadcn primitives; Tailwind v4 and Framer Motion provide styling and animation.

## Data contracts

`src/lib/types.ts` is the UI type source of truth:

| Type | Fields |
|---|---|
| `UploadedPhoto` | `id`, `file`, `dataUrl` |
| `PhotoPosition` | `photoId`, `gridArea`, optional `objectPosition`, `rotation`, `scale` |
| `GridLayout` | `id`, `name`, `photoCount`, `gridTemplate`, `areas`, optional `aspectRatio`, `platforms` |
| `CollageSettings` | `gap`, `backgroundColor`, `borderRadius` |
| `ExportOptions` | `format`, `quality`, `filename`, exact pixel `width` and `height` |

`UploadedPhoto.file` is reconstructed as an empty synthetic File after database reads: use it for the filename, not image bytes. `dataUrl` holds the actual image. Database record types in `db.ts` carry session IDs/timestamps and differ from UI types.

## Persistence and recovery

- `createCollage()` creates an empty session; `getCollageState()` assembles its dependent records.
- `addPhoto()` checks parent existence and `MAX_PHOTOS` (16) in the same read/write transaction as insertion.
- `updateCollage()` updates settings/layout and replaces positions transactionally.
- `removePhoto()` deletes the photo and its dependent positions.
- Confirmed Clear All calls `replaceCollage()`, atomically deleting the current session and all dependent records and creating a new one. It does not leave orphaned photos.
- Loading, initialization failure, read failure, and missing-session recovery are explicit UI states. Upload feedback counts persisted successes/failures and ignores stale session completions.
- Persistent storage requests and quota estimates are best-effort browser capabilities. Clearing site data can erase work; this is not a cloud backup or a saved-project system.

## Editing, layouts, and analysis

`GRID_LAYOUTS` in `src/lib/layouts.ts` contains static photo-count-aware layouts. `gridTemplate` uses columns or `rows / columns`; `areas` supplies CSS grid-area strings. Repeated letters form spanning cells. IDs conventionally start with the photo count.

`CollagePreview` renders CSS Grid with decorative photo images. `PhotoEditDialog` changes per-slot position, rotation, and zoom. Gallery comparison and arrangement selection share the same positions. `useCollageHistory` tracks layout/position/settings snapshots; it is not an upload/delete recovery system.

Smart Position analyzes photos locally. Basic mode needs no model downloads. Standard can use native face detection or a worker; Advanced uses MediaPipe face/object detection. Workers fetch model/runtime assets but do not upload photos. Cache invalidation guards photo data, mode, and generation. Analysis completion refreshes suggestions without restarting analysis, and manual actions cancel pending automatic position application immediately. Turning Smart Position off/on requests reapplication.

## Export

`ExportDialog` supplies PNG/JPEG format, JPEG quality, filename, and exact dimensions. Presets derive sizes from layout aspect ratio; Print uses a 300-DPI sizing assumption. `export-dimensions.ts` validates integers ≥1, each dimension ≤8192px, and ≤40 megapixels before rendering.

`downloadCollage()` in `image-utils.ts` rasterizes the existing preview with html2canvas and scales it to the requested dimensions. It converts unsupported modern CSS colors and bakes cover/object-position crops into cloned images while retaining rotation, zoom, radius, and gap styles. PNG retains transparency; JPEG uses white. Encoding and download initiation are awaited; null blobs reject and the dialog stays retryable.

## Production PWA and delivery

`vite.config.ts` configures a prompt-based service worker. App assets are precached; the large HEIC decoder is excluded. MediaPipe WASM/model downloads use runtime caches. A first-ever offline visit cannot install the app; uncached optional tools may fail with feedback/fallback. See [README offline support](../README.md#offline-and-browser-support) for limitations.

`useServiceWorker` exposes offline readiness and waiting updates to `OfflineBanner` and `UpdateToast`. Refreshing a waiting worker preserves the current IndexedDB session; future schema migrations need their own tests.

Node 24 is pinned by `.nvmrc` and the package engine. `.github/workflows/ci.yml` runs lint, explicit TypeScript checks, unit tests, development UI tests, and production PWA tests. Only a successful main-branch run can call the reusable Pages deployment workflow, which checks out that exact SHA. Pull requests are required; no manual deployment trigger is needed.

See [AGENTS.md](../AGENTS.md) for working contracts and [testing guidelines](testing-guidelines.md) for commands and browser evidence.
