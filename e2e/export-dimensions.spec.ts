import { expect, test } from '@playwright/test'
import { readFile } from 'fs/promises'
import { AppPage } from './pages/app.page'

async function readPngDimensions(path: string): Promise<{ width: number; height: number }> {
  const data = await readFile(path)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 393, height: 852 },
]) {
  test(`exports exact PNG dimensions on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const app = new AppPage(page)
    await app.goto()
    await app.uploadViaHiddenInput(['test-image.jpg'])

    const download = await app.exportExactDimensions(640, 480)
    expect(download.suggestedFilename()).toMatch(/\.png$/)
    const path = await download.path()
    expect(path).not.toBeNull()
    expect(await readPngDimensions(path!)).toEqual({ width: 640, height: 480 })
  })
}
