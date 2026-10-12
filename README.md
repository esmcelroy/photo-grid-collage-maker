# Collage Maker

> Create beautiful photo grids in seconds.

Collage Maker is a browser-based tool for composing photo grid collages. Upload 1–16 photos, pick a layout, edit photo crops/rotation/zoom, tweak spacing and style, and export an exact-size PNG or JPEG — all in the browser.

**Fully client-side** — no server required. Your photos never leave your device. Installable as a PWA for offline use.

---

## Features

- **Photo Upload & Management** — JPEG, PNG, and client-side HEIC/HEIF conversion, up to 16 photos; recovery and partial-upload feedback when browser storage fails
- **Dynamic Layout Gallery** — photo-count-aware layouts with live thumbnails, comparison, and arrangement suggestions
- **Instant Preview** — large collage preview updates in real time as you make changes
- **Drag-and-Drop Reordering** — swap photo positions within the grid by dragging thumbnails
- **Customization Controls** — adjust gap/spacing, background color, and border radius via sliders and color pickers
- **Photo Editing & History** — per-slot crop/rotation/zoom, customization presets, and collage undo/redo
- **Exact-Size Export** — PNG transparency or JPEG with quality controls and a white background; Web/Social/Print presets preserve layout aspect ratio
- **Offline Support** — installable PWA with service worker caching
- **Local Storage** — all data persists in IndexedDB; nothing sent to any server

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| UI Components | Radix UI + shadcn/ui |
| Animation | Framer Motion |
| Icons | @phosphor-icons/react |
| Export | html2canvas |
| State | @tanstack/react-query |
| Storage | Dexie.js (IndexedDB) |
| Toasts | sonner |
| Deployment | GitHub Pages |

---

## Project Structure

```
src/
├── components/
│   ├── ui/               # shadcn/ui base components
│   ├── UploadZone        # Drag-and-drop / file picker upload area
│   ├── PhotoThumbnail    # Individual photo preview with reorder support
│   ├── LayoutGallery     # Scrollable list of layout options
│   ├── LayoutOption      # Single layout thumbnail + selection state
│   ├── CollagePreview    # Live large-format collage preview
│   └── CustomizationControls  # Gap, background, border radius controls
├── lib/
│   ├── db.ts             # Dexie.js database (IndexedDB persistence)
│   ├── image-utils.ts    # Image loading, resizing, and processing helpers
│   ├── layouts.ts        # Layout definitions and photo-count mapping
│   ├── types.ts          # Shared TypeScript types
│   └── utils.ts          # General utility functions
└── hooks/
    ├── useCollageApi.ts   # React Query + Dexie state management
    └── use-mobile.ts      # Responsive breakpoint detection hook
```

---

## Getting Started

**Prerequisites:** Node.js 24 (pinned in `.nvmrc`) and npm. Use `nvm use` if you manage Node with nvm.

```bash
# Install dependencies
npm ci

# Start the development server
npm run dev
```

Other scripts:

```bash
npx tsc --noEmit       # Required explicit TypeScript check
npm run build          # Production build (uses tsc --noCheck, not a type check)
npm run preview        # Preview the production build locally
npm run lint           # Run ESLint
npm test               # Run Jest unit tests
npm run test:ui        # Run Playwright e2e tests
npm run test:production # Build + production PWA tests in Chromium/mobile emulation/WebKit
```

---

## Deployment

Pull requests are required to update `main`. CI runs lint, explicit TypeScript checking, unit tests, development-server UI tests, and production-preview browser tests. On `main`, all five jobs must succeed before CI calls the reusable `.github/workflows/deploy.yml` workflow. Deployment builds the exact revision checked, not a later moving branch tip. Failed or skipped required jobs block deployment.

To build for GitHub Pages manually:

```bash
npm ci
npx tsc --noEmit
npm run build
```

---

## Architecture Notes

All collage state lives in IndexedDB via Dexie.js; photos are stored as data URLs. React Query manages the cache through `useCollageApi`, and `localStorage` identifies the active session. Confirmed Clear All atomically removes that collage and its dependent records and creates a replacement. Clearing browser/site data can still erase saved work; persistence requests are best-effort, not a backup.

Export validates whole-pixel sizes before rendering: each dimension must be 1–8192px and total output must not exceed 40 megapixels. Print presets use a 300-DPI sizing assumption, not guaranteed printer settings. Export waits for image encoding and download initiation; errors remain retryable.

## Offline and browser support

- A first-ever visit requires a network connection. Wait for the production service worker to install and cache the app before relying on offline reload. The development server does not exercise this production lifecycle.
- Once installed, cached app assets support JPEG/PNG upload, saved-collage reload, local editing, and PNG/JPEG export offline. Browser storage must remain available.
- The large HEIC decoder is not precached. A first HEIC import offline may fail; existing photos stay intact and the failed file is reported. Previously loading it alone does not guarantee offline availability in every browser.
- Standard/Advanced positioning may need MediaPipe WASM/models from external CDNs. Their downloads are runtime-cached, but cache eviction or first use offline can make them unavailable. The app reports model-load failure and falls back to Standard/native detection or Basic positioning. Basic mode requires no model downloads. Photos are not uploaded to these services.
- A waiting service-worker update offers **Refresh Now** or **Dismiss**. Refresh updates the app without clearing the saved collage; schema changes still need separate migration coverage.
- Critical production journeys are tested in desktop Chromium, Chromium mobile emulation, and Playwright WebKit. This is not certification of all browsers, Safari versions, or physical mobile devices. Storage persistence and native face detection vary by browser.

For browser setup, test commands, update-test isolation, and CI artifacts, see [testing guidelines](docs/testing-guidelines.md). See [project overview](docs/project-overview.md) for current architecture.
