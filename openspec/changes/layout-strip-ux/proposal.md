# Layout Strip UX — Bottom-Anchored Layout Selection

## Problem

Layout option previews in the sidebar are too small (~70px wide) to meaningfully distinguish between layouts. The 4-column grid in a 1/3-width sidebar makes individual grid cells ~15px. Users must scroll between the layout gallery (sidebar) and the collage preview (main area) to evaluate choices — a scroll-select-scroll-check loop.

## Proposal

Move the LayoutGallery from the right sidebar into the main content area, positioned directly below the CollagePreview. Restyle from a vertical 4-column scroll grid to a horizontal scroll strip with ~130px-wide tiles. This:

1. **Doubles preview size** — full col-span-2 width instead of 1/3 sidebar
2. **Eliminates scroll loop** — layouts sit right below the preview, click-and-see
3. **Works on mobile** — natural horizontal swipe instead of vertical scroll
4. **Consolidates controls** — filter pills, shuffle, compare, arrange, auto-layout all in one strip

## Scope

- Move LayoutGallery from sidebar CollapsibleSection to below CollagePreview in the main column
- Restyle LayoutGallery: horizontal scrollable strip, larger tiles (~130px)
- Keep all existing functionality: platform filters, shuffle, compare, auto-layout, arrangement carousel
- Mobile: same horizontal strip, touch-swipeable
- No changes to layout data, scoring, or selection logic

## Non-Goals

- Changing the layout scoring system
- Adding new layout templates
- Modifying the CollagePreview component itself
- Hover-to-preview behavior (future enhancement)
