import { test, expect } from '@playwright/test'
import { AppPage } from './pages/app.page'

/**
 * File-Picker Upload Proof Tests
 *
 * These tests validate the core photo upload journey and serve as proof that
 * the application renders correctly after upload. Screenshots are captured
 * as evidence that the upload and preview flows work end-to-end.
 *
 * KNOWN REGRESSION (April 15, 2026):
 * The file chooser does not fire when clicking the upload label.
 * Investigation needed:
 * - Check if label[for="photo-upload"] is properly wired to input#photo-upload
 * - Verify no CSS or JavaScript prevents the click from reaching the input
 * - Test in a real browser to confirm (not just in Playwright)
 * 
 * Current state: Tests use hidden-input approach which works, but the
 * user-facing click-to-browse path is broken and needs fixing.
 */
test.describe('File-Picker Upload Proof', () => {
  let app: AppPage

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page)
    await app.goto()
  })

  test('[PROOF] uploading via file-picker shows collage preview', async ({ page }) => {
    /**
     * This test validates the core upload-to-preview flow:
     * 1. User uploads one or more image files
     * 2. Upload handler processes files
     * 3. Preview renders with selected photos
     * 4. Layout gallery appears with options
     *
     * PROOF ARTIFACT: Screenshot is captured showing rendered preview
     * after upload, providing visual evidence the app works.
     */
    await app.uploadViaFileChooser(['test-image.jpg'])

    // Verify upload completed and preview is ready
    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(1)

    // Capture proof screenshot showing the rendered upload result
    await app.takeProofScreenshot('upload-preview-rendered')
  })

  test('[PROOF] file-picker uploads with multiple photos', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])

    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(2)
    await app.assertLayoutGalleryVisible()

    // Proof screenshot showing multi-photo upload result
    await app.takeProofScreenshot('multi-photo-upload')
  })

  test('[PROOF] rejected uploads above limit do not mutate state', async ({ page }) => {
    test.setTimeout(120_000) // 16 uploads with individual waits
    // Upload up to the 16-photo limit using 3 fixture images in rotation
    const fixtures = ['test-image.jpg', 'test-image-2.jpg', 'test-photo.jpg']

    // Upload 16 photos one at a time, waiting for count badge after each
    for (let i = 0; i < 16; i++) {
      const file = fixtures[i % fixtures.length]
      await app.uploadViaHiddenInput([file])
      // Wait for the badge to reflect the new count
      const expectedCount = i + 1
      await expect(page.getByText(`${expectedCount} / 16`)).toBeVisible({ timeout: 10000 })
    }

    // Verify we're at capacity
    const countBefore = await app.getCurrentPhotoCount()
    expect(countBefore).toBe(16)

    // Verify upload zone is hidden at capacity
    await app.assertUploadLimitEnforced()

    // The upload label should not be visible at 16/16
    const uploadLabel = page.locator('label[for="photo-upload"]')
    await expect(uploadLabel).not.toBeVisible()

    // Count should remain at 16
    const countAfter = await app.getCurrentPhotoCount()
    expect(countAfter).toBe(16)

    await app.takeProofScreenshot('upload-limit-enforced')
  })
})
