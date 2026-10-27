// @covers tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx
// @covers artifacts/goods-shipment/custom/ReturnWizard.jsx
// @covers artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

/**
 * Goods Shipment — Create Return wizard (mocked).
 *
 * The wizard is a single step: pick lines and quantities, then "Crear Devolución" posts
 * createReturn directly (no confirmation step, no prices). On success the sales return is
 * announced in ConfirmResultModal (type devolucionVenta, draft badge, "Ver devolución" opens
 * /return-material-receipt/<id>) instead of navigating away. The over-return refusal
 * (com.etendoerp.go ReturnableQuantity: 422, error.code returnQuantityExceedsAvailable) closes the
 * wizard and shows the translated backend message.
 *
 * No backend required — all API calls are intercepted after login() (LIFO order).
 * Copy is read from the locale JSON through t(), never hardcoded.
 *
 * Route isolation: "goodsShipmentLine" URLs must NOT be captured by the
 * "goodsShipment" handler. We use URL predicate functions.
 */

function makeShipment(overrides) {
  return {
    id: 'mock-gs-001',
    documentNo: 'GS-TEST-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    processed: true,
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Client',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    invoiceStatus: 0,
    completelyInvoiced: false,
    invoiced: false,
    returnReceipts: [],
    linkedOrders: [],
    ...overrides,
  };
}

/**
 * Install the base goods-shipment mock.
 * Must be called AFTER login() so it takes priority (LIFO) over the generic catch-all.
 *
 * Additional route overrides (e.g. lines with real data, createReturn) must be
 * registered AFTER this function so they win over it (LIFO: last registered = first checked).
 */
async function installGoodsShipmentMock(page, records) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Default: empty.
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-shipment/goodsShipmentLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    }
  );

  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  await page.route(
    (url) =>
      url.href.includes('/sws/neo/goods-shipment/goodsShipment') &&
      !url.href.includes('/goodsShipmentLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
        return;
      }

      const detailMatch = url.match(/\/goodsShipment\/([^/?]+)(\?.*)?$/);
      if (
        detailMatch &&
        !['evaluate-display', 'defaults', 'selectors', 'action'].includes(detailMatch[1])
      ) {
        const id = detailMatch[1];
        const found = records.find((r) => r.id === id) ?? records[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Return Wizard spec
// ---------------------------------------------------------------------------

const SHIPMENT_ID = 'gs-return-001';

const RETURNABLE_LINES = [
  { id: 'line-001', 'product$_identifier': 'Producto A', movementQuantity: 5, product: 'prod-001' },
  { id: 'line-002', 'product$_identifier': 'Producto B', movementQuantity: 3, product: 'prod-002' },
];

/**
 * Logs in, installs the shipment + returnable-lines mocks and a createReturn mock answering
 * `createReturn` ({ status, body }). Returns the list the posted createReturn bodies land in.
 */
async function openShipmentWithReturnMock(page, createReturn) {
  const posted = [];
  await login(page);
  await installGoodsShipmentMock(page, [
    makeShipment({ id: SHIPMENT_ID, documentNo: 'GS-RETURN-001', canCreateReturn: true }),
  ]);

  await page.route(
    (url) => url.href.includes('/sws/neo/return-material-receipt/returnMaterialReceipt/_/action/availableShipmentLines'),
    async (route) => {
      if (route.request().method() !== 'POST') { route.fallback(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: RETURNABLE_LINES, totalRows: RETURNABLE_LINES.length } }),
      });
    }
  );

  await page.route(
    (url) => url.href.includes(`/goodsShipment/${SHIPMENT_ID}/action/createReturn`),
    async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({
        status: createReturn.status,
        contentType: 'application/json',
        body: JSON.stringify(createReturn.body),
      });
    }
  );

  await page.goto(`/goods-shipment/${SHIPMENT_ID}`);
  await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });
  return posted;
}

async function openWizard(page) {
  await page.getByRole('button', { name: t('createReturn') }).click();
  const wizard = page.getByRole('dialog', { name: t('createReturnFromShipment') });
  await expect(wizard).toBeVisible({ timeout: 8_000 });
  await expect(wizard.getByText('Producto A')).toBeVisible({ timeout: 10_000 });
  await expect(wizard.getByText('Producto B')).toBeVisible();
  return wizard;
}

test.describe('Goods Shipment — Create Return wizard (one step)', () => {
  test('creates the return in one step and announces the draft return in the result modal', async ({ page }) => {
    const posted = await openShipmentWithReturnMock(page, {
      status: 200,
      body: { response: { data: { id: 'ret-001', documentNo: 'RET-0001' } } },
    });
    const wizard = await openWizard(page);

    // One step: no wizard navigation left.
    await expect(wizard.getByRole('button', { name: t('next') })).toHaveCount(0);
    await expect(wizard.getByRole('button', { name: t('back') })).toHaveCount(0);

    const qtyA = wizard.getByTestId('CreateReturnWizard__qtyInput').first();
    await qtyA.fill('2');
    await qtyA.press('Tab');

    await wizard.getByRole('button', { name: t('createReturn') }).click();

    await expect(wizard).toBeHidden({ timeout: 8_000 });
    expect(posted).toHaveLength(1);
    expect(posted[0].lines).toEqual([
      { lineId: 'line-001', returnQuantity: 2 },
      { lineId: 'line-002', returnQuantity: 3 },
    ]);

    const result = page.getByTestId('confirm-result-dialog');
    await expect(result).toBeVisible({ timeout: 8_000 });
    await expect(result.getByTestId('confirm-result-title')).toHaveText(t('confirmResultModal.title.devolucionVenta'));
    const card = result.getByTestId('confirm-result-card-0');
    await expect(card).toHaveAttribute('data-doc-type', 'devolucionVenta');
    await expect(card).toHaveAttribute('data-doc-status', 'DR');
    await expect(card).toContainText(t('confirmResultModal.status.draft'));
    await expect(card).toContainText(t('confirmResultModal.docNumber', { number: 'RET-0001' }));
    // Still on the shipment: the return is announced, not opened automatically.
    await expect(page).toHaveURL(new RegExp(`/goods-shipment/${SHIPMENT_ID}`));

    await result.getByTestId('action-confirm-result-view').click();
    await expect(page).toHaveURL(/\/return-material-receipt\/ret-001/, { timeout: 8_000 });
  });

  test('a 422 over-return refusal closes the wizard and shows the translated message', async ({ page }) => {
    const messageParams = { requested: '5', product: 'Producto A', available: '2', total: '5' };
    await openShipmentWithReturnMock(page, {
      status: 422,
      body: {
        error: {
          status: 422,
          code: 'returnQuantityExceedsAvailable',
          message: 'Cannot return 5 of Producto A: only 2 can still be returned from this line (5 on the source document).',
        },
      },
    });
    const wizard = await openWizard(page);

    await wizard.getByRole('button', { name: t('createReturn') }).click();

    await expect(page.getByText(t('backendError.returnQuantityExceeds', messageParams))).toBeVisible({ timeout: 8_000 });
    await expect(wizard).toBeHidden();
    await expect(page.getByTestId('confirm-result-modal')).toHaveCount(0);
  });
});
