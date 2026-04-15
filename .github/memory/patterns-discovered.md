# Patterns Discovered

Accumulated code patterns, idioms, and architectural decisions discovered during development. AI assistants should apply these patterns consistently.

---

## Pattern Template

### Pattern: [Name]
- **Context**: Where/when this pattern applies
- **Problem**: What issue this pattern solves
- **Solution**: The preferred approach
- **Example**:
  ```typescript
  // Example code
  ```
- **Related Files**: Files where this pattern is used

---

## Patterns

### Pattern: Service Array Initialization
- **Context**: Initializing arrays in service classes, hooks, and state management
- **Problem**: Using `null` for uninitialized arrays causes `Cannot read property of null` errors and requires null checks everywhere
- **Solution**: Always initialize arrays as `[]` (empty array), never `null`. This allows safe `.map()`, `.filter()`, `.length` access without guards.
- **Example**:
  ```typescript
  // ❌ Avoid
  const [photos, setPhotos] = useKV<UploadedPhoto[] | null>('collage-photos', null)
  const count = photos?.length ?? 0 // requires null guard

  // ✅ Preferred
  const [photos, setPhotos] = useKV<UploadedPhoto[]>('collage-photos', [])
  const count = photos.length // safe direct access
  ```
- **Related Files**: `src/App.tsx` (photos, photoPositions, settings state)

---

### Pattern: KV State Defensive Access
- **Context**: Reading state from `useKV` hooks in App.tsx
- **Problem**: `useKV` can return `undefined` on first render before the store initializes
- **Solution**: Use `|| []` or `|| defaultValue` when reading KV state to ensure a defined value
- **Example**:
  ```typescript
  const [photos] = useKV<UploadedPhoto[]>('collage-photos', [])
  const currentPhotos = photos || [] // defensive fallback
  ```
- **Related Files**: `src/App.tsx`

---

### Pattern: ESM Jest — Import `jest` from `@jest/globals`
- **Context**: All test files in this project (ESM mode via `preset: 'ts-jest/presets/default-esm'`)
- **Problem**: `jest.fn()`, `jest.mock()` etc. are not auto-injected as globals in ESM mode — they silently resolve to `undefined`, causing cryptic failures
- **Solution**: Always explicitly import from `@jest/globals` at the top of every test file
- **Example**:
  ```typescript
  import { jest, describe, it, expect, beforeEach } from '@jest/globals'
  ```
- **Related Files**: All `*.test.ts` / `*.test.tsx` files

---

### Pattern: `jest.mock()` Factory — No JSX or React References
- **Context**: Mocking React component modules with `jest.mock()` in ESM test files
- **Problem**: `jest.mock()` factories are hoisted above `import React`, so any JSX or `React.createElement()` inside the factory will fail with `React is not defined`
- **Solution**: Return plain functions that render `null` without using JSX or importing React:
  ```typescript
  jest.mock('framer-motion', () => ({
    motion: { div: ({ children, ...p }: any) => children },
    AnimatePresence: ({ children }: any) => children,
  }))
  // NOT: motion: { div: ({ children }) => <div>{children}</div> }  ← breaks
  ```
- **Related Files**: `src/components/PhotoThumbnail.test.tsx`

---

### Pattern: Decorative Images Use `querySelectorAll`, Not `getAllByRole('img')`
- **Context**: Testing components with `<img alt="">` (decorative images)
- **Problem**: `<img alt="">` has the ARIA role `"presentation"`, not `"img"`. `getAllByRole('img')` won't find them.
- **Solution**: Use `container.querySelectorAll('img')` when images are intentionally decorative (alt="")
- **Example**:
  ```typescript
  const imgs = container.querySelectorAll('img')
  expect(imgs).toHaveLength(2)
  ```
- **Related Files**: `src/components/CollagePreview.test.tsx`

---

### Pattern: Radix UI Slider — Test Via Keyboard Events
- **Context**: Testing Radix UI `<Slider>` components in jsdom
- **Problem**: Radix Slider doesn't respond to `fireEvent.change` or `userEvent.type`. Mocking it requires JSX in jest.mock (which fails in ESM mode).
- **Solution**: Interact with the real Slider via ARIA keyboard events — `fireEvent.keyDown(thumb, { key: 'ArrowRight' })` increments the value and fires `onValueChange`
- **Example**:
  ```typescript
  const thumb = container.querySelector('[role="slider"]') as HTMLElement
  fireEvent.keyDown(thumb, { key: 'ArrowRight' })
  expect(onSettingsChange).toHaveBeenCalled()
  ```
- **Related Files**: `src/components/CustomizationControls.test.tsx`

---

### Pattern: Radix UI Popover — Opens via `userEvent.click`, Content in Portal
- **Context**: Testing Radix `<Popover>` in jsdom
- **Problem**: Popover content renders into a portal (`document.body`) not inside the component's DOM tree
- **Solution**: Use `await user.click(trigger)` then `await screen.findByLabelText(...)` (async, searches full document)
- **Example**:
  ```typescript
  const user = userEvent.setup()
  await user.click(screen.getByText(/custom color/i))
  const colorInput = await screen.findByLabelText(/pick a custom color/i)
  ```
- **Related Files**: `src/components/CustomizationControls.test.tsx`

---

### Pattern: Playwright + Spark KV — Reset State in `beforeEach`
- **Context**: Playwright E2E tests for apps using `@github/spark` `useKV`
- **Problem**: `useKV` persists to `/_spark/kv` via HTTP. Tests that depend on empty state fail if a prior test session left photos in KV.
- **Solution**: Add a `beforeEach` that DELETEs the relevant KV keys using `page.request.delete()`
- **Example**:
  ```typescript
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.request.delete('/_spark/kv/collage-photos').catch(() => {})
    await page.request.delete('/_spark/kv/selected-layout').catch(() => {})
    await page.request.delete('/_spark/kv/photo-positions').catch(() => {})
    await page.reload()
  })
  ```
- **Related Files**: `e2e/` specs

---

### Pattern: macOS + Spark Vite Plugin — Always Override Port 5000
- **Context**: Running `npm run dev` or Playwright `webServer` on macOS Monterey+
- **Problem**: `sparkPlugin()` defaults to `server.port: 5000`. macOS Monterey+ reserves port 5000 for AirPlay Receiver. Playwright's `reuseExistingServer` sees port 5000 responding (AirPlay's 403) and never launches Vite.
- **Solution**: Always pass an explicit port to `sparkPlugin()` in `vite.config.ts` and mirror it in `playwright.config.ts`
- **Example**:
  ```typescript
  // vite.config.ts
  sparkPlugin({ port: 5173 })
  // playwright.config.ts
  baseURL: 'http://localhost:5173'
  webServer: { url: 'http://localhost:5173', command: 'npm run dev -- --port 5173' }
  ```
- **Related Files**: `vite.config.ts`, `playwright.config.ts`
