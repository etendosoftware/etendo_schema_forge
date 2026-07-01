import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Schema Forge E2E tests.
 *
 * Two modes:
 *   1. Dev server (default):  make dev → http://localhost:3100
 *   2. Deployed (Etendo):     BASE_URL=http://localhost:8080/etendo/web/com.etendoerp.go make test-e2e
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: [
    ['html', { open: 'never', outputFolder: '../artifacts/e2e-report' }],
    ['list'],
  ],
  timeout: 60_000,

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.E2E_VIDEO ? 'on' : 'on-first-retry',
    headless: !!process.env.CI,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'mocked',
      testMatch: '**/*.mocked.spec.js',
      use: { ...devices['Desktop Chrome'] },
      workers: process.env.CI ? 4 : undefined,
    },
    {
      name: 'onboarding-setup',
      testMatch: '**/onboarding-register.integration.spec.js',
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
    },
    {
      name: 'integration',
      testIgnore: ['**/*.mocked.spec.js', '**/onboarding-register.integration.spec.js'],
      dependencies: ['onboarding-setup'],
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
    },
  ],
});
