# Photo Grid Collage Maker — Copilot Instructions

For frontend component conventions, styling, `useCollageApi` hook, layout authoring, and frontend test patterns, see [src.instructions.md](instructions/src.instructions.md).

---

## Architecture

This is a **fully client-side** application. All data persists in the browser via IndexedDB (Dexie.js). There is no backend server.

- **Storage**: Dexie.js → IndexedDB (`src/lib/db.ts`)
- **State**: React Query backed by Dexie query functions
- **Deployment**: GitHub Pages via GitHub Actions (static Vite build)
- **PWA**: Installable with service worker for offline support

## Storage Layer (`src/lib/db.ts`)

- `CollageDatabase` class extends `Dexie` with typed tables: `collages`, `photos`, `photoPositions`
- Exported query functions: `createCollage()`, `getCollageState()`, `updateCollage()`, `addPhoto()`, `removePhoto()`, `deleteCollage()`
- Photos stored as data URLs in IndexedDB
- Session ID stored in `localStorage` (`collage-session-id`)
- The adapter pattern allows future cloud sync without rewriting the hook layer

## ESM Jest Gotchas (all `*.test.ts/tsx` files)

| Gotcha | Rule |
|---|---|
| Jest globals not injected | Always `import { jest, describe, it, expect, beforeEach } from '@jest/globals'` |
| `jest.mock()` factory hoisting | No JSX or `React` references inside factories — return plain functions rendering `null` |
| Dexie module mocking | Use `jest.unstable_mockModule('@/lib/db', ...)` + dynamic `await import()` for both mock and module under test |
| Decorative `<img alt="">` | ARIA role is `"presentation"`, not `"img"` — use `container.querySelectorAll('img')` |
| Radix Slider in jsdom | `fireEvent.change` is ignored; use `fireEvent.keyDown(thumb, { key: 'ArrowRight' })` |
| Radix Popover portal | Content renders into `document.body`; use `await screen.findByLabelText(...)` after click |

## E2E Tests (`e2e/`)

- **Page Object Model**: `AppPage` (`e2e/pages/app.page.ts`) wraps all UI interactions and assertions — use it rather than inline Playwright locators
- **Image fixtures**: test images live in `e2e/fixtures/`; `AppPage.uploadViaHiddenInput()` resolves paths relative to that directory
- **File upload regression**: clicking `label[for="photo-upload"]` does not propagate to the hidden input — use `AppPage.uploadViaHiddenInput()` (direct `setInputFiles`) until fixed
- Playwright starts the Vite dev server only — no backend needed
- State clearing uses `page.evaluate()` to clear `localStorage` and IndexedDB