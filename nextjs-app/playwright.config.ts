import { defineConfig, devices } from '@playwright/test'

// E2E runs against a local dev server with the AI mocked (FOUNDRY_MOCK=true), so it is free and repeatable.
// Public-page tests need nothing else. The signed-in tests also need Supabase keys in .env.local and RUN_E2E_AUTH=1.
const port = Number(process.env.E2E_PORT) || 3100

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { FOUNDRY_MOCK: 'true', JOB_EXECUTION_MODE: 'inline', NEXT_PUBLIC_SITE_URL: `http://localhost:${port}` },
  },
})
