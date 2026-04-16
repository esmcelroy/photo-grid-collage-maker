# Screenshot Proof Testing Guide

## Overview

The photo collage maker now includes **proof-critical UI tests** that capture screenshot evidence of successful upload and preview flows. These tests provide visual proof that the application works end-to-end, catching regressions that unit/integration tests might miss.

## Running Proof Tests Locally

### Start the Development Server

```bash
npm run dev:full
```

This starts both the API (port 3001) and web server (port 5173) needed for Playwright tests.

### Run All Playwright Tests

```bash
npx playwright test
```

### Run Only Proof Tests

```bash
npx playwright test e2e/file-picker-proof.spec.ts
```

### Interactive Test Mode (UI)

```bash
npx playwright test --ui
```

This opens Playwright's interactive test runner, allowing you to step through tests and inspect page state.

### Run Tests with a Specific Browser

```bash
npx playwright test --project=chromium
```

Default is Chromium only (fast baseline). To test additional browsers locally:

```bash
npx playwright install  # Install Firefox, WebKit if needed
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Reviewing Proof Screenshots

### Local Test Runs

After running tests, proof screenshots are saved in:

```
test-results/proof-*.png
```

Each screenshot is named descriptively:
- `proof-upload-preview-rendered-<timestamp>.png` — Upload complete, preview visible
- `proof-multi-photo-upload-<timestamp>.png` — Multiple photos uploaded
- `proof-upload-limit-enforced-<timestamp>.png` — 9-photo limit enforced

**View screenshots in the HTML report:**

```bash
npx playwright show-report
```

This opens an interactive HTML report with trace, videos, and screenshots.

### GitHub Actions CI

Proof artifacts are retained in CI:
- **HTML Report**: Available in workflow artifacts or linked in CI job summary
- **Screenshots**: Embedded in the HTML report
- **Traces**: For debugging test failures with full browser timeline

To download CI artifacts:
1. Go to the GitHub Actions run
2. Scroll to "Artifacts" section
3. Download `playwright-report.zip`
4. Extract and open `index.html` in a browser

## Understanding Test Failures

### File Chooser Not Opening

**Current Status (April 2026):** There is a known regression where clicking the upload label does not trigger the native file chooser. The proof test is documented to flag this issue.

**What to check if tests fail:**
1. Click the upload zone in the browser manually — does the file chooser appear?
2. Check `src/components/UploadZone.tsx` for the click event wiring
3. Check for `pointer-events-none` or other CSS that might block click propagation
4. Verify `label[for="photo-upload"]` and `input#photo-upload` IDs match

### Screenshot Assertion Failures

If a screenshot doesn't match expected state:
1. Open the test report and compare the captured screenshot
2. Check for timing issues: image loading, CSS transitions
3. Verify the test waited for stable selectors: `waitForUploadComplete()`, `waitForLayoutReady()`
4. Check browser console for JavaScript errors

## AppPage Helper Methods

The `e2e/pages/app.page.ts` class provides shared proof-testing primitives:

```typescript
// Reset state and navigate to app
await app.clearState()
await app.goto()

// Upload via file input (current working path, despite regression)
await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])

// Wait for critical UI states
await app.waitForUploadComplete()    // Preview ready
await app.waitForLayoutReady()       // Layout gallery visible

// Assert expected states
await app.assertPreviewVisible()
await app.assertPhotoCountBadge(2)
await app.assertLayoutGalleryVisible()

// Capture proof screenshot
await app.takeProofScreenshot('my-checkpoint')
```

## Proof Test Patterns

### Basic Upload Test

```typescript
test('[PROOF] upload shows preview', async ({ page, request }) => {
  const app = new AppPage(page, request)
  await app.clearState()
  await app.goto()
  
  await app.uploadViaFileChooser(['test-image.jpg'])
  await app.assertPreviewVisible()
  
  // Capture proof showing successful upload
  await app.takeProofScreenshot('upload-complete')
})
```

### Boundary Test

```typescript
test('[PROOF] reject uploads above 9 photos', async ({ page, request }) => {
  const app = new AppPage(page, request)
  await app.clearState()
  await app.goto()
  
  // Upload up to limit
  for (let i = 0; i < 9; i++) {
    await app.uploadViaFileChooser(['test-image.jpg'])
  }
  
  // Verify limit enforcement
  await app.assertUploadLimitEnforced()
  
  await app.takeProofScreenshot('limit-enforced')
})
```

## CI Proof Path

GitHub Actions runs proof tests on every commit (Chromium only for speed):

```bash
npx playwright test --reporter=html
```

Results are uploaded as workflow artifacts named `playwright-report`.

**To expand browser coverage locally** without impacting CI speed:

```bash
# CI: chromium only (fast)
npx playwright test

# Local: full multi-browser coverage
npx playwright install
npm run test:browsers  # (optional task)
```

## Troubleshooting

### Tests Timeout

- Ensure dev servers are running: `npm run dev:full`
- Check that both ports 5173 and 3001 are available
- Check for network issues or slow hardware

### Better-sqlite3 Errors

If you see: `NODE_MODULE_VERSION mismatch (141 vs 115)`, rebuild the module:

```bash
npm rebuild better-sqlite3
```

### Screenshot Paths Not Found

Ensure `test-results/` directory exists:

```bash
mkdir -p test-results
```

## Next Steps

- **File Chooser Fix:** Investigate click wiring in `UploadZone.tsx` (regression documented)
- **Multi-Browser CI:** Optional expansion to Firefox/WebKit when baseline is stable
- **Proof Metrics:** Track screenshot artifacts in CI to measure proof coverage over time
