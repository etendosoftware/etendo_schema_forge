/**
 * Authentication and navigation helpers for E2E tests.
 *
 * Two modes:
 *
 * Mock mode (default when BASE_URL is not set, or E2E_USE_MOCK=1):
 *   Seeds localStorage with a fake token before React boots and intercepts /sws/*
 *   so useEntity never receives a 401 and never calls logout().
 *
 * Real Etendo mode (BASE_URL set, or E2E_USE_MOCK=0):
 *   Uses the current onboarding login flow, then enters the first available environment.
 */

const MOCK_MODE_OVERRIDE = process.env.E2E_USE_MOCK;
const IS_MOCK_MODE = MOCK_MODE_OVERRIDE === '1' || (MOCK_MODE_OVERRIDE !== '0' && !process.env.BASE_URL);

export const DEFAULT_USER = process.env.E2E_USER || 'goadmin@etendo.software';
export const DEFAULT_LOGIN_PASS = process.env.E2E_PASSWORD || '';

/**
 * Authenticate for E2E tests.
 *
 * In mock mode: seeds localStorage + intercepts /sws/* API calls.
 * In real mode: fills the onboarding login form and enters the first available environment.
 */
export async function login(page, {
  user = DEFAULT_USER,
  password = DEFAULT_LOGIN_PASS,
} = {}) {
  if (IS_MOCK_MODE) {
    // Inject token before React boots so AuthContext.isAuthenticated = true.
    await page.addInitScript(() => {
      localStorage.setItem('sf_auth_token', 'e2e-mock-token');
      localStorage.setItem('sf_auth_user', 'admin');
    });

    // Intercept /sws/* to prevent the real Etendo backend receiving our fake
    // token (which would return 401 and trigger logout()).
    // - GET /selectors/**  → single synthetic item so product search dropdowns populate
    // - POST /**/callout   → synthetic updates so forceCalloutFields can override user values
    // - POST/PUT/PATCH     → synthetic saved record so the UI can navigate to detail
    // - GET (other)        → empty list
    await page.route('**/sws/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/sws/neo/session')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ currencyCode: 'EUR' }),
        });
      } else if (url.includes('/sws/neo/dashboard/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
      } else if (url.includes('/selectors/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [{ id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' }] }),
        });
      } else if (method === 'POST' && url.includes('/callout')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            updates: { quantityCount: { value: 42 }, bookQuantity: { value: 42 } },
            combos: {},
            messages: [],
          }),
        });
      } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'e2e-record-id', data: {}, success: true }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], totalRows: 0 }),
        });
      }
    });

    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    return;
  }

  if (!password) {
    throw new Error('Set E2E_PASSWORD for real-backend E2E login, or set E2E_USE_MOCK=1 for mock mode.');
  }

  await page.goto('/onboarding');

  const dashboardReady = await page.waitForURL('**/dashboard', { timeout: 2_000 }).then(() => true).catch(() => false);
  if (dashboardReady) return;

  const switchToLogin = page.getByTestId('action-switch-to-login');
  if (await switchToLogin.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await switchToLogin.click();
  }

  await page.locator('#login-email').fill(user);
  await page.locator('#login-password').fill(password);
  await page.getByTestId('action-login-submit').click();

  await expectAnyEnvironmentOrDashboard(page);

  if (page.url().includes('/dashboard')) return;

  const enterButton = page.locator('[data-testid^="action-enter-environment-"]').first();
  await enterButton.click({ timeout: 30_000 });
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function expectAnyEnvironmentOrDashboard(page) {
  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 30_000 }),
    page.locator('[data-testid^="action-enter-environment-"]').first().waitFor({ state: 'visible', timeout: 30_000 }),
  ]);
}

/**
 * Navigate to a specific window by slug.
 * Uses path-based routing (not hash-based).
 */
export async function navigateTo(page, windowSlug) {
  await page.goto(`/${windowSlug}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}
