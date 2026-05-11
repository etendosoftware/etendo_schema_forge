import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

const SIF_BUTTON = /Send to SIF|Enviar a SIF/;
const SIF_TITLE = /Send to Tax System|Enviar al sistema fiscal/;
const SIF_BODY_TBAI = /This invoice will be sent to TBAI\.|Esta factura se enviará a TBAI\./;
const SIF_SUCCESS_TBAI = /Sent to TBAI successfully\.|Enviado a TBAI correctamente\./;

function responseData(data) {
  return JSON.stringify({ response: { data } });
}

async function seedSelectedOrg(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({
      id: 'ORG_1',
      name: 'QA Mock Org',
    }));
  });
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

  await page.route('**/sws/neo/verifactu-config/cabeceraDeConfiguraciónVerifactu?**', async (route) => {
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
    await seedSelectedOrg(page);
    await login(page);
  });

  test('shows Send to SIF for purchase invoices when the org profile is TBAI', async ({ page }) => {
    await installFiscalProfileMocks(page, 'tbai');
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
    await expect(page.getByRole('button', { name: SIF_BUTTON })).toBeVisible();
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
    await expect(page.getByRole('button', { name: SIF_BUTTON })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: SIF_BUTTON })).toBeVisible();
  });

  test('shows Send to SIF in the purchase invoice preview modal when the org profile is TBAI', async ({ page }) => {
    await installFiscalProfileMocks(page, 'tbai');

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

    await expect(page.getByRole('button', { name: SIF_BUTTON })).toBeVisible();
  });

  test('executes Send to SIF from the preview modal, shows success, and hides the button after refresh when the target is sent', async ({ page }) => {
    await installFiscalProfileMocks(page, 'tbai');

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
      tbaiIssent: false,
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

    await page.route('**/sws/neo/purchase-invoice/header/PI_SEND_1/action/Em_Tbai_Xmlgenerator', async (route) => {
      invoiceState.tbaiIssent = true;
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

    await expect(page.getByRole('button', { name: SIF_BUTTON }).last()).toBeVisible();
    await page.getByRole('button', { name: SIF_BUTTON }).last().click();
    const sifDialog = page.locator('div').filter({ has: page.getByRole('heading', { name: SIF_TITLE }) }).last();
    await expect(sifDialog.getByRole('heading', { name: SIF_TITLE })).toBeVisible();
    await expect(sifDialog.getByText(SIF_BODY_TBAI)).toBeVisible();

    await sifDialog.getByRole('button', { name: /Enviar|Send/ }).click();
    await expect(page.getByText(SIF_SUCCESS_TBAI)).toBeVisible();

    await sifDialog.getByRole('button', { name: /Cerrar|Close/ }).click();
    await expect(page.getByRole('button', { name: SIF_BUTTON })).toHaveCount(0);
  });
});
