import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const chrome = process.env.PLAYWRIGHT_CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'], ...(chrome ? { launchOptions: { executablePath: chrome } } : {}) },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173/?demo=1', reuseExistingServer: !process.env.CI, env: { VITE_OFFLINE_DEMO: '1' }, timeout: 30_000 },
})
