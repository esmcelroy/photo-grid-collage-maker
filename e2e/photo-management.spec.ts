import { test, expect } from '@playwright/test'
import { AppPage } from './pages/app.page'

test.describe('Photo Management', () => {
  let app: AppPage

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page)
    await app.goto()
  })

  test('shows "Get Started" text when no photos are uploaded', async ({ page }) => {
    await expect(page.getByText('Get Started')).toBeVisible()
  })

  test('shows "Your Photos" panel after upload', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await expect(page.getByText('Your Photos')).toBeVisible()
  })

  test('"Clear All" button is present after uploading photos', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])
    await expect(page.getByRole('button', { name: /clear all/i })).toBeVisible()
  })

  test('clear all button removes all photos and returns to empty state', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])

    // Confirm photos are loaded
    await expect(page.getByText('Your Photos')).toBeVisible()

    await page.getByRole('button', { name: /clear all/i }).click()

    // Empty state should be restored
    await expect(page.getByText(/upload photos/i)).toBeVisible()
    await expect(page.getByText('Your Photos')).not.toBeVisible()
    await expect(page.getByText('Preview')).not.toBeVisible()
  })

  test('uploading two photos shows count badge 2 / 16', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])
    await app.assertPhotoCountBadge(2)
  })
})
