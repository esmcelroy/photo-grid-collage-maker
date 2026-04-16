---
description: "Use when working on src"
applyTo: "src/**"
---

# src/ Area Instructions

Applies to: `src/**`

For project overview, commands, data model, API routes, and TDD workflow, see [AGENTS.md](../../AGENTS.md).

---

## Module Conventions

- All imports within `src/` use the `@/` alias (maps to `src/`): `import { cn } from '@/lib/utils'`
- All components use **named exports** — never default-export components
- Props interfaces are declared inline above the function: `interface FooProps { ... }`
- `src/main.tsx` and `src/ErrorFallback.tsx` are infrastructure files — do not add feature logic there

## Component Authoring

| Concern | Convention |
|---|---|
| Conditional classes | Always use `cn()` from `@/lib/utils` (clsx + tailwind-merge) |
| Icons | `@phosphor-icons/react` — always pass `weight` prop (e.g. `weight="duotone"`) |
| Animations | Framer Motion `motion.*` + `AnimatePresence`; stagger with `transition={{ delay: index * 0.05 }}` |
| Radix / shadcn | Use primitives from `src/components/ui/` — **never edit those files directly** |
| Toasts | `import { toast } from 'sonner'` — use `toast.success/error/info` for user feedback |

## Styling

- Tailwind CSS v4 — use design-token classes (`bg-background`, `text-foreground`, `bg-muted`, `border-border`, etc.)
- Brand colors use `oklch` directly in `style={}` props when a Tailwind class is insufficient
- Background colors can be `'transparent'` (the string) — check before applying padding

## `useCollageApi` Hook

- Single source of truth for all collage state — backed by Dexie.js (IndexedDB)
- `collageId` comes from `localStorage` (`'collage-session-id'`); absence means no session
- Default settings returned when no session: `{ gap: 8, backgroundColor: 'transparent', borderRadius: 0 }`
- `clearAll()` creates a **new session** (does not individually delete photos)
- Settings changes from UI should be debounced (~300 ms) before calling `updateSettings`
- `QueryClient` is configured with `staleTime: 0` — always refetches on mount
- All mutations call functions from `@/lib/db` (not `fetch`)

## `src/lib/layouts.ts`

- Layout IDs follow the convention `{photoCount}-{descriptor}` (e.g. `'3-left-stack'`)
- `gridTemplate` format: `cols` (columns only) OR `rows / cols` (slash-separated)
  - `parseTemplate` in `CollagePreview.tsx` splits on `/` — keep this format consistent
- `areas` items are CSS grid-area name strings; multi-cell spans repeat the letter (e.g. `'a a b'`)
- When adding a new layout, add it to `GRID_LAYOUTS` in the correct `photoCount` group

## `UploadedPhoto.file`

`UploadedPhoto.file` is a **synthetic** `File` reconstructed from the API response (empty blob + `fileName`). It carries the filename for display only — do not use it for actual file content.

---

## Frontend Testing (`src/**/*.test.ts/tsx`)

Tests live **co-located** next to source files (e.g. `CollagePreview.test.tsx` beside `CollagePreview.tsx`). Non-component tests in `src/lib/` and `src/hooks/` follow the same pattern.

### Test Setup

- `src/__tests__/setup.ts` runs before all tests — imports `@testing-library/jest-dom` and polyfills `ResizeObserver`
- Real image fixtures live in `src/__tests__/fixtures/` (`.jpg` files for integration-style tests)

### RTL Patterns

```tsx
// Prefer container queries for structural/DOM assertions
const grid = container.querySelector('[style*="grid-template"]') as HTMLElement

// Use screen queries only for accessible elements (text, roles)
screen.getByText('Upload Photos')
```

- Images in the collage preview use `alt=""` (decorative) — query via `container.querySelectorAll('img')`
- Use factory functions to produce fresh fixtures per test (avoids cross-test mutation):
  ```ts
  const makePositions = (): PhotoPosition[] => [
    { photoId: 'p1', gridArea: 'a' },
    { photoId: 'p2', gridArea: 'b' },
  ]
  ```

### Hook Tests

- Always create a fresh `QueryClient` per test to prevent cache pollution
- Wrap the hook under test with `QueryClientProvider`:
  ```tsx
  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return { wrapper: Wrapper, queryClient }
  }
  ```
- Mock `@/lib/db` with `jest.unstable_mockModule('@/lib/db', ...)` — must dynamically import both the mock and the module under test after registration

### Coverage Exclusions

These files are explicitly excluded from Jest coverage thresholds (80% required elsewhere):

| Path | Reason |
|---|---|
| `src/components/ui/**` | Generated shadcn components |
| `src/App.tsx` | Integration component — covered by Playwright |
| `src/ErrorFallback.tsx` | Uses `import.meta.env` (Vite-only API) |
| `src/main.tsx` | Entry point |
| `src/vite-end.d.ts`, `*.css` | Non-JS assets |
