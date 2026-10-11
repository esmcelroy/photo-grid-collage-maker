import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { AppPage } from '../pages/app.page'

test('a fresh offline browser cannot install the app', async ({ page, context }) => {
  await context.setOffline(true)
  await expect(page.goto('/')).rejects.toThrow()
})

test('installed app reloads, edits, and exports exact dimensions offline', async ({ page, context }, testInfo) => {
  const app = new AppPage(page)
  await app.goto()
  await app.uploadViaFileChooser(['test-image.jpg', 'test-image-2.jpg'])
  const session = await page.evaluate(() => localStorage.getItem('collage-session-id'))
  await app.waitForOfflineReady()
  await context.setOffline(true)
  // Exercise the online-to-offline transition before reload; local saves must
  // not be paused by React Query's default network policy.
  await app.assertOfflineNotice()
  await app.editFirstPhoto()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await app.assertPhotoCountBadge(2)
  await app.assertEditedPhoto()
  expect(await page.evaluate(() => localStorage.getItem('collage-session-id'))).toBe(session)

  // Export has not been opened online: its lazy-loaded code must be precached.
  const download = await app.exportExactDimensions(640, 480)
  const png = await readFile((await download.path())!)
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 480])
  await app.assertOfflineNotice()
  await testInfo.attach('offline-edited-app', { body: await page.screenshot(), contentType: 'image/png' })
})

test('uncached detection models report an offline fallback without losing photos', async ({ page, context }, testInfo) => {
  const app = new AppPage(page)
  await app.goto()
  await app.uploadViaHiddenInput(['test-image.jpg'])
  await app.waitForOfflineReady()
  await context.setOffline(true)
  await app.requestModelOffline()
  await app.assertPhotoCountBadge(1)
  await testInfo.attach('offline-model-fallback', { body: await page.screenshot(), contentType: 'image/png' })
})

test('uncached HEIC code reports failure while JPEG upload and prior photos survive', async ({ page, context }, testInfo) => {
  const app = new AppPage(page)
  await app.goto()
  await app.uploadViaHiddenInput(['test-image-2.jpg'])
  await app.waitForOfflineReady()
  await context.setOffline(true)
  const failedDecoder = await app.uploadWithUncachedHeic()
  expect(failedDecoder.failure()?.errorText).toBeTruthy()
  await app.assertPhotoCountBadge(2)
  await testInfo.attach('offline-heic-error', { body: await page.screenshot(), contentType: 'image/png' })
})

test('a real service-worker update prompts and preserves saved edits on refresh', async ({ page }, testInfo) => {
  const app = new AppPage(page)
  await app.goto()
  await app.uploadViaHiddenInput(['test-image.jpg', 'test-image-2.jpg'])
  await app.editFirstPhoto()
  await app.waitForOfflineReady()
  const session = await page.evaluate(() => localStorage.getItem('collage-session-id'))
  const originalWorker = await readFile('dist/sw.js', 'utf8')
  const originalHtml = await readFile('dist/index.html', 'utf8')
  const updatedTitle = `Updated app — ${testInfo.project.name}`
  const updatedHtml = originalHtml.replace(/<title>.*?<\/title>/, `<title>${updatedTitle}</title>`)
  expect(updatedHtml).not.toBe(originalHtml)
  const revision = createHash('md5').update(updatedHtml).digest('hex')
  const updatedWorker = originalWorker.replace(
    /url:"index\.html",revision:"[a-f0-9]+"/,
    `url:"index.html",revision:"${revision}"`,
  )
  expect(updatedWorker).not.toBe(originalWorker)
  try {
    // Update real precached HTML and its revision through the preview server.
    // This proves the refresh serves new content, not just a new worker comment.
    await writeFile('dist/index.html', updatedHtml)
    await writeFile('dist/sw.js', updatedWorker)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      await registration.update()
    })
    await app.assertUpdateAvailable()
    await testInfo.attach('update-prompt', { body: await page.screenshot(), contentType: 'image/png' })
    await app.acceptUpdate()
    await expect(page).toHaveTitle(updatedTitle)
    await app.assertPhotoCountBadge(2)
    await app.assertEditedPhoto()
    expect(await page.evaluate(() => localStorage.getItem('collage-session-id'))).toBe(session)
  } finally {
    await writeFile('dist/sw.js', originalWorker)
    await writeFile('dist/index.html', originalHtml)
  }
})
