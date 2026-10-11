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

test('export preserves cover crops in an asymmetric two-photo preview', async ({ page }) => {
  test.slow()
  const app = new AppPage(page)
  await app.goto()
  await app.uploadViaHiddenInput(['test-image.jpg', 'test-image-2.jpg'])
  const preview = await app.capturePreview()
  const download = await app.exportExactDimensions(1280, 720)
  const exported = await readFile((await download.path())!)
  await test.info().attach('native-preview', { body: preview, contentType: 'image/png' })
  await test.info().attach('exported-image', { body: exported, contentType: 'image/png' })

  const difference = await page.evaluate(async ({ preview, exported }) => {
    const pixels = async (data: string) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 72
      const context = canvas.getContext('2d')!
      context.imageSmoothingQuality = 'high'
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 128, 72)
      context.drawImage(bitmap, 0, 0, 128, 72)
      bitmap.close()
      return context.getImageData(0, 0, 128, 72).data
    }
    const expected = await pixels(preview)
    const actual = await pixels(exported)
    let difference = 0
    for (let i = 0; i < expected.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        difference += Math.abs(expected[i + channel] - actual[i + channel])
      }
    }
    return difference / (128 * 72 * 3)
  }, { preview: preview.toString('base64'), exported: exported.toString('base64') })

  // Native browser painting supplies the expectation independently of the
  // export implementation; allow antialiasing, but not stretched cover photos.
  expect(difference).toBeLessThan(5)
})
