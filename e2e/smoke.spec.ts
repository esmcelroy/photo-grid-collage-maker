import { test, expect } from '@playwright/test'

test('app loads and shows upload zone', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('heading', { name: /collage maker/i })).toBeVisible()
  await expect(page.getByText(/upload photos/i)).toBeVisible()
})
