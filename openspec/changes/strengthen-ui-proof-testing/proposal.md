## Why

The current UI test suite verifies a few happy paths but does not produce durable proof that core browser workflows actually work. A local regression where photo uploads fail through the file picker should have been caught earlier, which means the current testing strategy is not covering the real user path strongly enough.

## What Changes

- Strengthen end-to-end coverage around photo upload and preview flows so file-picker uploads, not just DOM state changes, are validated as a first-class user journey.
- Require screenshot artifacts for critical UI journeys so test runs provide visual proof that the application rendered and behaved correctly.
- Define a pragmatic CI execution strategy that keeps one proof-producing browser path in automation without requiring full cross-browser execution for every GitHub Actions run.
- Add acceptance criteria for investigating and preventing regressions where local file-picker uploads fail while existing tests still pass.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `collage`: tighten upload and preview requirements so critical UI flows must be validated end-to-end with evidence-producing tests, including file-picker upload behavior and screenshot capture for proof.

## Impact

- Affected code: Playwright configuration, end-to-end specs, test fixtures/helpers, and upload-related UI flow coverage.
- Affected systems: local developer validation flow and GitHub Actions evidence collection for UI proof.
- No public API changes expected.