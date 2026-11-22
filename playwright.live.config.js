import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'live.spec.js',
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'msedge',
    baseURL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:5173',
    headless: true,
  },
});
