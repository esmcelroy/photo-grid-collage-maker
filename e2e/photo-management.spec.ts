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

  test('confirmed clear removes the prior collage and its dependent IndexedDB records', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg'])

    // Confirm photos are loaded
    await expect(page.getByText('Your Photos')).toBeVisible()
    const previousSessionId = await page.evaluate(() => localStorage.getItem('collage-session-id'))

    await page.getByRole('button', { name: /clear all/i }).click()
    await page.getByRole('button', { name: 'Clear all photos' }).click()

    // Empty state should be restored
    await expect(page.getByText(/upload photos/i)).toBeVisible()
    await expect(page.getByText('Your Photos')).not.toBeVisible()
    await expect(page.getByText('Preview')).not.toBeVisible()

    const records = await page.evaluate(async (oldSessionId) => {
      const sessionId = localStorage.getItem('collage-session-id')
      const request = indexedDB.open('collage-maker')
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const count = (storeName: string, indexName?: string) => new Promise<number>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly')
        const store = indexName ? transaction.objectStore(storeName).index(indexName) : transaction.objectStore(storeName)
        const query = indexName ? IDBKeyRange.only(oldSessionId!) : undefined
        const request = store.count(query)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return {
        sessionId,
        collages: await count('collages'),
        oldPhotos: await count('photos', 'collageId'),
        oldPositions: await count('photoPositions', 'collageId'),
      }
    }, previousSessionId)

    expect(records.sessionId).not.toBe(previousSessionId)
    expect(records.collages).toBe(1)
    expect(records.oldPhotos).toBe(0)
    expect(records.oldPositions).toBe(0)

    await app.uploadViaHiddenInput(['test-image-2.jpg'])
    await app.assertPhotoCountBadge(1)
  })

  test('uploading two photos shows count badge 2 / 16', async ({ page }) => {
    await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])
    await app.assertPhotoCountBadge(2)
  })

  test('never stores more than the 16-photo session limit', async ({ page }) => {
    const input = page.locator('input[type="file"]')
    await input.setInputFiles(Array.from({ length: 17 }, () => 'test-image.jpg').map((filePath) =>
      new URL(`./fixtures/${filePath}`, import.meta.url).pathname
    ))

    await expect(page.getByText('16 / 16')).toBeVisible({ timeout: 30000 })
  })

  test('atomically enforces the photo limit across concurrent public addPhoto calls', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { addPhoto, createCollage, db } = await import('/src/lib/db.ts')
      const { id } = await createCollage()
      const results = await Promise.allSettled(
        Array.from({ length: 17 }, (_, index) => addPhoto(id, {
          id: `concurrent-${index}`,
          dataUrl: 'data:image/jpeg;base64,AA==',
          fileName: `${index}.jpg`,
        }))
      )
      const count = await db.photos.where('collageId').equals(id).count()
      return { count, fulfilled: results.filter((item) => item.status === 'fulfilled').length }
    })

    expect(result).toEqual({ count: 16, fulfilled: 16 })
  })
})
