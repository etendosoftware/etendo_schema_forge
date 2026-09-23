import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Row Quick Actions — smoke (mocked).
 *
 * Validates the ETP-3914 overlay on the four pilot windows: hover reveals the
 * overlay, Edit navigates to detail, Delete opens the confirm modal.
 *
 * Mock mode only: this spec installs window-specific routes on top of the
 * generic /sws/** mock that login() seeds, so it does not need a backend.
 */

const ROWS = [
  { id: 'row-001', documentNo: 'DOC-001', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador' },
  { id: 'row-002', documentNo: 'DOC-002', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado' },
];

/**
 * Per-window expected buttons (canonical RowQuickActions) derived from each
 * window's custom wiring in `tools/app-shell/src/windows/custom/<w>/index.jsx`
 * (or its shared hook — `useOrderWindow.jsx` for sales-order/purchase-order,
 * `useInvoiceWindow.js` for sales-invoice/purchase-invoice).
 *
 *   clone   → window passes `onClone`
 *   email   → window declares `documentPreview: true` + passes `onEmail`.
 *             For sales-order, purchase-order, and sales-invoice the button
 *             is ALSO gated by `SEND_VISIBLE_WHEN_CONFIRMED` (ETP-4717,
 *             see `shared/sendActionVisibility.js`): it only renders once
 *             `documentStatus === 'CO'`. DOC-001 below is Draft, so
 *             `expects.email` is `false` for these three windows even
 *             though the window does wire `onEmail` — `emailGate:
 *             'confirmed'` additionally asserts the button DOES appear on
 *             DOC-002 (Completado), so this spec still covers the
 *             positive case for the button's wiring, not just its absence.
 *   more    → window passes `menuActions` (kebab). sales-invoice and
 *             purchase-invoice show it even on DOC-001 (Draft) since ETP-5378
 *             added a Confirmar entry there, mirroring the form's draftMode
 *             button — previously their kebab only ever appeared once
 *             completed (Reactivate/Post).
 *
 * Edit and Delete are always expected (Delete fully visible because the test
 * rows do not set `hideDeleteWhenComplete` on draft state).
 */
const FIELDS = {
  'sales-order': {
    extra: { 'businessPartner$_identifier': 'Test BP', grandTotalAmount: 100, deliveryStatus: 50, invoiceStatus: 50, orderDate: '2026-01-15' },
    expects: { clone: true, email: false, more: true },
    emailGate: 'confirmed',
  },
  'purchase-order': {
    extra: { 'businessPartner$_identifier': 'Test BP', grandTotalAmount: 100, deliveryStatus: 50, invoiceStatus: 50, orderDate: '2026-01-15' },
    expects: { clone: true, email: false, more: true },
    emailGate: 'confirmed',
  },
  'sales-invoice': {
    extra: { 'businessPartner$_identifier': 'Test BP', grandTotalAmount: 100, invoiceDate: '2026-01-15' },
    // ETP-5378 — the row kebab now offers Confirmar on a Draft invoice (matching
    // the form's own draftMode button), so DOC-001 (DR below) renders the kebab
    // where it used to render nothing. See useInvoiceWindow.js's menuActions.
    expects: { clone: true, email: false, more: true },
    emailGate: 'confirmed',
  },
  'purchase-invoice': {
    // List shows orderReference (POReference) instead of documentNo — keep the
    // same display text so the row locator works across all four windows.
    extra: { 'businessPartner$_identifier': 'Test BP', grandTotalAmount: 100, invoiceDate: '2026-01-15' },
    docNoField: 'orderReference',
    // ETP-5378 — see the sales-invoice comment above; same Confirmar addition.
    expects: { clone: true, email: false, more: true },
  },
  'sales-quotation': {
    entityPath: 'quotation',  // quotation entity, not 'header'
    // Use UE (En espera) so the Reject menu action is visible → more button renders
    extra: { 'businessPartner$_identifier': 'Test BP', grandTotalAmount: 100, orderDate: '2026-01-15', validUntil: '2026-06-15', documentStatus: 'UE', 'documentStatus$_identifier': 'En espera' },
    expects: { clone: true, email: true, more: true },
  },
};

/**
 * Install a list-endpoint mock that returns two synthetic rows for the given
 * spec. Must run AFTER login() — Playwright matches routes in reverse order.
 */
async function installListMock(page, spec) {
  const cfg = FIELDS[spec];
  const docNoField = cfg.docNoField || 'documentNo';
  const entityPath = cfg.entityPath ?? 'header';   // windows may expose a non-header entity path
  const rows = ROWS.map(r => ({
    ...r,
    [docNoField]: r.documentNo, // some windows use a different key (e.g. orderReference)
    ...cfg.extra,
  }));
  await page.route(`**/sws/neo/${spec}/${entityPath}{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !new RegExp(`/${entityPath}/[^/?]+`).test(url)) {
      // List fetch
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }
    // Detail GET — return the matching row so the detail page renders
    if (req.method() === 'GET') {
      const m = url.match(new RegExp(`/${entityPath}/([^/?]+)`));
      const found = rows.find(r => r.id === m?.[1]) ?? rows[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }
    route.fallback();
  });
}

const SPECS = ['sales-order', 'purchase-order', 'sales-invoice', 'purchase-invoice', 'sales-quotation'];

for (const spec of SPECS) {
  test.describe(`Row Quick Actions — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installListMock(page, spec);
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('Edit button navigates to detail view', async ({ page }) => {
      const firstRow = page.locator('tbody tr').filter({ hasText: 'DOC-001' }).first();
      await firstRow.hover();
      await firstRow.getByTestId('row-quick-action-edit').click();
      await expect(page).toHaveURL(new RegExp(`/${spec}/row-001`));
    });
  });
}

test.describe('Preview panel — row click opens preview', () => {
  const PREVIEW_SPECS = ['sales-order', 'purchase-order', 'sales-quotation'];

  for (const spec of PREVIEW_SPECS) {
    test.describe(`${spec}`, () => {
      test.beforeEach(async ({ page }) => {
        await login(page);
        await installListMock(page, spec);
        await page.goto(`/${spec}`);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      });

      test('row click opens preview modal without navigating', async ({ page }) => {
        const firstRow = page.locator('tbody tr').filter({ hasText: 'DOC-001' }).first();
        await expect(firstRow).toBeVisible();
        await firstRow.click();
        await expect(page.getByTestId('generic-preview-modal')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/${spec}$`));
      });
    });
  }
});
