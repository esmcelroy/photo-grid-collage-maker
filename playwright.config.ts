import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Configure reporters for CI proof artifacts
  reporter: [
    ['html', { outputFolder: 'test-results/playwright-report' }],
    ['list'], // Console output for quick feedback
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Screenshot configuration for proof artifacts
    screenshot: 'only-on-failure', // Only capture on failures to keep CI artifacts lean
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
