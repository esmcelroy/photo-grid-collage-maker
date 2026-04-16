# Collage Maker

> Create beautiful photo grids in seconds.

Collage Maker is a browser-based tool for composing photo grid collages. Upload 1–9 photos, pick a layout, tweak spacing and style, and export a high-quality PNG — all without leaving the browser.

**Fully client-side** — no server required. Your photos never leave your device. Installable as a PWA for offline use.

---

## Features

- **Photo Upload & Management** — upload photos via file picker or drag-and-drop (up to 9 images)
- **Dynamic Layout Gallery** — 5–10 layout options that adapt to your photo count, with live thumbnails
- **Instant Preview** — large collage preview updates in real time as you make changes
- **Drag-and-Drop Reordering** — swap photo positions within the grid by dragging thumbnails
- **Customization Controls** — adjust gap/spacing, background color, and border radius via sliders and color pickers
- **High-Quality Export** — download the finished collage as a PNG via `html2canvas`
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

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Other scripts:

```bash
npm run build          # TypeScript check + production build
npm run preview        # Preview the production build locally
npm run lint           # Run ESLint
npm test               # Run Jest unit tests
npm run test:ui        # Run Playwright e2e tests
```

---

## Deployment

The app automatically deploys to GitHub Pages on push to `main` via the `.github/workflows/deploy.yml` workflow.

To build for GitHub Pages manually:

```bash
GITHUB_PAGES=true npm run build
```

---

## Architecture Notes

All state lives in the browser. Photos are stored as data URLs in IndexedDB via Dexie.js. React Query manages the cache layer, with Dexie as the persistence backend. The storage layer uses an adapter pattern, so cloud sync could be added in the future without rewriting the UI layer.
