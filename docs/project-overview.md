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
| Data Fetching | `@tanstack/react-query` — `useCollageApi` hook |
| Notifications | sonner (toast) |
| State | REST API + SQLite via `useCollageApi` hook |
| Backend | Express.js + TypeScript (`server/`) |
| Database | SQLite via `better-sqlite3` |

---

## Project Structure

```
src/
├── App.tsx                     # Root component; uses useCollageApi for all state
├── main.tsx                    # React entry point; QueryClientProvider wrapper
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
    ├── useCollageApi.ts        # React Query hook — all API calls + state
    └── use-mobile.ts           # Responsive breakpoint detection

server/
├── index.ts                    # Express app entry point (port 3001)
├── db.ts                       # SQLite singleton + schema migrations
├── types.ts                    # Serializable API types (ApiPhoto, CollageState)
├── routes/
│   └── collages.ts             # All 5 REST routes
├── tsconfig.json               # CommonJS TypeScript config for server
├── jest.config.js              # Separate Jest config for server tests
└── __tests__/
    └── collages.test.ts        # 20 Supertest integration tests
```

---

## Component Dependency Diagram

```
App.tsx  (state owner — useCollageApi hook)
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

## State Management (`src/hooks/useCollageApi.ts`)

State is managed via a React Query hook that communicates with the Express backend. A collage session ID is stored in `localStorage` and created on first load.

| Domain | API Call | React Query key |
|---|---|---|
| All state | `GET /api/collages/:id` | `['collage', sessionId]` |
| Add photo | `POST /api/collages/:id/photos` | invalidates query |
| Remove photo | `DELETE /api/collages/:id/photos/:photoId` | invalidates query |
| Update layout/positions | `PATCH /api/collages/:id` | sets query data directly |
| Update settings | `PATCH /api/collages/:id` | sets query data directly |

The hook exposes clean defaults (empty arrays, null, fallback settings) before the session loads — no defensive `|| []` patterns needed in components.

---

## Key Data Flow

```
1. Upload
   User drops files
     → handleFilesSelected()
     → fileToDataUrl() converts each File to a base64 dataUrl
     → POST /api/collages/:id/photos for each file

2. Layout selection
   Photo count changes
     → getLayoutsForPhotoCount(n) recalculates available layouts
     → first matching layout auto-selected
     → PATCH /api/collages/:id with { selectedLayoutId, photoPositions }

3. Preview render
   CollagePreview reads photoPositions + selectedLayout
     → renders CSS Grid with grid-template-areas
     → each cell displays the assigned photo

4. Customization
   CustomizationControls updates CollageSettings
     → PATCH /api/collages/:id with { settings }
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

## Backend API (`server/`)

Express.js + TypeScript server on port 3001. SQLite database via `better-sqlite3`.

### Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/collages` | Create new collage session → `{ id }` |
| `GET` | `/api/collages/:id` | Get full collage state |
| `PATCH` | `/api/collages/:id` | Update layout, positions, or settings |
| `POST` | `/api/collages/:id/photos` | Add a photo (base64 JSON body) |
| `DELETE` | `/api/collages/:id/photos/:photoId` | Remove a photo |

### Schema

```sql
collages(id, selected_layout_id, settings_json, created_at, updated_at)
photos(id, collage_id, data_url, file_name, created_at)
photo_positions(collage_id, photo_id, grid_area)
```

Start the backend: `npm run server:dev`  
Run API tests: `cd server && npx jest`

---

## Image Utilities (`src/lib/image-utils.ts`)

| Function | Description |
|---|---|
| `fileToDataUrl(file)` | Converts a `File` to a base64 data URL via `FileReader` |
| `generateUniqueId()` | Returns a unique string ID for a new photo |
| `downloadCollage(elementId)` | Runs html2canvas on a DOM element, triggers PNG download |
