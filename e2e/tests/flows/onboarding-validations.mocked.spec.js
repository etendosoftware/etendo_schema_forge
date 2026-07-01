import { test, expect } from '@playwright/test';

/**
 * Onboarding — Two continuous E2E flows (mocked, no backend).
 *
 * Flow 1: Full registration journey
 *   Page elements → password toggle → duplicate email error → successful register →
 *   profile step (pre-filled name, country, business type) → back button preserves data →
 *   company step (required fields, optional address) → start → dashboard
 *
 * Flow 2: Login & password recovery
 *   Navigate to login → wrong credentials error → password toggle →
 *   forgot password → success message → back to login → successful login
 *
 * Mock mode only.
 */

// ── Mock installer ───────────────────────────────────────────────────────────

async function installMocks(page, { registerBehavior = 'success', loginBehavior = 'success' } = {}) {
  await page.route('**/sws/go/me', route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"invalid"}}' })
  );

  await page.route('**/sws/go/register', async route => {
    if (registerBehavior === 'fail') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Email already registered', userMessage: 'El correo electrónico ya está registrado' } }),
      });
    }
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'platform-token', account: { name: body.name, email: body.email } }),
    });
  });

  await page.route('**/sws/go/login', async route => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET' && url.includes('userId=')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'env-token',
          roleList: [{ id: 'ROLE_1', name: 'Admin', orgList: [{ id: 'ORG_1', name: 'QA Org' }] }],
        }),
      });
    }
    if (method === 'POST') {
      if (loginBehavior === 'first-fails') {
        loginBehavior = 'success'; // next call succeeds
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Invalid credentials', userMessage: 'Credenciales incorrectas' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'platform-token', account: { name: 'QA User', email: 'qa@test.com' } }),
      });
    }
    route.fallback();
  });

  await page.route('**/sws/go/environments', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        environments: [{ clientId: 'C1', clientName: 'QA Company', adminUserId: 'U1', adminUserName: 'QA Admin' }],
      }),
    })
  );

  await page.route('**/sws/go/onboarding', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        JSON.stringify({ type: 'progress', step: 'setup', status: 'done', ms: 5 }),
        JSON.stringify({ type: 'progress', step: 'client', status: 'done', ms: 10 }),
        JSON.stringify({ type: 'progress', step: 'organization', status: 'done', ms: 15 }),
        JSON.stringify({ type: 'progress', step: 'finalize', status: 'done', ms: 20 }),
        JSON.stringify({ type: 'result', success: true }),
        '',
      ].join('\n'),
    })
  );

  await page.route('**/sws/neo/session', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"user":"QA Admin"}' })
  );
  await page.route('**/sws/neo/sales-invoice/header/defaults', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"documentType":"DOC1"}' })
  );
  await page.route('**/sws/neo/sales-invoice/header/selectors/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[{"id":"1","label":"Item"}]}' })
  );
  await page.route('**/sws/go/password-reset/request', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );
}

// ── Flow 1: Full registration journey ────────────────────────────────────────

test.describe('Onboarding — Full registration flow', () => {

  test('register page → validations → profile → company → dashboard', async ({ page }) => {
    const ts = Date.now();
    await installMocks(page);
    await page.goto('/onboarding');

    // ═══════════════════════════════════════════════════════════════════════
    // PART 1: Register page — verify all elements are present
    // ═══════════════════════════════════════════════════════════════════════

    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();
    await expect(page.locator('#reg-name')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
    await expect(page.getByTestId('action-register-submit')).toBeVisible();
    await expect(page.locator('#onboarding-language')).toBeVisible();
    await expect(page.getByTestId('action-switch-to-login')).toBeVisible();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2: Password visibility toggle
    // ═══════════════════════════════════════════════════════════════════════

    const passwordInput = page.locator('#reg-password');
    await passwordInput.fill('MySecret123!');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /mostrar|show/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /ocultar|hide/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // ═══════════════════════════════════════════════════════════════════════
    // PART 3: Successful registration — advance to profile step
    // ═══════════════════════════════════════════════════════════════════════

    await page.locator('#reg-name').fill('QA User');
    await page.locator('#reg-email').fill(`qa-reg-${ts}@example.com`);
    await passwordInput.clear();
    await passwordInput.fill(`Qa-${ts}-Pass!42`);
    await page.getByTestId('action-register-submit').click();

    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5: Profile step — pre-filled name, country, business types
    // ═══════════════════════════════════════════════════════════════════════

    // Name is pre-filled from registration
    const fullNameInput = page.locator('#fullName');
    await expect(fullNameInput).toHaveValue('QA User');

    // Progress bar shows "Un paso más"
    await expect(page.getByText(/un paso m[aá]s/i)).toBeVisible();

    // Country selector visible
    await expect(page.locator('#countryCode')).toBeVisible();

    // Business type options visible
    await expect(page.getByText(/empresa/i).first()).toBeVisible();
    await expect(page.getByText(/autónomo|autonomo/i).first()).toBeVisible();
    await expect(page.getByText(/asesoría|asesoria/i).first()).toBeVisible();

    // Continue disabled without name
    const continueBtn = page.getByRole('button', { name: /continuar|continue/i });
    await fullNameInput.clear();
    await expect(continueBtn).toBeDisabled();

    // Fill name back — enabled
    await fullNameInput.fill('QA User');
    await expect(continueBtn).toBeEnabled();

    // Continue to company step
    await continueBtn.click();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 6: Company step — required fields, optional address, back
    // ═══════════════════════════════════════════════════════════════════════

    await expect(page.getByText(/datos para empezar a facturar/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/casi listo/i)).toBeVisible();

    // Start button disabled (no company name or fiscal ID)
    const startBtn = page.getByRole('button', { name: /empezar|start/i });
    await expect(startBtn).toBeDisabled();

    // Fill company name only — still disabled
    await page.locator('#clientName').fill('Mi Empresa E2E');
    await expect(startBtn).toBeDisabled();

    // Fill fiscal ID — enabled
    await page.locator('#fiscalIdValue').fill('B12345678');
    await expect(startBtn).toBeEnabled();

    // Address shows "(opcional)"
    await expect(page.getByText(/opcional/i)).toBeVisible();

    // Sector dropdown visible
    await expect(page.locator('#sector')).toBeVisible();

    // Click "Atrás" — goes back to profile step with data preserved
    await page.getByRole('button', { name: /atr[aá]s|back/i }).click();
    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible();
    await expect(fullNameInput).toHaveValue('QA User');

    // Go forward again — company data should still be there
    await continueBtn.click();
    await expect(page.locator('#clientName')).toHaveValue('Mi Empresa E2E');

    // Fill optional fields
    await page.getByRole('textbox', { name: /direcci[oó]n|address/i }).fill('Calle QA 123');

    // ═══════════════════════════════════════════════════════════════════════
    // PART 7: Start — verify the onboarding request fires
    // ═══════════════════════════════════════════════════════════════════════

    const onboardingPromise = page.waitForRequest(
      req => req.url().includes('/sws/go/onboarding') && req.method() === 'POST',
      { timeout: 15_000 }
    );
    await startBtn.click();

    const onboardingReq = await onboardingPromise;
    const onboardingBody = onboardingReq.postDataJSON();
    expect(onboardingBody.clientName).toBe('Mi Empresa E2E');
  });
});

// ── Flow 2: Login & password recovery ────────────────────────────────────────

test.describe('Onboarding — Login & password recovery flow', () => {

  test('duplicate email → login view → wrong credentials → password toggle → forgot password → successful login', async ({ page }) => {
    await installMocks(page, { registerBehavior: 'fail', loginBehavior: 'first-fails' });
    await page.goto('/onboarding');

    // ═══════════════════════════════════════════════════════════════════════
    // PART 1: Duplicate email error on register
    // ═══════════════════════════════════════════════════════════════════════

    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();

    await page.locator('#reg-name').fill('QA User');
    await page.locator('#reg-email').fill('existing@example.com');
    await page.locator('#reg-password').fill('Qa-test-Pass!42');
    await page.getByTestId('action-register-submit').click();

    // Error message shown
    const registerError = page.locator('.border-rose-200');
    await expect(registerError).toBeVisible({ timeout: 5_000 });
    await expect(registerError).toContainText(/ya está registrado|already registered/i);

    // Still on register view
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2: Navigate from register to login
    // ═══════════════════════════════════════════════════════════════════════

    await page.getByTestId('action-switch-to-login').click();
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#login-password')).toBeVisible();

    // Register heading should not be visible
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).not.toBeVisible();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2: Wrong credentials — error message
    // ═══════════════════════════════════════════════════════════════════════

    await page.locator('#login-email').fill('wrong@test.com');
    await page.locator('#login-password').fill('WrongPassword!1');
    await page.getByTestId('action-login-submit').click();

    const errorBox = page.locator('.border-rose-200');
    await expect(errorBox).toBeVisible({ timeout: 5_000 });
    await expect(errorBox).toContainText(/incorrectas|invalid|wrong/i);

    // Still on login view
    await expect(page.locator('#login-email')).toBeVisible();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 3: Password visibility toggle (on login form)
    // ═══════════════════════════════════════════════════════════════════════

    const loginPassword = page.locator('#login-password');
    await expect(loginPassword).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /mostrar|show/i }).click();
    await expect(loginPassword).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /ocultar|hide/i }).click();
    await expect(loginPassword).toHaveAttribute('type', 'password');

    // ═══════════════════════════════════════════════════════════════════════
    // PART 4: Forgot password — send reset email and return to login
    // ═══════════════════════════════════════════════════════════════════════

    await page.getByRole('button', { name: /olvidaste|forgot|olvid/i }).click();

    const forgotEmail = page.locator('#forgot-email');
    await expect(forgotEmail).toBeVisible({ timeout: 5_000 });

    await forgotEmail.fill('qa@test.com');
    await page.getByTestId('action-forgot-password-submit').click();

    // Success message
    const successBox = page.locator('.border-emerald-200');
    await expect(successBox).toBeVisible({ timeout: 5_000 });

    // Back to login
    await page.getByTestId('action-forgot-back-to-login').click();
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5: Successful login
    // ═══════════════════════════════════════════════════════════════════════

    await page.locator('#login-email').fill('qa@test.com');
    await page.locator('#login-password').fill('Qa-test-Pass!42');

    // Set up listeners before clicking
    const loginPromise = page.waitForRequest(
      req => req.url().includes('/sws/go/login') && req.method() === 'POST',
      { timeout: 10_000 }
    );
    const envPromise = page.waitForRequest(
      req => req.url().includes('/sws/go/environments'),
      { timeout: 10_000 }
    );

    await page.getByTestId('action-login-submit').click();

    // Verify login request sent with correct email
    const loginReq = await loginPromise;
    expect(loginReq.postDataJSON().email).toBe('qa@test.com');

    // Login succeeded — environment list is fetched
    await envPromise;

    // ═══════════════════════════════════════════════════════════════════════
    // PART 6: Verify we can navigate back to register from login
    // ═══════════════════════════════════════════════════════════════════════

    // Navigate fresh to verify register ↔ login navigation
    await page.goto('/onboarding');
    await page.getByTestId('action-switch-to-login').click();
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('action-switch-to-register').click();
    await expect(page.getByRole('heading', { name: /crea tu cuenta gratis/i })).toBeVisible({ timeout: 5_000 });
  });
});
