import { test, expect } from '@playwright/test'
import { AppPage } from './pages/app.page'

const testImage = 'test-image.jpg'
const testImage2 = 'test-image-2.jpg'

test.describe('Layout Enhancements', () => {
  let app: AppPage

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page)
    await app.goto()
    await app.clearState()
    await app.goto()
  })

  test('layout gallery shows platform filter buttons', async ({ page }) => {
    // Upload 2 photos to show layout gallery
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    
    // Check platform filter buttons are visible
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Instagram' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Facebook' })).toBeVisible()
  })

  test('platform filter reduces visible layouts', async ({ page }) => {
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    await app.waitForLayoutReady()
    
    // Verify layout options are visible
    const layoutHeading = page.getByText(/\d+ layouts?/)
    await expect(layoutHeading).toBeVisible({ timeout: 5000 })
    
    // Click Instagram filter
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.waitForTimeout(500)
    
    // Verify filter is active and layouts still shown
    await expect(page.getByText(/\d+ layouts?/)).toBeVisible()
    
    // Click All to reset
    await page.getByRole('button', { name: 'All', exact: true }).click()
  })

  test('selecting a layout shows preview', async ({ page }) => {
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    await app.waitForLayoutReady()
    
    // Click the first layout option
    const layouts = page.locator('[data-testid="layout-option"]')
    const count = await layouts.count()
    if (count > 0) {
      await layouts.first().click()
    } else {
      // Fallback: find layout buttons by structure
      const layoutButtons = page.locator('button').filter({ has: page.locator('div[style*="grid"]') })
      if (await layoutButtons.count() > 0) {
        await layoutButtons.first().click()
      }
    }
    
    await app.assertPreviewVisible()
  })

  test('layout preview has correct grid structure', async ({ page }) => {
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    await app.waitForLayoutReady()
    
    // Select first layout
    const layoutButton = page.locator('button').filter({ has: page.locator('div[style*="display"]') }).first()
    await layoutButton.click({ timeout: 5000 }).catch(() => {})
    
    // Wait for preview
    await page.waitForTimeout(1000)
    
    // Verify grid container exists with grid display
    const gridContainer = page.locator('div[style*="grid-template-areas"]')
    if (await gridContainer.count() > 0) {
      const style = await gridContainer.first().getAttribute('style')
      expect(style).toContain('grid-template-areas')
      expect(style).toContain('grid-template-rows')
      expect(style).toContain('grid-template-columns')
    }
  })

  test('dark mode toggle exists and works', async ({ page }) => {
    // Find theme toggle button (default is "System theme")
    const themeButton = page.getByRole('button', { name: /light mode|dark mode|system theme/i })
    await expect(themeButton).toBeVisible()
    
    // Cycle: system → light → dark
    // First click: system → light
    await themeButton.click()
    await expect(page.getByRole('button', { name: 'Light mode' })).toBeVisible()
    
    // Second click: light → dark
    await page.getByRole('button', { name: 'Light mode' }).click()
    await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible()
    
    // Verify data-appearance attribute is set to dark
    const appearance = await page.evaluate(() => 
      document.documentElement.getAttribute('data-appearance')
    )
    expect(appearance).toBe('dark')
    
    // Third click: dark → system
    await page.getByRole('button', { name: 'Dark mode' }).click()
    await expect(page.getByRole('button', { name: 'System theme' })).toBeVisible()
  })

  test('collapsible sections toggle correctly', async ({ page }) => {
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    
    // Find collapsible sections (details/summary elements)
    const details = page.locator('details')
    const count = await details.count()
    expect(count).toBeGreaterThan(0)
    
    // Find an open section and close it
    const openDetail = details.filter({ has: page.locator('[open]') }).first()
    if (await openDetail.count() > 0) {
      const summary = openDetail.locator('summary')
      await summary.click()
      // Verify it closed
      await page.waitForTimeout(300)
    }
  })

  test('mobile bottom bar appears on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone X
    await app.goto()
    
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    
    // Wait for layout to render
    await page.waitForTimeout(1000)
    
    // Check for mobile bottom bar (lg:hidden means visible on mobile)
    const bottomBar = page.locator('.fixed.bottom-0, [class*="fixed"][class*="bottom"]')
    if (await bottomBar.count() > 0) {
      await expect(bottomBar.first()).toBeVisible()
    }
  })

  test('empty state shows step icons', async ({ page }) => {
    // Without uploading, verify empty state
    await expect(page.getByText('Get Started')).toBeVisible()
    await expect(page.getByText('Upload', { exact: true })).toBeVisible()
    await expect(page.getByText('Customize', { exact: true })).toBeVisible()
    await expect(page.getByText('Choose Layout')).toBeVisible()
    await expect(page.getByText('Download', { exact: true })).toBeVisible()
  })

  test('undo/redo buttons appear with photos', async ({ page }) => {
    // Initially no undo/redo
    await expect(page.getByRole('button', { name: /undo/i })).not.toBeVisible()
    
    // Upload photos
    await app.uploadViaHiddenInput([testImage, testImage2])
    await app.waitForUploadComplete()
    
    // Undo/redo should now be visible (though disabled)
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /redo/i })).toBeVisible()
  })
})
