import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Pick up co-located unit tests in src/ AND integration tests in tests/.
  testMatch: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  reporter: [['json', { outputFile: 'test-results/report.json' }]],
  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    // baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Maximum time one test can run for.
  timeout: 120_000,
  // Maximum number of workers running in parallel.
  workers: 1,
});
