import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — Confirm Modal Idempotency (mocked).
 *
 * Verifies that ConfirmModal does NOT re-execute steps that already succeeded
 * on a previous attempt. Uses mocked /sws/* routes so the test owns the
 * sequence of failures and recoveries deterministically.
 *
 * Companion source-level tests:
 *   artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
 *
 * The two scenarios mirror the bug reported in ETP-3893:
 *   - shipment OK + invoice fails → retry must NOT call createShipment again
 *   - invoice OK + shipment fails → retry must NOT call createDraftInvoice again
 *
 * In both cases retry must also NOT call documentAction=CO again, because the
 * order is already in 'CO' status and the backend would return @AlreadyPosted@.
 *
 * Steps 2 and 3 run INDEPENDENTLY — a failure on createShipment must not
 * prevent createDraftInvoice from being attempted. Each step has its own
 * try/catch and the modal aggregates the errors at the end.
 */

const ORDER_ID = 'idem-mock-order-001';
const SHIPMENT_ID = 'idem-mock-shipment-001';
const INVOICE_ID = 'idem-mock-invoice-001';

const DRAFT_HEADER = {
  id: ORDER_ID,
  documentNo: '1000999',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 100,
  summedLineAmount: 100,
  totalLines: 100,
  'businessPartner$_identifier': 'Test BP',
  'currency$_identifier': 'EUR',
};

const ONE_LINE = {
  id: 'line-001',
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  orderedQuantity: 1,
  listPrice: 100,
  lineGrossAmount: 100,
};

/**
 * Install fine-grained mocks for the confirm flow on top of the generic
 * /sws/** mock that login() seeds. Playwright matches routes in REVERSE
 * registration order, so these specific routes win.
 *
 * The `state` object lets the test toggle which step fails between attempts
 * and counts how many times each endpoint was hit.
 */
async function installConfirmMocks(page, state) {
  // Header GET — return our deterministic draft header
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_HEADER] } }),
    });
  });

  // Lines GET — return a single line so the modal computes a non-empty count
  await page.route('**/sws/neo/sales-order/lines**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [ONE_LINE] } }),
    });
  });

  // Step 1 — documentAction=CO
  await page.route(
    `**/sws/neo/sales-order/header/${ORDER_ID}/action/documentAction`,
    async (route) => {
      state.calls.documentAction += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { id: ORDER_ID, documentNo: DRAFT_HEADER.documentNo, documentStatus: 'CO' } },
        }),
      });
    },
  );

  // Step 2 — createShipment
  await page.route(
    `**/sws/neo/sales-order/header/${ORDER_ID}/action/createShipment`,
    async (route) => {
      state.calls.createShipment += 1;
      if (state.failNext.shipment) {
        state.failNext.shipment = false; // fail once, succeed on retry
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ response: { message: 'simulated shipment failure' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: SHIPMENT_ID,
              documentNo: 'SHIP-001',
              grandTotalAmount: 100,
            },
          },
        }),
      });
    },
  );

  // Step 3 — createDraftInvoice
  await page.route(
    `**/sws/neo/sales-order/header/${ORDER_ID}/action/createDraftInvoice`,
    async (route) => {
      state.calls.createDraftInvoice += 1;
      if (state.failNext.invoice) {
        state.failNext.invoice = false; // fail once, succeed on retry
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ response: { message: 'simulated invoice failure' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: INVOICE_ID,
              documentNo: 'INV-001',
              grandTotalAmount: 100,
            },
          },
        }),
      });
    },
  );
}

/**
 * Open the ConfirmModal on the rendered detail page and tick both the
 * shipment and invoice checkboxes, then click the primary confirm button.
 *
 * The modal is opened via the same custom event the topbar dispatches,
 * which avoids depending on a specific selector for the topbar button.
 */
async function openConfirmAndTickBoth(page) {
  // Ensure DetailView (and its topbarRight OrderCreateInvoice) has mounted
  // before dispatching — domcontentloaded fires before React renders.
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

  // Retry dispatching the event in case OrderCreateInvoice listener
  // hasn't been registered yet (useEffect runs after paint).
  const shipmentCard = page.getByText(/Crear albarán|Create shipment/i).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
    });
    try {
      await expect(shipmentCard).toBeVisible({ timeout: 1000 });
      break;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }

  const invoiceCard = page.getByText(/Crear factura|Create invoice/i).first();
  await expect(invoiceCard).toBeVisible();

  await shipmentCard.click();
  await invoiceCard.click();
}

async function clickConfirm(page) {
  // Primary button label changes by selection — match by Spanish or English
  const btn = page
    .getByRole('button')
    .filter({ hasText: /Confirmar.*albarán.*factura|Confirm.*shipment.*invoice|Confirmar \+|Confirm \+/i })
    .first();
  await btn.click();
}

/**
 * Open the ConfirmModal and tick ONLY the shipment card (leave invoice off).
 * Used by the single-doc "Ver albarán" result-modal assertion.
 */
async function openConfirmAndTickShipmentOnly(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

  const shipmentCard = page.getByText(/Crear albarán|Create shipment/i).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
    });
    try {
      await expect(shipmentCard).toBeVisible({ timeout: 1000 });
      break;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }

  await shipmentCard.click();
}

test.describe('Sales Order — Confirm Modal idempotency (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shipment succeeds, invoice fails — retry only re-runs the invoice step', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createShipment: 0, createDraftInvoice: 0 },
      failNext: { shipment: false, invoice: true },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickBoth(page);
    await clickConfirm(page);

    // First attempt: documentAction + createShipment + (failed) createDraftInvoice
    await expect(page.getByText(/simulated invoice failure/i)).toBeVisible({ timeout: 5000 });
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(1);
    expect(state.calls.createDraftInvoice).toBe(1);

    // The shipment card must now show the locked state
    await expect(page.getByText(/Ya creado|Already created/i)).toBeVisible();

    // Retry — invoice mock now succeeds
    await clickConfirm(page);

    // Wait for the result modal (modal title appears after onConfirmed fires)
    await expect(page.getByText(/Pedido confirmado|Order confirmed/i)).toBeVisible({ timeout: 5000 });

    // CRITICAL: documentAction and createShipment must NOT have been called again
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(1);
    expect(state.calls.createDraftInvoice).toBe(2);

    // Both documents must show in the result modal
    await expect(page.getByText(/SHIP-001/)).toBeVisible();
    await expect(page.getByText(/INV-001/)).toBeVisible();
  });

  test('invoice succeeds, shipment fails — retry only re-runs the shipment step', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createShipment: 0, createDraftInvoice: 0 },
      failNext: { shipment: true, invoice: false },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickBoth(page);
    await clickConfirm(page);

    // First attempt: documentAction + (failed) createShipment + (independent) createDraftInvoice
    // The shipment failure must NOT block the invoice — both steps are independent.
    await expect(page.getByText(/simulated shipment failure/i)).toBeVisible({ timeout: 5000 });
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(1);
    expect(state.calls.createDraftInvoice).toBe(1);

    // Invoice succeeded silently in the same attempt — its card must now be locked
    await expect(page.getByText(/Ya creado|Already created/i)).toBeVisible();

    // Retry — shipment mock now succeeds, invoice is locked and skipped by the !invoiceResult guard
    await clickConfirm(page);

    await expect(page.getByText(/Pedido confirmado|Order confirmed/i)).toBeVisible({ timeout: 5000 });

    // CRITICAL: documentAction must not be called again, shipment is retried, invoice is NOT re-run
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(2);
    expect(state.calls.createDraftInvoice).toBe(1);

    // Both documents must show in the result modal
    await expect(page.getByText(/SHIP-001/)).toBeVisible();
    await expect(page.getByText(/INV-001/)).toBeVisible();
  });

  test('both steps fail — both errors are surfaced together and both retry-able', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createShipment: 0, createDraftInvoice: 0 },
      failNext: { shipment: true, invoice: true },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickBoth(page);
    await clickConfirm(page);

    // First attempt: both step 2 and step 3 must run and both must fail
    await expect(page.getByText(/simulated shipment failure/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/simulated invoice failure/i)).toBeVisible();
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(1);
    expect(state.calls.createDraftInvoice).toBe(1);

    // Neither card should be locked — both must remain retry-able
    await expect(page.getByText(/Ya creado|Already created/i)).toHaveCount(0);

    // Retry — both mocks now succeed
    await clickConfirm(page);

    await expect(page.getByText(/Pedido confirmado|Order confirmed/i)).toBeVisible({ timeout: 5000 });
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createShipment).toBe(2);
    expect(state.calls.createDraftInvoice).toBe(2);

    await expect(page.getByText(/SHIP-001/)).toBeVisible();
    await expect(page.getByText(/INV-001/)).toBeVisible();
  });

  /**
   * ETP-4312 — symmetric "Ver albarán" assertion.
   *
   * When the order is confirmed with ONLY the shipment (no invoice), the
   * ConfirmResultModal renders a single `salida` doc. Its primary button must
   * read EXACTLY "Ver albarán" (soViewShipment) — NOT "Ver factura". This
   * validates the type-derivation in ConfirmResultModal that replaced the old
   * hardcoded `primary={ui('soViewInvoice')}`. As with the invoice case, the
   * arrow must be an SVG, not a literal "→" in the label, and there must be
   * exactly ONE arrow svg.
   */
  test('shipment only — result modal primary button reads "Ver albarán" with one svg arrow', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createShipment: 0, createDraftInvoice: 0 },
      failNext: { shipment: false, invoice: false },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickShipmentOnly(page);
    await clickConfirm(page);

    // Result modal appears with the shipment doc only.
    await expect(page.getByText(/Pedido confirmado|Order confirmed/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/SHIP-001/)).toBeVisible();
    // No invoice was requested → its documentNo must not appear.
    await expect(page.getByText(/INV-001/)).toHaveCount(0);

    // Only the shipment step ran (no invoice creation).
    expect(state.calls.createShipment).toBe(1);
    expect(state.calls.createDraftInvoice).toBe(0);

    // Primary button must read EXACTLY "Ver albarán" (NOT "Ver factura").
    const viewShipmentBtn = page.getByRole('button', { name: 'Ver albarán' });
    await expect(viewShipmentBtn).toBeVisible({ timeout: 5_000 });
    // There must be NO "Ver factura" button — guards against the old hardcoded primary.
    await expect(page.getByRole('button', { name: 'Ver factura' })).toHaveCount(0);

    const viewShipmentText = (await viewShipmentBtn.textContent())?.trim();
    expect(viewShipmentText).toBe('Ver albarán');
    expect(viewShipmentText).not.toContain('→');

    // The arrow is an SVG appended by the component — exactly one, canonical path.
    await expect(viewShipmentBtn.locator('svg')).toHaveCount(1);
    await expect(
      viewShipmentBtn.locator('svg path[d="M5 12h14M12 5l7 7-7 7"]'),
    ).toHaveCount(1);
  });
});
