import { test, expect } from '@playwright/test'

test('app loads and shows upload zone', async ({ page, request }) => {
  // Clear any persisted KV state so we reliably land on the empty/upload state
  for (const key of ['collage-photos', 'selected-layout', 'photo-positions']) {
    await request.delete(`/_spark/kv/${encodeURIComponent(key)}`).catch(() => {})
  }

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('heading', { name: /collage maker/i })).toBeVisible()
  await expect(page.getByText(/upload photos/i)).toBeVisible()
})
