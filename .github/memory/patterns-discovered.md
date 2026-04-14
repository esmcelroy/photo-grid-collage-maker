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
