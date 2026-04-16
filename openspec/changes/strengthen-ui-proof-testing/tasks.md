## 1. Reproduce the missed upload regression

- [x] 1.1 Add a failing Playwright scenario that activates the visible upload control, uses the browser file chooser, and reproduces the local file-picker upload failure.
- [x] 1.2 Confirm the regression is not caught by the current hidden-input upload approach and document the gap in the test implementation notes.
- [ ] 1.3 Add or update deterministic upload fixtures so the file-picker proof scenario is stable locally and in CI.

## 2. Build shared proof-testing primitives

- [x] 2.1 Add a shared Playwright helper or page-object method that resets app state, triggers the visible upload affordance, and completes file selection through the browser file chooser.
- [x] 2.2 Add stable wait helpers for upload completion and preview readiness before assertions or screenshot capture.
- [x] 2.3 Add a screenshot helper or convention that writes named proof artifacts for critical UI checkpoints.

## 3. Strengthen critical UI journeys

- [x] 3.1 Update upload-and-preview coverage to use the shared file-picker flow instead of direct hidden-input assignment for proof-critical paths.
- [x] 3.2 Add assertions that verify upload completion, layout readiness, and preview rendering after file-picker uploads.
- [x] 3.3 Add or update a boundary test that proves uploads above 9 photos are rejected without mutating the existing collage state.

## 4. Keep CI proof pragmatic and inspectable

- [x] 4.1 Configure Playwright output so critical proof runs retain screenshots and existing debugging artifacts in a predictable location.
- [x] 4.2 Keep the default GitHub Actions proof path scoped to one maintained browser project while preserving optional local expansion.
- [x] 4.3 Update any workflow or test documentation needed to explain how developers review screenshot proof locally and in CI.

## 5. Verify and prepare for apply

- [ ] 5.1 Run the targeted Playwright proof scenarios locally to confirm the file-picker path passes and produces screenshot evidence.
- [ ] 5.2 Run the broader relevant UI suite to ensure existing upload, layout, and preview coverage still passes with the shared helpers.
- [ ] 5.3 Capture any remaining open issues or follow-up work if browser-specific upload quirks remain outside the default CI proof scope.