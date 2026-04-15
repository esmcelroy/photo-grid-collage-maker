import { expect, test } from '@playwright/test'

test('loads the app and shows the page title', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Collage Maker', level: 1 })
  ).toBeVisible()
})
