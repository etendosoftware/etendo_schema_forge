/**
 * E2E tests for ETP-3778 changes to the Fiscal Monitor:
 *   - Verifactu date column (format + colSpan)
 *   - Error status pill → Contact Detail popup
 *   - Tax ID Key custom dropdown
 *
 * All tests run in mock mode (no real Etendo backend required).
 * Run: npx playwright test fiscal-monitor-etp3778
 */

import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

// ── API response helpers ──────────────────────────────────────────────────────

function neoOk(records, totalRows) {
  return { response: { status: 0, data: records, totalRows: totalRows ?? records.length } };
}

// ── Shared fixture data ───────────────────────────────────────────────────────

const VF_CFG = { verifactuConfig: 'e2e-vf-001', tAXType: '01' };
const SII_CFG = { configuracinSII: 'e2e-sii-001', navarra: 'N', guipuzcoa: 'N' };

const BP_ID = 'bp-e2e-001';

const VF_ROW_ACCEPTED = {
  id: 'vf1',
  invoiceDate: '2025-04-14',
  invoice: 'SV-2025-1001',
  issuerTaxID: 'B28912345',
  typeOperation: 'F1',
  cSV: 'VFT-8A3F-KL02',
  verifactuSendingStatus: 'accepted',
  businessPartner: null,
  codeError: null,
  errorReason: null,
};

const VF_ROW_REJECTED = {
  id: 'vf2',
  invoiceDate: '2025-04-17',
  invoice: 'SV-2025-1002',
  issuerTaxID: 'B99887766',
  typeOperation: 'F1',
  cSV: null,
  verifactuSendingStatus: 'rejected',
  businessPartner: BP_ID,
  codeError: '3005',
  errorReason: 'NIF del emisor no registrado en el sistema Verifactu',
};

const SII_ROW_ERROR = {
  id: 'sii1',
  _siiTab: 'issued',
  invoiceDate: '2025-04-14',
  documentNo: 'EV-2025-0321',
  businessPartner: BP_ID,
  businessPartnerIdentifier: 'Logística Norte S.A.',
  aeatsiiClaveTipo: 'F1',
  grandTotalAmount: '28.710,00',
  aeatsiiEstado: 'AE',
  aeatsiiErrorCode: '1106',
  aeatsiiErrorMsg: 'Período de liquidación no coincide',
};

const SII_ROW_OK = {
  id: 'sii2',
  _siiTab: 'issued',
  invoiceDate: '2025-04-01',
  documentNo: 'EV-2025-0318',
  businessPartner: 'bp-ok-001',
  businessPartnerIdentifier: 'Acme Distribución S.L.',
  aeatsiiClaveTipo: 'F1',
  grandTotalAmount: '12.100,00',
  aeatsiiEstado: 'CO',
};

const BP_RECORD = {
  id: BP_ID,
  name: 'Logística Norte S.A.',
  taxID: 'A99887766',
  oBTIKTaxIDKey: '',
};

const TAX_ID_KEY_OPTIONS = [
  { id: 'nif', label: 'NIF' },
  { id: 'noi', label: 'NOI' },
  { id: 'pasaporte', label: 'Pasaporte' },
];

// ── Setup helpers ─────────────────────────────────────────────────────────────

// ETP-4576 — the org is part of the restored cookie session, so it is passed to
// login() (which cross-references it into `environment.orgId` + the role's
// `orgList`). It used to be seeded into the `sf_auth_*` localStorage keys, which
// are now dead: AuthProvider reads from memory storage and purges those keys on
// mount, so a seeded org never reached `selectedOrg` at all.
const E2E_ORG = { id: 'ORG_E2E', name: 'E2E Test Org' };

async function loginWithOrg(page) {
  await login(page, { org: E2E_ORG });
}

async function installVfMocksWithRows(page, rows) {
  await page.route('**/sws/neo/verifactu-config/**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(neoOk([VF_CFG])),
    });
  });
  await page.route('**/sws/neo/sii-config/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) });
  });
  await page.route('**/sws/neo/tbai-config/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) });
  });
  await page.route('**/sws/neo/monitor-verifactu/**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(neoOk(rows)),
    });
  });
}

async function installSiiMocksWithRows(page, rows) {
  await page.route('**/sws/neo/sii-config/**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(neoOk([SII_CFG])),
    });
  });
  await page.route('**/sws/neo/tbai-config/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) });
  });
  await page.route('**/sws/neo/verifactu-config/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) });
  });

  // General sii-monitor catch-all: returns data rows (registered first = lower priority)
  await page.route('**/sws/neo/sii-monitor/**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(neoOk(rows)),
    });
  });

  // SiiMonitorSection needs a non-null parentId: fetchSiiParentId() queries the
  // sii-monitor/organizations endpoint. Register AFTER the catch-all so it wins (LIFO).
  await page.route(/sws\/neo\/sii-monitor\/organizations/, async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(neoOk([{ id: 'sii-parent-e2e-001' }])),
    });
  });
}

async function installContactMocks(page) {
  // contactsApiBase = neoBase(apiBaseUrl) + '/contacts'
  // neoBase strips the last path segment: '/sws/neo' → '/sws'
  // So the actual fetch prefix is /sws/contacts, NOT /sws/neo/contacts.
  await page.route(`**/sws/contacts/businessPartner/${BP_ID}`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(neoOk([BP_RECORD])),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await page.route('**/sws/contacts/locationAddress**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(neoOk([])) });
  });
  // Use a regex (not a glob) so this intercepts before the login() catch-all
  // which also matches '/selectors/' paths via url.includes('/selectors/').
  await page.route(/\/contacts\/businessPartner\/selectors\//, async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: TAX_ID_KEY_OPTIONS }),
    });
  });
}

// ── 8.1 Verifactu table structure ────────────────────────────────────────────
// Note: date column was removed (field not available in VF contract entities).

test.describe('Verifactu table structure — ETP-3778', () => {
  test('accepted row renders the invoice number in the table', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_ACCEPTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('verifactu-tablecard')).toBeVisible({ timeout: 8_000 });

    // Invoice number cell must be visible (FK field falls back to raw value)
    await expect(page.getByText('SV-2025-1001')).toBeVisible({ timeout: 6_000 });
  });

  test('invoice number column header is visible in the Aceptadas tab', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_ACCEPTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('verifactu-tablecard')).toBeVisible({ timeout: 8_000 });

    const table = page.getByTestId('fm-data-table').first();
    await expect(table.getByText(t('fiscalMonitor.col.invoiceNumber'))).toBeVisible({ timeout: 6_000 });
  });

  test('empty tab shows the empty-state message — no layout shift', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, []);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('verifactu-tablecard')).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText(t('fiscalMonitor.empty'))).toBeVisible({ timeout: 6_000 });
  });

  test('invoice number column is present in the Con problemas filter', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_REJECTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('verifactu-tablecard')).toBeVisible({ timeout: 8_000 });

    // Switch to "Con problemas" filter pill (shows rejected/partial/invalid rows)
    const problemsTab = page.getByTestId('fm-tabs').locator('button').filter({ hasText: t('fiscalMonitor.verifactu.pill.problems') }).first();
    await problemsTab.click();

    const table = page.getByTestId('fm-data-table').first();
    await expect(table.getByText(t('fiscalMonitor.col.invoiceNumber'))).toBeVisible({ timeout: 6_000 });
  });
});

// ── 8.2 Error pill → Contact Detail popup ────────────────────────────────────

test.describe('Error status pill → Contact Detail popup — ETP-3778', () => {
  test('clicking an error-status pill on an AE row opens the Contact Detail modal', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    // Find and click the error status pill for the AE row
    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await expect(pill).toBeVisible({ timeout: 6_000 });
    await pill.click();

    // Contact Detail modal should open
    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });
  });

  test('Contact Detail modal shows the business partner name', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();

    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(BP_RECORD.name, { exact: false })).toBeVisible({ timeout: 4_000 });
  });

  test('CO (correct) status pill has no cursor:pointer — is not clickable', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_OK]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    // The CO success pill must not have role="button" (no onClick applied)
    const successPill = page.locator('[data-testid="status-pill"][data-status="success"]').first();
    await expect(successPill).toBeVisible({ timeout: 6_000 });
    await expect(successPill).not.toHaveAttribute('role', 'button');
  });

  test('modal closes when the close (×) button is clicked', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });

    // Click the aria-label="close" button inside the modal (scoped to avoid strict-mode
    // violations if other "Cerrar" buttons exist elsewhere on the page)
    const modal = page.getByTestId('contact-detail-backdrop').first();
    await modal.getByRole('button', { name: t('close') }).click();
    await expect(page.getByText(t('contactDetail.title'))).not.toBeVisible({ timeout: 4_000 });
  });

  test('modal closes when the backdrop is clicked', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });

    // Click the semi-transparent backdrop
    await page.getByTestId('contact-detail-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.getByText(t('contactDetail.title'))).not.toBeVisible({ timeout: 4_000 });
  });
});

// ── 8.3 Tax ID Key custom dropdown ───────────────────────────────────────────

test.describe('TaxIDKeyPicker dropdown — ETP-3778', () => {
  test('dropdown opens when the trigger button is clicked', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    // Open the modal
    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    // Click the dropdown trigger button (aria-haspopup="listbox")
    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();

    // The listbox should appear
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 4_000 });
  });

  test('dropdown lists the options returned by the selector API', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();

    // All three fixture options must be visible in the list
    for (const opt of TAX_ID_KEY_OPTIONS) {
      await expect(page.getByRole('option', { name: opt.label })).toBeVisible({ timeout: 4_000 });
    }
  });

  test('selecting an option updates the trigger button label', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();

    // Select the third option from the fixture
    const selectedOption = TAX_ID_KEY_OPTIONS[2];
    await page.getByRole('option', { name: selectedOption.label }).click();

    // Trigger should now show the selected label
    await expect(trigger).toContainText(selectedOption.label, { timeout: 3_000 });
    // Listbox should close after selection
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });

  test('dropdown closes when Escape is pressed', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 4_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });

  test('dropdown closes when clicking outside (backdrop)', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('[data-testid="status-pill"]:is([data-status="warn"],[data-status="danger"])').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 4_000 });

    // Mousedown on the TaxIDKeyPicker backdrop closes the list
    await page.getByTestId('taxid-picker-backdrop').dispatchEvent('mousedown');
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });
});
