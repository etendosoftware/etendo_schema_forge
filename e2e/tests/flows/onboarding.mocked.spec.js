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

  await page.route('**/sws/go/register', async route => {
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

  await page.route('**/sws/go/login?userId=USER_1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'env-token',
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

  await page.route('**/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'TERM_1', label: 'Immediate' }] }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/header/selectors/C_BPartner_ID**', async route => {
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

  await expect(page.getByRole('heading', { name: labels.heading })).toBeVisible();
  await page.getByRole('textbox', { name: labels.name }).fill('QA Onboarding User');
  await page.getByRole('textbox', { name: labels.email }).fill(`${emailPrefix}-${suffix}@example.com`);
  await page.getByRole('textbox', { name: labels.password }).fill(password);
  await page.getByRole('button', { name: labels.createAccount }).click();

  await expect(page.getByText(labels.intro)).toBeVisible();
  await page.getByRole('button', { name: labels.continue }).click();

  await page.getByRole('textbox', { name: labels.companyName }).fill('QA Mock Company');
  await page.locator('#fiscalIdValue').fill('B12345678');
  await page.getByRole('textbox', { name: labels.address }).fill('QA Street 123');
  await page.getByRole('button', { name: labels.start }).click();
}

test.describe('Onboarding with mocked Schema Forge backend boundary', () => {
  test('registers, creates environment, verifies readiness, and redirects to dashboard', async ({ page }) => {
    await installOnboardingMocks(page);
    await completeOnboardingForm(page, 'qa-onboarding');

    await page.waitForURL('**/dashboard');
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('sf_auth_token'))).toBe('env-token');
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('sf_auth_selected_org')).id)).toBe('ORG_1');
  });

  test('lets the user switch onboarding language to English before registration', async ({ page }) => {
    const labels = labelsFor('en_US');
    const suffix = Date.now();
    await installOnboardingMocks(page, { expectedLanguage: 'en_US' });
    await page.goto('/onboarding');

    await page.locator('#onboarding-language').selectOption('en_US');
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
