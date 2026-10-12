import { test } from '@playwright/test'
import { projectJourney } from './project-journey'

test('saved projects survive edits, independent duplication, reload, and backup restore', async ({ page }, testInfo) => {
  await projectJourney(page, testInfo)
})
