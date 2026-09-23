import { test, expect } from '@playwright/test';

const LOCALE_LABELS = {
  es_ES: {
    languageLabel: 'Idioma',
    name: 'Nombre*',
    email: 'Correo electrónico*',
    password: 'Contraseña*',
    createAccount: 'Crear cuenta',
    continue: 'Continuar',
    companyName: 'Nombre de la empresa*',
    address: 'Dirección',
    start: 'Empezar',
    intro: /Vamos a dejar todo listo/i,
    heading: /Crea tu cuenta gratis/i,
  },
  en_US: {
    languageLabel: 'Language',
    name: 'Name*',
    email: 'Email*',
    password: 'Password*',
    createAccount: 'Create account',
    continue: 'Continue',
    companyName: 'Company name*',
    address: 'Address',
    start: 'Start',
    intro: /We will get everything ready/i,
    heading: /Create your free account/i,
  },
};

function labelsFor(locale) {
  return LOCALE_LABELS[locale] || LOCALE_LABELS.es_ES;
}

async function installOnboardingMocks(page, { invalidDocumentType = false, expectedLanguage = 'es_ES' } = {}) {
  await page.route('**/sws/go/me', async route => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'invalid' } }),
    });
  });

  await page.route('**/sws/go/session/register', async route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      name: 'QA Onboarding User',
      email: /qa-onboarding-.+@example\.com/,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'platform-token',
        account: { name: body.name, email: body.email },
      }),
    });
  });

  await page.route('**/sws/go/onboarding', async route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      clientName: 'QA Mock Company',
      currency: 'EUR',
      language: expectedLanguage,
      countryCode: 'ES',
    });
    await route.fulfill({
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
    });
  });

  await page.route('**/sws/go/environments', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        environments: [{
          clientId: 'CLIENT_1',
          clientName: 'QA Mock Company',
          adminUserId: 'USER_1',
          adminUserName: 'QA Admin',
        }],
      }),
    });
  });

  // Draft autosave/restore — handleNext() awaits this before advancing steps,
  // so leaving it unmocked hangs every "Continuar" click forever.
  await page.route('**/sws/go/onboarding/draft', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft: null }) });
  });

  await page.route('**/sws/go/session/environment', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // ETP-4576 — entering an environment updates the backend-managed session and reports
      // `status`; it no longer mints a token for the client to hold.
      body: JSON.stringify({
        status: 'success',
        roleList: [{
          id: 'ROLE_1',
          name: 'Admin',
          orgList: [{ id: 'ORG_1', name: 'QA Mock Org' }],
        }],
      }),
    });
  });

  await page.route('**/sws/neo/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: 'QA Admin' }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/header/defaults', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentType: invalidDocumentType ? '0' : 'DOC_TYPE_1' }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID{/**,}**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'TERM_1', label: 'Immediate' }] }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/header/selectors/C_BPartner_ID{/**,}**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'BP_1', label: 'QA Customer' }] }),
    });
  });
}

function buildDisposablePassword(suffix) {
  return `Qa-${suffix}-Pass!42`;
}

async function completeOnboardingForm(page, emailPrefix, locale = 'es_ES') {
  const labels = labelsFor(locale);
  const suffix = Date.now();
  const password = buildDisposablePassword(suffix);
  await page.goto('/onboarding');

  // Onboarding now defaults to the login view; switch to the register view
  // before filling the registration form.
  await page.getByTestId('action-switch-to-register').click();

  await expect(page.getByRole('heading', { name: labels.heading })).toBeVisible();
  await page.getByRole('textbox', { name: labels.name }).fill('QA Onboarding User');
  await page.getByRole('textbox', { name: labels.email }).fill(`${emailPrefix}-${suffix}@example.com`);
  await page.getByRole('textbox', { name: labels.password }).fill(password);
  await page.getByRole('button', { name: labels.createAccount }).click();

  await expect(page.getByText(labels.intro)).toBeVisible();
  await page.getByRole('button', { name: labels.continue }).click();

  await page.getByRole('textbox', { name: labels.companyName }).fill('QA Mock Company');
  // Check-digit-valid CIF: ETP-5190 guards "Empezar" with the NIF validator, so an invalid
  // value stops the wizard here and no onboarding request is ever sent.
  await page.locator('#fiscalIdValue').fill('B12345674');
  await page.getByRole('textbox', { name: labels.address }).fill('QA Street 123');
  await page.getByRole('button', { name: labels.start }).click();
}

test.describe('Onboarding with mocked Schema Forge backend boundary', () => {
  test('lets the user switch onboarding language to English before registration', async ({ page }) => {
    const labels = labelsFor('en_US');
    const suffix = Date.now();
    await installOnboardingMocks(page, { expectedLanguage: 'en_US' });
    await page.goto('/onboarding');

    // Onboarding now defaults to the login view, which also exposes the
    // language selector. Switch the language to English first, then move to
    // the register view (the register heading is asserted in English).
    // The selector is now a Radix combobox: click the trigger to open the
    // popover, then click the "English" option. Since the page is still in
    // Spanish at this point, the option's accessible name is the Spanish
    // translation of "English" (ui('onboardingLanguageEnglish') = "Inglés"),
    // not the label heading ("Idioma") that also sits inside the popover.
    await page.locator('#onboarding-language').click();
    await page.getByRole('option', { name: 'Inglés', exact: true }).click();
    await page.getByTestId('action-switch-to-register').click();
    await expect(page.getByRole('heading', { name: labels.heading })).toBeVisible();

    await page.getByRole('textbox', { name: labels.name }).fill('QA Onboarding User');
    await page.getByRole('textbox', { name: labels.email }).fill(`qa-onboarding-en-${suffix}@example.com`);
    await page.getByRole('textbox', { name: labels.password }).fill(buildDisposablePassword(suffix));
    await page.getByRole('button', { name: labels.createAccount }).click();

    await expect(page.getByText(labels.intro)).toBeVisible();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('schema-forge-locale'))).toBe('en_US');
  });

  test('shows readiness failure instead of redirecting when invoice defaults are invalid', async ({ page }) => {
    await installOnboardingMocks(page, { invalidDocumentType: true });
    await completeOnboardingForm(page, 'qa-onboarding-negative');

    await expect(page.getByText(/todavía no está listo para facturar/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/dashboard/);
  });
});

/**
 * Readiness-probe auth contract (ETP-5443 follow-up, bug A).
 *
 * `onboarding/onboardingReadiness.js`'s three probes (`/sws/neo/session`,
 * `/sws/neo/sales-invoice/header/defaults`, the `C_PaymentTerm_ID` selector) run right after
 * `loginEnvironment()` under the cookie session, authenticating with `credentials: 'include'`
 * and NO bearer token at all (see that file's own doc comment on `fetchJson`) — they are a
 * plain global `fetch`, not `apiFetch`, so there is nothing that could put an `Authorization`
 * header on them. Before this was fixed, entering an environment sent these three requests
 * with neither a token nor a cookie, all three came back 401, and the onboarding wizard never
 * reached the dashboard — it landed on this SAME "not ready to invoice" error screen the
 * existing invalid-document-type test above asserts, but for the wrong reason (a broken auth
 * contract instead of a genuine data gap), and with no way for the user to tell the two apart.
 *
 * This suite pins the auth contract directly (no Authorization header) instead of re-deriving
 * it from copy, and separately guards that a broken probe is caught LOUDLY (fails the test)
 * rather than passed over.
 */
/**
 * `SetupProgressStep`'s success path does a HARD `window.location.href` navigation into the
 * app (not a client-side route change), so unlike every other test in this file — which never
 * gets past that point — reaching the dashboard needs the post-redirect app boot to also
 * resolve a session. None of `installOnboardingMocks`' routes cover that (no other test needs
 * it), so this fills the gap: `GET /sws/go/session` WITH a `csrfToken` (this reproduces bug A's
 * real context — the cookie scheme, ADR-0001 — not just the bearer path the registration mocks
 * above already exercise), full window/menu access so the dashboard itself isn't gated by an
 * unrelated concern, and the first-steps gate answering "already seen".
 */
async function installDashboardEntryMocks(page) {
  // Stateful on purpose: `GET /sws/go/session` must 401 until the environment login below
  // actually succeeds, or the app "restores" a session on the very FIRST `/onboarding` page
  // load and redirects away before registration ever runs. Flipped by watching the response
  // to `installOnboardingMocks`' own `/sws/go/session/environment` route rather than
  // re-registering that URL here — Playwright tries the LATER-registered route first, so a
  // second route for the same pattern would shadow (not observe) the original.
  let sessionEstablished = false;
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && response.url().includes('/sws/go/session/environment')) {
      sessionEstablished = true;
    }
  });

  await page.route('**/sws/go/session', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (!sessionEstablished) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'No active session' } }),
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: { name: 'QA Admin', email: 'qa@example.com' },
        environment: { clientId: 'CLIENT_1', roleId: 'ROLE_1', orgId: 'ORG_1' },
        roleList: [{ id: 'ROLE_1', name: 'Admin', orgList: [{ id: 'ORG_1', name: 'QA Mock Org' }] }],
        csrfToken: 'e2e-onboarding-csrf',
      }),
    });
  });
  await page.route('**/sws/neo/windowaccessmap', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ windowAccess: {}, capabilities: {} }),
    });
  });
  // Fails open by design (see login()'s own identical convention in auth.js) — aborting
  // reproduces "webhook unreachable", which useRoleMenu() resolves to `null` (don't filter),
  // rather than risk a wrong-shaped 200 collapsing to a confirmed empty Set (NoAccessScreen).
  await page.route('**/sws/neo/listmenu', (route) => route.abort());
  await page.route('**/sws/neo/myreportaccess', (route) => route.abort());
  await page.route('**/sws/neo/dashboard/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
  await page.route('**/sws/go/onboarding/first-steps**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().method() === 'GET'
        ? JSON.stringify({ status: 'success', firstSteps: { v: 1, seen: true, completed: [] } })
        : JSON.stringify({ status: 'success' }),
    });
  });
}

test.describe('Onboarding readiness — auth contract (ETP-5443 follow-up)', () => {
  test('the three readiness probes carry no Authorization header, and the flow reaches the dashboard', async ({ page }) => {
    await installOnboardingMocks(page);
    await installDashboardEntryMocks(page);

    const captured = { session: [], defaults: [], paymentTerms: [] };
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/sws/neo/session')) captured.session.push(request.headers());
      else if (url.includes('/sws/neo/sales-invoice/header/defaults')) captured.defaults.push(request.headers());
      else if (url.includes('/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID')) captured.paymentTerms.push(request.headers());
    });

    await completeOnboardingForm(page, 'qa-onboarding-cookie-readiness');

    // The retry/back pair (SetupProgressStep.jsx) only renders on a readiness (or onboarding)
    // failure — its ABSENCE, together with actually reaching the dashboard, is the positive
    // signal that all three probes succeeded. Checked with testids, not translated copy — see
    // the negative test below for why matching copy here would be the wrong guard.
    await expect(page.getByTestId('Button__retry')).toHaveCount(0);
    await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });

    for (const [label, requests] of Object.entries(captured)) {
      expect(requests.length, `${label} probe was never sent`).toBeGreaterThan(0);
      for (const headers of requests) {
        expect(headers.authorization, `${label} probe carried an Authorization header`).toBeUndefined();
      }
    }
  });

  test('a 401 on the session probe is a loud, visible failure — not a silent pass', async ({ page }) => {
    await installOnboardingMocks(page);
    // Registered after installOnboardingMocks' own `/sws/neo/session` route, so Playwright
    // tries this one first (reverse registration order) and it wins.
    await page.route('**/sws/neo/session', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    });

    await completeOnboardingForm(page, 'qa-onboarding-cookie-readiness-401');

    // This is the guard the ETP-5443 follow-up asked for: reproducing bug A must make the
    // test fail loudly rather than pass because SOME element rendered. A test that only
    // asserted "some error text is visible" would pass identically for an unrelated data gap
    // (see the invalid-document-type test above) — the retry/back pair plus staying off the
    // dashboard is what actually distinguishes "a probe failed" from "onboarding succeeded".
    await expect(page.getByTestId('Button__retry')).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/dashboard/);
  });
});
