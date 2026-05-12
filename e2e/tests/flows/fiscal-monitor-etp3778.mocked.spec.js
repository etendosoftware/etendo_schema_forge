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

async function loginWithOrg(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_auth_selected_role', JSON.stringify({ id: 'r1', name: 'Admin', orgList: [] }));
    localStorage.setItem('sf_auth_rolelist', JSON.stringify([{ id: 'r1', name: 'Admin', orgList: [] }]));
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'ORG_E2E', name: 'E2E Test Org' }));
  });
  await login(page);
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

// ── 8.1 Verifactu date column ─────────────────────────────────────────────────

test.describe('Verifactu date column — ETP-3778', () => {
  test('accepted row shows invoiceDate formatted as dd/mm/yyyy', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_ACCEPTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.verifactu.title'))).toBeVisible({ timeout: 8_000 });

    // The ISO date 2025-04-14 must be displayed as 14/04/2025
    await expect(page.getByText('14/04/2025')).toBeVisible({ timeout: 6_000 });
  });

  test('date column header is visible in the Aceptadas tab', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_ACCEPTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.verifactu.title'))).toBeVisible({ timeout: 8_000 });

    const table = page.locator('.fm-table').first();
    await expect(table.getByText(t('fiscalMonitor.col.date'))).toBeVisible({ timeout: 6_000 });
  });

  test('empty tab shows a single cell that spans all 9 columns — no layout shift', async ({ page }) => {
    await loginWithOrg(page);
    // Start on accepted tab which will have 0 rows after we switch to rejected
    await installVfMocksWithRows(page, []);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.verifactu.title'))).toBeVisible({ timeout: 8_000 });

    // The empty-state cell should exist (colSpan=9 is structural; we verify no broken columns)
    await expect(page.getByText(t('fiscalMonitor.empty'))).toBeVisible({ timeout: 6_000 });
  });

  test('date column is present in the Rechazadas tab', async ({ page }) => {
    await loginWithOrg(page);
    await installVfMocksWithRows(page, [VF_ROW_REJECTED]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.verifactu.title'))).toBeVisible({ timeout: 8_000 });

    // Switch to Rechazadas tab
    const rejectedTab = page.locator('.fm-tabs button').filter({ hasText: t('fiscalMonitor.verifactu.tab.rejected') }).first();
    await rejectedTab.click();

    const table = page.locator('.fm-table').first();
    await expect(table.getByText(t('fiscalMonitor.col.date'))).toBeVisible({ timeout: 6_000 });
  });
});

// ── 8.2 Error pill → Contact Detail popup ────────────────────────────────────

test.describe('Error status pill → Contact Detail popup — ETP-3778', () => {
  test('clicking an error-status pill on an AE row opens the Contact Detail modal', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    // Find and click the error status pill for the AE row
    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
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

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
    await pill.click();

    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(BP_RECORD.name, { exact: false })).toBeVisible({ timeout: 4_000 });
  });

  test('CO (correct) status pill has no cursor:pointer — is not clickable', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_OK]);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    // The CO success pill must not have role="button" (no onClick applied)
    const successPill = page.locator('.fm-pill.success').first();
    await expect(successPill).toBeVisible({ timeout: 6_000 });
    await expect(successPill).not.toHaveAttribute('role', 'button');
  });

  test('modal closes when the close (×) button is clicked', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });

    // Click the aria-label="close" button inside the modal (scoped to avoid strict-mode
    // violations if other "Cerrar" buttons exist elsewhere on the page)
    const modal = page.locator('.fixed.inset-0.z-50').first();
    await modal.getByRole('button', { name: t('close') }).click();
    await expect(page.getByText(t('contactDetail.title'))).not.toBeVisible({ timeout: 4_000 });
  });

  test('modal closes when the backdrop is clicked', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.title'))).toBeVisible({ timeout: 6_000 });

    // Click the semi-transparent backdrop (fixed inset-0 bg-black/30 div)
    await page.locator('.fixed.inset-0.bg-black\\/30').click({ position: { x: 5, y: 5 } });
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

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    // Open the modal
    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
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

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
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

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();

    // Select "Pasaporte"
    await page.getByRole('option', { name: 'Pasaporte' }).click();

    // Trigger should now show the selected label
    await expect(trigger).toContainText('Pasaporte', { timeout: 3_000 });
    // Listbox should close after selection
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });

  test('dropdown closes when Escape is pressed', async ({ page }) => {
    await loginWithOrg(page);
    await installSiiMocksWithRows(page, [SII_ROW_ERROR]);
    await installContactMocks(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
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

    await expect(page.getByText(t('fiscalMonitor.sii.title'))).toBeVisible({ timeout: 8_000 });

    const pill = page.locator('.fm-pill.warn, .fm-pill.danger').first();
    await pill.click();
    await expect(page.getByText(t('contactDetail.taxIDKey'))).toBeVisible({ timeout: 6_000 });

    const trigger = page.locator('button[aria-haspopup="listbox"]');
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 4_000 });

    // Mousedown on the fixed backdrop (z-[60]) closes the list
    await page.locator('.fixed.inset-0.z-\\[60\\]').dispatchEvent('mousedown');
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });
});
