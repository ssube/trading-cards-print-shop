import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const chrome = process.env.PLAYWRIGHT_CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)
export default defineConfig({
  testDir: './tests/pages',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4174/trading-cards-print-shop/', ...devices['Desktop Chrome'], ...(chrome ? { launchOptions: { executablePath: chrome } } : {}) },
  webServer: { command: 'node scripts/pages-server.mjs', url: 'http://127.0.0.1:4174/trading-cards-print-shop/', reuseExistingServer: false, timeout: 10_000 },
})
