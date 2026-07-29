import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Playwright configuration for Schema Forge E2E tests.
 *
 * Two modes:
 *   1. Local (default):   Playwright starts and owns a dev server from THIS
 *                         checkout — see `webServer` below.
 *   2. External target:   BASE_URL=http://localhost:8080/etendo/web/com.etendoerp.go
 *                         npx playwright test   (no server is started)
 *
 * Why Playwright owns the server: without a `webServer` block it simply uses
 * whatever answers the port, so a run could silently exercise a different
 * checkout's app — passing or failing against code that is not under test. That
 * is the worst failure mode a golden master can have, because it is invisible in
 * both directions. See "Pitfalls that fail silently" in docs/e2e-testing-guide.md.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

// An explicit external target disables the managed server entirely.
const EXTERNAL_TARGET = process.env.BASE_URL || null;
// Dedicated E2E port, deliberately NOT the 3100 dev port: `make dev` and an E2E
// run must be able to coexist, and two checkouts must not silently share one
// server. Override with E2E_PORT when running several suites at once.
const E2E_PORT = Number(process.env.E2E_PORT || 3200);
const LOCAL_TARGET = `http://localhost:${E2E_PORT}`;

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

  // Start the app from THIS worktree, unless an external target was named.
  // Omitted (undefined) rather than disabled so an external run spawns nothing.
  webServer: EXTERNAL_TARGET ? undefined : {
    // `cwd` is what actually pins the run to this checkout — the whole point.
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    cwd: resolve(__dirname, '../tools/app-shell'),
    url: LOCAL_TARGET,
    // Never adopt a server this config did not start. Reusing one would
    // reintroduce exactly the bug this block exists to prevent, so a busy port
    // is a loud error rather than a silent wrong-app run.
    reuseExistingServer: false,
    // Cold vite compiles the whole module graph on first boot (~35s locally,
    // slower on CI hardware).
    timeout: 180_000,
    stderr: 'pipe',
    // LOCAL_CORE / SCHEMA_FORGE_CORE are inherited from the ambient environment
    // rather than forced: resolving core from local source is opt-in by design
    // (see docs/repo-topology.md), and hardcoding it here would break CI and
    // functional-only devs, who have no core checkout to resolve against.
  },

  use: {
    baseURL: EXTERNAL_TARGET || LOCAL_TARGET,
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
