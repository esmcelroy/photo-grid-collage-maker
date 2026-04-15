## 1. Reproduce and Lock In Failures

- [ ] 1.1 Add failing unit/integration tests for layout filtering and auto-selection when photo counts move above three.
- [ ] 1.2 Add failing tests for photo-position initialization to ensure complete, one-to-one area assignments at 4, 6, and 9 photos.
- [ ] 1.3 Confirm current regression by running the targeted test set and documenting failure cases.

## 2. Stabilize Count-to-Layout Resolution

- [ ] 2.1 Refactor layout resolution into a single deterministic path used by both gallery and preview flows.
- [ ] 2.2 Ensure count transitions (for example 3 to 4 and 6 to 9) auto-select a valid layout when the current one is invalid.
- [ ] 2.3 Ensure photo-position mappings are reinitialized only when required and remain complete for all supported counts.

## 3. Validate Boundaries and Optional Extension

- [ ] 3.1 Enforce supported maximum count behavior with acceptance tests for both in-range and over-limit uploads.
- [ ] 3.2 Keep default maximum at 9 while making behavior compatible with optional 10 to 12 layouts when configured.
- [ ] 3.3 Add safeguards so supported counts never produce an empty layout gallery.

## 4. Add UI End-to-End Coverage

- [ ] 4.1 Create Playwright scenarios for 1, 3, 4, 6, and 9 photo uploads that verify layout availability and stable preview rendering.
- [ ] 4.2 Add a Playwright boundary scenario that verifies upload rejection above the supported maximum.
- [ ] 4.3 If extended layouts exist, add Playwright coverage for at least one 10 to 12 photo path.

## 5. Verify and Prepare for Apply

- [ ] 5.1 Run lint and all relevant unit/integration tests to ensure no regressions.
- [ ] 5.2 Run Playwright suite for the new grid scenarios and stabilize any flaky assertions.
- [ ] 5.3 Update workflow notes if behavior or support limits change from current defaults.
