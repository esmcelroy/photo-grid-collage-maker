## Context

The current Playwright suite checks visible UI states after upload, but its upload steps target the hidden file input directly with `setInputFiles`. That validates file processing after selection, but it does not exercise the click-to-open file-picker path that real users hit through the upload label and overlay. Because of that gap, a local regression in the file-picker flow can slip through while the browser suite still passes.

The project already uses Playwright for critical journeys and currently runs only Chromium in automation. That is a reasonable default for this repo, but the suite needs stronger evidence output so developers and CI runs can prove that the application rendered correctly after the key upload journey.

## Goals / Non-Goals

**Goals:**
- Validate the real file-picker journey, not only hidden-input file assignment.
- Produce durable screenshot evidence for critical upload and preview flows.
- Keep CI pragmatic by requiring one maintained proof-producing browser path rather than full cross-browser coverage.
- Make the missed local upload regression reproducible and visible in automated UI validation.

**Non-Goals:**
- Adding mandatory cross-browser execution to every GitHub Actions run.
- Redesigning the upload UI or replacing Playwright with another test framework.
- Solving unrelated preview/layout issues outside the upload-proof workflow.

## Decisions

1. Use a file-chooser-driven upload helper for proof-critical journeys.
Rationale: Tests need to click the visible upload affordance, wait for the browser file chooser, and set files through that path so label/input wiring regressions are caught.
Alternative considered: Continue using direct `locator('input[type="file"]').setInputFiles(...)` everywhere. Rejected because it bypasses the real user trigger path and can hide file-picker failures.

2. Capture named screenshots at stable checkpoints in critical UI journeys.
Rationale: Screenshot artifacts give visual proof that upload, preview, and layout states rendered correctly and make failures easier to triage.
Alternative considered: Rely only on HTML reports and traces. Rejected because those artifacts are helpful for debugging but do not provide lightweight, explicit proof of expected rendered states.

3. Keep one primary CI browser project for proof generation.
Rationale: Chromium-only CI remains fast and aligned with the current setup while still producing credible evidence artifacts. Optional local runs can continue to expand coverage when needed.
Alternative considered: Require Chromium, Firefox, and WebKit on every CI run. Rejected because the user explicitly does not need every browser in GitHub Actions, and broader coverage would slow feedback without addressing the current blind spot.

4. Centralize proof flows in shared Playwright helpers or page objects.
Rationale: A shared helper for state reset, upload initiation, stable waits, and screenshot naming reduces drift across specs and keeps the proof workflow consistent.
Alternative considered: Duplicating upload and screenshot logic in each spec. Rejected due to maintenance risk and inconsistent evidence quality.

## Risks / Trade-offs

- [Risk] Screenshot assertions may become flaky if the UI is captured before image rendering settles. -> Mitigation: wait for stable preview selectors and deterministic fixture data before taking screenshots.
- [Risk] File chooser orchestration can be brittle if the clickable upload affordance changes. -> Mitigation: anchor helpers to accessible labels or roles and keep upload interactions in one reusable abstraction.
- [Risk] Proof artifacts can become noisy and large in CI. -> Mitigation: capture screenshots only for critical journeys and use predictable names/output folders.
- [Risk] Chromium-only CI may still miss browser-specific upload quirks. -> Mitigation: treat Chromium proof as the required baseline and leave room for optional local multi-browser validation when triaging browser-specific issues.

## Migration Plan

1. Add or update Playwright helpers/page objects so proof-critical upload tests use the visible upload trigger and `filechooser` events.
2. Introduce screenshot capture conventions for the critical journeys that prove upload, preview, and layout functionality.
3. Update targeted UI specs to use the shared flow and add coverage for the local file-picker regression.
4. Confirm CI retains a single proof-producing browser project and emits the evidence artifacts in the standard Playwright output.
5. Rollback strategy: if the proof flow causes instability, revert the helper/screenshot changes while preserving any isolated regression reproduction tests for further debugging.

## Open Questions

- Should screenshot proof be captured only on pass for designated smoke journeys, or on both pass and failure for every proof-critical spec?
- Do we want a dedicated proof-focused GitHub Actions job/artifact name, or should evidence remain attached to the default Playwright run output?
- Should drag-and-drop remain covered by separate tests, or should proof-critical upload validation require both drag-and-drop and file-picker for the same journey?