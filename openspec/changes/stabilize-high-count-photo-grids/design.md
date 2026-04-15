## Context

The collage builder currently supports up to 9 photos, but grid behavior degrades when counts exceed three photos. The instability appears in the interaction between photo uploads, layout filtering by photo count, automatic layout selection, and preview position initialization. The project already uses layered testing (unit/integration/UI), and this change needs strong UI-level coverage to prevent regressions in high-count scenarios.

## Goals / Non-Goals

**Goals:**
- Make layout filtering and auto-selection deterministic for all supported counts.
- Ensure preview photo assignments remain complete and non-overlapping for 4 to 9 photos (and 10 to 12 when layout definitions exist).
- Add automated UI tests for representative and boundary counts, including over-limit behavior.
- Keep existing UX intact for low-count scenarios.

**Non-Goals:**
- Full redesign of layout definitions or generation strategy.
- Backend/state-layer migration away from the current storage mechanism.
- New download/export formats beyond existing PNG export.

## Decisions

1. Normalize count-to-layout resolution in one place.
Rationale: A single source for filtering supported layouts by photo count reduces drift between gallery and preview behavior.
Alternative considered: Keeping count checks distributed in multiple components. Rejected due to higher regression risk.

2. Re-initialize positions whenever selected layout or effective photo count changes.
Rationale: High-count failures are often stale-assignment issues. Explicit re-initialization guarantees complete mapping from photos to grid areas.
Alternative considered: Incremental in-place mutation of existing positions. Rejected because edge transitions (for example 3 to 4, 6 to 9) are error-prone.

3. Add Playwright UI tests for representative counts and boundary conditions.
Rationale: Grid correctness and visual assignment issues are best caught through real browser behavior and DOM-level assertions.
Alternative considered: Unit tests only for layout helpers. Rejected as insufficient for drag/drop, render, and gallery integration behaviors.

4. Treat 10 to 12 as configuration-dependent extension, not default behavior.
Rationale: Current baseline is 9. The design remains forward-compatible by validating extended counts only when matching layouts are configured.
Alternative considered: Immediate hard increase of default maximum to 12. Rejected until layout inventory and UX are explicitly approved.

## Risks / Trade-offs

- [Risk] UI tests may become flaky due to asynchronous image loading and rendering timing. -> Mitigation: Use deterministic fixtures, explicit waits on stable DOM states, and avoid timing-only assertions.
- [Risk] Re-initializing positions can reset user arrangement after count transitions. -> Mitigation: Restrict re-initialization to invalid-layout or count-change transitions and preserve mapping when layout remains valid.
- [Risk] Hidden gaps in layout definitions for certain counts can cause empty gallery states. -> Mitigation: Add defensive checks and tests that assert at least one layout for each supported count.

## Migration Plan

1. Add/adjust tests first:
   - Unit/integration tests for layout filtering and position initialization behavior.
   - Playwright tests for 1, 3, 4, 6, and 9 photos, plus over-limit rejection.
2. Implement deterministic count/layout resolution and robust re-initialization in app state flow.
3. Verify no regressions in existing low-count behavior and export flow.
4. If extended layouts (10 to 12) are introduced, enable and validate with the same UI scenarios.
5. Rollback strategy: revert high-count selection/initialization changes behind a single commit if regressions appear.

## Open Questions

- Should the product requirement officially move the default maximum from 9 to 12, or remain 9 with extension support?
- For over-limit attempts, should the UI show an explicit error/toast message in addition to rejecting files?
- Do we require drag-to-swap validation for each representative high-count scenario, or only one high-count smoke case?
