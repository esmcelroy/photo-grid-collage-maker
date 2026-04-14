# Photo Grid Collage Maker — Project Overview

> **Audience**: AI assistants and developers working on this codebase.  
> **Purpose**: Architecture, tech stack, and structural reference.

---

## App Purpose

A browser-based photo collage maker. Users upload 1–9 photos, choose from dynamically generated grid layouts, customize spacing and background color, and export the result as a PNG.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite (`vite.config.ts`) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Component Primitives | Radix UI (accordion, dialog, dropdown, popover, slider, tabs, etc.) |
| Component Wrappers | shadcn/ui — `src/components/ui/` |
| Animations | Framer Motion |
| Icons | `@phosphor-icons/react` |
| PNG Export | html2canvas |
| Data Fetching | `@tanstack/react-query` (available, not yet used heavily) |
| Notifications | sonner (toast) |
| State | `@github/spark` `useKV` hook (KV store) |

---

## Project Structure

```
src/
├── App.tsx                     # Root component; owns all state via useKV
├── main.tsx                    # React entry point
├── components/
│   ├── UploadZone.tsx          # Drag-and-drop + file picker (max 9 photos)
│   ├── PhotoThumbnail.tsx      # Thumbnail with remove button (Framer Motion)
│   ├── LayoutGallery.tsx       # Scrollable gallery of layout options
│   ├── LayoutOption.tsx        # Individual layout thumbnail preview
│   ├── CollagePreview.tsx      # Main preview; CSS Grid + drag-to-swap
│   ├── CustomizationControls.tsx # Gap/border-radius sliders + bg color picker
│   └── ui/                     # shadcn/ui wrappers (button, card, slider, etc.)
├── lib/
│   ├── types.ts                # Core TypeScript interfaces
│   ├── layouts.ts              # GRID_LAYOUTS array + getLayoutsForPhotoCount()
│   ├── image-utils.ts          # fileToDataUrl, generateUniqueId, downloadCollage
│   └── utils.ts                # cn() Tailwind merge helper
└── hooks/
    └── use-mobile.ts           # Responsive breakpoint detection
```

---

## Component Dependency Diagram

```
App.tsx  (state owner — 4 useKV keys)
│
├── UploadZone.tsx
│       └── PhotoThumbnail.tsx
│
├── LayoutGallery.tsx
│       └── LayoutOption.tsx
│
├── CollagePreview.tsx
│       └── [CSS Grid cells — photos mapped to grid-template-areas]
│
└── CustomizationControls.tsx
        └── ui/slider, ui/popover, ui/button, ...

lib/
  layouts.ts ←── LayoutGallery, App (auto-select on photo count change)
  image-utils.ts ←── App (upload), CollagePreview (download)
  types.ts ←── all components
  utils.ts ←── all components (cn helper)
```

---

## Core Types (`src/lib/types.ts`)

```ts
UploadedPhoto     // id, dataUrl, fileName, fileSize
PhotoPosition     // photoId, gridArea
GridLayout        // id, name, photoCount, gridTemplateAreas, gridTemplateColumns, gridTemplateRows
CollageSettings   // gap (px), borderRadius (px), backgroundColor (hex)
CollageState      // photos, selectedLayoutId, photoPositions, settings
```

---

## State Management (`App.tsx`)

State is held in four `@github/spark` `useKV` keys:

| Key | Type | Description |
|---|---|---|
| `'collage-photos'` | `UploadedPhoto[]` | All uploaded photos |
| `'selected-layout'` | `string \| null` | ID of the active layout |
| `'photo-positions'` | `PhotoPosition[]` | Photo-to-grid-area assignments |
| `'collage-settings'` | `CollageSettings` | Gap, border-radius, background color |

**Defensive access pattern** used throughout (KV values may be `undefined` on first load):

```ts
const currentPhotos = photos || [];
```

---

## Key Data Flow

```
1. Upload
   User drops files
     → handleFilesSelected()
     → fileToDataUrl() converts each File to a base64 dataUrl
     → stored in 'collage-photos' KV key

2. Layout selection
   Photo count changes
     → getLayoutsForPhotoCount(n) recalculates available layouts
     → first matching layout auto-selected
     → initializePhotoPositions() maps each photo to a named grid area

3. Preview render
   CollagePreview reads photoPositions + selectedLayout
     → renders CSS Grid with grid-template-areas
     → each cell displays the assigned photo

4. Customization
   CustomizationControls updates CollageSettings
     → gap, borderRadius, backgroundColor applied inline to the grid

5. Export
   User clicks Download
     → downloadCollage() calls html2canvas on the preview <div>
     → triggers browser download of the resulting PNG
```

---

## Layout System (`src/lib/layouts.ts`)

Layouts are defined as static objects in the `GRID_LAYOUTS` array:

```ts
{
  id: 'grid-2-equal',
  name: 'Side by Side',
  photoCount: 2,
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr',
  gridTemplateAreas: '"photo1 photo2"'
}
```

`getLayoutsForPhotoCount(n)` filters `GRID_LAYOUTS` by `photoCount === n`, returning all valid layout options for the current upload count.

---

## Planned Architecture (Backend Hardening Phase)

The current `useKV` state layer is a planned migration target:

| Concern | Current | Planned |
|---|---|---|
| Photo storage | base64 dataUrls in KV | Server-side (S3 or similar) |
| Collage state | `useKV` browser KV | REST API + database |
| State access | `@github/spark` hooks | Standard `fetch` / React Query |

**Frontend components are designed to remain unchanged** — only the state/data layer will be swapped out.

---

## Image Utilities (`src/lib/image-utils.ts`)

| Function | Description |
|---|---|
| `fileToDataUrl(file)` | Converts a `File` to a base64 data URL via `FileReader` |
| `generateUniqueId()` | Returns a unique string ID for a new photo |
| `downloadCollage(elementId)` | Runs html2canvas on a DOM element, triggers PNG download |
