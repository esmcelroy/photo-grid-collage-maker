import { Page } from '@playwright/test'
import * as path from 'path'

import { expect } from '@playwright/test'
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
      this.page.locator('input[type="file"]').click(),
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
    const fileInput = this.page.locator('input[type="file"]')
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
   */
  async assertPreviewVisible() {
    await expect(this.page.getByText('Preview')).toBeVisible()
    await expect(this.page.getByRole('button', { name: /download/i })).toBeVisible()
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
}
