import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.EXTENDED_BROWSERS === '1'
      ? [
          { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
        ]
      : []),
  ],
  webServer: [
    {
      command: 'pnpm run dev:web',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'pnpm run dev:server',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
