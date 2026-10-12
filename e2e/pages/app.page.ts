import { Download, expect, Page, type Locator } from '@playwright/test'
import * as path from 'path'

const __dirname = new URL('.', import.meta.url).pathname

/**
 * AppPage encapsulates the photo collage maker UI and provides
 * proof-critical upload interactions and screenshot capture.
 */
export class AppPage {
  constructor(
    private page: Page
  ) {}

  /**
   * Navigate to the app home page and wait for the session to initialize.
   */
  async goto() {
    await this.page.goto('/')
    await this.page.waitForLoadState('domcontentloaded')
    // Wait for the collage session to be initialized in localStorage
    await this.page.waitForFunction(
      () => localStorage.getItem('collage-session-id') !== null,
      { timeout: 10000 }
    )
  }

  /**
   * Clear browser state for a clean test environment.
   * NOTE: Playwright creates a fresh BrowserContext per test, so localStorage
   * and IndexedDB are already clean. This method is kept for explicit cleanup
   * in tests that need to reset mid-test (e.g., testing "clear all").
   */
  async clearState() {
    await this.page.evaluate(async () => {
      localStorage.clear()
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(
          (db) =>
            new Promise<void>((resolve) => {
              if (!db.name) {
                resolve()
                return
              }
              const req = indexedDB.deleteDatabase(db.name)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            })
        )
      )
    })
  }

  /**
   * Upload one or more files through the browser's native file chooser.
   * Clicks the upload zone, waits for the file chooser event, and sets files.
   *
   * This validates the real user click path: click upload zone → native
   * file picker opens → files selected → upload processes.
   *
   * @param filePaths - Array of file paths relative to e2e/fixtures/
   */
  async uploadViaFileChooser(filePaths: string[]) {
    const absolutePaths = filePaths.map(filePath =>
      path.join(__dirname, '../fixtures', filePath)
    )

    // Wait for file chooser and click the upload input simultaneously
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.locator('input[type="file"][accept^="image/"]').click(),
    ])

    await fileChooser.setFiles(absolutePaths)
    await this.waitForUploadComplete()
  }

  /**
   * Upload files using the hidden input directly.
   * This bypasses the file-chooser flow and is useful for batch/performance tests.
   *
   * @param filePaths - Array of file paths relative to e2e/fixtures/
   */
  async uploadViaHiddenInput(filePaths: string[]) {
    const fileInput = this.page.locator('input[type="file"][accept^="image/"]')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    const absolutePaths = filePaths.map(filePath =>
      path.join(__dirname, '../fixtures', filePath)
    )
    await fileInput.setInputFiles(absolutePaths)
    await this.waitForUploadComplete()
  }

  /**
   * Wait for upload to complete and the preview to become render-ready.
   * This stable wait prevents flaky screenshots or assertions on partial renders.
   */
  async waitForUploadComplete() {
    // Wait for the preview to appear (indicates upload was processed)
    await expect(this.page.getByText('Preview')).toBeVisible({ timeout: 30000 })
    // Brief additional wait to ensure rendering settles
    await this.page.waitForTimeout(500)
  }

  /**
   * Wait for the layout gallery to be ready and selectable.
   * Used after uploads to ensure layout options are available.
   */
  async waitForLayoutReady() {
    await expect(this.page.getByText('Layout Options')).toBeVisible({ timeout: 10000 })
    // Additional wait for gallery to finish rendering layouts
    await this.page.waitForTimeout(300)
  }

  /**
   * Capture a proof screenshot at a critical UI checkpoint.
   * Screenshots are saved to test-results/screenshots/ with descriptive names.
   *
   * @param name - Descriptive name for the checkpoint
   * @returns The path where the screenshot was saved
   */
  async takeProofScreenshot(name: string): Promise<string> {
    const screenshotPath = `./test-results/screenshots/proof-${name}.png`
    await this.page.screenshot({
      path: screenshotPath,
      fullPage: false,
    })
    return screenshotPath
  }

  /**
   * Assert that the collage preview is visible and render-ready.
   * On desktop the "Download" button is shown; on mobile "Export Collage" appears
   * in a fixed bottom bar instead.
   */
  async assertPreviewVisible() {
    await expect(this.page.getByText('Preview')).toBeVisible()
    const downloadBtn = this.page.getByRole('button', { name: /download/i })
    const exportBtn = this.page.getByRole('button', { name: /export/i })
    await expect(downloadBtn.or(exportBtn)).toBeVisible()
  }

  /**
   * Assert that the layout gallery is visible with options.
   */
  async assertLayoutGalleryVisible() {
    await expect(this.page.getByText('Layout Options')).toBeVisible()
  }

  /**
   * Assert that the photo count badge shows the expected count.
   */
  async assertPhotoCountBadge(count: number) {
    const badge = `${count} / 16`
    await expect(this.page.getByText(badge)).toBeVisible()
  }

  /**
   * Assert that upload above the 16-photo limit is rejected.
   */
  async assertUploadLimitEnforced() {
    await expect(this.page.getByText('Upload Photos')).not.toBeVisible()
    await this.assertPhotoCountBadge(16)
  }

  /**
   * Assert that the customization controls are visible.
   */
  async assertCustomizationControlsVisible() {
    await expect(this.page.getByText('Customize')).toBeVisible()
  }

  /**
   * Get the current photo count from the badge.
   */
  async getCurrentPhotoCount(): Promise<number | null> {
    const badgeText = await this.page
      .getByText(/\d+ \/ \d+/)
      .textContent()
      .catch(() => null)
    
    if (!badgeText) return null
    const match = badgeText.match(/(\d+) \/ \d+/)
    return match ? parseInt(match[1], 10) : null
  }

  /**
   * Assert that a proof screenshot was captured at the given path.
   */
  async assertProofScreenshotExists(name: string): Promise<boolean> {
    const fs = await import('fs')
    const screenshotPath = `./test-results/screenshots/proof-${name}.png`
    return fs.existsSync(screenshotPath)
  }

  async capturePreview(): Promise<Buffer> {
    await this.page.mouse.move(0, 0)
    return this.page.locator('[data-grid-area]').first().locator('..').screenshot()
  }

  async waitForOfflineReady() {
    await this.page.evaluate(async () => { await navigator.serviceWorker.ready })
    await this.page.reload({ waitUntil: 'domcontentloaded' })
    await this.page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  }

  async editFirstPhoto() {
    await this.page.locator('[data-grid-area]').first().hover()
    await this.page.getByRole('button', { name: /^Edit photo in slot/ }).first().click()
    await this.page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click()
    const sliders = this.page.getByRole('dialog').getByRole('slider')
    await sliders.nth(0).press('ArrowRight')
    await sliders.nth(1).press('ArrowRight')
    await this.page.getByRole('button', { name: 'Apply', exact: true }).click()
    await this.assertEditedPhoto()
  }

  /**
   * Edit the first photo through the preview's sequential keyboard controls.
   * This verifies that the edit action is reachable without pointer hover and
   * that focus returns to it after the dialog closes.
   */
  async editFirstPhotoWithKeyboard() {
    const editAction = this.page.getByRole('button', { name: 'Edit photo in slot a' })

    await this.tabTo(this.page.getByRole('button', { name: 'Photo slot a, click or drag to reorder', exact: true }))
    await this.page.keyboard.press('Tab')
    await expect(this.page.locator(':focus')).toHaveAttribute('aria-label', 'Edit photo in slot a')
    await this.page.keyboard.press('Tab')
    await expect(this.page.locator(':focus')).toHaveAttribute('aria-label', 'Photo slot b, click or drag to reorder')
    await this.page.keyboard.press('Tab')
    await expect(this.page.locator(':focus')).toHaveAttribute('aria-label', 'Edit photo in slot b')
    await this.page.keyboard.press('Shift+Tab')
    await this.page.keyboard.press('Shift+Tab')
    await expect(editAction).toBeFocused()
    await this.page.keyboard.press('Enter')

    const dialog = this.page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)

    await this.tabTo(this.page.getByRole('button', { name: 'Rotate clockwise', exact: true }))
    await this.page.keyboard.press('Enter')
    const sliders = dialog.getByRole('slider')
    await this.tabTo(sliders.nth(0))
    await this.page.keyboard.press('ArrowRight')
    await this.tabTo(sliders.nth(1))
    await this.page.keyboard.press('ArrowRight')
    await this.tabTo(this.page.getByRole('button', { name: 'Apply', exact: true }))
    await this.page.keyboard.press('Enter')

    await expect(editAction).toBeFocused()
    await this.assertEditedPhoto()
  }

  async swapWithKeyboardAndDragBack() {
    const firstPhoto = this.page.locator('[data-grid-area="a"] img')
    const secondPhoto = this.page.locator('[data-grid-area="b"] img')
    const firstSource = await firstPhoto.getAttribute('src')
    const secondSource = await secondPhoto.getAttribute('src')
    expect(firstSource).not.toBe(secondSource)
    await this.tabTo(this.page.getByRole('button', { name: 'Photo slot a, click or drag to reorder', exact: true }))
    await this.page.keyboard.press('Enter')
    await this.page.keyboard.press('Tab') // Edit a
    await this.page.keyboard.press('Escape') // Cancel selection from edit control
    await this.page.keyboard.press('Tab') // Swap b
    await this.page.keyboard.press('Space') // Select b, without swapping
    await expect(firstPhoto).toHaveAttribute('src', firstSource!)
    await expect(secondPhoto).toHaveAttribute('src', secondSource!)
    await this.page.keyboard.press('Space') // Deselect b
    await this.page.keyboard.press('Shift+Tab')
    await this.page.keyboard.press('Shift+Tab') // Swap a
    await this.page.keyboard.press('Enter')
    await this.page.keyboard.press('Tab') // Edit a
    await this.page.keyboard.press('Tab') // Swap b
    await this.page.keyboard.press('Space')
    await expect(firstPhoto).toHaveAttribute('src', secondSource!)
    await expect(secondPhoto).toHaveAttribute('src', firstSource!)

    await this.page.getByRole('button', { name: /^Photo slot a,/ }).dragTo(
      this.page.getByRole('button', { name: /^Photo slot b,/ }),
      { sourcePosition: { x: 12, y: 12 }, targetPosition: { x: 12, y: 12 } },
    )
    await expect(firstPhoto).toHaveAttribute('src', firstSource!)
    await expect(secondPhoto).toHaveAttribute('src', secondSource!)
  }

  private async tabTo(target: Locator) {
    for (let index = 0; index < 40; index += 1) {
      await this.page.keyboard.press('Tab')
      if (await target.evaluate(element => element === document.activeElement)) return
    }
    throw new Error(`Could not reach ${target} with sequential Tab navigation`)
  }

  async assertEditedPhoto() {
    const photo = this.page.locator('[data-grid-area]').first().locator('img')
    await expect(photo).toHaveCSS('object-position', '51% 50%')
    await expect(photo).toHaveCSS('transform', 'matrix(0, 1.05, -1.05, 0, 0, 0)')
  }

  async rotateEditedPhotoAgain() {
    await this.assertEditedPhoto()
    await this.page.locator('[data-grid-area]').first().hover()
    await this.page.getByRole('button', { name: /^Edit photo in slot/ }).first().click()
    await this.page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click()
    await this.page.getByRole('button', { name: 'Apply', exact: true }).click()
    const photo = this.page.locator('[data-grid-area]').first().locator('img')
    await expect(photo).toHaveCSS('object-position', '51% 50%')
    await expect(photo).toHaveCSS('transform', 'matrix(-1.05, 0, 0, -1.05, 0, 0)')
  }

  async assertOfflineNotice() {
    const notice = this.page.getByText("You're offline — some tools need previously cached downloads.")
    await expect(notice).toBeVisible()
    // Capture the persistent notice after transient upload/export toasts leave.
    await expect(this.page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 })
    await notice.scrollIntoViewIfNeeded()
    const storageGuidance = this.page.getByRole('status').filter({ hasText: /persistent.storage/ })
    const content = await storageGuidance.count()
      ? storageGuidance
      : this.page.getByRole('heading', { name: 'Collage Maker', exact: true })
    const banner = (await notice.boundingBox())!
    const below = (await content.boundingBox())!
    expect(below.y).toBeGreaterThanOrEqual(banner.y + banner.height)
  }

  async uploadWithUncachedHeic() {
    const { readFile } = await import('node:fs/promises')
    const failedDecoder = this.page.waitForEvent('requestfailed', {
      predicate: request => /libheif-js-.*\.js/.test(request.url()),
    })
    await this.page.locator('input[type="file"][accept^="image/"]').setInputFiles([
      // The decoder import fails before these bytes can be decoded. This tests
      // unavailable-code feedback, not HEIC decoding or image-format support.
      { name: 'uncached.heic', mimeType: 'image/heic', buffer: Buffer.from('unused offline input') },
      { name: 'offline.jpg', mimeType: 'image/jpeg', buffer: await readFile(path.join(__dirname, '../fixtures/test-image.jpg')) },
    ])
    await expect(this.page.getByText(/Could not convert uncached\.heic:/)).toBeVisible()
    await expect(this.page.getByText('Added 1 photo', { exact: true })).toBeVisible()
    return failedDecoder
  }

  async requestModelOffline() {
    await this.page.getByRole('switch', { name: 'Smart positioning' }).click()
    await this.page.getByRole('radio', { name: /^Advanced/ }).check()
    await expect(this.page.getByText(/Detection model failed to load\. Using/).first()).toBeVisible()
    const hasNativeDetector = await this.page.evaluate(() => 'FaceDetector' in window)
    await expect(this.page.getByRole('radio', { name: hasNativeDetector ? /^Standard/ : /^Basic/ })).toBeChecked()
  }

  async acceptUpdate() {
    await this.assertUpdateAvailable()
    await Promise.all([
      this.page.waitForEvent('load'),
      this.page.getByRole('button', { name: 'Refresh Now', exact: true }).click(),
    ])
    await expect(this.page.getByText('A new version is available')).not.toBeVisible()
  }

  async assertUpdateAvailable() {
    const message = this.page.getByText('A new version is available')
    await expect(message).toBeVisible()
    // Framer Motion begins translucent; wait for the readable final state.
    await expect(message.locator('..')).toHaveCSS('opacity', '1')
  }

  async clearAll() {
    await this.page.getByRole('button', { name: 'Clear All', exact: true }).click()
    await this.page.getByRole('button', { name: 'Clear all photos', exact: true }).click()
    await expect(this.page.getByText('Upload Photos', { exact: true })).toBeVisible()
  }

  async exportExactDimensions(width: number, height: number): Promise<Download> {
    await this.page.getByRole('button', { name: /download|export collage/i }).click()
    await expect(this.page.getByRole('heading', { name: 'Export Collage' })).toBeVisible()
    await this.page.getByLabel('Width (px)').fill(String(width))
    await this.page.getByLabel('Height (px)').fill(String(height))
    const downloadPromise = this.page.waitForEvent('download')
    await this.page.getByRole('button', { name: /^export$/i }).click()
    return downloadPromise
  }

  async createProject(name: string) {
    await this.page.getByRole('button', { name: 'New project', exact: true }).click()
    await this.page.getByLabel('Project name', { exact: true }).fill(name)
    await this.page.getByRole('button', { name: 'Create project', exact: true }).click()
    await this.assertProjectName(name)
  }

  async assertProjectName(name: string) {
    await expect(this.page.getByText(`Editing: ${name}`, { exact: true })).toBeVisible()
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }

  async projectAction(action: 'Open' | 'Rename' | 'Duplicate' | 'Delete', name: string) {
    await this.page.getByRole('button', { name: 'Manage projects', exact: true }).click()
    await this.page.getByRole('button', { name: `${action} ${name}`, exact: true }).click()
  }

  async renameProject(previous: string, name: string) {
    await this.projectAction('Rename', previous)
    await this.page.getByLabel('Project name', { exact: true }).fill(name)
    await this.page.getByRole('button', { name: 'Save name', exact: true }).click()
    await this.assertProjectName(name)
  }

  async downloadBackup(): Promise<Download> {
    const download = this.page.waitForEvent('download')
    await this.page.getByRole('button', { name: 'Back up', exact: true }).click()
    return download
  }

  async restoreBackup(file: string) {
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.getByRole('button', { name: 'Restore backup', exact: true }).press('Enter'),
    ])
    await chooser.setFiles(file)
  }

  async confirmProjectDeletion() {
    await this.page.getByRole('button', { name: 'Delete project', exact: true }).click()
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }

  async assertUndoUnavailable() {
    await expect(this.page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  }

  async assertRestoreError() {
    await expect(this.page.getByRole('alert')).toContainText('Unsupported backup format version')
  }

  async captureProjectView(file: string) {
    const dialog = this.page.getByRole('dialog')
    if (await dialog.count()) await expect(dialog).toHaveCSS('opacity', '1')
    else await this.page.getByRole('button', { name: 'Manage projects', exact: true }).scrollIntoViewIfNeeded()
    await this.page.screenshot({ path: file })
  }

  async showProjectLibrary() {
    await this.page.getByRole('button', { name: 'Manage projects', exact: true }).click()
    await expect(this.page.getByRole('dialog')).toHaveAccessibleName('Saved projects')
  }

  async showNewProjectForm() {
    await this.page.getByRole('button', { name: 'New project', exact: true }).click()
    await expect(this.page.getByLabel('Project name')).toBeFocused()
  }

  async cancelProjectDialog() {
    await this.page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }
}
