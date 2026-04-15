import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/journeys',
  use: {
    baseURL: 'http://localhost:5000'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5000',
    port: 5000,
    reuseExistingServer: !process.env.CI
  }
})
