import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the-delegation E2E tests.
 *
 * Expects both servers running before test start:
 *   - DevAll backend on port 6400
 *   - Vite dev server on port 3000
 *
 * The test uses the @cline tag so it can be filtered:
 *   npx playwright test --grep @cline
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: ['unit/**'], // node --test suites (npm run test:unit)
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000/the-delegation/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
