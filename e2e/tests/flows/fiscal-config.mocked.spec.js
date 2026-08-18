import { test, expect } from '@playwright/test';
import { login, loginWithOrg, navigateTo } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

// ── NEO API response envelope ─────────────────────────────────────────────────

function neoOk(records) {
  return {
    response: { status: 0, data: records, totalRows: records.length },
  };
}

// ── Fixture records ───────────────────────────────────────────────────────────

// The extractor now assigns the PK field its java_qualifier via IsKey='Y' (see
// schema_forge_core commit 5d363ad2f), so NeoFieldFilter no longer renames the PK to
// a per-system field name (tbaiConfigID / configuracinSII / verifactuConfig) — the API
// always returns it as `id`, for every system (see fiscalConfig.utils.js getFiscalRecordId()
// and FiscalConfigDebugPanel.jsx MOCK_SII/MOCK_TBAI/MOCK_VERIFACTU for the same convention).
const SII_RECORD = {
  id: 'e2e-sii-001',
  acogidaAlSII: 'N',
  entornoDeProduccin: 'N',
  navarra: 'N',
  guipuzcoa: 'N',
};

const SII_NAVARRA_RECORD = { ...SII_RECORD, navarra: 'Y' };

const TBAI_RECORD = {
  id: 'e2e-tbai-001',
  etsgSifTerritory: 'ARABA',
  entornoDeProduccin: 'N',
};

const VERIFACTU_RECORD = {
  id: 'e2e-vf-001',
  tAXType: '01',
  defaultQR: 'N',
};

// ── Route helpers ─────────────────────────────────────────────────────────────

async function installFiscalConfigMocks(page, { sii = null, tbai = null, verifactu = null } = {}) {
  await page.route('**/sws/neo/sii-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(sii ? [sii] : [])),
    });
  });

  await page.route('**/sws/neo/tbai-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(tbai ? [tbai] : [])),
    });
  });

  await page.route('**/sws/neo/verifactu-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(verifactu ? [verifactu] : [])),
    });
  });
}


// ── Kebab menu helper ─────────────────────────────────────────────────────────
//
// The "Añadir SII" and "Cambiar SIF" actions are inside a DropdownMenu kebab
// triggered by `FiscalConfigPage__actionsMenu`. The content only renders after
// the trigger is clicked, so all interactions with those items must open the
// kebab first.

async function openActionsMenu(page) {
  await page.getByTestId('FiscalConfigPage__actionsMenu').click();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Fiscal Config — no org selected', () => {
  test('shows the no-org message when session has no selected organisation', async ({ page }) => {
    // `org: null` is the explicit "authenticated, no environment entered" case:
    // login()'s default session DOES carry an org, so it has to be opted out of.
    await login(page, { org: null });
    await navigateTo(page, 'fiscal-config');
    await expect(page.getByText(t('fiscal.noOrg'))).toBeVisible();
  });
});

test.describe('Fiscal Config — unconfigured (wizard)', () => {
  test('shows the onboarding wizard territory screen when no fiscal records exist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page); // all null → unconfigured
    await navigateTo(page, 'fiscal-config');

    await expect(
      page.getByText(t('fiscal.onboarding.territory.title')),
    ).toBeVisible({ timeout: 8_000 });
  });

});

test.describe('Fiscal Config — SII profile', () => {
  test('shows the SII configuration section when an SII record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.sii.field.enrolled'))).toBeVisible({ timeout: 8_000 });
  });

  test('shows the Navarra SII section when the SII record has navarra=Y', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_NAVARRA_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.sii.field.enrolled'))).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Config — TBAI profile', () => {
  test('shows the TBAI configuration section when a TBAI record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { tbai: TBAI_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.tbai.field.enrollDate'))).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Config — Verifactu profile', () => {
  test('shows the Verifactu configuration section when a Verifactu record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { verifactu: VERIFACTU_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.verifactu.field.tax'))).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Config — SII+TBAI combined profile', () => {
  test('shows both SII and TBAI sections when both records exist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD, tbai: TBAI_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.sii.field.enrolled'))).toBeVisible({ timeout: 8_000 });

    // SII+TBAI uses tabs — switch to TBAI tab to verify it renders
    await page.getByRole('button', { name: t('fiscal.tab.tbai') }).click();
    await expect(page.getByText(t('fiscal.tbai.field.enrollDate'))).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Fiscal Config — conflict state', () => {
  test('shows the conflict warning when both Verifactu and SII records exist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD, verifactu: VERIFACTU_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.conflict.title'))).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Config — wizard interaction', () => {
  test('selecting a territory and clicking Continuar advances to the confirm screen', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page); // unconfigured → wizard
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });

    // Click the Navarra territory card (no sub-question → goes straight to confirm)
    await page.getByRole('button', { name: new RegExp(t('fiscal.territory.navarra')) }).click();
    await page.getByRole('button', { name: t('fiscal.onboarding.continue') }).click();

    await expect(page.getByText(t('fiscal.onboarding.confirm.title'))).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(t('fiscal.territory.navarra'), { exact: true }).first()).toBeVisible();
  });

  test('Back button on confirm screen returns to territory selection', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page);
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: new RegExp(t('fiscal.territory.navarra')) }).click();
    await page.getByRole('button', { name: t('fiscal.onboarding.continue') }).click();
    await expect(page.getByText(t('fiscal.onboarding.confirm.title'))).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: new RegExp(t('fiscal.onboarding.back').replace('←', '').trim(), 'i') }).click();
    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 5_000 });
  });
});

// ── Certificate upload helpers ────────────────────────────────────────────────

const FAKE_P12 = Buffer.from('fakep12content');
const FAKE_CERT_DETAILS = {
  subject: 'CN=Empresa Test S.L., O=Test',
  issuer: 'CN=FNMT Clase 2 CA',
  validFrom: '2024-01-01',
  validTo: '2026-01-01',
  algorithm: 'SHA256withRSA',
};

async function openCertModal(page) {
  await expect(page.getByText(t('fiscal.cert.section.legend'))).toBeVisible({ timeout: 8_000 });
  await page.getByText(t('fiscal.cert.dropzone.drag')).click();
  await expect(page.getByText(t('fiscal.cert.modal.title'))).toBeVisible({ timeout: 4_000 });
}

async function pickCertFile(page) {
  const input = page.locator('input[type="file"]').last();
  await input.setInputFiles({ name: 'empresa.p12', mimeType: 'application/x-pkcs12', buffer: FAKE_P12 });
  await expect(page.getByText('empresa.p12')).toBeVisible();
}

async function fillPassword(page, pwd = 'secret123') {
  // The password input has no for/id association — select by placeholder
  await page.locator('input[placeholder="••••••••"]').fill(pwd);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Fiscal Config — certificate upload modal', () => {
  test('clicking Subir certificado opens the cert modal for the SII section', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD });
    await page.route('**/certificate{/**,}**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exists: false }),
      });
    });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.cert.section.legend'))).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(t('fiscal.cert.dropzone.drag'))).toBeVisible();

    await page.getByText(t('fiscal.cert.dropzone.drag')).click();

    await expect(page.getByText(t('fiscal.cert.modal.title'))).toBeVisible({ timeout: 4_000 });
  });

  test('uploading a non-p12 file shows a format error', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD });
    await page.route('**/certificate{/**,}**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false }) }),
    );
    await navigateTo(page, 'fiscal-config');
    await openCertModal(page);

    const input = page.locator('input[type="file"]').last();
    await input.setInputFiles({ name: 'documento.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });

    await expect(page.getByText(t('fiscal.cert.err.format'))).toBeVisible({ timeout: 3_000 });
    // Still on pick step — verify button stays disabled (no valid file)
    await expect(page.getByRole('button', { name: t('fiscal.cert.btn.verify') })).toBeDisabled();
  });
});

test.describe('Fiscal Config — certificate upload flow', () => {
  async function setupPage(page, certGetResponse = { exists: false }) {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD });
    await page.route('**/certificate{/**,}**', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(certGetResponse),
        });
      }
      return route.fallback();
    });
    await navigateTo(page, 'fiscal-config');
  }

  test('happy path: pick → verify spinner → done screen with success message', async ({ page }) => {
    await setupPage(page);

    // Intercept the POST and return a successful upload
    await page.route('**/certificate{/**,}**', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ cert: FAKE_CERT_DETAILS }),
        });
      }
      return route.fallback();
    });

    await openCertModal(page);
    await pickCertFile(page);
    await fillPassword(page);

    await page.getByRole('button', { name: t('fiscal.cert.btn.verify') }).click();

    // Verify spinner appears briefly, then done screen
    await expect(page.getByText(t('fiscal.cert.success.title'))).toBeVisible({ timeout: 6_000 });
    await expect(page.getByRole('button', { name: t('fiscal.cert.btn.use') })).toBeVisible();
  });

  test('confirmNif path: POST returns pendingNifConfirmation → user confirms → done', async ({ page }) => {
    const CERT_NIF = 'B12345678';
    await setupPage(page);

    let callCount = 0;
    await page.route('**/certificate{/**,}**', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      callCount++;
      if (callCount === 1) {
        // First call — org has no NIF, ask user to confirm
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pendingNifConfirmation: true, certNif: CERT_NIF }),
        });
      }
      // Second call (setOrgNif=true) — store and return success
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cert: FAKE_CERT_DETAILS }),
      });
    });

    await openCertModal(page);
    await pickCertFile(page);
    await fillPassword(page);
    await page.getByRole('button', { name: t('fiscal.cert.btn.verify') }).click();

    // confirmNif step — NIF warning and confirmation button
    await expect(page.getByText(t('fiscal.cert.nif.warning.title'))).toBeVisible({ timeout: 6_000 });
    // The NIF appears in both the body text and the table row — target the table cell exactly
    await expect(page.getByText(CERT_NIF, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: t('fiscal.cert.btn.useNif', { nif: CERT_NIF }) }).click();

    await expect(page.getByText(t('fiscal.cert.success.title'))).toBeVisible({ timeout: 6_000 });
  });

  test('NIF mismatch (422) returns to pick step with localized error', async ({ page }) => {
    await setupPage(page);

    await page.route('**/certificate{/**,}**', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'NIF mismatch' } }),
      });
    });

    await openCertModal(page);
    await pickCertFile(page);
    await fillPassword(page);
    await page.getByRole('button', { name: t('fiscal.cert.btn.verify') }).click();

    await expect(page.getByText(t('fiscal.cert.err.nifMismatch'))).toBeVisible({ timeout: 6_000 });
    // Back on pick step — the file is still selected so the drag hint is hidden;
    // the password field confirms we're on the pick step
    await expect(page.locator('input[placeholder="••••••••"]')).toBeVisible();
  });
});

// ── Change SIF flow (ETP-4785) ────────────────────────────────────────────────
//
// Maps to Jira TCs where they are UI-observable:
//   TC2 — Change SIF deactivates the active config (PUT { active:false }, NOT a
//         DELETE) and the row is kept as a trace → after refetch the profile
//         resolves to unconfigured → the onboarding wizard reappears.
//   TC4 — leaving the wizard (no active SIF record) is a valid "no-SIF" state:
//         the wizard territory screen is shown, no config section, no crash.
//   TC6 — for VERI*FACTU the permanence notice is shown in the confirm dialog
//         and the change is STILL allowed (informational, isReady is not a block).
//
// Stateful config mock: after the deactivation PUT, subsequent list loads return
// the record flagged inactive (active:'N'), reproducing the NEO NO_ACTIVE_FILTER
// trace-row behavior so the front resolves the org back to `unconfigured`.

async function installChangeSifMocks(page, { spec, record }) {
  const state = { deactivated: false };
  await page.route(`**/sws/neo/${spec}/**`, async route => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      const row = state.deactivated ? { ...record, active: 'N' } : { ...record, active: 'Y' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk([row])),
      });
    }
    if (method === 'PUT') {
      state.deactivated = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk([{ ...record, active: 'N' }])),
      });
    }
    return route.fallback();
  });
  for (const other of ['sii-config', 'tbai-config', 'verifactu-config'].filter(s => s !== spec)) {
    await page.route(`**/sws/neo/${other}/**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) }),
    );
  }
  return state;
}

const CHANGE_SIF_CASES = [
  {
    label: 'SII',
    spec: 'sii-config',
    detailFieldLabel: t('fiscal.sii.field.enrolled'),
    record: { id: 'e2e-csif-sii-001', acogidaAlSII: 'N', navarra: 'N', guipuzcoa: 'N' },
    noticeKey: 'fiscal.changeSif.notice.sii',
  },
  {
    label: 'TBAI',
    spec: 'tbai-config',
    detailFieldLabel: t('fiscal.tbai.field.enrollDate'),
    record: { id: 'e2e-csif-tbai-001', etsgSifTerritory: 'ARABA' },
    noticeKey: 'fiscal.changeSif.notice.tbai',
  },
  {
    label: 'VERIFACTU',
    spec: 'verifactu-config',
    detailFieldLabel: t('fiscal.verifactu.field.tax'),
    record: { id: 'e2e-csif-vf-001', tAXType: '01', defaultQR: 'N', isReady: 'N' },
    noticeKey: 'fiscal.changeSif.notice.verifactu',
  },
];

test.describe('Fiscal Config — Change SIF (ETP-4785)', () => {
  for (const c of CHANGE_SIF_CASES) {
    test(`TC2 ${c.label}: Change SIF PUTs { active:false } (not DELETE) → wizard reappears`, async ({ page }) => {
      await loginWithOrg(page);
      await installChangeSifMocks(page, c);
      await navigateTo(page, 'fiscal-config');

      await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });
      await openActionsMenu(page);
      await page.getByTestId('FiscalConfigPage__changeSif').click();

      await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible();
      await expect(page.getByTestId('ChangeSifDialog__confirm')).toBeVisible();

      const [putReq] = await Promise.all([
        page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)),
        page.getByTestId('ChangeSifDialog__confirm').click(),
      ]);
      expect(putReq.url()).toContain(c.record.id);
      expect(JSON.parse(putReq.postData() || '{}')).toEqual({ active: false });
      expect(putReq.method()).not.toBe('DELETE');

      // After deactivation the refetch resolves to `unconfigured` → the existing
      // onboarding wizard reappears (TC2 end-state + TC4 valid no-SIF state).
      await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });
      await expect(page.getByText(c.detailFieldLabel)).toHaveCount(0);
    });
  }

  test('TC6 VERIFACTU: confirm dialog shows the permanence notice and still allows the change', async ({ page }) => {
    const c = CHANGE_SIF_CASES.find(x => x.label === 'VERIFACTU');
    await loginWithOrg(page);
    await installChangeSifMocks(page, c);
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });
    await openActionsMenu(page);
    await page.getByTestId('FiscalConfigPage__changeSif').click();

    await expect(page.getByTestId('ChangeSifDialog__notice')).toBeVisible();
    await expect(page.getByText(t(c.noticeKey))).toBeVisible();

    const confirm = page.getByTestId('ChangeSifDialog__confirm');
    await expect(confirm).toBeEnabled();

    const [putReq] = await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)),
      confirm.click(),
    ]);
    expect(JSON.parse(putReq.postData() || '{}')).toEqual({ active: false });
    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });
  });

  test('TC4 cancel keeps the active config (no PUT, no wizard)', async ({ page }) => {
    const c = CHANGE_SIF_CASES.find(x => x.label === 'SII');
    await loginWithOrg(page);
    await installChangeSifMocks(page, c);
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });
    await openActionsMenu(page);
    await page.getByTestId('FiscalConfigPage__changeSif').click();
    await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible();

    let sawPut = false;
    page.on('request', req => { if (req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)) sawPut = true; });

    await page.getByTestId('ChangeSifDialog__cancel').click();
    await expect(page.getByTestId('ChangeSifDialog__content')).toHaveCount(0);
    await expect(page.getByText(c.detailFieldLabel)).toBeVisible();
    expect(sawPut).toBe(false);
  });
});

// ── Onboarding save regression (ETP-4401) ─────────────────────────────────────
//
// Real flow exercised: territory pick → confirm → createRecords() POSTs the new
// record → getFiscalRecordId(created) reads its id → GET by id → detail screen →
// Save PUTs to `/{spec}/{entity}/{id}`. Before the fix, getFiscalRecordId() looked
// for the stale per-system PK field names (tbaiConfigID / configuracinSII /
// verifactuConfig), which the backend no longer returns — recordId was always
// null and the section's save() threw a "record id not found" error instead of
// completing. Asserting the PUT request URL contains the record's `id` is the
// direct regression signal for the bug; reaching the applied screen confirms the
// save actually completed instead of throwing.

async function installOnboardingRecordMock(page, { spec, record }) {
  await page.route(`**/sws/neo/${spec}/**`, async route => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === 'GET') {
      // useFiscalConfig()'s initial list load always sends `organization=`;
      // createAndFetchRecord()'s post-create fetch-by-id never does.
      const isListLoad = url.includes('organization=');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk(isListLoad ? [] : [record])),
      });
    }
    // POST (create) and PUT (update) both echo back the full record.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk([record])),
    });
  });
}

const ONBOARDING_SAVE_CASES = [
  {
    label: 'TBAI',
    spec: 'tbai-config',
    territoryLabel: t('fiscal.territory.alava'),
    hasSubquestion: true,
    subquestionPickLabel: t('fiscal.onboarding.subq.tbai.label'), // "TicketBAI only" → alsoNational=false
    detailFieldLabel: t('fiscal.tbai.field.enrollDate'),
    record: {
      id: 'e2e-onb-tbai-001',
      etsgSifTerritory: 'ARABA',
      tbaisystemdate: '2026-01-15',
      productionEnv: 'N',
      invoiceDescription: 'Factura test',
      uSEAsproductDesc: 'N',
      autoSendInvoices: 'N',
      jasperreportPath: '',
      validatePreviousInvoice: 'N',
    },
  },
  {
    label: 'SII',
    spec: 'sii-config',
    territoryLabel: t('fiscal.territory.navarra'),
    hasSubquestion: false,
    detailFieldLabel: t('fiscal.sii.field.enrolled'),
    record: {
      id: 'e2e-onb-sii-001',
      navarra: 'Y',
      guipuzcoa: 'N',
      acogidaAlSII: 'N',
      fechaAcogidaSII: '',
      plazoLmiteDeEnvoASII: '4',
      cadenciaEnvoFacturasVentaASII: 'D',
      cadenciaEnvoFacturasCompraASII: 'W',
      entornoDeProduccin: 'N',
      adjuntarArchivosXML: 'N',
      recc: 'N',
      redeme: 'N',
      monitordate: '',
      postedInvoices: 'N',
      authorizationno: '',
    },
  },
  {
    label: 'VERIFACTU',
    spec: 'verifactu-config',
    territoryLabel: t('fiscal.territory.espania'),
    hasSubquestion: true,
    subquestionVolumeLow: true, // "No, no estoy obligado al SII" then choose VERI*FACTU
    detailFieldLabel: t('fiscal.verifactu.field.tax'),
    record: {
      id: 'e2e-onb-vf-001',
      tAXType: '01',
      defaultQR: 'N',
      isReady: 'N',
    },
  },
];

test.describe('Fiscal Config — onboarding save regression (ETP-4401)', () => {
  for (const testCase of ONBOARDING_SAVE_CASES) {
    test(`${testCase.label}: completes onboarding and saves using the record's universal id`, async ({ page }) => {
      await loginWithOrg(page);
      await installFiscalConfigMocks(page); // unconfigured → wizard
      await installOnboardingRecordMock(page, { spec: testCase.spec, record: testCase.record });
      await navigateTo(page, 'fiscal-config');

      await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });
      await page.getByRole('button', { name: testCase.territoryLabel }).click();
      await page.getByRole('button', { name: t('fiscal.onboarding.continue') }).click();

      if (testCase.hasSubquestion) {
        if (testCase.subquestionPickLabel) {
          await page.getByRole('button', { name: testCase.subquestionPickLabel }).click();
        }
        if (testCase.subquestionVolumeLow) {
          await page.getByRole('button', { name: t('fiscal.onboarding.subq.obligation.no.label') }).click();
          // Both ObligationCard descriptions mention "VERI*FACTU" in passing, so a
          // plain substring match on the label resolves to 3 buttons. Anchor the
          // match to the start of the accessible name to target only the actual
          // BulletOptionCard (whose name starts with its own label).
          await page.getByRole('button', { name: new RegExp(`^${t('fiscal.onboarding.subq.verifactu.label').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
        }
        const continueLabel = t('fiscal.onboarding.continue').replace('›', '').trim();
        await page.getByRole('button', { name: continueLabel }).click();
      }

      await expect(page.getByText(t('fiscal.onboarding.confirm.title'))).toBeVisible({ timeout: 5_000 });

      // Confirm → createRecords() → POST creates the record (this is what used to
      // silently produce a record with no reachable id under the old field names).
      const [createReq] = await Promise.all([
        page.waitForRequest(req => req.method() === 'POST' && req.url().includes(`/${testCase.spec}/`)),
        page.getByRole('button', { name: t('fiscal.onboarding.confirm.btn') }).click(),
      ]);
      expect(createReq.url()).toContain(testCase.spec);

      // Detail screen — the created record (fetched back by its universal `id`) is mounted.
      await expect(page.getByText(testCase.detailFieldLabel)).toBeVisible({ timeout: 8_000 });

      // Save → getFiscalRecordId(record) must resolve record.id so the PUT targets
      // `/{spec}/{entity}/{id}` — this is the exact path that used to be `undefined`.
      const [putReq] = await Promise.all([
        page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${testCase.spec}/`)),
        page.getByRole('button', { name: t('fiscal.save') }).click(),
      ]);
      expect(putReq.url()).toContain(testCase.record.id);

      // Success — reaches the applied screen instead of throwing "record id not found".
      await expect(page.getByText(t('fiscal.onboarding.applied.title'))).toBeVisible({ timeout: 8_000 });
    });
  }
});

// ── Add complementary SIF flow (ETP-4785) ─────────────────────────────────────
//
// When a user has only TBAI configured (effectiveProfile === 'tbai'), an "Add SII"
// button is shown. Clicking it:
//   1. POSTs to /sws/neo/sii-config/siiConfiguration to create a new empty SII record.
//   2. Switches renderProfile to 'sii+tbai' — two tab buttons appear (SII tab, TBAI tab).
//   3. The user can then save (PUT) both records via the normal Save button.
//
// The button must NOT appear when the profile is SII-only or Verifactu.

const NEW_SII_RECORD = {
  id: 'e2e-new-sii-001',
  acogidaAlSII: 'N',
  entornoDeProduccin: 'N',
  navarra: 'N',
  guipuzcoa: 'N',
};

test.describe('Fiscal Config — Add complementary SIF (ETP-4785)', () => {
  test('button "Add SII" is visible when only a TBAI record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { tbai: TBAI_RECORD });
    await navigateTo(page, 'fiscal-config');

    // TBAI section must load first
    await expect(page.getByText(t('fiscal.tbai.field.enrollDate'))).toBeVisible({ timeout: 8_000 });

    // The "Add SII" item is in the kebab because canAddComplementary is true (tbai-only profile).
    // Open the actions menu first, then assert the item is present and contains the right text.
    await openActionsMenu(page);
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toBeVisible();
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toContainText(
      t('fiscal.addComplementary.addSii'),
    );
  });

  test('button "Add SII" is NOT visible when only an SII record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { sii: SII_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.sii.field.enrolled'))).toBeVisible({ timeout: 8_000 });

    // canAddComplementary is false for sii-only profile — open the kebab and verify
    // addComplementary is absent from its items.
    await openActionsMenu(page);
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toHaveCount(0);
  });

  test('button "Add SII" is NOT visible when only a Verifactu record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalConfigMocks(page, { verifactu: VERIFACTU_RECORD });
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(t('fiscal.verifactu.field.tax'))).toBeVisible({ timeout: 8_000 });

    // canAddComplementary is false for verifactu profile — open the kebab and verify
    // addComplementary is absent from its items.
    await openActionsMenu(page);
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toHaveCount(0);
  });

  test('happy path: clicking "Add SII" POSTs to sii-config and switches layout to sii+tbai', async ({ page }) => {
    // Stateful mock: before the POST, sii-config returns empty; after, returns the
    // newly-created record. This mirrors the real flow where createComplementary()
    // receives the POST response and immediately mounts the new SII section without
    // a refetch — the subsequent GET (if any) will also return the record.
    let siiCreated = false;

    await loginWithOrg(page);

    // Install the TBAI mock first (existing record)
    await page.route('**/sws/neo/tbai-config/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk([TBAI_RECORD])),
      });
    });

    // Install the stateful SII mock:
    //   GET before POST → empty list (no SII yet)
    //   POST           → creates and returns the new SII record
    //   GET after POST → returns the new SII record
    await page.route('**/sws/neo/sii-config/**', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        siiCreated = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(neoOk([NEW_SII_RECORD])),
        });
      }
      if (req.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(neoOk(siiCreated ? [NEW_SII_RECORD] : [])),
        });
      }
      return route.fallback();
    });

    // Verifactu always returns empty (not relevant to this test)
    await page.route('**/sws/neo/verifactu-config/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk([])),
      });
    });

    await navigateTo(page, 'fiscal-config');

    // TBAI section loads and the "Add SII" item is in the kebab.
    await expect(page.getByText(t('fiscal.tbai.field.enrollDate'))).toBeVisible({ timeout: 8_000 });
    await openActionsMenu(page);
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toBeVisible();

    // Click "Add SII" — intercept the POST to sii-config.
    const [postReq] = await Promise.all([
      page.waitForRequest(
        req => req.method() === 'POST' && req.url().includes('/sii-config/'),
      ),
      page.getByTestId('FiscalConfigPage__addComplementary').click(),
    ]);

    // The POST must target the sii-config spec
    expect(postReq.url()).toContain('/sii-config/');
    expect(postReq.method()).toBe('POST');

    // After the POST the layout switches to sii+tbai:
    //   renderProfile becomes 'sii+tbai', which renders the TabBar with both tabs.
    await expect(
      page.getByRole('button', { name: t('fiscal.tab.sii') }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByRole('button', { name: t('fiscal.tab.tbai') }),
    ).toBeVisible();

    // The "Add SII" button itself disappears (addingComplementary is now set)
    await expect(page.getByTestId('FiscalConfigPage__addComplementary')).toHaveCount(0);
  });
});

// ── Smart deactivation — deleted:true response (ETP-4785) ────────────────────
//
// When the backend removes the fiscal config record entirely (because no sent
// invoices existed), it returns `{ response: { data: { deleted: true } } }` in
// the PUT response body instead of the usual deactivated row envelope.
// ChangeSifDialog treats any ok=200 as success and calls onChanged(), which
// triggers refetch(). After a deletion the GET returns an empty list, so the
// page resolves back to `unconfigured` and the onboarding wizard reappears —
// exactly the same visible end-state as a regular deactivation, so no special
// error branch is hit.
//
// TC-DEL-1: Verifactu config — deleted:true → page refetches → wizard reappears
// TC-DEL-2: SII config — deleted:true → GET re-fires → wizard reappears
// TC-DEL-3: deleted:true does NOT leave a stale SIF section visible while loading

async function installChangeSifDeletedMocks(page, { spec, record }) {
  const state = { deleted: false };
  await page.route(`**/sws/neo/${spec}/**`, async route => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      // After the DELETE the record is gone — return empty list for the refetch.
      if (state.deleted) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(neoOk([])),
        });
      }
      // Before the PUT — return the active record.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(neoOk([{ ...record, active: 'Y' }])),
      });
    }
    if (method === 'PUT') {
      state.deleted = true;
      // Backend deleted the record (no sent invoices) — returns the smart-delete shape.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { deleted: true } } }),
      });
    }
    return route.fallback();
  });
  for (const other of ['sii-config', 'tbai-config', 'verifactu-config'].filter(s => s !== spec)) {
    await page.route(`**/sws/neo/${other}/**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) }),
    );
  }
  return state;
}

test.describe('Fiscal Config — smart deactivation (deleted:true response)', () => {
  test('Verifactu — backend deletes the record and the onboarding wizard reappears', async ({ page }) => {
    const c = CHANGE_SIF_CASES.find(x => x.label === 'VERIFACTU');
    await loginWithOrg(page);
    const state = await installChangeSifDeletedMocks(page, c);
    await navigateTo(page, 'fiscal-config');

    // Verifactu section must render before we can interact
    await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });

    // Open kebab → click "Cambiar SIF"
    await openActionsMenu(page);
    await page.getByTestId('FiscalConfigPage__changeSif').click();

    await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible({ timeout: 4_000 });

    // Confirm the SIF change and wait for the PUT to complete
    const [putReq] = await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)),
      page.getByTestId('ChangeSifDialog__confirm').click(),
    ]);
    expect(putReq.url()).toContain(c.record.id);
    expect(state.deleted).toBe(true);

    // After deleted:true the page must refetch and resolve to unconfigured
    // → the onboarding wizard reappears
    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });

    // No error banner must be visible
    await expect(page.locator('[data-testid="ChangeSifDialog__error"]')).toHaveCount(0);

    // The old SIF section must be gone
    await expect(page.getByText(c.detailFieldLabel)).toHaveCount(0);
  });

  test('SII — backend deletes the record, refetch fires, and org ends up unconfigured', async ({ page }) => {
    const c = CHANGE_SIF_CASES.find(x => x.label === 'SII');
    await loginWithOrg(page);
    const state = await installChangeSifDeletedMocks(page, c);
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });

    // Track the GET that fires after the PUT to confirm refetch happened
    let refetchGetFired = false;
    page.on('request', req => {
      if (req.method() === 'GET' && req.url().includes(`/${c.spec}/`) && state.deleted) {
        refetchGetFired = true;
      }
    });

    await openActionsMenu(page);
    await page.getByTestId('FiscalConfigPage__changeSif').click();
    await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible({ timeout: 4_000 });

    await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)),
      page.getByTestId('ChangeSifDialog__confirm').click(),
    ]);

    // Wizard reappears — proves the GET re-fired and the page resolved to unconfigured
    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });
    expect(refetchGetFired).toBe(true);

    // No error shown
    await expect(page.locator('[data-testid="ChangeSifDialog__error"]')).toHaveCount(0);
  });

  test('SII — stale config section is not visible while the page transitions after deletion', async ({ page }) => {
    const c = CHANGE_SIF_CASES.find(x => x.label === 'SII');
    await loginWithOrg(page);
    await installChangeSifDeletedMocks(page, c);
    await navigateTo(page, 'fiscal-config');

    await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });

    await openActionsMenu(page);
    await page.getByTestId('FiscalConfigPage__changeSif').click();
    await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible({ timeout: 4_000 });

    await Promise.all([
      page.waitForRequest(req => req.method() === 'PUT' && req.url().includes(`/${c.spec}/`)),
      page.getByTestId('ChangeSifDialog__confirm').click(),
    ]);

    // The page must reach the wizard (unconfigured) without showing the old SIF
    // section at any point after the PUT resolves. We wait for the wizard text
    // rather than polling — if the old SIF section reappears, this expectation
    // catches the stale-UI regression.
    await expect(page.getByText(t('fiscal.onboarding.territory.title'))).toBeVisible({ timeout: 8_000 });

    // At this point (wizard visible) the old SIF section must not co-exist
    await expect(page.getByText(c.detailFieldLabel)).toHaveCount(0);
  });
});

// ── ChangeSifDialog disclaimer per profile (ETP-4785) ─────────────────────────
//
// Each SIF profile shows a different notice key in the ChangeSifDialog:
//   SII       → fiscal.changeSif.notice.sii
//   TBAI      → fiscal.changeSif.notice.tbai
//   Verifactu → fiscal.changeSif.notice.verifactu (also tested in TC6 above as a
//               correctness regression, here we verify all three profiles match)
//
// The notice is rendered in the `ChangeSifDialog__notice` container.
// We open the kebab, click "Cambiar SIF", and assert the notice text differs
// per profile — proving the dialog receives the correct `noticeKey` prop.

test.describe('Fiscal Config — ChangeSifDialog notice per SIF profile', () => {
  for (const c of CHANGE_SIF_CASES) {
    test(`${c.label}: ChangeSifDialog shows the correct notice text`, async ({ page }) => {
      await loginWithOrg(page);
      await installChangeSifMocks(page, c);
      await navigateTo(page, 'fiscal-config');

      // Wait for the fiscal config section to load (profile-specific field label)
      await expect(page.getByText(c.detailFieldLabel)).toBeVisible({ timeout: 8_000 });

      // Open the kebab and click "Cambiar SIF"
      await openActionsMenu(page);
      await page.getByTestId('FiscalConfigPage__changeSif').click();

      // The dialog must be visible with its notice section
      await expect(page.getByTestId('ChangeSifDialog__content')).toBeVisible({ timeout: 4_000 });

      // The notice section must contain the profile-specific i18n text
      const notice = page.getByTestId('ChangeSifDialog__notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(t(c.noticeKey));

      // Dismiss (cancel) without making changes
      await page.getByTestId('ChangeSifDialog__cancel').click();
      await expect(page.getByTestId('ChangeSifDialog__content')).toHaveCount(0);
    });
  }
});
