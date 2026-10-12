import { expect, type Page, type TestInfo } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { AppPage } from './pages/app.page'
import type { ProjectBackup } from '../src/lib/db'

function content(backup: ProjectBackup) {
  const project = backup.project
  const names = new Map(project.photos.map(photo => [photo.id, photo.fileName]))
  return {
    layout: project.selectedLayoutId,
    settings: project.settings,
    photos: project.photos.map(({ fileName, dataUrl }) => ({ fileName, dataUrl })).sort((a, b) => a.fileName.localeCompare(b.fileName)),
    positions: project.photoPositions.map(position => ({ ...position, photoId: names.get(position.photoId) })).sort((a, b) => a.gridArea.localeCompare(b.gridArea)),
  }
}

// The same real local-storage journey runs against Vite and the offline PWA.
export async function projectJourney(page: Page, testInfo: TestInfo) {
  const app = new AppPage(page)
  await app.goto()
  await app.renameProject('Untitled collage', 'Original')
  await app.uploadViaHiddenInput(['test-image.jpg', 'test-image-2.jpg'])
  await app.editFirstPhoto()
  const originalDownload = await app.downloadBackup()
  const originalFile = testInfo.outputPath('original.json')
  await originalDownload.saveAs(originalFile)
  const original: ProjectBackup = JSON.parse(await readFile(originalFile, 'utf8'))
  expect(original.version).toBe(1)
  expect(original.project.photos).toHaveLength(2)
  expect(original.project.photoPositions).toContainEqual(expect.objectContaining({ rotation: 90, scale: 1.05, objectPosition: '51% 50%' }))
  await app.captureProjectView(testInfo.outputPath('projects-default.png'))
  await app.showProjectLibrary()
  await app.captureProjectView(testInfo.outputPath('projects-library.png'))
  await app.cancelProjectDialog()
  await app.showNewProjectForm()
  await app.captureProjectView(testInfo.outputPath('projects-name.png'))
  await app.cancelProjectDialog()

  await app.createProject('Other')
  await app.uploadViaHiddenInput(['test-image-2.jpg'])
  await app.projectAction('Open', 'Original')
  await app.assertProjectName('Original')
  await app.assertPhotoCountBadge(2)
  await app.assertEditedPhoto()
  await app.assertUndoUnavailable()
  await page.reload()
  await app.assertProjectName('Original')
  await app.assertEditedPhoto()

  await app.projectAction('Duplicate', 'Original')
  await app.assertProjectName('Original copy')
  const copied: ProjectBackup = JSON.parse(await readFile((await (await app.downloadBackup()).path())!, 'utf8'))
  expect(content(copied)).toEqual(content(original))
  await app.rotateEditedPhotoAgain()
  await app.projectAction('Open', 'Original')
  await app.assertProjectName('Original')
  await app.assertEditedPhoto()
  const unchanged: ProjectBackup = JSON.parse(await readFile((await (await app.downloadBackup()).path())!, 'utf8'))
  expect(content(unchanged)).toEqual(content(original))

  await app.projectAction('Delete', 'Original copy')
  await app.captureProjectView(testInfo.outputPath('projects-delete.png'))
  await app.confirmProjectDeletion()
  await app.assertProjectName('Original')

  // Retry the exact same filename after a rejected import.
  const restoreFile = testInfo.outputPath('restore.json')
  await writeFile(restoreFile, JSON.stringify({ ...original, version: 999 }))
  await app.restoreBackup(restoreFile)
  await app.assertRestoreError()
  await app.assertProjectName('Original')
  await app.captureProjectView(testInfo.outputPath('projects-error.png'))
  await writeFile(restoreFile, JSON.stringify(original))
  await app.restoreBackup(restoreFile)
  // Both projects have the same name; compare identity and complete contents.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('collage-session-id'))).not.toBe(original.project.id)
  await app.assertProjectName('Original')
  await app.assertEditedPhoto()
  const restored: ProjectBackup = JSON.parse(await readFile((await (await app.downloadBackup()).path())!, 'utf8'))
  expect(content(restored)).toEqual(content(original))
  expect(restored.project.photos.every(photo => !original.project.photos.some(source => source.id === photo.id))).toBe(true)
}
