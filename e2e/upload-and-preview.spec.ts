import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Reset the Spark KV store to a clean state before each test. */
async function clearKVState(request: import('@playwright/test').APIRequestContext) {
  for (const key of ['collage-photos', 'selected-layout', 'photo-positions', 'collage-settings']) {
    await request.delete(`/_spark/kv/${encodeURIComponent(key)}`).catch(() => {
      // KV endpoint may not exist in all environments; ignore errors silently
    })
  }
}

test.describe('Upload and Preview', () => {
  test.beforeEach(async ({ page, request }) => {
    await clearKVState(request)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('uploading a photo shows the collage preview', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    // Preview section should appear with a visible heading and download button
    await expect(page.getByText('Preview')).toBeVisible()
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible()
  })

  test('uploaded photo count badge updates', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    // Badge format is "X / 9" (spaces around slash)
    await expect(page.getByText('1 / 9')).toBeVisible()
  })

  test('customization controls appear after upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    await expect(page.getByText('Customize')).toBeVisible()
  })

  test('layout options appear after upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    await expect(page.getByText('Layout Options')).toBeVisible()
  })

  test('upload zone is hidden after photos are loaded', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

    // Once photos are uploaded, the "Get Started" landing state should be gone
    await expect(page.getByText('Get Started')).not.toBeVisible()
  })
})
