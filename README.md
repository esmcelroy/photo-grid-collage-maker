# Collage Maker

> Create beautiful photo grids in seconds.

Collage Maker is a browser-based tool for composing photo grid collages. Upload 1–9 photos, pick a layout, tweak spacing and style, and export a high-quality PNG — all without leaving the browser.

---

## Features

- **Photo Upload & Management** — upload photos via file picker or drag-and-drop (up to 9 images)
- **Dynamic Layout Gallery** — 5–10 layout options that adapt to your photo count, with live thumbnails
- **Instant Preview** — large collage preview updates in real time as you make changes
- **Drag-and-Drop Reordering** — swap photo positions within the grid by dragging thumbnails
- **Customization Controls** — adjust gap/spacing, background color, and border radius via sliders and color pickers
- **High-Quality Export** — download the finished collage as a PNG via `html2canvas`

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
| Data Fetching | @tanstack/react-query |
| Toasts | sonner |
| State Persistence | `@github/spark` `useKV` *(temporary — see Development Notes)* |

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
│   ├── image-utils.ts    # Image loading, resizing, and processing helpers
│   ├── layouts.ts        # Layout definitions and photo-count mapping
│   ├── types.ts          # Shared TypeScript types
│   └── utils.ts          # General utility functions
└── hooks/
    └── use-mobile.ts     # Responsive breakpoint detection hook
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
npm run build      # TypeScript check + production build
npm run preview    # Preview the production build locally
npm run lint       # Run ESLint
```

---

## Development Notes

**Current phase:** Initial wireframing with active feature buildout.

**State persistence:** Photo data, layout selections, and settings are currently stored using the `@github/spark` `useKV` hook. This is a temporary solution for early development. Migration to a proper backend storage layer is planned as the project matures.
