import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — header auto-saves before "Añadir líneas" (ETP-5147, mocked).
 *
 * Bug: in ALL header+lines documents, editing a header field (e.g. currency)
 * without clicking Save first, then clicking "Añadir líneas" (or any
 * line-creation trigger), did NOT auto-save the header first — the new line
 * got created against stale header data. Root cause: `handleAddLineClick` /
 * `handleSecondaryAddLineToggle` / `handleCustomModalAddClick`
 * (DetailView.jsx) only auto-saved the header when the record was brand new
 * (`isNew`); the `else` branch — an ALREADY-SAVED record with a pending edit,
 * exactly this scenario — opened the line-creation UI straight away.
 *
 * CP-2 (QA test plan, Jira comment 145306): change currency EUR→USD on a
 * saved sales order, click "Añadir líneas" without manually saving, and
 * assert the header PATCH (carrying the new currency) fires and completes
 * BEFORE the line-creation UI opens.
 *
 * Sequencing is asserted with real timestamps captured on the PATCH route
 * handler (Node-side clock), the same technique as
 * `organization-save.mocked.spec.js`'s non-overlap assertion — not DOM-timing
 * polling, which would be flaky in either direction.
 *
 * Mock mode only. Routes are installed AFTER login() so they win over the
 * generic /sws/** catch-all login() seeds (Playwright LIFO route matching).
 * See docs/e2e-testing-guide.md for the two-route-per-endpoint convention
 * (`word/**` for sub-paths, `word**` for the bare/query-string case).
 */

const ORDER_ID = 'so-etp5147-001';

const CURRENCY_EUR = { id: '102', isoCode: 'EUR', rate: 1.0 };
const CURRENCY_USD = { id: '100', isoCode: 'USD', rate: 1.15 };
const CURRENCY_OPTIONS = [CURRENCY_EUR, CURRENCY_USD];

const ORDER = {
  id: ORDER_ID,
  documentNo: 'SO-ETP5147-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  currency: CURRENCY_EUR.id,
  'currency$_identifier': CURRENCY_EUR.isoCode,
  eTGOCurrencyRate: 1.0,
  orderDate: '2026-01-15',
  grandTotalAmount: 0,
  summedLineAmount: 0,
  'businessPartner$_identifier': 'Test BP',
  businessPartner: 'bp-001',
  partnerAddress: 'addr-001',
  'partnerAddress$_identifier': 'Test Address',
  priceList: 'pl-001',
  'priceList$_identifier': 'Standard Sales',
  paymentTerms: 'pt-001',
  'paymentTerms$_identifier': '30 days',
  warehouse: 'wh-001',
  'warehouse$_identifier': 'Main Warehouse',
  processed: false,
};

/**
 * Installs every route the sales-order detail page needs for this flow:
 * currency options + validate-exchange-rate + session (all three needed by
 * CurrencyRatePicker's currency-change flow, per
 * sales-order-currency-rate-picker.mocked.spec.js scenario E), plus the
 * header GET/PATCH and an empty lines list.
 *
 * `patchDelayMs` holds the header PATCH open for that long — the same trick
 * `organization-save.mocked.spec.js` uses to make sequencing observable: a
 * PATCH that resolves instantly can't prove "the line UI opened AFTER the
 * save finished" versus "the line UI opened without ever waiting".
 *
 * @returns {{ patches: Array<{ body: any, startedAt: number, finishedAt: number }> }}
 */
async function installOrderMocks(page, { patchDelayMs = 0 } = {}) {
  const journal = { patches: [] };

  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}/action/currencyOptions`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: CURRENCY_OPTIONS } }),
    });
  });

  await page.route(`**/sws/neo/validate-exchange-rate{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasRate: true, rate: CURRENCY_USD.rate }),
    });
  });

  await page.route(`**/sws/neo/session`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currencyCode: CURRENCY_EUR.isoCode, currencyId: CURRENCY_EUR.id }),
    });
  });

  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ORDER] } }),
      });
      return;
    }
    if (method === 'PATCH') {
      const startedAt = Date.now();
      let body = null;
      try {
        body = JSON.parse(route.request().postData() ?? 'null');
      } catch {
        // Surfaced as a `null` body assertion below rather than an
        // unrelated "route was not handled" Playwright error.
      }
      if (patchDelayMs > 0) {
        await new Promise((resolve) => { setTimeout(resolve, patchDelayMs); });
      }
      const finishedAt = Date.now();
      journal.patches.push({ body, startedAt, finishedAt });
      const updatedCurrency = CURRENCY_OPTIONS.find(c => c.id === body?.currency);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: [{
              ...ORDER,
              ...body,
              'currency$_identifier': updatedCurrency?.isoCode ?? ORDER['currency$_identifier'],
            }],
          },
        }),
      });
      return;
    }
    route.fallback();
  });

  await page.route(`**/sws/neo/sales-order/header`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [ORDER], totalRows: 1 } }),
    });
  });

  // No saved lines yet — the "Añadir líneas" trigger under test is the
  // LinesEmptyState button (`action-add-lines-empty-state`), which only
  // renders while the lines table is empty.
  await page.route(`**/sws/neo/sales-order/lines{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  return journal;
}

async function waitForDetailView(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
}

/** Changes the header currency via CurrencyRatePicker's dropdown, without saving. */
async function changeCurrencyToUsd(page) {
  const currencyField = page.getByTestId('field-currency');
  const trigger = currencyField.getByTestId('currency-rate-trigger');
  await expect(trigger).toBeVisible({ timeout: 8_000 });
  await expect(trigger).toContainText('EUR');

  await trigger.click();
  const usdOption = page.getByRole('button', { name: /USD/ }).last();
  await expect(usdOption).toBeVisible({ timeout: 5_000 });
  await usdOption.click();

  await expect(trigger).toContainText('USD', { timeout: 5_000 });
}

test.describe('Sales Order — auto-save before "Añadir líneas" (ETP-5147, CP-2)', () => {
  test('dirty currency + "Añadir líneas": header PATCH (new currency) completes BEFORE the line UI opens', async ({ page }) => {
    await login(page);
    const journal = await installOrderMocks(page, { patchDelayMs: 500 });

    await page.goto(`/sales-order/${ORDER_ID}`);
    await waitForDetailView(page);

    await changeCurrencyToUsd(page);

    // Not saved yet — the header edit is still only in local (editing) state.
    expect(journal.patches).toHaveLength(0);

    const addLineTrigger = page.getByTestId('action-add-lines-empty-state');
    await expect(addLineTrigger).toBeVisible({ timeout: 8_000 });
    await addLineTrigger.click();

    // This is the bug: without the ETP-5147 fix, handleAddLineClick never
    // calls handleSave on an already-saved record's dirty header, so no
    // PATCH is ever sent here and this poll times out.
    await expect.poll(() => journal.patches.length, {
      timeout: 8_000,
      message: 'Expected the header to auto-save (PATCH) before the line UI opened, but no PATCH was ever sent — the dirty header edit (currency EUR→USD) was silently discarded.',
    }).toBeGreaterThan(0);

    const patch = journal.patches[0];
    expect(patch.body?.currency, `PATCH body: ${JSON.stringify(patch.body)}`).toBe(CURRENCY_USD.id);

    // The line-creation UI (inline add row) must only open once the header
    // save has actually finished — never before, and never without saving.
    const inlineAddRow = page.getByTestId('inline-add-row');
    await expect(inlineAddRow).toBeVisible({ timeout: 8_000 });
    const openedAt = Date.now();
    expect(
      openedAt,
      `The line UI opened at +${openedAt - patch.startedAt}ms, but the header PATCH only finished at +${patch.finishedAt - patch.startedAt}ms — the line UI must not open before the auto-save completes.`,
    ).toBeGreaterThanOrEqual(patch.finishedAt);
  });
});
