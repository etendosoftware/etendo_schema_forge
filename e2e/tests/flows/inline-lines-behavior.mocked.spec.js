import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Inline-editable lines — behavior coverage (mocked).
 *
 * This spec complements inline-lines-quotation.mocked.spec.js with deeper
 * behavior tests: autosave PATCH content, read-only docs, keyboard handling,
 * selection bar, live totals, and the imperative flushPendingEdits ref.
 *
 * Routing note: login() installs a `**\/sws/**` catch-all, so installMocks()
 * must run AFTER login() for specific routes to win.
 */

const QUOT_ID = 'mock-quot-behavior-001';
const COMPLETED_ID = 'mock-quot-completed-002';

const LINE_A = {
  id: 'line-a-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product A',
  description: '',
  orderedQuantity: 2,
  listPrice: 50,
  discount: 0,
  lineGrossAmount: 100,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};
const LINE_B = {
  id: 'line-b-002',
  lineNo: 20,
  product: 'prod-2',
  'product$_identifier': 'Test Product B',
  description: '',
  orderedQuantity: 1,
  listPrice: 200,
  discount: 0,
  lineGrossAmount: 200,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};

const DRAFT_HEADER = {
  id: QUOT_ID,
  documentNo: 'CQ-MOCK-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 300,
  summedLineAmount: 300,
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
};

const COMPLETED_HEADER = {
  ...DRAFT_HEADER,
  id: COMPLETED_ID,
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  // isDocumentReadOnly = lockWhenProcessed && isProcessed (see DetailView.jsx:386),
  // and isProcessed checks the `processed` flag. documentStatus alone is NOT enough.
  processed: true,
};

/**
 * Install mocks for sales-quotation. Hooks allow tests to introspect requests.
 *
 * @param {object} opts
 * @param {object} opts.header             - the quotation header doc
 * @param {Array}  opts.lines              - line rows to return
 * @param {function} opts.onPatch          - called with { url, body } on every PATCH /quotationLine
 * @param {function} opts.onDelete         - called with the lineId on every DELETE /quotationLine
 * @param {function} opts.onHeaderRequest  - called with { method, body } on every header write
 * @param {number} opts.patchStatus        - HTTP status to return for PATCH (default 200)
 */
async function installMocks(page, {
  header = DRAFT_HEADER,
  lines = [LINE_A, LINE_B],
  onPatch = null,
  onDelete = null,
  onHeaderRequest = null,
  patchStatus = 200,
} = {}) {
  await page.route(`**/sws/neo/sales-quotation/quotation/${header.id}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [header] } }),
      });
      return;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
      onHeaderRequest?.({ method, body, url: route.request().url() });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...header, ...body }] } }),
      });
      return;
    }
    return route.continue();
  });

  await page.route(`**/sws/neo/sales-quotation/header/${header.id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [header] } }),
    });
  });

  await page.route('**/sws/neo/sales-quotation/quotationLine**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
    });
  });

  // Consolidated PATCH + DELETE handler. Multiple `page.route()` with the same
  // pattern don't chain — `route.continue()` sends the request to the real backend
  // (the dev server), not to the next handler. So we branch by method inside one.
  await page.route('**/sws/neo/sales-quotation/quotationLine/**', async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'PATCH') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      onPatch?.({ url: req.url(), body });
      if (patchStatus !== 200) {
        await route.fulfill({
          status: patchStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Mocked server error' } }),
        });
        return;
      }
      const lineId = req.url().split('/').pop();
      const original = lines.find(l => l.id === lineId) ?? lines[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...original, ...body }] } }),
      });
      return;
    }
    if (method === 'DELETE') {
      const id = req.url().split('/').pop();
      onDelete?.(id);
      await route.fulfill({ status: 204 });
      return;
    }
    return route.continue();
  });
}

// ---------------------------------------------------------------------------
// Tanda 1 — autosave, read-only, keyboard, rollback, flush
// ---------------------------------------------------------------------------

test.describe('Tanda 1 — core behaviors', () => {
  test('autosave: editing orderedQuantity fires PATCH with the new value', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await expect(qtyField).toBeVisible({ timeout: 3_000 });
    await qtyField.fill('5');
    await qtyField.blur();

    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    const lastPatch = patches.at(-1);
    expect(lastPatch.url).toContain(`/quotationLine/${LINE_A.id}`);
    expect(Number(lastPatch.body.orderedQuantity)).toBe(5);
  });

  test('read-only doc: documentStatus=CO hides pencil and trash icons', async ({ page }) => {
    await login(page);
    await installMocks(page, { header: COMPLETED_HEADER });
    await page.goto(`/sales-quotation/${COMPLETED_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');

    // showActions=(isHovered||isEditing)&&!isDocumentReadOnly — on a locked doc
    // the action slot must contain 0 action buttons (the reserveActionSlot div may
    // still render, but no pencil/trash inside).
    await page.waitForTimeout(300);
    await expect(rowA.locator('[data-testid="line-actions"] button')).toHaveCount(0);
  });

  test('keyboard Enter: commits the edit and fires PATCH', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await expect(qtyField).toBeVisible({ timeout: 3_000 });
    await qtyField.fill('7');
    await qtyField.press('Enter');

    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    expect(String(patches.at(-1).body.orderedQuantity)).toBe('7');
  });

  test('keyboard Escape: cancels the edit without firing PATCH', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await expect(qtyField).toBeVisible({ timeout: 3_000 });
    await qtyField.fill('99');
    await qtyField.press('Escape');

    // Edit mode must exit and no PATCH fired
    await expect(rowA.locator('[data-testid^="field-"]')).toHaveCount(0, { timeout: 3_000 });
    await page.waitForTimeout(500);
    expect(patches.length).toBe(0);
  });

  test('error path: 500 PATCH surfaces an error toast', async ({ page }) => {
    await login(page);
    await installMocks(page, { patchStatus: 500 });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await expect(qtyField).toBeVisible({ timeout: 3_000 });
    await qtyField.fill('42');
    await qtyField.blur();

    // Toast appears (sonner renders into a region with role="status" or a section)
    const toast = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: /error|fail|red|sav/i }).first();
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('flush pending edits: clicking global Guardar PATCHes the in-flight cell', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await expect(qtyField).toBeVisible({ timeout: 3_000 });
    await qtyField.fill('11');
    // DO NOT blur — leave the edit pending

    const guardarBtn = page.getByRole('button', { name: /Guardar|Save/i }).first();
    await guardarBtn.click({ force: true });

    // The pending edit must be flushed via document.activeElement.blur() → onCommit
    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    expect(String(patches.at(-1).body.orderedQuantity)).toBe('11');
  });
});

// ---------------------------------------------------------------------------
// Tanda 2 — selection bar, live totals
// ---------------------------------------------------------------------------

test.describe('Tanda 2 — selection and totals', () => {
  // Bulk delete (LinesSelectionBar) intentionally not E2E'd here. Its portal is
  // anchored to AddLineButton's viewport rect, which sits below the screenshot
  // fold under Playwright headless layout — the bar materialises in the DOM but
  // can't be deterministically asserted. Coverage lives in:
  //   - LinesSelectionBar.test.js                   (portal, animations, props)
  //   - InlineLinesPanel.test.js                    (onSelectionChange emit)
  //   - inline-lines-quotation.mocked.spec.js       (single-row trash → DELETE,
  //                                                  same handler as bulk delete)

  test('live totals: committing a new quantity updates the right-panel subtotal', async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    // Initial: LINE_A (2 * 50 = 100) + LINE_B (1 * 200 = 200) = 300
    const totalsPanel = page.locator('text=Subtotal').first().locator('xpath=ancestor::div[1]');
    await expect(totalsPanel).toContainText('300', { timeout: 5_000 });

    // Edit row A quantity from 2 → 4 → new gross = 4 * 50 = 200, total = 400
    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const qtyField = rowA.locator('[data-testid="field-orderedQuantity"]');
    await qtyField.fill('4');
    await qtyField.blur();

    // After commit the totals panel reflects the new subtotal (200 from A + 200 from B = 400)
    await expect(page.locator('body')).toContainText('400', { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Tanda 3 — selector/lookup/enum cell renderers
// ---------------------------------------------------------------------------

test.describe('Tanda 3 — cell renderers', () => {
  test('selector cell: clicking commits via the dropdown picker', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });

    // Mock the tax selector endpoint with two items so we can pick a different one
    await page.route('**/selectors/C_Tax_ID**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: 'tax-1', name: 'IVA 21%', _identifier: 'IVA 21%' },
            { id: 'tax-2', name: 'IVA 10%', _identifier: 'IVA 10%' },
          ],
          totalRows: 2,
        }),
      });
    });

    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const rowA = page.locator(`[data-testid="line-row-${LINE_A.id}"]`);
    await rowA.dispatchEvent('mouseover');
    await rowA.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    // Open the tax cell selector. The wrapper div carries data-testid="field-tax",
    // and the inner SelectorInput renders a button with the same testid — use .first()
    // to get the wrapper, then locate the actual trigger button inside it.
    const taxFieldWrapper = rowA.locator('[data-testid="field-tax"]').first();
    await expect(taxFieldWrapper).toBeVisible({ timeout: 3_000 });
    const taxTrigger = taxFieldWrapper.locator('button[role="combobox"]');
    await taxTrigger.click({ force: true });

    // Pick the alternative item from the dropdown (rendered in a Radix portal)
    await page.getByText('IVA 10%').first().click({ force: true });

    await expect.poll(() => patches.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const taxPatch = patches.find(p => p.body.tax === 'tax-2');
    expect(taxPatch).toBeDefined();
  });

  test.fixme('lookup cell: clicking opens ProductSearchDrawer and selecting commits id+identifier+selectedItem', async ({ page }) => {
    // The drawer needs additional mocking (product search endpoint + drawer's
    // internal lookup endpoint). Covered by unit tests; skipping until the
    // drawer's network surface is documented in tests/helpers.
  });

  test.fixme('enum/select cell: renders native <select> for enum columns and commits on change', async ({ page }) => {
    // Sales-quotation has no enum/select columns in its lines entity. The
    // <select> rendering path is covered by InlineLinesPanel unit tests
    // (assertion: col.type === 'enum' || col.type === 'select' + <select>).
  });
});
