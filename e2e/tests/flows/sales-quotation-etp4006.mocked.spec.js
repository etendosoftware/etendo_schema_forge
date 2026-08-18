import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

const ORIGINAL_ID = 'quot-source-001';
const CLONE_ID = 'quot-clone-001';
const UE_ID = 'quot-ue-001';
const DELETE_ID = 'quot-delete-001';

const BASE_DRAFT = {
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  orderDate: '2026-05-01',
  validUntil: '2026-05-31',
  businessPartner: 'bp-1',
  'businessPartner$_identifier': 'Laura Morat',
  partnerAddress: 'addr-1',
  'partnerAddress$_identifier': 'Rio Cuarto, Santa Fe 488',
  priceList: 'pl-1',
  'priceList$_identifier': 'Standard Sales Price List',
  paymentMethod: 'pm-1',
  'paymentMethod$_identifier': 'Cash',
  paymentTerms: 'pt-1',
  'paymentTerms$_identifier': '30 Days',
  grandTotalAmount: 100,
  summedLineAmount: 80,
  etgoTotalDiscount: 10,
  description: '',
  processed: false,
};

const ORIGINAL_QUOTE = {
  id: ORIGINAL_ID,
  documentNo: 'QUOT-ORIG-001',
  ...BASE_DRAFT,
};

const CLONED_QUOTE = {
  id: CLONE_ID,
  documentNo: 'QUOT-CLONE-001',
  ...BASE_DRAFT,
};

const UE_QUOTE = {
  id: UE_ID,
  documentNo: 'QUOT-UE-001',
  ...BASE_DRAFT,
  documentStatus: 'UE',
  'documentStatus$_identifier': 'Under Evaluation',
  grandTotalAmount: 90,
  summedLineAmount: 72,
  processed: true,
};

const DELETE_QUOTE = {
  id: DELETE_ID,
  documentNo: 'QUOT-DELETE-001',
  ...BASE_DRAFT,
};

const QUOTATION_LINES = [
  {
    id: 'quot-line-001',
    product: 'prod-1',
    'product$_identifier': 'Test Product',
    orderedQuantity: 1,
    listPrice: 80,
    discount: 0,
    lineGrossAmount: 80,
  },
];

async function installQuotationMocks(page, state) {
  await page.route('**/sws/neo/sales-quotation/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf('sales-quotation');
    const entity = segments[idx + 1];
    const idOrSubpath = segments[idx + 2];
    const action = segments[idx + 4];

    if (entity === 'quotationLine' && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: QUOTATION_LINES } }),
      });
      return;
    }

    if (entity === 'quotation' && req.method() === 'GET' && idOrSubpath === 'defaults') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults: { orderDate: '2026-05-14' } }),
      });
      return;
    }

    const detailMap = {
      [ORIGINAL_ID]: ORIGINAL_QUOTE,
      [CLONE_ID]: CLONED_QUOTE,
      [UE_ID]: UE_QUOTE,
      [DELETE_ID]: DELETE_QUOTE,
    };

    if ((entity === 'quotation' || entity === 'header') && req.method() === 'GET') {
      if (idOrSubpath && detailMap[idOrSubpath]) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [detailMap[idOrSubpath]] } }),
        });
        return;
      }

      if (!idOrSubpath) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [ORIGINAL_QUOTE], totalRows: 1 } }),
        });
        return;
      }
    }

    // ETP-4468 — QuotationConfirmModal now calls onSave() (handleSave, a PATCH
    // to `${apiBaseUrl}/quotation/${id}`) before converting the quotation.
    // Without an explicit PATCH echo here, the request fell through to the
    // generic `**/sws/**` catch-all in auth.js, which replies with a
    // synthetic `{ id: 'e2e-record-id', ... }` (wrong id, no NEO envelope).
    // useEntity's refetchAfterSave then refetched by that fake id — a URL
    // this route also matches (`sales-quotation/quotation/e2e-record-id`),
    // but not present in detailMap, so it fell through to `route.fallback()`
    // and got an empty record from the catch-all, overwriting the header
    // state and losing `documentStatus` (UE) before the invoice-creation
    // step ran. Echo back the real record (matched by id) to keep the
    // refetch consistent, exactly like a real backend would.
    if (
      entity === 'quotation'
      && (req.method() === 'PATCH' || req.method() === 'PUT')
      && idOrSubpath && detailMap[idOrSubpath]
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...detailMap[idOrSubpath] }] } }),
      });
      return;
    }

    if (entity === 'quotation' && req.method() === 'POST' && action === 'cloneRecord' && idOrSubpath === ORIGINAL_ID) {
      state.cloneCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { id: CLONE_ID } } }),
      });
      return;
    }

    if (entity === 'quotation' && req.method() === 'POST' && action === 'createDraftInvoice' && idOrSubpath === UE_ID) {
      state.invoiceCreateCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: 'inv-quote-001',
              documentNo: 'INV-QUOTE-001',
              grandTotalAmount: 90,
            },
          },
        }),
      });
      return;
    }

    if (entity === 'quotation' && req.method() === 'DELETE' && idOrSubpath === DELETE_ID) {
      state.deletedIds.push(DELETE_ID);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    route.fallback();
  });
}

async function clearServiceWorkerState(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  });
}

async function openQuotationConfirmModal(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId('action-clone')).toBeVisible({ timeout: 8_000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-quotation:open-confirm-modal'));
    });
    try {
      await expect(page.getByTestId('confirm-summary-total')).toBeVisible({ timeout: 1_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
}

test.describe('Sales Quotation — ETP-4006 regressions (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await clearServiceWorkerState(page);
  });

  test('cloned quotation keeps price list and shows the discount-adjusted draft preview total', async ({ page }) => {
    const state = { cloneCalls: 0, invoiceCreateCalls: 0, deletedIds: [] };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${ORIGINAL_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('action-clone').click();

    await page.getByTestId('action-clone-record').click();
    await expect.poll(() => state.cloneCalls, { timeout: 5_000 }).toBe(1);
    await page.waitForURL(new RegExp(`/sales-quotation/${CLONE_ID}$`), { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(CLONED_QUOTE.documentNo, { exact: true })).toBeVisible({ timeout: 10_000 });

    // ETP-4600: a field with a committed value renders as a chip
    // (`field-priceList-chip`) — the plain input testid is not in the DOM
    // while a value is set. The chip's <span> holds the value label.
    await expect(page.getByTestId('field-priceList-chip')).toContainText(CLONED_QUOTE['priceList$_identifier']);

    await openQuotationConfirmModal(page);
    await expect(page.getByTestId('confirm-summary-total')).toHaveText(/90([.,])00/, { timeout: 5_000 });
    await expect(page.getByTestId('confirm-summary-subtotal')).toHaveText(/72([.,])00/);
  });

  test('new quotation does not render rejectReason on the initial draft form', async ({ page }) => {
    const state = { cloneCalls: 0, invoiceCreateCalls: 0, deletedIds: [] };
    await installQuotationMocks(page, state);

    await page.goto('/sales-quotation/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('field-businessPartner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('field-rejectReason')).toHaveCount(0);
  });

  test('invoice creation from UE keeps the agreed total after total-discount carry-over', async ({ page }) => {
    const state = { cloneCalls: 0, invoiceCreateCalls: 0, deletedIds: [] };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${UE_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await openQuotationConfirmModal(page);
    await expect(page.getByTestId('confirm-summary-total')).toHaveText(/90([.,])00/, { timeout: 5_000 });
    await page.getByTestId('confirm-option-invoice').click();
    await page.getByTestId('action-confirm-modal').click();

    await expect.poll(() => state.invoiceCreateCalls, { timeout: 5_000 }).toBe(1);
    await expect(page.getByText('INV-QUOTE-001')).toBeVisible({ timeout: 5_000 });
    // As of ETP-4777, the quotation's OWN totals panel (still on screen
    // behind the "Factura creada" confirmation banner) also reads the
    // persisted 90,00 baseline verbatim, so an unscoped page-wide text
    // search now matches both and trips Playwright's strict-mode ambiguity
    // check. The totals panel renders first in the DOM and the confirmation
    // banner is appended after it, so `.last()` reliably picks the banner's
    // occurrence without depending on that banner's internal markup.
    await expect(page.getByText(/90([.,])00/).last()).toBeVisible();
  });

  test('draft quotation can be deleted without a false related-documents blocker', async ({ page }) => {
    const state = { cloneCalls: 0, invoiceCreateCalls: 0, deletedIds: [] };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${DELETE_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('action-delete').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('action-delete-confirm').click();

    await expect.poll(() => state.deletedIds.length, { timeout: 5_000 }).toBe(1);
    await expect(page.getByText(/related documents/i)).toHaveCount(0);
  });
});
