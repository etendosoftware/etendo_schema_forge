import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Notes save on blur — mocked spec.
 *
 * Validates the ETP-4008 feature: the Notes textarea auto-saves via PATCH when
 * the user clicks away (onBlur), equivalent to the "Descuento total" pattern.
 *
 * Four scenarios per window:
 *   1. Happy path — blur triggers toast "Note saved" / "Nota guardada"
 *   2. PATCH request — correct endpoint + body
 *   3. Completed document — notes save still works even when normal Save is hidden
 *   4. Blur on new record — NO PATCH emitted (isNew guard)
 *
 * Mock mode only: installs specific routes AFTER login() so they win over the
 * catch-all /sws/** stub that login() seeds (Playwright LIFO route order).
 */

// ── Synthetic records ────────────────────────────────────────────────────────

const RECORD_ID  = 'mock-notes-hdr-001';
const NEW_RECORD_ID = 'new'; // "new" in route → isNew = true

const DRAFT_HEADER = {
  id: RECORD_ID,
  documentNo: 'NOTES-MOCK-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  description: '',
  'businessPartner$_identifier': 'Test BP',
  grandTotalAmount: 100,
};

const COMPLETED_HEADER = {
  ...DRAFT_HEADER,
  id: 'mock-notes-hdr-co-002',
  documentNo: 'NOTES-MOCK-CO-002',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  processed: true,
};

// ── Mock installer ───────────────────────────────────────────────────────────

/**
 * Install mocks for a given spec (e.g. "sales-order").
 * Must be called AFTER login().
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} spec        - window slug, e.g. "sales-order"
 * @param {object} [opts]
 * @param {Function} [opts.onPatch]        - called with {url, body} on PATCH
 * @param {number}   [opts.patchStatus]    - HTTP status for PATCH response (default 200)
 * @param {object}   [opts.header]         - header doc to return for detail GET
 */
async function installMocks(page, spec, { onPatch = null, patchStatus = 200, header = DRAFT_HEADER } = {}) {
  // List endpoint — returns the two synthetic docs
  await page.route(`**/sws/neo/${spec}/header`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: {
          data: [DRAFT_HEADER, COMPLETED_HEADER],
          totalRows: 2,
        },
      }),
    });
  });

  // Detail GET — returns the requested header by id
  await page.route(`**/sws/neo/${spec}/header/**`, async (route) => {
    const req  = route.request();
    const url  = req.url();
    const method = req.method();

    if (method === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const id = m?.[1];
      let doc = [DRAFT_HEADER, COMPLETED_HEADER].find(d => d.id === id) ?? DRAFT_HEADER;
      // Override with caller-supplied header when ids match
      if (header.id === id) doc = header;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [doc] } }),
      });
      return;
    }

    if (method === 'PATCH') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      onPatch?.({ url, body });
      if (patchStatus !== 200) {
        await route.fulfill({
          status: patchStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Mocked server error' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...DRAFT_HEADER, ...body }] } }),
      });
      return;
    }

    route.fallback();
  });
}

/**
 * Navigate to the detail view of a record and wait for the notes textarea
 * container to appear.
 */
async function openDetail(page, spec, id = RECORD_ID) {
  await page.goto(`/${spec}/${id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/**
 * Activate the notes textarea by clicking the unfocused notes div, then wait
 * for the actual <textarea> to appear inside the notes-textarea container.
 */
async function focusNotesTextarea(page) {
  const container = page.getByTestId('notes-textarea');
  await expect(container).toBeVisible({ timeout: 8_000 });

  // The container renders a role=textbox div when unfocused; clicking it
  // sets notesFocused=true which swaps in the real <textarea>.
  const unfocused = container.locator('[role="textbox"]');
  if (await unfocused.count() > 0) {
    await unfocused.click();
  } else {
    await container.click();
  }

  // Wait for the actual <textarea> to appear
  const ta = container.locator('textarea');
  await expect(ta).toBeVisible({ timeout: 5_000 });
  return ta;
}

// ── Test suites (parametrized) ───────────────────────────────────────────────

const SPECS = ['sales-order', 'purchase-order'];

for (const spec of SPECS) {
  test.describe(`Notes save on blur — ${spec}`, () => {

    // ── Happy path ───────────────────────────────────────────────────────────

    test('blur triggers toast with "Note saved" / "Nota guardada"', async ({ page }) => {
      await login(page);
      await installMocks(page, spec);
      await openDetail(page, spec, RECORD_ID);

      const ta = await focusNotesTextarea(page);

      await ta.fill('Test note content');

      // Blur by clicking outside the notes container
      await page.getByTestId('detail-view').click({ position: { x: 10, y: 10 }, force: true });

      // Toast should appear with the i18n key result
      await expect(
        page.getByText(/nota guardada|note saved/i)
      ).toBeVisible({ timeout: 8_000 });
    });

    // ── PATCH request verification ────────────────────────────────────────────

    test('blur emits PATCH to correct endpoint with description field in body', async ({ page }) => {
      let capturedPatch = null;
      await login(page);
      await installMocks(page, spec, {
        onPatch: ({ url, body }) => { capturedPatch = { url, body }; },
      });
      await openDetail(page, spec, RECORD_ID);

      const ta = await focusNotesTextarea(page);
      await ta.fill('My important note');

      // Set up the request interceptor before triggering blur
      const patchPromise = page.waitForRequest(
        (req) =>
          req.method() === 'PATCH' &&
          req.url().includes(`/${spec}/header/${RECORD_ID}`),
        { timeout: 8_000 }
      );

      // Blur
      await page.getByTestId('detail-view').click({ position: { x: 10, y: 10 }, force: true });

      const patchReq = await patchPromise;
      const body = JSON.parse(patchReq.postData() || '{}');

      // The notes field for all parametrized windows is "description"
      expect(body).toHaveProperty('description', 'My important note');
      expect(patchReq.url()).toMatch(new RegExp(`/sws/neo/${spec}/header/${RECORD_ID}`));
    });

    // ── Completed document ───────────────────────────────────────────────────

    test('notes save works on a completed (CO) document', async ({ page }) => {
      await login(page);
      await installMocks(page, spec, { header: COMPLETED_HEADER });
      await openDetail(page, spec, COMPLETED_HEADER.id);

      const ta = await focusNotesTextarea(page);
      await ta.fill('Note on completed doc');

      const patchPromise = page.waitForRequest(
        (req) =>
          req.method() === 'PATCH' &&
          req.url().includes(`/${spec}/header/${COMPLETED_HEADER.id}`),
        { timeout: 8_000 }
      );

      await page.getByTestId('detail-view').click({ position: { x: 10, y: 10 }, force: true });

      const patchReq = await patchPromise;
      const body = JSON.parse(patchReq.postData() || '{}');
      expect(body).toHaveProperty('description');
    });

    // ── Blur on new record — NO PATCH ────────────────────────────────────────

    test('blur on new record does NOT emit a PATCH', async ({ page }) => {
      await login(page);
      await installMocks(page, spec);

      // Navigate to the new-record form (no existing id)
      await page.goto(`/${spec}/new`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      // Collect any PATCH requests that fire during the test
      const patchRequests = [];
      page.on('request', (req) => {
        if (
          req.method() === 'PATCH' &&
          req.url().includes(`/${spec}/header/`)
        ) {
          patchRequests.push(req.url());
        }
      });

      const ta = await focusNotesTextarea(page);
      await ta.fill('Text in new record');

      // Blur
      await page.locator('body').click({ position: { x: 5, y: 5 }, force: true });

      // Wait a moment for any async requests to fire
      await page.waitForTimeout(1_500);

      expect(patchRequests).toHaveLength(0);
    });

  });
}
