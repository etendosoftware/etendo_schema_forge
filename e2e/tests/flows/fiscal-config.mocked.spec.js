import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
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

async function loginWithOrg(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_auth_selected_role', JSON.stringify({ id: 'r1', name: 'Admin', orgList: [] }));
    localStorage.setItem('sf_auth_rolelist', JSON.stringify([{ id: 'r1', name: 'Admin', orgList: [] }]));
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'ORG_E2E', name: 'E2E Test Org' }));
  });
  await login(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Fiscal Config — no org selected', () => {
  test('shows the no-org message when session has no selected organisation', async ({ page }) => {
    await login(page);
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
