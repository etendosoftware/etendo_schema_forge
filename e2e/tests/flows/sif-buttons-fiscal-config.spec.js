import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

function responseData(data) {
  return JSON.stringify({ response: { data } });
}

// ETP-4576 — the fiscal-profile hook resolves the org from `selectedOrg`, which
// is populated only from the restored cookie session. So the org is handed to
// login(), which cross-references it into `environment.orgId` + the role's
// `orgList`. Seeding `sf_auth_selected_org` in localStorage (as this spec used
// to) is a no-op now: AuthProvider reads from memory storage and purges the
// legacy `sf_auth_*` keys on mount.
const MOCK_ORG_1 = { id: 'ORG_1', name: 'QA Mock Org' };

async function loginWithOrg(page) {
  await login(page, { org: MOCK_ORG_1 });
}

async function installFiscalProfileMocks(page, profile) {
  const siiRecord = profile === 'sii'
    ? { taxtype: 'IVA' }
    : profile === 'sii-navarra'
      ? { navarra: 'Y', taxtype: 'IVA' }
      : profile === 'sii+tbai'
        ? { guipuzcoa: 'Y', taxtype: 'IVA' }
        : null;

  const tbaiRecord = profile === 'tbai' || profile === 'sii+tbai'
    ? { etsgSifTerritory: 'GIPUZKOA', tbaisystemdate: '2026-05-08' }
    : null;

  const verifactuRecord = profile === 'verifactu'
    ? { tAXType: '01', nextSendWaitTime: '60' }
    : null;

  await page.route('**/sws/neo/sii-config/siiConfiguration?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(siiRecord ? [siiRecord] : []),
    });
  });

  await page.route('**/sws/neo/tbai-config/header?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(tbaiRecord ? [tbaiRecord] : []),
    });
  });

  await page.route('**/sws/neo/verifactu-config/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(verifactuRecord ? [verifactuRecord] : []),
    });
  });
}

async function installInvoiceDetailMocks(page, specName, invoice, installments = []) {
  await page.route(`**/sws/neo/${specName}/header/${invoice.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData([invoice]),
    });
  });

  await page.route(`**/sws/neo/${specName}/lines?parentId=${invoice.id}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData([]),
    });
  });

  await page.route(`**/sws/neo/${specName}/paymentPlan?parentId=${invoice.id}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(installments),
    });
  });
}

function installMutableInvoiceDetailMocks(page, specName, invoice, installments = []) {
  const state = { ...invoice };

  page.route(`**/sws/neo/${specName}/header/${invoice.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData([state]),
    });
  });

  page.route(`**/sws/neo/${specName}/lines?parentId=${invoice.id}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData([]),
    });
  });

  page.route(`**/sws/neo/${specName}/paymentPlan?parentId=${invoice.id}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(installments),
    });
  });

  return state;
}

test.describe('SIF buttons follow fiscal config in invoice detail views', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithOrg(page);
  });

  test('shows Send to SIF for purchase invoices when the org profile is SII', async ({ page }) => {
    await installFiscalProfileMocks(page, 'sii');
    await installInvoiceDetailMocks(page, 'purchase-invoice', {
      id: 'PI_1',
      documentNo: 'PI-001',
      orderReference: 'SUP-001',
      documentStatus: 'CO',
      grandTotalAmount: 150,
      outstandingAmount: 150,
      businessPartner: 'BP_1',
      'businessPartner$_identifier': 'QA Supplier',
      'currency$_identifier': 'EUR',
    });

    await navigateTo(page, 'purchase-invoice/PI_1');
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await expect(page.getByRole('button', { name: t('sendToSif') })).toBeVisible();
  });

  test('hides Send to SIF for purchase invoices when the org profile is Verifactu', async ({ page }) => {
    await installFiscalProfileMocks(page, 'verifactu');
    await installInvoiceDetailMocks(page, 'purchase-invoice', {
      id: 'PI_2',
      documentNo: 'PI-002',
      orderReference: 'SUP-002',
      documentStatus: 'CO',
      grandTotalAmount: 230,
      outstandingAmount: 230,
      businessPartner: 'BP_1',
      'businessPartner$_identifier': 'QA Supplier',
      'currency$_identifier': 'EUR',
    });

    await navigateTo(page, 'purchase-invoice/PI_2');
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await expect(page.getByRole('button', { name: t('sendToSif') })).toHaveCount(0);
  });

  test('shows Send to SIF for sales invoices when the org profile is SII+TBAI', async ({ page }) => {
    await installFiscalProfileMocks(page, 'sii+tbai');
    await installInvoiceDetailMocks(
      page,
      'sales-invoice',
      {
        id: 'SI_1',
        documentNo: 'SI-001',
        documentStatus: 'CO',
        grandTotalAmount: 310,
        outstandingAmount: 310,
        businessPartner: 'BP_2',
        'businessPartner$_identifier': 'QA Customer',
        'currency$_identifier': 'EUR',
      },
      [{
        id: 'FPS_1',
        amount: 310,
        paidAmount: 0,
        outstandingAmount: 310,
        dueDate: '2026-05-08',
        daysOverdue: 0,
      }],
    );

    await navigateTo(page, 'sales-invoice/SI_1');
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await expect(page.getByRole('button', { name: t('sendToSif') })).toBeVisible();
  });

  test('shows Send to SIF in the purchase invoice preview modal when the org profile is SII', async ({ page }) => {
    await installFiscalProfileMocks(page, 'sii');

    await page.route('**/sws/neo/purchase-invoice/header?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: responseData([{
          id: 'PI_PREVIEW_1',
          documentNo: 'PI-PREVIEW-001',
          orderReference: 'SUP-PREVIEW-001',
          documentStatus: 'CO',
          grandTotalAmount: 180,
          outstandingAmount: 180,
          businessPartner: 'BP_1',
          'businessPartner$_identifier': 'QA Supplier',
          'currency$_identifier': 'EUR',
        }]),
      });
    });

    await page.route('**/sws/neo/purchase-invoice/paymentPlan?parentId=PI_PREVIEW_1**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: responseData([]),
      });
    });

    await page.route('**/sws/neo/purchase-invoice/header/PI_PREVIEW_1/action/invoicePayments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: responseData([]),
      });
    });

    await navigateTo(page, 'purchase-invoice');
    const row = page.locator('[data-testid^="row-"]').first();
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByRole('button', { name: t('sendToSif') })).toBeVisible();
  });

  test('executes Send to SIF from the preview modal, shows success, and hides the button after refresh when the target is sent', async ({ page }) => {
    await installFiscalProfileMocks(page, 'sii');

    const invoiceState = installMutableInvoiceDetailMocks(page, 'purchase-invoice', {
      id: 'PI_SEND_1',
      documentNo: 'PI-SEND-001',
      orderReference: 'SUP-SEND-001',
      documentStatus: 'CO',
      grandTotalAmount: 190,
      outstandingAmount: 190,
      businessPartner: 'BP_1',
      'businessPartner$_identifier': 'QA Supplier',
      'currency$_identifier': 'EUR',
      aeatsiiIssent: false,
    });

    await page.route('**/sws/neo/purchase-invoice/header?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: responseData([invoiceState]),
      });
    });

    await page.route('**/sws/neo/purchase-invoice/header/PI_SEND_1/action/invoicePayments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: responseData([]),
      });
    });

    await page.route('**/sws/neo/purchase-invoice/header/PI_SEND_1/action/Em_aeatsii_send', async (route) => {
      invoiceState.aeatsiiIssent = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' }),
      });
    });

    await navigateTo(page, 'purchase-invoice');
    const row = page.locator('[data-testid^="row-"]').first();
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByRole('button', { name: t('sendToSif') }).last()).toBeVisible();
    await page.getByRole('button', { name: t('sendToSif') }).last().click();
    const sifDialog = page.locator('div').filter({ has: page.getByRole('heading', { name: t('sendToSifTitle') }) }).last();
    await expect(sifDialog.getByRole('heading', { name: t('sendToSifTitle') })).toBeVisible();
    await expect(sifDialog.getByText(t('sendToSifBodySii'))).toBeVisible();

    await sifDialog.getByRole('button', { name: t('sendToSifConfirm') }).click();
    await expect(page.getByText(t('sendToSifSuccessSii'))).toBeVisible();

    await sifDialog.getByRole('button', { name: t('close') }).click();
    await expect(page.getByRole('button', { name: t('sendToSif') })).toHaveCount(0);
  });
});

// ── ETP-4390: Verifactu fields on the SIF tab (sales-invoice, draft) ─────────
//
// Adds coverage for the 6 new Verifactu-only fields on SifTab.jsx and the
// OperationDateField bug fix (previously only editable from the SII panel,
// now shared by both SII and Verifactu). See tools/app-shell/src/windows/
// custom/shared/SifTab.jsx and useSifFieldPatcher.js for the implementation.

function installSalesInvoicePatchCapture(page, invoiceId, patchBodies) {
  return page.route(`**/sws/neo/sales-invoice/header/${invoiceId}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    let body = {};
    try { body = route.request().postDataJSON(); } catch { /* ignore malformed body */ }
    patchBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{}] } }),
    });
  });
}

test.describe('SifTab — Verifactu fields on sales invoice (ETP-4390)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithOrg(page);
  });

  // ETP-4463: SifTab no longer persists fields itself — edits made in the tab
  // (invoice type, corrective type, operation date, etc.) write into the same
  // shared `editing` state as the header form via the `onChange` prop DetailView
  // passes down. There is no more per-field PATCH-on-blur/select — persistence
  // happens only when the header "Guardar" (data-testid="action-save-draft") or
  // "Confirmar" (data-testid="action-save") button is clicked, and that ONE PATCH
  // carries every pending edit (SIF fields included) together with the rest of
  // the header payload. These tests assert the field values land in that single
  // PATCH, rather than intercepting a PATCH fired per field on blur/select.
  test('editing the invoice type to a rectifying value reveals the corrective type field, and the Guardar PATCH includes both SIF field changes', async ({ page }) => {
    await installFiscalProfileMocks(page, 'verifactu');

    const invoice = {
      id: 'SI_VF_1',
      documentNo: 'SI-VF-001',
      documentStatus: 'DR',
      grandTotalAmount: 200,
      outstandingAmount: 200,
      businessPartner: 'BP_1',
      'businessPartner$_identifier': 'QA Customer',
      'currency$_identifier': 'EUR',
    };
    await installInvoiceDetailMocks(page, 'sales-invoice', invoice);

    const patchBodies = [];
    await installSalesInvoicePatchCapture(page, invoice.id, patchBodies);

    await navigateTo(page, `sales-invoice/${invoice.id}`);
    await expect(page.getByTestId('detail-view')).toBeVisible();

    await page.getByTestId('tab-custom:sif').click();
    await expect(page.getByText(t('sifDataTabs.panel.verifactu.subtitle'))).toBeVisible({ timeout: 8_000 });

    // Corrective invoice type field is not shown before an invType is selected.
    await expect(page.getByText(t('sifDataTabs.field.correctiveInvoiceType'))).toHaveCount(0);

    // Open the "Tipo de Factura" select and choose a rectifying value (R2).
    await page.locator('#sif-vfInvType').click();
    await page.getByRole('option', { name: /R2/ }).click();

    // The corrective invoice type field becomes visible immediately — driven by
    // the shared editing state (onChange updates it, data reflects it on the very
    // next render), with no save round-trip involved.
    await expect(page.getByText(t('sifDataTabs.field.correctiveInvoiceType'))).toBeVisible({ timeout: 4_000 });
    await expect(page.locator('#sif-vfReverseType')).toBeVisible();

    // The corrective invoice type select is itself selectable.
    await page.locator('#sif-vfReverseType').click();
    await page.getByRole('option', { name: /Por Diferencias|By difference/i }).click();

    // No PATCH has fired yet from any of the above — SifTab no longer persists
    // per-field.
    expect(patchBodies).toHaveLength(0);

    // Clicking "Guardar" (draft save) fires the ONE header PATCH, and it carries
    // both pending SIF field edits made above.
    await page.getByTestId('action-save-draft').click();

    await expect.poll(() => patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({ etvfacInvType: 'R2', etvfacReverseinvtype: 'I' });
  });

  test('etsgDateOperation is editable from the Verifactu tab (regression: previously only editable from SII) and its edit lands in the Guardar PATCH', async ({ page }) => {
    await installFiscalProfileMocks(page, 'verifactu');

    const invoice = {
      id: 'SI_VF_2',
      documentNo: 'SI-VF-002',
      documentStatus: 'DR',
      grandTotalAmount: 300,
      outstandingAmount: 300,
      businessPartner: 'BP_1',
      'businessPartner$_identifier': 'QA Customer',
      'currency$_identifier': 'EUR',
      etsgDateOperation: '2026-01-01',
    };
    await installInvoiceDetailMocks(page, 'sales-invoice', invoice);

    const patchBodies = [];
    await installSalesInvoicePatchCapture(page, invoice.id, patchBodies);

    await navigateTo(page, `sales-invoice/${invoice.id}`);
    await expect(page.getByTestId('detail-view')).toBeVisible();

    await page.getByTestId('tab-custom:sif').click();
    await expect(page.getByText(t('sifDataTabs.panel.verifactu.subtitle'))).toBeVisible({ timeout: 8_000 });

    const dateInput = page.locator('#sif-etsgDateOperation');
    await expect(dateInput).toBeVisible();
    await expect(dateInput).toBeEnabled();

    // Type a new date (es_ES locale: day-first, 8 digits auto-masked to dd/mm/yyyy)
    // and blur — DateField commits via its own onChange, no separate save button
    // inside the tab itself.
    await dateInput.click();
    await dateInput.fill('');
    await dateInput.pressSequentially('15032026');
    await dateInput.blur();

    expect(patchBodies).toHaveLength(0);

    await page.getByTestId('action-save-draft').click();

    await expect.poll(() => patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({ etsgDateOperation: '2026-03-15' });
  });
});
