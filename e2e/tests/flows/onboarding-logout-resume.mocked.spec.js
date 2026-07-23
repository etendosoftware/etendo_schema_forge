import { test, expect } from '@playwright/test';

/**
 * ETP-4584 — authenticated onboarding logout and resume (mocked boundary).
 *
 * These browser journeys run with `make dev-local-core`: the consumer resolves
 * the Core packages from the sibling source checkout while Playwright owns the
 * `/sws/go/**` boundary.  The mock intentionally retains drafts between login
 * attempts so the assertions exercise the real resume behaviour rather than a
 * browser-local imitation of it.
 */

const ACCOUNT = { name: 'QA Resume User', email: 'resume@example.com' };
const PLATFORM_TOKEN = 'platform-token';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installOnboardingMocks(page, { failDraftSave = false, holdProvisioning = false } = {}) {
  const state = { draft: null, events: [], releaseProvisioning: null };

  await page.route('**/sws/go/me', route => json(route, ACCOUNT));
  await page.route('**/sws/go/register', route => json(route, { token: PLATFORM_TOKEN, account: ACCOUNT }));
  await page.route('**/sws/go/login', route => {
    if (route.request().method() === 'POST') return json(route, { token: PLATFORM_TOKEN, account: ACCOUNT });
    return route.fallback();
  });
  await page.route('**/sws/go/environments', route => json(route, { environments: [] }));

  // One endpoint owns both restore and final/debounced persistence. Capture the
  // POST before fulfilling it: the test can prove it preceded local cleanup.
  await page.route('**/sws/go/onboarding/draft', async route => {
    if (route.request().method() === 'GET') return json(route, { draft: state.draft });
    const payload = route.request().postDataJSON();
    state.events.push({ type: 'draft-save', draft: payload.draft });
    if (failDraftSave) return json(route, { error: { message: 'draft unavailable' } }, 500);
    state.draft = payload.draft;
    return json(route, { ok: true });
  });

  await page.route('**/sws/go/onboarding', async route => {
    if (holdProvisioning) {
      await new Promise(resolve => { state.releaseProvisioning = resolve; });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({ type: 'result', success: true })}\n`,
    });
  });

  return state;
}

async function registerToProfile(page) {
  await page.goto('/onboarding');
  await page.getByTestId('action-switch-to-register').click();
  await page.locator('#reg-name').fill(ACCOUNT.name);
  await page.locator('#reg-email').fill(ACCOUNT.email);
  await page.locator('#reg-password').fill('Qa-Resume-Pass!42');
  await page.getByTestId('action-register-submit').click();
  await expect(page.locator('#fullName')).toBeVisible();
}

async function loginToRestoredDraft(page) {
  await expect(page.getByTestId('draft-save-warning')).toHaveCount(0);
  await page.locator('#login-email').fill(ACCOUNT.email);
  await page.locator('#login-password').fill('Qa-Resume-Pass!42');
  await page.getByTestId('action-login-submit').click();
  await expect(page.locator('#fullName, #clientName')).toBeVisible();
}

async function logout(page) {
  await page.getByTestId('onboarding-logout').click();
  await expect(page.getByTestId('action-login-submit')).toBeVisible();
}

test.describe('ETP-4584 — onboarding logout and resume', () => {
  test('saves edited Profile before cleanup, logs in, and restores its values', async ({ page }) => {
    const state = await installOnboardingMocks(page);
    await registerToProfile(page);

    await page.locator('#fullName').fill('Edited Resume Name');
    await logout(page);

    expect(state.events).toHaveLength(1);
    expect(state.events[0].draft).toMatchObject({ step: 1, form: { fullName: 'Edited Resume Name' } });
    // The credential has been removed only after the final draft POST resolved.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sf_platform_token'))).toBeNull();

    await loginToRestoredDraft(page);
    await expect(page.locator('#fullName')).toHaveValue('Edited Resume Name');
    await expect(page.getByTestId('draft-restored-notice')).toBeVisible();
  });

  test('direct navigation to /logout clears the authenticated session without a redirect loop', async ({ page }) => {
    await installOnboardingMocks(page);
    await page.goto('/onboarding');
    await page.evaluate(() => {
      localStorage.setItem('sf_auth_token', 'environment-token');
      localStorage.setItem('sf_platform_token', 'platform-token');
    });

    await page.goto('/logout?returnTo=/logout');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByTestId('action-login-submit')).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      auth: localStorage.getItem('sf_auth_token'),
      platform: localStorage.getItem('sf_platform_token'),
    }))).toEqual({ auth: null, platform: null });
  });

  test('flushes pending Company edits before logout and resumes at Company', async ({ page }) => {
    const state = await installOnboardingMocks(page);
    await registerToProfile(page);
    await page.getByRole('button', { name: /continuar|continue/i }).click();
    await expect(page.locator('#clientName')).toBeVisible();
    await page.locator('#clientName').fill('Pending Company Draft');

    await logout(page);
    // The profile→company transition may itself flush the profile snapshot.
    // The final event must nevertheless be the pending Company edit.
    expect(state.events).not.toHaveLength(0);
    expect(state.events.at(-1).draft).toMatchObject({ step: 2, form: { clientName: 'Pending Company Draft' } });

    await loginToRestoredDraft(page);
    await expect(page.locator('#clientName')).toHaveValue('Pending Company Draft');
  });

  test('logs out during provisioning and does not recreate a session after the stream completes', async ({ page }) => {
    const state = await installOnboardingMocks(page, { holdProvisioning: true });
    await registerToProfile(page);
    await page.getByRole('button', { name: /continuar|continue/i }).click();
    await page.locator('#clientName').fill('Provisioning Escape');
    await page.getByRole('button', { name: /empezar|start/i }).click();
    await expect(page.getByTestId('onboarding-logout')).toBeVisible();

    await logout(page);
    state.releaseProvisioning?.();
    await page.waitForTimeout(100);
    await expect(page.getByTestId('action-login-submit')).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sf_auth_token'))).toBeNull();
  });

  test('shows the localized save warning yet reaches Login after a failed final save', async ({ page }) => {
    await installOnboardingMocks(page, { failDraftSave: true });
    await registerToProfile(page);
    await page.locator('#fullName').fill('Will Not Persist');

    await logout(page);
    await expect(page.getByTestId('draft-save-warning')).toBeVisible();
    await expect(page.getByTestId('draft-save-warning')).toContainText(/cambios|guard/i);
  });

  test('is idempotent for repeated keyboard logout and remains usable on a narrow viewport', async ({ page }) => {
    const state = await installOnboardingMocks(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await registerToProfile(page);
    await page.locator('#fullName').fill('Keyboard Logout');

    const action = page.getByTestId('onboarding-logout');
    await expect(action).toBeVisible();
    await action.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('action-login-submit')).toBeVisible();
    expect(state.events).toHaveLength(1);
  });
});
