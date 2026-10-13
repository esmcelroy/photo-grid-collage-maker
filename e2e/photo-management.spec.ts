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

    await app.clearAll()

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

  test('keyboard-only editing opens the dialog and returns focus to the editor', async () => {
    await app.uploadViaHiddenInput(['test-image.jpg', 'test-image-2.jpg'])
    await app.editFirstPhotoWithKeyboard()
  })

  test('keyboard swapping and native dragging still reorder photos', async () => {
    await app.uploadViaHiddenInput(['test-image.jpg', 'test-image-2.jpg'])
    await app.swapWithKeyboardAndDragBack()
  })

  test('preserves native text history in editable descendants and uses collage undo elsewhere', async ({ page }) => {
    await app.uploadViaHiddenInput(['test-image.jpg'])

    const spacing = page.getByRole('slider', { name: 'Photo spacing' })
    await spacing.press('ArrowRight')
    await expect(page.getByText('10px', { exact: true })).toBeVisible()

    await app.openExportDialog()
    await app.assertNativeTextUndoRedo(page.getByLabel('Filename'), '-draft')
    await expect(page.getByText('10px', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await app.showNewProjectForm()
    await app.assertNativeTextUndoRedo(page.getByLabel('Project name', { exact: true }), ' draft')
    await expect(page.getByText('10px', { exact: true })).toBeVisible()
    await app.cancelProjectDialog()

    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.innerHTML = '<textarea id="editable-textarea">draft</textarea><div id="editable-host" contenteditable="true">draft<span id="editable-child" tabindex="0"> child</span><span id="non-editable-child" contenteditable="false" tabindex="0">button</span></div>'
      document.body.append(probe)
    })

    await app.assertNativeTextUndoRedo(page.locator('#editable-textarea'), ' text')
    await expect(page.getByText('10px', { exact: true })).toBeVisible()

    const editableHost = page.locator('#editable-host')
    await editableHost.focus()
    await page.keyboard.press('End')
    await page.keyboard.type(' text')
    await expect(editableHost).toHaveText('draft childbutton text')
    await app.pressCollageUndo()
    await expect(editableHost).toHaveText('draft childbutton')
    await expect(page.getByText('10px', { exact: true })).toBeVisible()

    const editableChild = page.locator('#editable-child')
    await editableChild.focus()
    expect(await editableChild.evaluate(element => (element as HTMLElement).isContentEditable)).toBe(true)
    await app.pressCollageUndo()
    await expect(page.getByText('10px', { exact: true })).toBeVisible()

    await page.locator('#non-editable-child').focus()
    await app.pressCollageUndo()
    await expect(page.getByText('8px', { exact: true })).toBeVisible()

    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.innerHTML = '<input id="undo-radio" type="radio"><input id="undo-color" type="color"><input id="undo-file" type="file"><input id="undo-readonly-input" readonly value="draft"><textarea id="undo-readonly-textarea" readonly>draft</textarea>'
      document.body.append(probe)
    })

    for (const id of ['undo-radio', 'undo-color', 'undo-file', 'undo-readonly-input', 'undo-readonly-textarea']) {
      await spacing.press('ArrowRight')
      await expect(page.getByText('10px', { exact: true })).toBeVisible()
      const control = page.locator(`#${id}`)
      await control.focus()
      await expect(control).toBeFocused()
      await app.pressCollageUndo()
      await expect(page.getByText('8px', { exact: true })).toBeVisible()
    }
  })

  test('never stores more than the 16-photo session limit', async ({ page }) => {
    const input = page.locator('input[type="file"][accept^="image/"]')
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
