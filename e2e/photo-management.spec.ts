import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Reset the Spark KV store to a clean state before each test. */
async function clearKVState(request: import('@playwright/test').APIRequestContext) {
  for (const key of ['collage-photos', 'selected-layout', 'photo-positions', 'collage-settings']) {
    await request.delete(`/_spark/kv/${encodeURIComponent(key)}`).catch(() => {})
  }
}

test.describe('Photo Management', () => {
  test.beforeEach(async ({ page, request }) => {
    await clearKVState(request)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('shows "Get Started" text when no photos are uploaded', async ({ page }) => {
    await expect(page.getByText('Get Started')).toBeVisible()
  })

  test('shows "Your Photos" panel after upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    await expect(page.getByText('Your Photos')).toBeVisible()
  })

  test('"Clear All" button is present after uploading photos', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    await expect(page.getByRole('button', { name: /clear all/i })).toBeVisible()
  })

  test('clear all button removes all photos and returns to empty state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    // Confirm photos are loaded
    await expect(page.getByText('Your Photos')).toBeVisible()

    await page.getByRole('button', { name: /clear all/i }).click()

    // Empty state should be restored
    await expect(page.getByText(/upload photos/i)).toBeVisible()
    await expect(page.getByText('Your Photos')).not.toBeVisible()
    await expect(page.getByText('Preview')).not.toBeVisible()
  })

  test('uploading two photos shows count badge 2 / 9', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([
      path.join(__dirname, 'fixtures/test-image.jpg'),
      path.join(__dirname, 'fixtures/test-image-2.jpg'),
    ])

    await expect(page.getByText('2 / 9')).toBeVisible()
  })
})
