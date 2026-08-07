import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Posting badge / accounting-status pill — smoke (mocked).
 *
 * ETP-4707: return-to-vendor-shipment and return-material-receipt were moved
 * from a discarded `posted` field to the generic decisions.json-driven
 * pattern already used by purchase-invoice/sales-invoice:
 *   - `window.menuActions` gets a localized "post" kebab item (labelKey
 *     "post" → "Contabilizar" in es_ES, never the raw English "Post").
 *   - the `posted` header field gets `badge: true` + `badgeLabels` so the
 *     list column renders "Contabilizado" / "Sin contabilizar" instead of a
 *     boolean.
 *   - `window.statusPills` renders a DocumentStatusPill in the detail header
 *     for the same field.
 *
 * This is the 3rd window using the pattern but the first with E2E coverage —
 * only return-material-receipt is exercised here (representative pick: both
 * windows share the identical generic wiring — same decisions.json shape,
 * same generator output, same shared components — so a second parametrized
 * copy would duplicate assertions without covering new code paths; see
 * DataTable.cellRenderers.vitest.jsx for the renderer-level unit coverage
 * that IS shared code and is tested directly instead).
 *
 * Mock mode only: installs spec-specific routes on top of the generic
 * /sws/** mock that login() seeds. `login()` also seeds
 * `capabilities: new Proxy({}, { get: () => true })`, so the
 * `visibleWhenCapability: "showAccountingFields"` gate on both the column
 * and the status pill (see docs/e2e-testing-guide.md's capability notes and
 * `@/lib/capabilityVisibility.js`) resolves to visible without extra mocking.
 */

const SPEC = 'return-material-receipt';
const ENTITY = 'returnMaterialReceipt';

const BASE_ROW = {
  documentNo: 'RMR-001',
  movementDate: '2026-01-10',
  'businessPartner$_identifier': 'Test BP',
  'warehouse$_identifier': 'Main Warehouse',
  'partnerAddress$_identifier': 'Test BP Address',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  processed: 'Y',
  invoiceStatus: 0,
  sourceShipmentDocNo: 'SHP-1',
};

// Realistic Etendo values: 'Y'/'N' strings, not booleans.
const ROW_POSTED = { ...BASE_ROW, id: 'rmr-001', documentNo: 'RMR-001', posted: 'Y' };
const ROW_NOT_POSTED = { ...BASE_ROW, id: 'rmr-002', documentNo: 'RMR-002', posted: 'N' };
const ROWS = [ROW_POSTED, ROW_NOT_POSTED];

/**
 * Install list + detail GET mocks for the spec.
 * Must run AFTER login() so it takes precedence over the generic /sws/** stub
 * (Playwright matches routes in reverse registration order).
 */
async function installMocks(page, { rows = ROWS } = {}) {
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, async (route) => {
    const req = route.request();
    const url = req.url();

    // List GET: `/returnMaterialReceipt` (no id segment)
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY}/[^/?]+`).test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }

    // Detail GET: `/returnMaterialReceipt/<id>`
    if (req.method() === 'GET') {
      const m = url.match(new RegExp(`/${ENTITY}/([^/?]+)`));
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

test.describe(`Posting badge/status pill — ${SPEC}`, () => {
  test.describe('list view — posted badge column', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installMocks(page);
      await page.goto(`/${SPEC}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('renders "Contabilizado" for a posted row and "Sin contabilizar" for an unposted row', async ({ page }) => {
      const postedRow = page.getByTestId(`row-${ROW_POSTED.id}`);
      const notPostedRow = page.getByTestId(`row-${ROW_NOT_POSTED.id}`);

      await expect(postedRow).toBeVisible();
      await expect(notPostedRow).toBeVisible();

      await expect(postedRow).toContainText('Contabilizado');
      // Guard against the negative case matching too: "Contabilizado" is a
      // substring of "Sin contabilizar"? No — assert the exact opposite text
      // instead of just absence, so a regression that always renders
      // "Contabilizado" cannot pass silently.
      await expect(notPostedRow).toContainText('Sin contabilizar');
      await expect(notPostedRow).not.toContainText('Contabilizado');
    });
  });

  test.describe('detail view — kebab Post action label', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installMocks(page);
      await page.goto(`/${SPEC}/${ROW_NOT_POSTED.id}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('kebab menu exposes the Post action localized as "Contabilizar", not "Post"', async ({ page }) => {
      const detail = page.getByTestId('detail-view');
      await expect(detail).toBeVisible();

      const moreTrigger = page.getByTestId('action-more');
      await expect(moreTrigger).toBeVisible();
      await moreTrigger.click();

      const postItem = page.getByTestId('menu-action-post');
      await expect(postItem).toBeVisible();
      await expect(postItem).toHaveText('Contabilizar');
    });
  });

  test.describe('detail view — accounting status pill', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installMocks(page);
      await page.goto(`/${SPEC}/${ROW_POSTED.id}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('shows the accounting-status pill with "Contabilizado" for a posted document', async ({ page }) => {
      const detail = page.getByTestId('detail-view');
      await expect(detail).toBeVisible();

      // DocumentStatusPill hardcodes data-testid="document-status-pill" on
      // every instance (see DocumentStatusPill.jsx — it doesn't forward a
      // `data-testid` prop), and this header renders TWO of them: the main
      // `documentStatus` pill (data-status="CO"/"DR"/...) and the accounting
      // `posted` pill from window.statusPills (data-status="Y"/"N"). AD
      // document-status codes are never "Y"/"N", so filtering on
      // data-status="Y" unambiguously targets the accounting pill.
      const pill = page.locator('[data-testid="document-status-pill"][data-status="Y"]');
      await expect(pill).toBeVisible();
      await expect(pill).toContainText('Contabilizado');
    });
  });
});
