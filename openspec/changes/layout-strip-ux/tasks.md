# Layout Strip UX — Tasks

## Task 1: Restyle LayoutGallery to horizontal strip
**Files**: `src/components/LayoutGallery.tsx`
- Replace `ScrollArea h-[400px]` + vertical grid with horizontal flex scroll container
- Change grid from `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` to `flex gap-3 overflow-x-auto`
- Add fade gradient indicators on scroll edges
- Keep toolbar (count, shuffle, auto-layout, compare, carousel buttons) + platform filters
- Consolidate toolbar and filters into a single header row

**Tests**:
- Renders horizontal scroll container (overflow-x-auto)
- All layout tiles rendered in a single row
- Toolbar buttons present and functional
- Platform filter works

## Task 2: Update LayoutOption for strip sizing
**Files**: `src/components/LayoutOption.tsx`
- Change from `w-full` to fixed `w-[130px] shrink-0`
- Adjust height to maintain aspect ratio or fixed height
- Keep all existing functionality (recommended badge, selected indicator, photo thumbnails)

**Tests**:
- Renders with correct fixed width
- Selected/recommended states still work
- Photo thumbnails display correctly

## Task 3: Move LayoutGallery in App.tsx
**Files**: `src/App.tsx`
- Move `<LayoutGallery>` from sidebar CollapsibleSection to after `<CollagePreview>` in the col-span-2 div
- Remove the Layout Options CollapsibleSection wrapper
- Wrap in a Card with appropriate padding
- Keep ArrangementCarousel and ComparePanel above the collage (they're contextual overlays)

**Tests**:
- Existing E2E tests pass (layout selection still works)
- Layout strip appears below preview

## Task 4: Keyboard navigation
**Files**: `src/components/LayoutGallery.tsx`
- Add Left/Right arrow key navigation between layout tiles
- Add `role="listbox"` to container, `role="option"` to tiles
- Auto-scroll focused tile into view

**Tests**:
- Left/Right arrow navigates between tiles
- ARIA roles present
- Selected tile scrolls into view
