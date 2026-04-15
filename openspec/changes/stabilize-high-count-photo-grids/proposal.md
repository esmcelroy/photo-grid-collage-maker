## Why

Grid rendering and placement behavior becomes unreliable when more than three photos are uploaded, which breaks a core user flow for collage creation. We need explicit behavior requirements and automated UI coverage so high-count layouts stay stable as features evolve.

## What Changes

- Define and enforce stable preview behavior for high photo counts, including correct grid layout rendering and photo placement after uploads.
- Add acceptance criteria for supported maximum counts and graceful handling when counts exceed current supported layouts.
- Add UI end-to-end test coverage across representative photo counts and layout selections, including boundary scenarios near maximum capacity.
- Align current implementation and layout-selection logic with the updated behavior requirements.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- collage: strengthen layout rendering, selection, and high-count upload behavior requirements; add explicit testable scenarios for upper-bound photo counts.

## Impact

- Affected code: layout filtering and selection logic, collage preview rendering, and upload boundary handling in React components and layout utilities.
- Affected tests: Playwright UI journey coverage for multi-photo grids and edge counts.
- No external API changes expected.
