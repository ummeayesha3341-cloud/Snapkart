import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'snapkart.spec.js',
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    cwd: './frontend',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:3000',
      VITE_SUPABASE_URL: 'https://snapkart-e2e.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-public-test-key',
    },
  },
});
