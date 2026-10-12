import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: './e2e/production',
  testIgnore: [],
  // The update test changes the served worker, so browsers must run serially.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [
    ['html', { outputFolder: 'test-results/production/report' }],
    ['list'],
  ],
  outputDir: 'test-results/production/artifacts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
