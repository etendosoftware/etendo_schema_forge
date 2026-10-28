import { test, expect } from '../../helpers/test.js';
import { declareNoSession } from '../../helpers/auth.js';

/**
 * ETP-4665 — Onboarding length limits and readable provisioning errors (mocked).
 *
 * Before this ticket the three onboarding steps accepted values longer than the
 * Etendo AD columns they are written to. The overflow was only caught by the DAL
 * halfway through tenant provisioning, which rolled the transaction back and put
 * the literal, untranslated `@CreateClientFailed@` on the user's screen.
 *
 * Every limit asserted here is the size of the AD column behind the field:
 *   email       60  → AD_USER.USERNAME / AD_USER.NAME
 *   accountName 60  → no storage constraint; pinned to fullName because step 2 pre-fills it
 *   fullName    60  → AD_USER.NAME  (40 for freelancers: it doubles as the client name)
 *   clientName  40  → AD_CLIENT.VALUE / AD_ORG.VALUE
 *               (the input itself accepts 60 so an over-limit name shows an inline error
 *               instead of being silently truncated — ETP-5638)
 *   fiscalId    20  → C_BPARTNER.TAXID
 *   address     60  → C_LOCATION.ADDRESS1
 *
 * Mock mode only — no backend required.
 */

const LIMITS = {
  accountName: 60,
  email: 60,
  password: 128,
  fullName: 60,
  freelancerFullName: 40,
  clientName: 40,
  clientNameInput: 60,
  fiscalId: 20,
  address: 60,
  // ETP-5806 — the free-text address field was replaced by structured Street/Number/Building
  // Name/City cells; streetName is the closest conceptual replacement for this length-limit
  // check (`ETGO_CORE` ships maxLength === the AD column limit, same as the old address field).
  streetName: 70,
};

// ── Mock installer ───────────────────────────────────────────────────────────

async function installMocks(page, { registerBehavior = 'success', onboardingResult } = {}) {
  await declareNoSession(page);
  await page.route('**/sws/go/me', route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"invalid"}}' })
  );

  await page.route('**/sws/go/session/register', async route => {
    if (registerBehavior === 'field-too-long') {
      // The envelope a non-browser client gets when it bypasses maxLength.
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'FIELD_TOO_LONG',
            field: 'email',
            max: LIMITS.email,
            message: 'Field email must not exceed 60 characters',
          },
        }),
      });
    }
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'platform-token', account: { name: body.name, email: body.email } }),
    });
  });

  await page.route('**/sws/go/environments', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ environments: [] }) })
  );

  // Draft autosave/restore — handleNext() awaits this before advancing steps,
  // so leaving it unmocked hangs every "Continuar" click forever.
  await page.route('**/sws/go/onboarding/draft', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft: null }) })
  );

  await page.route('**/sws/go/onboarding', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        JSON.stringify({ type: 'progress', step: 'setup', status: 'done', ms: 5 }),
        JSON.stringify(onboardingResult ?? { type: 'result', success: true }),
        '',
      ].join('\n'),
    })
  );
}

/** Registers a fresh account and lands on the profile step. */
async function registerAndReachProfile(page, ts) {
  await page.goto('/onboarding');
  await page.getByTestId('action-switch-to-register').click();
  await page.locator('#reg-name').fill('QA User');
  await page.locator('#reg-email').fill(`qa-len-${ts}@example.com`);
  await page.locator('#reg-password').fill(`Qa-${ts}-Pass!42`);
  await page.getByTestId('action-register-submit').click();
  await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 5_000 });
}

// ── Step 1: account registration ─────────────────────────────────────────────

test.describe('ETP-4665 — Step 1 length limits', () => {

  test('caps name, email and password at their column sizes', async ({ page }) => {
    await installMocks(page);
    await page.goto('/onboarding');
    await page.getByTestId('action-switch-to-register').click();

    await expect(page.locator('#reg-name')).toHaveAttribute('maxlength', String(LIMITS.accountName));
    await expect(page.locator('#reg-email')).toHaveAttribute('maxlength', String(LIMITS.email));
    await expect(page.locator('#reg-password')).toHaveAttribute('maxlength', String(LIMITS.password));
  });

  test('silently blocks an email past 60 characters — the exact reported overflow', async ({ page }) => {
    await installMocks(page);
    await page.goto('/onboarding');
    await page.getByTestId('action-switch-to-register').click();

    // The 255-character address from the bug report.
    const reported = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`;
    expect(reported).toHaveLength(255);

    const email = page.locator('#reg-email');
    await email.fill(reported);

    // Truncated in the browser: the value that would blow up AD_USER.NAME never
    // leaves the form, and no error banner is shown (a silent block by design).
    await expect(email).toHaveValue(reported.slice(0, LIMITS.email));
    await expect(page.getByText(/no puede superar/i)).toHaveCount(0);
  });

  test('localizes a FIELD_TOO_LONG rejection instead of showing the English sentence', async ({ page }) => {
    await installMocks(page, { registerBehavior: 'field-too-long' });
    await page.goto('/onboarding');
    await page.getByTestId('action-switch-to-register').click();

    await page.locator('#reg-name').fill('QA User');
    await page.locator('#reg-email').fill('qa@example.com');
    await page.locator('#reg-password').fill('Qa-Pass!42x');
    await page.getByTestId('action-register-submit').click();

    await expect(page.getByText(`El campo no puede superar los ${LIMITS.email} caracteres.`))
      .toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/must not exceed/i)).toHaveCount(0);
  });
});

// ── Step 2: profile ──────────────────────────────────────────────────────────

test.describe('ETP-4665 — Step 2 length limits', () => {

  test('a name accepted in step 1 never arrives pre-filled and already in error', async ({ page }) => {
    // maxLength does not truncate a programmatically assigned value: when step 1
    // allowed more characters than step 2, the pre-filled "Nombre completo" landed
    // over its own limit, showing an error and disabling Continue on a value the
    // user never typed there.
    await installMocks(page);
    const ts = Date.now();
    const longName = 'A'.repeat(100);

    await page.goto('/onboarding');
    await page.getByTestId('action-switch-to-register').click();

    const regName = page.locator('#reg-name');
    await regName.fill(longName);
    await expect(regName).toHaveValue(longName.slice(0, LIMITS.accountName));

    await page.locator('#reg-email').fill(`qa-prefill-${ts}@example.com`);
    await page.locator('#reg-password').fill(`Qa-${ts}-Pass!42`);
    await page.getByTestId('action-register-submit').click();
    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('#fullName')).toHaveValue(longName.slice(0, LIMITS.fullName));
    await expect(page.getByText(/no puede superar/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /continuar|continue/i })).toBeEnabled();
  });

  test('blocks a freelancer full name past 40 with an inline error', async ({ page }) => {
    // A freelancer has no company: CompanyStep reuses this name as the client
    // name, so it inherits AD_CLIENT.VALUE's tighter 40.
    await installMocks(page);
    await registerAndReachProfile(page, Date.now());

    await page.getByText(/autónomo|autonomo/i).first().click();

    const fullName = page.locator('#fullName');
    const continueBtn = page.getByRole('button', { name: /continuar|continue/i });

    await fullName.fill('f'.repeat(41));
    await expect(page.getByText(`El campo no puede superar los ${LIMITS.freelancerFullName} caracteres.`))
      .toBeVisible();
    await expect(continueBtn).toBeDisabled();

    await fullName.fill('f'.repeat(40));
    await expect(page.getByText(/no puede superar/i)).toHaveCount(0);
    await expect(continueBtn).toBeEnabled();
  });

  test('lets a company use the full 60 characters', async ({ page }) => {
    await installMocks(page);
    await registerAndReachProfile(page, Date.now());

    await page.getByText(/^empresa$/i).first().click();
    await page.locator('#fullName').fill('c'.repeat(60));

    await expect(page.getByText(/no puede superar/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /continuar|continue/i })).toBeEnabled();
  });
});

// ── Step 3: company ──────────────────────────────────────────────────────────

test.describe('ETP-4665 — Step 3 length limits', () => {

  async function reachCompanyStep(page) {
    // ETP-5806 — CompanyStep's structured Street/Number/Building Name fields render only when
    // `capabilities.structuredAddressForSepa` is true. OnboardingFlow.jsx reads `capabilities`
    // exactly once, from the mount-time `GET /sws/go/session` response, and never re-reads it
    // after registration (`handleRegisterSuccess` only calls `GET /sws/go/me`, which carries no
    // capabilities) — confirmed by tracing the core package. A fresh register journey (the
    // declareNoSession 401 `registerAndReachProfile` path) can therefore never see the flag on.
    // Reaching Company step with it on requires landing through an authenticated session
    // bootstrap instead, which skips the register/login screens entirely and lands straight on
    // the Profile step — Profile's own required field (fullName) is filled in manually since
    // there is no registration call to prefill it from.
    await page.route('**/sws/go/session', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          csrfToken: 'csrf-test',
          account: { name: 'QA User', email: 'qa-len@example.com' },
          capabilities: { structuredAddressForSepa: true },
        }),
      });
    });
    await page.route('**/sws/go/me', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'QA User', email: 'qa-len@example.com' }),
      })
    );

    await page.goto('/onboarding');
    await expect(page.getByText(/vamos a dejar todo listo/i)).toBeVisible({ timeout: 5_000 });
    await page.locator('#fullName').fill('QA User');
    await page.getByRole('button', { name: /continuar|continue/i }).click();
    await expect(page.getByText(/datos para empezar a facturar/i)).toBeVisible({ timeout: 5_000 });
  }

  test('never sends a company name that would overflow AD_CLIENT.VALUE', async ({ page }) => {
    await installMocks(page);
    await reachCompanyStep(page);

    const clientName = page.locator('#clientName');
    const start = page.getByRole('button', { name: /empezar|start/i });

    await clientName.fill('E'.repeat(100));
    await page.locator('#streetName').fill('D'.repeat(200));

    // Over the AD limit but inside the input cap: kept, flagged inline, and not submittable.
    await expect(clientName).toHaveValue('E'.repeat(LIMITS.clientNameInput));
    await expect(clientName).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(new RegExp(`${LIMITS.clientName} (caracteres|characters)`))).toBeVisible();
    await expect(start).toBeDisabled();
    // streetName's maxLength is set to the AD column limit itself (no separate looser input
    // cap), so the overflow is truncated by the browser's native maxlength enforcement.
    await expect(page.locator('#streetName')).toHaveValue('D'.repeat(LIMITS.streetName));

    await clientName.fill('E'.repeat(LIMITS.clientName));
    await expect(clientName).not.toHaveAttribute('aria-invalid', 'true');
    // ETP-5806 — filling streetName starts the address block, which makes buildingNumber and
    // city mandatory together with it (isAddressBlockStarted/isCompanyStepValid); fill them too
    // so Start enables on the same submittable state the old single-field address test reached.
    await page.locator('#buildingNumber').fill('123');
    await page.locator('#city').fill('Buenos Aires');
    await expect(start).toBeEnabled();

    const onboardingPromise = page.waitForRequest(
      req => req.url().endsWith('/sws/go/onboarding') && req.method() === 'POST',
      { timeout: 15_000 }
    );
    await start.click();

    const body = (await onboardingPromise).postDataJSON();
    expect(body.clientName.length).toBeLessThanOrEqual(LIMITS.clientName);
    expect(body.streetName.length).toBeLessThanOrEqual(LIMITS.streetName);
  });
});

// ── Provisioning failures must never show a raw AD message key ───────────────

test.describe('ETP-4665 — provisioning error is readable', () => {

  test('replaces the literal @CreateClientFailed@ with a localized message', async ({ page }) => {
    await installMocks(page, {
      onboardingResult: { type: 'result', success: false, message: '@CreateClientFailed@' },
    });
    await registerAndReachProfile(page, Date.now());
    await page.getByRole('button', { name: /continuar|continue/i }).click();
    await expect(page.getByText(/datos para empezar a facturar/i)).toBeVisible({ timeout: 5_000 });

    await page.locator('#clientName').fill('Mi Empresa E2E');
    await page.getByRole('button', { name: /empezar|start/i }).click();

    await expect(page.getByText(/no pudimos crear tu entorno/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('@CreateClientFailed@')).toHaveCount(0);
  });

  test('falls back to the generic message for an unknown AD key', async ({ page }) => {
    await installMocks(page, {
      onboardingResult: { type: 'result', success: false, message: '@SomeBrandNewFailure@' },
    });
    await registerAndReachProfile(page, Date.now());
    await page.getByRole('button', { name: /continuar|continue/i }).click();
    await expect(page.getByText(/datos para empezar a facturar/i)).toBeVisible({ timeout: 5_000 });

    await page.locator('#clientName').fill('Mi Empresa E2E');
    await page.getByRole('button', { name: /empezar|start/i }).click();

    await expect(page.getByText(/ocurri[oó] un problema durante el onboarding/i))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/@\w+@/)).toHaveCount(0);
  });
});
