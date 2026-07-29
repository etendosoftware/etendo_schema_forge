import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * DetailView line callout chain — golden master (mocked).
 *
 * ETP-4708 T14-T17 replaces four hardcoded `field === 'product'` checks in
 * DetailView.jsx with a declarative `priceTriggerField`. Those checks gate the
 * whole product-triggered chain that runs when a line's product is selected:
 *
 *   applyProductCalloutPriceAdjustments  list price backfill + discount zeroing
 *   forceCalloutFields                   product adds the discount field to the
 *                                        force set, on top of the declared ones
 *   calculateNetUnitPrice                net unit price from gross + tax rate
 *   calculateLineNetAmount               qty x price fallback when the callout
 *                                        omits lineNetAmount
 *   resolveTaxIdentifier                 tax label borrowed from a sibling line
 *   applyProductCurrencyConversion       header-currency conversion of the price
 *
 * This spec locks in what the user ends up with today, so the refactor is
 * provably behaviour-preserving. It deliberately asserts the values that reach
 * the line-create POST body — that is what the backend persists, and it captures
 * chain steps (net unit price, tax identifier, currency) that never surface as
 * their own input in the add row.
 *
 * Existing coverage this does NOT duplicate: DetailView.lineCalloutFlow.vitest.jsx
 * drives the same handler at unit level with mocked helpers, and
 * DetailView.currencyConversionBehavior.vitest.jsx pins the conversion guard.
 * Neither runs the real drawer, the real pipeline-generated field metadata, or
 * the real request the server would receive. Note also that neither
 * product-pricing.mocked.spec.js nor order-to-invoice-discount.mocked.spec.js
 * touches this chain, despite being credited for it.
 */

const ORDER_ID = 'so-callout-chain-001';
const PRODUCT_ID = 'prod-callout-001';
const TAX_ID = 'tax-callout-001';

// Organisation base currency vs. the currency saved on the order. They must
// differ for the header conversion to arm; the per-order rate override short
// circuits the validate-exchange-rate lookup.
const ORG_CURRENCY = 'cur-eur-001';
const DOC_CURRENCY = 'cur-usd-001';
const RATE = 1.5;

// Callout economics. The callout answers in the PRICE LIST currency; the chain
// is what turns that into the order's currency.
const STANDARD_PRICE = 100;
const CONVERTED_PRICE = 150;   // STANDARD_PRICE * RATE
const GROSS_UNIT_PRICE = 121;
const TAX_RATE = 21;
const NET_UNIT_PRICE = 100;    // GROSS_UNIT_PRICE / (1 + TAX_RATE/100)
const QTY = 2;

/**
 * An existing line is what makes resolveTaxIdentifier observable: the callout
 * returns a tax id with no label, and the chain borrows the label from a sibling
 * line carrying the same tax.
 */
const EXISTING_LINE = {
  id: 'so-callout-line-000',
  lineNo: 10,
  product: 'prod-existing',
  'product$_identifier': 'Existing Widget',
  orderedQuantity: 1,
  listPrice: 10,
  discount: 0,
  unitPrice: 10,
  lineNetAmount: 10,
  lineGrossAmount: 12.1,
  tax: TAX_ID,
  'tax$_identifier': 'IVA 21%',
};

function makeOrder({ currency }) {
  return {
    id: ORDER_ID,
    documentNo: 'SO-CALLOUT-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    orderDate: '2026-06-25',
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Client',
    partnerAddress: 'addr-001',
    'partnerAddress$_identifier': 'Test Address',
    priceList: 'pl-001',
    'priceList$_identifier': 'EUR Price List',
    paymentTerms: 'pt-001',
    'paymentTerms$_identifier': '30 days',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Main Warehouse',
    grandTotalAmount: 12.1,
    summedLineAmount: 10,
    currency,
    'currency$_identifier': currency === DOC_CURRENCY ? 'USD' : 'EUR',
    eTGOCurrencyRate: RATE,
  };
}

/**
 * The line callout's answer. Shaped to exercise every step of the chain at once:
 * a zero list price to be backfilled from standardPrice, a non-zero discount to
 * be zeroed, a gross price and tax rate to derive the net from, and a tax id
 * with no label.
 */
const CALLOUT_UPDATES = {
  standardPrice: { value: STANDARD_PRICE },
  listPrice: { value: 0 },
  discount: { value: 25 },
  grossUnitPrice: { value: GROSS_UNIT_PRICE },
  taxRate: { value: TAX_RATE },
  tax: { value: TAX_ID },
  orderedQuantity: { value: QTY },
};

/**
 * @param {object} opts
 * @param {string} opts.orgCurrencyId  what /session reports as the org base currency
 * @param {object} opts.state          mutable sink for observed requests
 */
async function installMocks(page, { orgCurrencyId, state }) {
  // Org base currency. login()'s catch-all answers /session with currencyCode
  // only; the conversion effect reads currencyId, so it must be overridden here.
  await page.route('**/sws/neo/session**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currencyId: orgCurrencyId, currencyCode: 'EUR' }),
    });
  });

  await page.route('**/sws/neo/sales-order/header**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    if (url.includes('/selectors/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ id: 'addr-001', label: 'Test Address', _identifier: 'Test Address' }],
        }),
      });
    }
    const order = makeOrder({ currency: state.orderCurrency });
    const detail = /\/header\/([^/?]+)/.test(url);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: detail ? { data: [order] } : { data: [order], totalRows: 1 },
      }),
    });
  });

  // Line list + create. Registered before the callout route so the more specific
  // callout route wins (Playwright matches in reverse registration order).
  await page.route('**/sws/neo/sales-order/lines**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [EXISTING_LINE], totalRows: 1 } }),
      });
    }
    if (req.method() === 'POST') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.createdLines.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'so-callout-line-new', ...body }] } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/sales-order/lines/callout', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    state.callouts.push(req.postData() ? JSON.parse(req.postData()) : {});
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ updates: CALLOUT_UPDATES }),
    });
  });

  // Product lookup feeding the search drawer.
  await page.route('**/selectors/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: PRODUCT_ID,
          label: 'Callout Widget',
          name: 'Callout Widget',
          _identifier: 'Callout Widget',
          searchKey: 'CW-001',
        }],
      }),
    });
  });
}

function newState(orderCurrency) {
  return { callouts: [], createdLines: [], orderCurrency };
}

/** Open the order, reveal the inline-add row, and pick the product from the drawer. */
async function selectProductOnNewLine(page) {
  await page.goto(`/sales-order/${ORDER_ID}`);
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('action-add-line').click();
  const addRow = page.getByTestId('inline-add-row');
  await expect(addRow).toBeVisible({ timeout: 10_000 });

  await addRow.getByTestId('inline-add-field-product').click();
  const drawer = page.getByTestId('product-search-drawer');
  await expect(drawer).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`product-search-option-${PRODUCT_ID}`).click();
  await expect(drawer).toBeHidden({ timeout: 5_000 });

  return addRow;
}

test.describe('Line callout chain — product trigger (sales-order)', () => {
  test('selecting a product fires the line callout for that field', async ({ page }) => {
    const state = newState(DOC_CURRENCY);
    await login(page);
    await installMocks(page, { orgCurrencyId: ORG_CURRENCY, state });

    await selectProductOnNewLine(page);

    await expect.poll(() => state.callouts.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const callout = state.callouts[0];
    expect(callout.field).toBe('product');
    expect(callout.value).toBe(PRODUCT_ID);
  });

  test('the chain backfills the list price, converts it, and zeroes the discount', async ({ page }) => {
    const state = newState(DOC_CURRENCY);
    await login(page);
    await installMocks(page, { orgCurrencyId: ORG_CURRENCY, state });

    const addRow = await selectProductOnNewLine(page);

    // listPrice arrived as 0, was backfilled from standardPrice (100), then
    // converted into the order's currency at 1.5.
    await expect(addRow.getByTestId('inline-add-field-listPrice'))
      .toHaveValue(String(CONVERTED_PRICE), { timeout: 10_000 });
    // The callout proposed 25; a product change always zeroes the discount.
    await expect(addRow.getByTestId('inline-add-field-discount')).toHaveValue('0');
    // resolveTaxIdentifier borrowed the label from the sibling line. The callout
    // returned the tax id with no label, and identifiers are never posted, so the
    // row is the only place this step is observable.
    await expect(addRow.getByTestId('inline-add-field-tax')).toHaveValue('IVA 21%');
  });

  test('the saved line carries the whole chain result', async ({ page }) => {
    const state = newState(DOC_CURRENCY);
    await login(page);
    await installMocks(page, { orgCurrencyId: ORG_CURRENCY, state });

    const addRow = await selectProductOnNewLine(page);
    await expect(addRow.getByTestId('inline-add-field-listPrice'))
      .toHaveValue(String(CONVERTED_PRICE), { timeout: 10_000 });

    await page.keyboard.press('Enter');

    await expect.poll(() => state.createdLines.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const line = state.createdLines.at(-1);

    expect(line.product).toBe(PRODUCT_ID);
    expect(line.tax).toBe(TAX_ID);
    expect(Number(line.discount)).toBe(0);
    // The conversion stamps the order's currency onto the line.
    expect(line.currency).toBe(DOC_CURRENCY);

    // Converted: the price fields the conversion propagates to.
    expect(Number(line.listPrice)).toBeCloseTo(CONVERTED_PRICE, 2);
    expect(Number(line.standardPrice)).toBeCloseTo(CONVERTED_PRICE, 2);
    expect(Number(line.unitPrice)).toBeCloseTo(CONVERTED_PRICE, 2);

    // NOT converted: derived from the callout's own gross/tax figures, which
    // the conversion deliberately leaves alone. Pinning these catches a refactor
    // that widens the conversion to every price-ish field.
    expect(Number(line.netUnitPrice)).toBeCloseTo(NET_UNIT_PRICE, 2);
    expect(Number(line.grossUnitPrice)).toBeCloseTo(GROSS_UNIT_PRICE, 2);

    // The subtle one (ETP-4029): the net is qty x the CONVERTED price, not the
    // price the callout returned. It only comes out at 300 because the chain
    // clears the already-latched lineNetAmount before recomputing. If that reset
    // is lost the line silently persists 200 against a gross of 363.
    expect(Number(line.lineNetAmount)).toBeCloseTo(QTY * CONVERTED_PRICE, 2);
    expect(Number(line.lineGrossAmount)).toBeCloseTo(QTY * CONVERTED_PRICE * 1.21, 2);

    // No display-only sidecar is ever posted — identifiers are resolved for the
    // UI, not for the server. Asserted so the DOM check below is understood as
    // the right place to verify resolveTaxIdentifier, not a weaker substitute.
    expect(line['tax$_identifier']).toBeUndefined();
  });

  test('without an active conversion the price stays in the price-list currency', async ({ page }) => {
    // Control for the conversion half of the chain: org base currency equals the
    // order currency, so no conversion arms and the backfilled price is untouched.
    const state = newState(ORG_CURRENCY);
    await login(page);
    await installMocks(page, { orgCurrencyId: ORG_CURRENCY, state });

    const addRow = await selectProductOnNewLine(page);

    await expect(addRow.getByTestId('inline-add-field-listPrice'))
      .toHaveValue(String(STANDARD_PRICE), { timeout: 10_000 });
    // The non-currency steps still run — this is the conversion alone dropping out.
    await expect(addRow.getByTestId('inline-add-field-discount')).toHaveValue('0');
  });
});
