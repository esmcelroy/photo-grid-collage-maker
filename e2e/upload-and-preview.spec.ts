import { test, expect } from '@playwright/test'
import { AppPage } from './pages/app.page'

test.describe('Upload and Preview', () => {
  let app: AppPage

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page)
    await app.goto()
  })

  test('uploading a photo shows the collage preview', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await app.assertPreviewVisible()
  })

  test('uploaded photo count badge updates', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await app.assertPhotoCountBadge(1)
  })

  test('customization controls appear after upload', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await app.assertCustomizationControlsVisible()
  })

  test('layout options appear after upload', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await app.assertLayoutGalleryVisible()
  })

  test('upload zone is hidden after photos are loaded', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    // Once photos are uploaded, the "Get Started" landing state should be gone
    await expect(page.getByText('Get Started')).not.toBeVisible()
  })
})
