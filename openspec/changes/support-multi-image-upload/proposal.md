## Why

The current upload flow is optimized for one-at-a-time selection and does not provide strong guarantees for batch selection behavior across picker, drag-and-drop, and rapid repeat actions. As users increasingly build larger collages, reliable multi-image upload behavior is now a core usability requirement.

## What Changes

- Define explicit requirements for selecting and ingesting multiple images in one action from file picker and drag-and-drop.
- Define consistent client-side validation and rejection behavior for mixed-validity batches (some valid files, some invalid files).
- Define deterministic ordering, duplicate-handling, and max-photo-limit behavior when adding many images at once.
- Define user-facing feedback requirements for successful and rejected files in batch uploads.
- Add proof-oriented test requirements to validate multi-image upload behavior through unit/integration and UI flows.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `collage`: Expand upload and photo-management requirements to explicitly support robust multi-image upload semantics and verification expectations.

## Impact

- Affected frontend areas: `src/components/UploadZone.tsx`, `src/App.tsx`, and related photo list/preview update paths.
- Affected shared utilities and validation paths in `src/lib/` for file-type checks, duplicate detection, and capacity enforcement.
- Affected tests in component/unit suites and Playwright flows (`src/components/*.test.tsx`, `e2e/*.spec.ts`).
- No external API contract changes expected; primary impact is UI behavior and test coverage guarantees.
