import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Solo Lectura (read-only window-access tier) — Send / attachment writes (ETP-5205, QA pasada 1).
 *
 * Under the runtime read-only tier the order windows must not offer anything that writes:
 *   - the list row "Enviar" envelope is gone;
 *   - the preview has no Send, but still offers Download PDF (decision D1: printing and
 *     downloading only expose data the role can already read);
 *   - opening the preview of a completed order does NOT upload its rendered PDF as the record's
 *     main attachment (the preview normally caches it via POST /attachments/C_Order/...);
 *   - the sales-order detail, opened by direct URL, has no "Gestionar envío y factura" button,
 *     while Print stays.
 *
 * The tier comes from login()'s `windowAccessOverrides` (the mocked windowaccessmap answers
 * "full" for every other window). Each describe also runs a full-access control so the
 * assertions cannot pass just because the control never rendered.
 */

const WINDOWS = {
  'sales-order': { windowId: '143', entityPath: 'header' },
  'purchase-order': { windowId: '181', entityPath: 'header' },
  'sales-quotation': { windowId: '6CB5B67ED33F47DFA334079D3EA2340E', entityPath: 'quotation' },
};

const COMPLETED_ROW = {
  id: 'ro-001',
  documentNo: 'RO-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  'businessPartner$_identifier': 'Test BP',
  businessPartner: 'bp-1',
  grandTotalAmount: 100,
  'currency$_identifier': 'EUR',
  orderDate: '2026-01-15',
  validUntil: '2026-06-15',
  // Backend annotations the "Gestionar" button reads (orderPendingDocs.js).
  needsPrimaryDoc: true,
  needsInvoiceDoc: true,
};

async function installRecordMock(page, spec) {
  const { entityPath } = WINDOWS[spec];
  await page.route(`**/sws/neo/${spec}/${entityPath}{/**,}**`, async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const isDetail = new RegExp(`/${entityPath}/[^/?]+`).test(req.url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isDetail
        ? { response: { data: [COMPLETED_ROW] } }
        : { response: { data: [COMPLETED_ROW], totalRows: 1 } }),
    });
  });
}

/** Records every attachment write the page attempts. */
function trackAttachmentWrites(page) {
  const writes = [];
  page.on('request', (req) => {
    if (req.url().includes('/sws/neo/attachments/') && req.method() !== 'GET') {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
  return writes;
}

async function openList(page, spec, readOnly) {
  await login(page, readOnly ? { windowAccessOverrides: { [WINDOWS[spec].windowId]: 'read-only' } } : {});
  await installRecordMock(page, spec);
  await page.goto(`/${spec}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

for (const spec of Object.keys(WINDOWS)) {
  test.describe(`Solo Lectura — ${spec}`, () => {
    test('list row has no Send envelope', async ({ page }) => {
      await openList(page, spec, true);
      const row = page.locator('tbody tr').filter({ hasText: COMPLETED_ROW.documentNo }).first();
      await row.hover();
      await expect(row.getByTestId('row-quick-action-email')).toHaveCount(0);
    });

    test('list row keeps the Send envelope under full access (control)', async ({ page }) => {
      await openList(page, spec, false);
      const row = page.locator('tbody tr').filter({ hasText: COMPLETED_ROW.documentNo }).first();
      await row.hover();
      await expect(row.getByTestId('row-quick-action-email')).toBeVisible();
    });

    test('preview has no Send, keeps Download PDF and does not write the attachment', async ({ page }) => {
      const writes = trackAttachmentWrites(page);
      await openList(page, spec, true);
      await page.locator('tbody tr').filter({ hasText: COMPLETED_ROW.documentNo }).first().click();

      const modal = page.getByTestId('generic-preview-modal');
      await expect(modal).toBeVisible();
      await expect(modal.getByTestId('preview-action-download')).toBeVisible();
      await expect(modal.getByTestId('preview-action-send')).toHaveCount(0);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      expect(writes).toEqual([]);
    });

    test('preview keeps Send under full access (control)', async ({ page }) => {
      await openList(page, spec, false);
      await page.locator('tbody tr').filter({ hasText: COMPLETED_ROW.documentNo }).first().click();
      await expect(page.getByTestId('generic-preview-modal').getByTestId('preview-action-send')).toBeVisible();
    });
  });
}

test.describe('Solo Lectura — sales-order detail by direct URL', () => {
  async function openDetail(page, readOnly) {
    await login(page, readOnly ? { windowAccessOverrides: { '143': 'read-only' } } : {});
    await installRecordMock(page, 'sales-order');
    await page.goto(`/sales-order/${COMPLETED_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  test('has no "Gestionar envío y factura" but still has Print', async ({ page }) => {
    await openDetail(page, true);
    await expect(page.getByTestId('action-document-print')).toBeVisible();
    await expect(page.getByTestId('sales-order-manage-docs')).toHaveCount(0);
  });

  test('shows "Gestionar envío y factura" under full access (control)', async ({ page }) => {
    await openDetail(page, false);
    await expect(page.getByTestId('sales-order-manage-docs')).toBeVisible();
  });
});
