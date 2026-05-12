# Layout Strip UX — Design

## Architecture

### Current Layout (simplified)
```
<main grid lg:grid-cols-3>
  <div lg:col-span-2>         ← main content
    [Your Photos]
    [Preview + Collage]
  </div>
  <div>                        ← sidebar
    [Customization Controls]
    [Layout Options]           ← LayoutGallery HERE (tiny)
  </div>
</main>
```

### New Layout
```
<main grid lg:grid-cols-3>
  <div lg:col-span-2>         ← main content
    [Your Photos]
    [Preview + Collage]
    [Layout Strip]             ← LayoutGallery MOVED HERE (big)
  </div>
  <div>                        ← sidebar
    [Customization Controls]
  </div>
</main>
```

## Component Changes

### `App.tsx`
- Move `<LayoutGallery>` from sidebar `CollapsibleSection` to after `<CollagePreview>` inside the main col-span-2 div
- Remove the `CollapsibleSection` wrapper for layout options
- Keep all props and handlers unchanged

### `LayoutGallery.tsx` (major restyle)
Current: vertical scroll grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, `ScrollArea h-[400px]`)

New: horizontal scroll strip
- Replace ScrollArea with `overflow-x-auto` horizontal scroll container
- Tiles: `flex` row with `gap-3`, each tile `w-[130px] shrink-0`
- Platform filter pills: horizontal row above the strip (already horizontal)
- Toolbar buttons: same row as count/filters
- Optional scroll indicators (fade gradients on edges)

### `LayoutOption.tsx`
- Width changes from `w-full` (filling grid cell) to fixed `w-[130px]`
- Height: auto based on aspect ratio, or fixed `h-[100px]`
- Padding: keep `p-3` or reduce to `p-2` for compactness
- Grid gap inside the preview: keep `2px`

### Mobile Behavior
- Same horizontal strip — CSS overflow-x handles swipe natively
- No special mobile breakpoint needed; strip is naturally touch-scrollable
- Tile width might shrink to `w-[110px]` on small screens

## Visual Design
```
┌────────────────────────────────────────────────────────┐
│ 8 layouts  [All] [Instagram] [Facebook] ...   🔀 ⚡ ⊞ 🪄│
│ ┌──────┬──────┬──────┬──────┬──────┬──────┐      ◀ ▶ │
│ │      │      │  ★   │      │      │      │          │
│ │ 130w │ 130w │ 130w │ 130w │ 130w │ 130w │  scroll→ │
│ │      │      │      │      │      │      │          │
│ └──────┴──────┴──────┴──────┴──────┴──────┘          │
│  Two Row  Hero+Grid  Mixed   L-Shape  Mosaic  Grid   │
└────────────────────────────────────────────────────────┘
```

## Accessibility
- Horizontal scroll container: `role="listbox"`, `aria-label="Layout options"`
- Each tile: `role="option"`, `aria-selected` for current selection
- Keyboard: Left/Right arrow navigation between tiles
- Screen reader: layout names announced with selection state
- Focus management: selected tile receives focus on keyboard nav

## Testing Strategy
- Unit tests: LayoutGallery renders horizontal strip, correct tile count
- Unit tests: keyboard navigation (Left/Right arrows)
- Unit tests: scroll container properties
- E2E: verify layout selection works from new position
- Visual: verify tile size is readable on desktop and mobile
