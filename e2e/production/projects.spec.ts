import { test } from '@playwright/test'
import { AppPage } from '../pages/app.page'
import { projectJourney } from '../project-journey'

test('installed projects can be created, switched, and backed up entirely offline', async ({ page, context }, testInfo) => {
  const app = new AppPage(page)
  await app.goto()
  await app.waitForOfflineReady()
  await context.setOffline(true)
  await projectJourney(page, testInfo)
})
