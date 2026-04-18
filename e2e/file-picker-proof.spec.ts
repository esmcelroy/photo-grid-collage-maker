import { test, expect } from '@playwright/test'
import { AppPage } from './pages/app.page'

/**
 * File-Picker Upload Proof Tests
 *
 * These tests validate the core photo upload journey via the native file chooser
 * and capture screenshot evidence that the upload and preview flows work end-to-end.
 *
 * The file chooser is triggered by clicking the upload zone's <input type="file">,
 * which opens the native file picker dialog. Playwright intercepts this event
 * to programmatically set files.
 */
test.describe('File-Picker Upload Proof', () => {
  let app: AppPage

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page)
    await app.goto()
  })

  test('[PROOF] uploading via file-picker shows collage preview', async () => {
    await app.uploadViaFileChooser(['test-image.jpg'])

    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(1)

    // Capture proof screenshot
    const path = await app.takeProofScreenshot('upload-preview-rendered')
    expect(await app.assertProofScreenshotExists('upload-preview-rendered')).toBe(true)
  })

  test('[PROOF] file-picker uploads with multiple photos', async () => {
    await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])

    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(2)
    await app.assertLayoutGalleryVisible()

    await app.takeProofScreenshot('multi-photo-upload')
    expect(await app.assertProofScreenshotExists('multi-photo-upload')).toBe(true)
  })

  test('[PROOF] file-chooser and hidden-input produce same result', async ({ page }) => {
    // Upload via file chooser
    await app.uploadViaFileChooser(['test-image.jpg'])
    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(1)
    await app.takeProofScreenshot('file-chooser-result')

    // Clear and re-upload via hidden input
    await page.getByRole('button', { name: /clear all/i }).click()
    await expect(page.getByText(/upload photos/i)).toBeVisible()

    await app.uploadViaHiddenInput(['test-image.jpg'])
    await app.assertPreviewVisible()
    await app.assertPhotoCountBadge(1)
    await app.takeProofScreenshot('hidden-input-result')
  })

  test('[PROOF] rejected uploads above limit do not mutate state', async ({ page }) => {
    test.setTimeout(120_000)
    const fixtures = ['test-image.jpg', 'test-image-2.jpg', 'test-photo.jpg']

    // Upload 16 photos one at a time
    for (let i = 0; i < 16; i++) {
      const file = fixtures[i % fixtures.length]
      await app.uploadViaHiddenInput([file])
      const expectedCount = i + 1
      await expect(page.getByText(`${expectedCount} / 16`)).toBeVisible({ timeout: 10000 })
    }

    const countBefore = await app.getCurrentPhotoCount()
    expect(countBefore).toBe(16)

    await app.assertUploadLimitEnforced()

    const uploadLabel = page.locator('label[for="photo-upload"]')
    await expect(uploadLabel).not.toBeVisible()

    const countAfter = await app.getCurrentPhotoCount()
    expect(countAfter).toBe(16)

    await app.takeProofScreenshot('upload-limit-enforced')
  })
})
