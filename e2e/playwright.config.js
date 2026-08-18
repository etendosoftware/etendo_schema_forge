import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The onboarding project creates this file for the downstream integration tests.
// Reuse it when available so running integration tests does not register another
// user on every Playwright invocation.
const authCredentialsPath = resolve(import.meta.dirname, '.auth-credentials.json');
const hasAuthCredentials = existsSync(authCredentialsPath);

/**
 * Playwright configuration for Schema Forge E2E tests.
 *
 * Two modes:
 *   1. Dev server (default):  make dev → http://localhost:3100
 *   2. Deployed (Etendo):     BASE_URL=http://localhost:8080/etendo/web/com.etendoerp.go make test-e2e
 */

// mocked is always safe to parallelize — every mocked spec talks to a fully
// intercepted, per-page fake backend, so workers never share state.
//
// onboarding-setup/integration default to workers:1 for a real reason: every
// *.integration.spec.js logs in with the SAME shared admin credentials against
// the SAME live Etendo/Postgres tenant (see e.g. contacts-integration.spec.js),
// so concurrent workers there race on real, shared records — data corruption,
// not just flakiness. Raising E2E_WORKERS above 1 applies to ALL THREE
// projects, including these two: that's an explicit, opt-in acceptance of that
// risk (deliberately not a separate/quieter knob), not a safe default.
const E2E_WORKERS = process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined;
const MOCKED_WORKERS = E2E_WORKERS ?? 4;
const INTEGRATION_WORKERS = E2E_WORKERS ?? 1;
const CAPTURE_SCREENSHOTS = new Set(['1', 'true', 'yes']).has(
  String(process.env.E2E_CAPTURE_SCREENSHOTS || '').toLowerCase(),
);

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
    screenshot: CAPTURE_SCREENSHOTS ? 'only-on-failure' : 'off',
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
      workers: MOCKED_WORKERS,
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
      dependencies: hasAuthCredentials ? [] : ['onboarding-setup'],
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
    },
  ],
});
