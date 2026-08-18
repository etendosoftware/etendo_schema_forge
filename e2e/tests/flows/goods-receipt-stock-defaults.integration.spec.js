import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { login, navigateTo } from '../helpers/auth.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  expectSaveResponse, reselectComboOption,
} from '../helpers/purchase-helpers.js';

/**
 * Goods Receipt — Real integration E2E for ETP-4671 (two related bugs, one
 * continuous flow, same product used throughout):
 *
 *   Bug 1: Confirming a goods receipt failed for a product with zero prior
 *          stock ("New object Locator ... not present in the import set").
 *          Fixed in com.etendoerp.go's GoodsReceiptLineHandler, which now
 *          injects a default warehouse locator when the receipt line's
 *          storageBin is missing/unresolved.
 *   Bug 2: The Movement Quantity field was pre-filled with the product's
 *          current on-hand stock instead of defaulting to 1. Fixed via (a)
 *          GoodsReceiptLineHandler#afterCallout stripping the stock-derived
 *          quantity the classic AD callout injects, and (b) a schema_forge_core
 *          pipeline fix so decisions.json's movementQuantity.defaultValue: "1"
 *          actually reaches the generated frontend instead of the raw AD
 *          default of 0.
 *
 * Flow (single test, same product end to end):
 *   1. Login (real backend)
 *   2. Create a brand-new product (zero stock by construction)
 *   3. First goods receipt for that product (quantity 10) → confirm.
 *      Proves Bug 1: confirming must succeed even though the product had no
 *      prior stock / no resolved storage bin.
 *   4. Second goods receipt for the SAME product (now has 10 units of stock)
 *      → assert the Movement Quantity field defaults to 1 right after
 *      selecting the product, NOT the on-hand stock (10) and NOT 0.
 *      Proves Bug 2.
 *   5. Confirm the second receipt too as a final sanity check.
 *
 * Scope: goods-receipt ONLY (goods-shipment is explicitly out of scope for
 * ETP-4671). Skipped unless E2E_GOODS_RECEIPT_INTEGRATION=1 is set — needs a
 * live Etendo GO backend with the ETP-4671 fixes deployed (compiled Java +
 * regenerated goods-receipt frontend artifacts). Not run by any CI job.
 */

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_GOODS_RECEIPT_INTEGRATION === '1';

function uniqueSuffix() {
  return randomBytes(4).toString('hex');
}

// ── Local flow helpers (goods-receipt / product specific — not shared with
//    other windows, so they live in this spec rather than purchase-helpers.js) ──

/** Extract the record id from the current URL for a given window slug (e.g. `/product/<id>`). */
function extractRecordId(page, windowSlug) {
  const match = page.url().match(new RegExp(`/${windowSlug}/([a-zA-Z0-9]+)(?:[/?#]|$)`));
  return match?.[1] ?? null;
}

/**
 * Create a brand-new product with a unique identifier/name, leaving every
 * other field at its default. A freshly created product has zero stock by
 * construction (no prior stock movements), which is exactly what Bug 1 needs.
 *
 * Returns the created product's record id, so the caller can assert it was
 * actually extracted (a falsy/wrong id here would mean creation silently
 * didn't happen the way the URL assertion above implies).
 */
async function createUniqueProduct(page, { searchKey, name }) {
  await navigateTo(page, 'product');
  await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 15_000 });
  await slow(page);

  await page.getByTestId('action-new').click();
  await waitForDetailReady(page);
  await slow(page);

  await page.getByTestId('field-searchKey').fill(searchKey);
  await slow(page);
  await page.getByTestId('field-name').fill(name);
  await slow(page);

  const saveBtn = page.getByTestId('action-save')
    .or(page.getByRole('button', { name: /guardar|save/i }));
  const savePromise = expectSaveResponse(page);
  await saveBtn.click();
  await savePromise.catch(() => {});
  await page.waitForTimeout(1_000);

  let created = await page
    .waitForURL(/\/product\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (!created) {
    // Defensive fallback: not expected to run given the manual verification
    // behind this ticket (uOM / Tax Category / Category came pre-filled via
    // /product/defaults there), but some environments may lack a system-wide
    // default for one of these required selectors, blocking the save. Pick
    // the first available option for each and retry once.
    for (const key of ['uOM', 'productCategory', 'taxCategory']) {
      await reselectComboOption(page, key);
    }
    const retryPromise = expectSaveResponse(page);
    await saveBtn.click();
    await retryPromise.catch(() => {});
    created = await page
      .waitForURL(/\/product\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }

  expect(
    created,
    `Product "${searchKey}" should be created (URL should include /product/<id>). Current URL: ${page.url()}`,
  ).toBe(true);

  await waitForDetailReady(page);
  await slow(page);

  return extractRecordId(page, 'product');
}

/**
 * Create a new goods receipt, set the Contacto (business partner), and save
 * it as a draft. Warehouse (Almacén) is deliberately left untouched — the
 * ticket's manual verification showed it comes pre-filled with a
 * default-flagged locator's warehouse, and the goal is to prove that
 * whatever default the running environment resolves works end to end (not
 * to hardcode a specific warehouse name).
 *
 * Returns the created receipt's record id, so the caller can assert it was
 * actually extracted (same rationale as `createUniqueProduct()`).
 */
async function createDraftGoodsReceipt(page) {
  await navigateTo(page, 'goods-receipt');
  await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 15_000 });
  await slow(page);

  await page.getByTestId('action-new').click();
  await waitForDetailReady(page);
  await slow(page);

  await selectVendorBP(page);
  await saveDraft(page);

  let created = await page
    .waitForURL(/\/goods-receipt\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (!created) {
    // Defensive fallback — see createUniqueProduct()'s comment above for the
    // same rationale, applied here to Warehouse (the only other required
    // header field besides Business Partner; Movement Date already defaults
    // to the current date per the contract).
    await reselectComboOption(page, 'warehouse');
    await saveDraft(page);
    created = await page
      .waitForURL(/\/goods-receipt\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }

  expect(
    created,
    `Goods receipt should be saved as draft (URL should include /goods-receipt/<id>). Current URL: ${page.url()}`,
  ).toBe(true);

  await waitForDetailReady(page);
  await slow(page);

  return extractRecordId(page, 'goods-receipt');
}

/**
 * Add a goods-receipt line via the inline-add row, searching for the given
 * product by its unique search key (so the SAME product is reused across
 * both receipts created in this test, never a random one).
 *
 * Returns the Movement Quantity input's value as read immediately after the
 * product is selected (and its callout response has resolved) — the exact
 * point ETP-4671's Bug 2 regression is about — BEFORE any explicit quantity
 * is applied by the caller.
 */
async function addGoodsReceiptLine(page, { isFirst = false, searchKey, quantity } = {}) {
  if (isFirst) {
    const emptyStateBtn = page.getByTestId('action-add-lines-empty-state')
      .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());

    await expect(async () => {
      await emptyStateBtn.click({ timeout: 3_000 });
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  } else {
    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i }).first();
    await expect(async () => {
      await addLineBtn.click({ timeout: 3_000 });
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  }
  await slow(page);

  const productField = page.getByTestId('inline-add-field-product');
  const searchDrawer = page.getByTestId('product-search-drawer');

  await expect(async () => {
    await productField.click({ timeout: 3_000 });
    await expect(searchDrawer).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });
  await slow(page);

  const searchInput = page.getByTestId('product-search-input');
  await searchInput.fill(searchKey);
  await page.waitForTimeout(800); // debounce

  const option = page.locator('[data-testid^="product-search-option-"]').first();
  await expect(
    option,
    `Product search should return the receipt's product ("${searchKey}")`,
  ).toBeVisible({ timeout: 10_000 });
  // Start listening for callout (price/quantity fill) BEFORE clicking the product
  const productCalloutResponse = page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
    { timeout: 15_000 },
  );
  await option.click();
  await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
  await productCalloutResponse.catch(() => {});
  await slow(page);

  const qtyField = page.getByTestId('inline-add-field-movementQuantity');
  await expect(qtyField).toBeVisible({ timeout: 5_000 });
  const qtyValueAfterProductSelect = await qtyField.inputValue().catch(() => null);

  if (quantity != null) {
    await qtyField.clear();
    await qtyField.fill(String(quantity));
  }

  const linePromise = expectSaveResponse(page);
  await page.keyboard.press('Enter');
  await linePromise.catch(() => {});
  await slow(page);

  return { qtyValueAfterProductSelect };
}

/**
 * Assert the committed line count shown on the "Líneas" tab badge.
 *
 * Deliberately NOT `expect(page.locator('tbody tr')).toHaveCount(n)`: right
 * after saving a line via Enter, `DataTable`/`InlineLinesPanel` leave a
 * second `<tr>` in the DOM — the still-open "inline add new line" row
 * (`data-testid="inline-add-row"`, empty product cell, default-`"1"`
 * quantity textbox) — sitting alongside the just-committed row. Whether
 * that pending row has closed by the time the assertion runs is a race
 * (it flaked for 14 retries without converging in a real run), so counting
 * raw `tbody tr` elements is inherently timing-dependent here.
 *
 * The "Líneas" tab badge (`data-testid="tab-lines"`) renders
 * `hook.children.length` (see `insertLinesTab()` in `DetailView.jsx`) — the
 * actual number of committed child records returned by the backend, fully
 * decoupled from whether the pending add-row UI happens to still be open.
 * `expect(...).toContainText()` auto-retries until the count text settles,
 * so this converges deterministically instead of racing a transient DOM
 * state.
 *
 * The label and count render as adjacent text nodes with NO separating
 * whitespace (`TabStripButton` in `DetailView.jsx`), so the button's text is
 * a direct concatenation like "Líneas1" / "Lines1" — there is no `\b` word
 * boundary between the label's trailing letter and the count digit(s)
 * (both are `\w`). Anchor the regex on the known label prefix instead, with
 * the boundary only required AFTER the count.
 */
async function expectLineCount(page, count) {
  const linesTab = page.getByTestId('tab-lines');
  await expect(linesTab, '"Líneas" tab should be visible').toBeVisible({ timeout: 10_000 });
  await expect(
    linesTab,
    `"Líneas" tab badge should show ${count} committed line(s)`,
  ).toContainText(new RegExp(`(Líneas|Lines)${count}\\b`), { timeout: 10_000 });
}

/**
 * Click the topbar "Confirmar" button (action-save, draft mode), interact
 * with the shared ConfirmInOutModal (`ConfirmGoodsReceiptModal` wraps it for
 * this window), and verify the receipt reaches Completed (CO) status with
 * no error surfacing anywhere.
 *
 * ConfirmInOutModal renders backend errors as inline red text inside the
 * modal body (not a Sonner toast) — e.g. Bug 1's "New object Locator ... not
 * present in the import set" failure. This asserts BOTH that no such inline
 * error keeps the modal open AND that no global error toast fired (covers
 * the optional invoice-creation call, which uses the same error path but
 * could in principle also be wired to a toast elsewhere).
 */
async function confirmGoodsReceipt(page, { createInvoice = false } = {}) {
  const confirmTopbarBtn = page.getByTestId('action-save');
  const modal = page.getByTestId('confirm-inout-modal');

  await expect(async () => {
    await confirmTopbarBtn.click({ timeout: 3_000 });
    await expect(modal).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });
  await slow(page);

  const invoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
  const toggleIsOn = (await invoiceToggle.getAttribute('aria-checked').catch(() => null)) === 'true';
  if (toggleIsOn !== createInvoice) {
    await invoiceToggle.click();
    await slow(page);
  }

  const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');
  await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

  const confirmResponse = page.waitForResponse(
    (r) => r.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
      r.ok(),
    { timeout: 30_000 },
  );
  await confirmBtn.click();
  await confirmResponse;

  const stillOpen = await modal.isVisible({ timeout: 1_000 }).catch(() => false);
  if (stillOpen) {
    const modalText = await modal.innerText().catch(() => '<could not read>');
    expect(
      stillOpen,
      `[Bug 1 regression] Confirm modal stayed open with an inline error instead of ` +
      `completing the receipt — likely the missing default locator for a zero-stock ` +
      `product. Modal text: "${modalText}"`,
    ).toBe(false);
  }

  await expect(
    page.locator('[data-type="error"]'),
    'No error toast should appear after confirming the receipt',
  ).toHaveCount(0);

  await expect(modal, 'Confirm modal should close after a successful confirmation').toBeHidden({ timeout: 15_000 });

  const resultTitle = page.getByText(/albarán de compra confirmado|goods receipt confirmed/i);
  await expect(
    resultTitle,
    'Success result modal should confirm the receipt was registered',
  ).toBeVisible({ timeout: 15_000 });

  // Deliberately NOT clicking the result modal's own "Cerrar"/"Close" button:
  // `ConfirmResultModal.jsx` (tools/app-shell/src/components/contract-ui/) has
  // no data-testid or unambiguous accessible name of its own — its close
  // button's accessible name ("Cerrar"/"Close") collides with the unrelated
  // Copilot assistant panel's own close button ("Cerrar Copilot"), which is
  // also present on this page and can be matched first by a bare
  // `getByRole('button', { name: /cerrar|close/i })`.
  //
  // We also don't need the app's own reload-on-close behavior: the topbar's
  // `data-doc-status` reflects whatever `DetailView` last fetched, and the
  // successful `documentAction=CO` call already happened — the local `data`
  // state just hasn't been refetched yet. Reloading the page ourselves gets
  // the same fresh, persisted state without depending on an ambiguous UI
  // control at all.
  // Use goto on current URL instead of reload to avoid ERR_ABORTED
  const currentUrl = page.url();
  await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await slow(page);

  const detailView = page.getByTestId('detail-view');
  await expect(detailView, 'Detail view should be visible after reload').toBeVisible({ timeout: 20_000 });
  await expect(
    detailView,
    'Receipt should be Completed (CO) after confirmation',
  ).toHaveAttribute('data-doc-status', 'CO', { timeout: 15_000 });
}

test.describe('Goods Receipt — Stock defaults (ETP-4671, integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_GOODS_RECEIPT_INTEGRATION=1 to run this live goods-receipt stock-defaults integration test.',
  );

  test('receipt confirms with zero prior stock, then defaults quantity to 1 on the next receipt', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    const suffix = uniqueSuffix();
    const searchKey = `E2E-GR-${suffix}`;
    const productName = `E2E GR Product ${suffix}`;

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page, 'Login should redirect to /dashboard').toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    let productId;
    await test.step('Create a brand-new product (zero stock by construction)', async () => {
      productId = await createUniqueProduct(page, { searchKey, name: productName });
      expect(productId, `Product id extracted from the URL should be a real, non-empty id (got ${JSON.stringify(productId)}, current URL: ${page.url()})`).toBeTruthy();
    });

    await test.step('First goods receipt — confirms with zero prior stock (Bug 1)', async () => {
      const firstReceiptId = await createDraftGoodsReceipt(page);
      expect(firstReceiptId, `First receipt id extracted from the URL should be a real, non-empty id (got ${JSON.stringify(firstReceiptId)}, current URL: ${page.url()})`).toBeTruthy();

      await addGoodsReceiptLine(page, { isFirst: true, searchKey, quantity: 10 });

      await expectLineCount(page, 1);

      await confirmGoodsReceipt(page, { createInvoice: false });
    });

    let qtyValueAfterProductSelect;
    await test.step('Second goods receipt — verify quantity defaults to 1 (Bug 2)', async () => {
      const secondReceiptId = await createDraftGoodsReceipt(page);
      expect(secondReceiptId, `Second receipt id extracted from the URL should be a real, non-empty id (got ${JSON.stringify(secondReceiptId)}, current URL: ${page.url()})`).toBeTruthy();

      const result = await addGoodsReceiptLine(page, {
        isFirst: true,
        searchKey,
        quantity: null, // do NOT touch it — this is the core regression assertion
      });
      qtyValueAfterProductSelect = result.qtyValueAfterProductSelect;

      expect(
        qtyValueAfterProductSelect === '1' || qtyValueAfterProductSelect === '' || qtyValueAfterProductSelect === null,
        `[Bug 2 regression] Movement Quantity should default to 1 (or render empty), ` +
        `not the product's on-hand stock. Got: "${qtyValueAfterProductSelect}"`,
      ).toBe(true);
      expect(
        qtyValueAfterProductSelect,
        '[Bug 2 regression] Movement Quantity must NOT be pre-filled with the stock value (10)',
      ).not.toBe('10');
      expect(
        qtyValueAfterProductSelect,
        '[Bug 2 regression] Movement Quantity must NOT be pre-filled with 0',
      ).not.toBe('0');
    });

    await test.step('Sanity-confirm the second receipt (quantity 1 is valid)', async () => {
      await expectLineCount(page, 1);

      await confirmGoodsReceipt(page, { createInvoice: false });
    });
  });
});
