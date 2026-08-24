import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waitForEmail, verificationTokenFromEmail } from '../helpers/email-sink.js';

/**
 * Onboarding — Real integration E2E: register a new user, complete profile,
 * select "Autónomo" business type, and verify the greeting.
 *
 * Requires a running Etendo GO backend (localhost:3100 by default).
 * Skipped unless E2E_ONBOARDING_INTEGRATION=1 is set.
 *
 * Each run creates a unique user (random suffix) so the test is repeatable.
 */

const RUN_INTEGRATION = process.env.E2E_ONBOARDING_INTEGRATION === '1';
const SLOW_MS = Number(process.env.E2E_SLOW_MS || 0);

function loadOnboardingAccountCount() {
  const configuredPath = process.env.E2E_ONBOARDING_ACCOUNTS_FILE
    || resolve(import.meta.dirname, '../../onboarding-accounts.json');
  let configuredValue = 1;

  try {
    configuredValue = JSON.parse(readFileSync(configuredPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const count = Number(process.env.E2E_ONBOARDING_ACCOUNT_COUNT
    || (typeof configuredValue === 'number' ? configuredValue : configuredValue?.count)
    || 1);
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error(`E2E onboarding account count must be an integer between 1 and 10, got: ${count}`);
  }
  return count;
}

const ONBOARDING_ACCOUNT_COUNT = loadOnboardingAccountCount();

function uniqueSuffix() {
  return randomBytes(4).toString('hex');
}

async function slow(page) {
  if (SLOW_MS > 0) await page.waitForTimeout(SLOW_MS);
}

// The onboarding entry point now lands on LOGIN by default; switch to the
// register form before interacting with the registration fields.
async function goToRegister(page) {
  await page.goto('/onboarding');
  await page.getByTestId('action-switch-to-register').click();
  await expect(page.locator('#reg-name')).toBeVisible({ timeout: 10_000 });
}

const EMAIL_SINK_URL = process.env.E2E_EMAIL_SINK_URL || 'http://127.0.0.1:8025';

/**
 * ETP-4798 — clears the confirm-your-email wall that now sits between registration and step 1.
 *
 * Waits for whichever screen actually appears, because BOTH are correct depending on the
 * environment. The backend only leaves a confirmation pending when the welcome mail was accepted
 * for delivery; with no email sink (or no provider) it drops the token and leaves the account
 * ungated, and registration lands on the profile step exactly as it did before this feature. So
 * the wall is asserted when it is there and skipped when it is not — this mirrors the backend's
 * own fail-open rather than papering over it.
 *
 * When the wall IS shown, this confirms the address the way a user would: it reads the link out of
 * the real welcome mail in the sink and follows it. That keeps the gate under test instead of
 * disabling it for the E2E run.
 */
async function passEmailConfirmationWall(page, request, email) {
  const wall = page.getByTestId('verify-email-step');
  const profile = page.getByText(/vamos a dejar todo listo/i);
  await expect(wall.or(profile).first()).toBeVisible({ timeout: 15_000 });
  if (!(await wall.isVisible())) {
    return;
  }

  const message = await waitForEmail(request, {
    recipient: email,
    template: 'custom',
    baseURL: EMAIL_SINK_URL,
  });
  // Straight to the app's own route with the token: the flow reads it off the query string,
  // confirms it, strips it from the address bar and drops into onboarding.
  await page.goto(`/onboarding?verifyToken=${encodeURIComponent(verificationTokenFromEmail(message))}`);
}

test.describe('Onboarding — Register new user (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_ONBOARDING_INTEGRATION=1 to run this live onboarding integration test.',
  );

  test('registers new users from the configured account count', async ({ page, context, request }) => {
    for (let accountNumber = 1; accountNumber <= ONBOARDING_ACCOUNT_COUNT; accountNumber += 1) {
    const suffix = uniqueSuffix();
    const userName = `E2E User ${accountNumber} ${suffix}`;
    const userEmail = `e2e-${suffix}@test-onboarding.com`;
    const userPassword = `E2e-${suffix}-Pass!99`;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Navigate to onboarding and fill registration form
    // ═══════════════════════════════════════════════════════════════════════

    await goToRegister(page);
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();

    await page.locator('#reg-name').fill(userName);
    await slow(page);
    await page.locator('#reg-email').fill(userEmail);
    await slow(page);
    await page.locator('#reg-password').fill(userPassword);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Click "Crear cuenta"
    // ═══════════════════════════════════════════════════════════════════════

    await page.getByTestId('action-register-submit').click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2b: Confirm the email address (ETP-4798), when the wall is shown
    // ═══════════════════════════════════════════════════════════════════════

    await passEmailConfirmationWall(page, request, userEmail);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Profile step — verify greeting contains the user name
    // ═══════════════════════════════════════════════════════════════════════

    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 15_000 });

    // The greeting should include the user's first name (first word of userName)
    const firstName = userName.split(' ')[0];
    await expect(page.getByRole('heading', { name: new RegExp(`Hola ${firstName}`, 'i') })).toBeVisible();

    // Full name should be pre-filled
    const fullNameInput = page.locator('#fullName');
    await expect(fullNameInput).toHaveValue(userName);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Select "Autónomo" business type
    // ═══════════════════════════════════════════════════════════════════════

    await page.getByText(/autónomo|autonomo/i).first().click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Click "Continuar"
    // ═══════════════════════════════════════════════════════════════════════

    const continueBtn = page.getByRole('button', { name: /continuar|continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Company step — click "Empezar"
    // The Autónomo (freelancer) business type selected in STEP 4 leaves this
    // step with only the optional Dirección / Sector fields: CompanyStep hides
    // BOTH the company Tax ID (core 0.3.8 / ETP-4445) and the company name —
    // a freelancer invoices under their own identity, so `clientName` is
    // derived from the profile step's `fullName` instead of being asked again.
    // Nothing needs filling here; "Empezar" is already enabled because
    // isCompanyStepValid only requires clientName, which the derivation fills.
    // ═══════════════════════════════════════════════════════════════════════

    await expect(page.locator('#sector')).toBeVisible({ timeout: 10_000 });
    // Guard the derivation: the company-name input must NOT be asked of a
    // freelancer. If this ever renders again, the flow regressed.
    await expect(page.locator('#clientName')).toHaveCount(0);
    await slow(page);

    // Start capturing console logs and network before clicking "Empezar"
    const consoleLogs = [];
    const networkLog = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('response', resp => {
      const url = resp.url();
      if (url.includes('/sws/')) {
        networkLog.push(`${resp.status()} ${resp.request().method()} ${url}`);
      }
    });

    const startBtn = page.getByRole('button', { name: /empezar|start/i });
    await startBtn.scrollIntoViewIfNeeded();
    await expect(startBtn).toBeEnabled({ timeout: 10_000 });
    await startBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Provisioning completes — "Tu cuenta ya está en marcha"
    // ═══════════════════════════════════════════════════════════════════════

    // Wait for the success message that confirms provisioning finished at 100%
    const provisioningOk = await expect(
      page.getByText(/tu cuenta ya est[aá] en marcha|your account is ready/i)
    ).toBeVisible({ timeout: 240_000 }).then(() => true).catch(() => false);

    if (!provisioningOk) {
      // Dump diagnostics so we can see why provisioning got stuck in CI
      console.log('=== PROVISIONING FAILED — DIAGNOSTICS ===');
      console.log('Current URL:', page.url());
      console.log('--- Console logs ---');
      consoleLogs.forEach(l => console.log(l));
      console.log('--- Network log (/sws/) ---');
      networkLog.forEach(l => console.log(l));
      console.log('--- Page text snapshot ---');
      console.log(await page.locator('body').innerText().catch(() => '<could not read>'));
      console.log('=== END DIAGNOSTICS ===');

      // Fail with a clear message
      expect(provisioningOk, 'Provisioning did not complete — see diagnostics above').toBe(true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Redirect to dashboard
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForURL('**/dashboard', { timeout: 60_000 });
    await expect(page).toHaveURL(/dashboard/);

    // Keep the first account in the legacy location for downstream integration tests.
    // Numbered files make every generated admin available to cross-client E2E setup.
    const credentials = { email: userEmail, password: userPassword };
    const credentialsDir = resolve(import.meta.dirname, '../..');
    writeFileSync(
      resolve(credentialsDir, `.auth-credentials-${accountNumber}.json`),
      JSON.stringify(credentials, null, 2),
    );
    if (accountNumber === 1) {
      writeFileSync(
        resolve(credentialsDir, '.auth-credentials.json'),
        JSON.stringify(credentials, null, 2),
      );
    }

    if (accountNumber < ONBOARDING_ACCOUNT_COUNT) {
      // Each iteration must start as an anonymous visitor so the same
      // onboarding flow provisions an independent account and tenant.
      await context.clearCookies();
      await page.evaluate(() => localStorage.clear());
    }
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CORNER CASE 1: Duplicate email — register the same email twice
  // ═════════════════════════════════════════════════════════════════════════

  test('shows error when registering with an already used email', async ({ page, context }) => {
    const suffix = uniqueSuffix();
    const email = `e2e-dup-${suffix}@test-onboarding.com`;
    const password = `E2e-${suffix}-Pass!99`;

    // First registration — should succeed
    await goToRegister(page);
    await page.locator('#reg-name').fill('Dup User');
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill(password);
    await page.getByTestId('action-register-submit').click();
    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 15_000 });
    await slow(page);

    // Clear session so we land on the register form again
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // Second registration — same email, fresh session
    await goToRegister(page);
    await page.locator('#reg-name').fill('Dup User Again');
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill(password);
    await slow(page);
    await page.getByTestId('action-register-submit').click();

    // Should show an error (email already registered)
    const errorBox = page.locator('.border-rose-200');
    await expect(errorBox).toBeVisible({ timeout: 10_000 });
    await expect(errorBox).toContainText(/ya está registrado|already registered/i);
    await slow(page);

    // Should stay on the register page
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CORNER CASE 2: Empty fields — submit button disabled or validation
  // ═════════════════════════════════════════════════════════════════════════

  test('cannot submit registration with empty fields', async ({ page }) => {
    await goToRegister(page);
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();

    const submitBtn = page.getByTestId('action-register-submit');

    // With all fields empty the submit button should be disabled
    await expect(submitBtn).toBeDisabled();

    // Should still be on register page
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();
    // Profile step should NOT be visible
    await expect(page.getByText(/vamos a dejar todo listo/i)).not.toBeVisible();

    // Fill only name — button should still be disabled
    await page.locator('#reg-name').fill('Only Name');
    await expect(submitBtn).toBeDisabled();
    await expect(page.getByText(/vamos a dejar todo listo/i)).not.toBeVisible();

    // Fill name + email but no password — button should still be disabled
    await page.locator('#reg-email').fill('nopass@test.com');
    await expect(submitBtn).toBeDisabled();
    await expect(page.getByText(/vamos a dejar todo listo/i)).not.toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CORNER CASE 3: Invalid email format — submit stays disabled
  // ═════════════════════════════════════════════════════════════════════════

  test('does not advance with an invalid email format', async ({ page }) => {
    await goToRegister(page);

    const submitBtn = page.getByTestId('action-register-submit');

    await page.locator('#reg-name').fill('Bad Email User');
    await page.locator('#reg-email').fill('not-an-email');
    await page.locator('#reg-password').fill('ValidPass!99');
    await slow(page);

    // ETP-4664: submit is gated on isValidEmailFormat(email) on top of password
    // strength, so a malformed address keeps the button disabled outright — a
    // stronger guarantee than the HTML5 validation this case used to rely on.
    await expect(submitBtn).toBeDisabled();

    // Completing the address is what unlocks it — proves the gate is the email
    // and not some unrelated field left empty.
    await page.locator('#reg-email').fill('bad-email-user@test-onboarding.com');
    await expect(submitBtn).toBeEnabled();
    await page.locator('#reg-email').fill('not-an-email');
    await expect(submitBtn).toBeDisabled();
    await slow(page);

    // Should NOT advance to profile step
    await expect(page.getByText(/vamos a dejar todo listo/i)).not.toBeVisible({ timeout: 3_000 });
    // Should still be on the register page
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CORNER CASE 4: Empty name on profile step — Continuar disabled
  // ═════════════════════════════════════════════════════════════════════════

  test('cannot continue on profile step with empty name', async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const userEmail = `e2e-profile-${suffix}@test-onboarding.com`;
    await goToRegister(page);

    await page.locator('#reg-name').fill(`Profile User ${suffix}`);
    await page.locator('#reg-email').fill(userEmail);
    await page.locator('#reg-password').fill(`E2e-${suffix}-Pass!99`);
    await page.getByTestId('action-register-submit').click();

    await passEmailConfirmationWall(page, request, userEmail);

    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 15_000 });

    // Clear the pre-filled name
    const fullNameInput = page.locator('#fullName');
    await fullNameInput.clear();
    await slow(page);

    // Continuar should be disabled
    const continueBtn = page.getByRole('button', { name: /continuar|continue/i });
    await expect(continueBtn).toBeDisabled();
    await slow(page);

    // Fill name back — should be enabled again
    await fullNameInput.fill('Recovered Name');
    await expect(continueBtn).toBeEnabled();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CORNER CASE 5: Provisioning failure — backend error during environment creation
  // ═════════════════════════════════════════════════════════════════════════

  test('shows error and stays on onboarding when provisioning fails', async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const userName = `E2E ProvFail ${suffix}`;
    const userEmail = `e2e-provfail-${suffix}@test-onboarding.com`;
    const userPassword = `E2e-${suffix}-Pass!99`;

    // Register a real user against the backend
    await goToRegister(page);
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();

    await page.locator('#reg-name').fill(userName);
    await page.locator('#reg-email').fill(userEmail);
    await page.locator('#reg-password').fill(userPassword);
    await page.getByTestId('action-register-submit').click();

    await passEmailConfirmationWall(page, request, userEmail);

    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 15_000 });

    // Complete profile step
    await page.getByText(/autónomo|autonomo/i).first().click();
    const continueBtn = page.getByRole('button', { name: /continuar|continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Reach the company step. Nothing to fill: the Autónomo (freelancer) flow
    // hides both the Tax ID (core 0.3.8 / ETP-4445) and the company name field
    // — clientName is derived from the profile step's fullName — so #sector is
    // the stable anchor for "this step rendered".
    await expect(page.locator('#sector')).toBeVisible({ timeout: 10_000 });

    // Intercept ONLY the onboarding POST to simulate a provisioning failure.
    // The user was registered with real backend — this tests error handling
    // with a real session but a failed provisioning.
    await page.route('**/sws/go/onboarding', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ type: 'progress', step: 'setup', status: 'done', ms: 100 }),
          JSON.stringify({ type: 'progress', step: 'client', status: 'done', ms: 200 }),
          JSON.stringify({ type: 'progress', step: 'organization', status: 'error', ms: 300, error: 'Simulated provisioning failure' }),
          JSON.stringify({ type: 'result', success: false, error: 'Environment creation failed' }),
          '',
        ].join('\n'),
      });
    });

    // Click "Empezar" — provisioning will fail via intercepted route
    const startBtn = page.getByRole('button', { name: /empezar|start/i });
    await startBtn.scrollIntoViewIfNeeded();
    await expect(startBtn).toBeEnabled({ timeout: 10_000 });
    await startBtn.click();

    // Should NOT redirect to dashboard — wait long enough for a redirect to happen
    await page.waitForTimeout(5_000);
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 10_000 });

    // The user should still be somewhere in onboarding, OR see an error.
    // After a provisioning failure the app may stay on /onboarding, show an
    // intermediate error screen, or redirect to a loading/error route — any of
    // those is acceptable as long as the user did NOT land on the dashboard.
    const url = page.url();
    const notOnDashboard = !url.includes('/dashboard');
    const errorVisible = await page.getByText(/error|fallo|failed|no se pudo/i).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const onOnboarding = url.includes('/onboarding');
    // #sector, not #clientName: the freelancer company step never renders a
    // company-name input, so that locator would always report false here.
    const formVisible = await page.locator('#sector')
      .isVisible({ timeout: 3_000 }).catch(() => false);

    // Success: not on dashboard AND (error shown OR still on onboarding form)
    expect(notOnDashboard && (errorVisible || onOnboarding || formVisible)).toBe(true);
  });
});
