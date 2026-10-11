# Photo Grid Collage Maker — Agent Instructions

For frontend component conventions, styling, `useCollageApi` hook, layout authoring, and frontend test patterns, see [`.github/instructions/src.instructions.md`](.github/instructions/src.instructions.md).

---

## Architecture

This is a **fully client-side** application. All data persists in the browser via IndexedDB (Dexie.js). There is no backend server.

- **Storage**: Dexie.js → IndexedDB (`src/lib/db.ts`)
- **State**: React Query backed by Dexie query functions
- **Deployment**: GitHub Pages via GitHub Actions (static Vite build)
- **PWA**: Installable with service worker for offline support

## Storage Layer (`src/lib/db.ts`)

- `CollageDatabase` class extends `Dexie` with typed tables: `collages`, `photos`, `photoPositions`
- Query functions include `createCollage()`, `getCollageState()`, `updateCollage()`, `addPhoto()`, `removePhoto()`, `deleteCollage()`, and `replaceCollage()`
- Photos stored as data URLs in IndexedDB
- Session ID stored in `localStorage` (`collage-session-id`)
- Keep UI persistence behind `useCollageApi`; components must not introduce a parallel storage path
- Preserve explicit loading, initialization, read-error, and missing-session recovery states
- Enforce the photo limit atomically with insertion; confirmed Clear All atomically deletes the current collage and its dependent records and creates a replacement
- Upload batches report actual persisted successes and failures, not attempted file counts; keep overlapping uploads and stale-session completions guarded

## Editing and export contracts

- `MAX_PHOTOS` in `src/lib/types.ts` is the photo-limit source of truth (currently 16)
- Export options carry exact pixel dimensions. Validate with `src/lib/export-dimensions.ts` before rendering: each dimension ≤8192px and total size ≤40 megapixels
- Await image encoding and download initiation before reporting success. Null blobs must reject; keep failures retryable and prevent duplicate submissions while pending
- Export must preserve preview crop, rotation, zoom, radius, gaps, and PNG transparency/JPEG white background. html2canvas does not implement `object-fit`/`object-position`; retain the cloned-photo crop correction
- Smart analysis completion refreshes suggestions without retriggering analysis. Ignore stale photo/session/mode work and invalidate pending automatic positioning immediately when manual editing begins
- Manual edits take precedence; Smart Position off/on explicitly requests reapplication. Preserve worker-readiness gating and report positioning save failures

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
- Use `AppPage.uploadViaFileChooser()` to exercise the native picker; direct `uploadViaHiddenInput()` is useful for batch tests but does not prove the picker opens
- Use `AppPage.clearAll()` for the confirmed destructive flow, not a single Clear All click
- Playwright starts the Vite dev server only — no backend needed
- Chromium desktop and mobile emulation are configured in `playwright.config.ts`; mobile emulation is not physical-device or WebKit coverage
- Verify real downloads by decoding dimensions; compare asymmetric multi-photo exports against native preview rendering when changing export fidelity

## Accessibility Testing

- **jest-axe** is installed and configured in `src/__tests__/setup.ts` (`jest-axe/extend-expect`)
- **All new components must include a `toHaveNoViolations()` test** — see `docs/testing-guidelines.md` for patterns
- **Lighthouse Accessibility score must remain at 100** — run `npx lighthouse <url> --only-categories=accessibility` before merge
- User-uploaded photos use `alt=""` (decorative) — this is intentional per WCAG for visual composition tools
- State clearing uses `page.evaluate()` to clear `localStorage` and IndexedDB

## Build and safety

- Use the locked npm dependency graph: `npm ci`. The repository pins Node 24 in `.nvmrc`.
- Standard validation is `npm run lint`, `npx tsc --noEmit`, `npm test -- --runInBand`, and
  `npm run build`. Run `npm run test:ui` for user-flow or browser-storage changes.
- `npm run build` uses `tsc --noCheck`; it does not replace the explicit TypeScript check.
- Keep image processing and persistence client-side. Do not add photo uploads to a server, analytics, or network
  storage without an explicit product requirement and corresponding privacy review.
- Preserve the 1–16 image limit and avoid committing generated `dist/`, coverage, screenshots,
  Playwright reports, IndexedDB artifacts, or user photos.
- `.agents/setup` installs the pinned Node toolchain, locked dependencies, and Chromium for Debian orbs; do not run its system installer on macOS. `.agents/resume` is intentionally a no-op for this client-only app.
- GitHub requires pull requests to update `main`; push work to a feature/integration branch and do not bypass the rule or manually trigger deployment.
