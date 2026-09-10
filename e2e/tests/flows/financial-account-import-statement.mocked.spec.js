import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Import bank statement wizard — mocked (ETP-4954 shape).
 *
 * The wizard is no longer a round trip through the backend. The file is parsed
 * IN THE BROWSER, so the flow is:
 *
 *   pick file → [parsed locally] → mapping + row review (step 2)
 *             → preview (step 3) → POST ?action=create
 *
 * That is why this spec no longer mocks `?action=preview` / `?action=import`
 * (still served for MCP / REST / Cuaderno 43 callers, but unreachable from this
 * screen): the only request the wizard makes now is the same `?action=create`
 * the manual statement form posts.
 *
 * What is covered here:
 *
 *  - step 1 offers both downloadable templates;
 *  - a file with the canonical headers auto-assigns all 6 columns on step 2;
 *  - a row carrying no amount, and a row carrying an amount on BOTH sides, are
 *    correctable errors in the review queue and never reach the payload;
 *  - the preview warns how many lines are being left behind
 *    (`import-discarded-lines`, computed locally now, rendered on step 3);
 *  - regression: with a 120-line file, "Mostrar todas" keeps the modal inside
 *    the viewport and the "Importar" button reachable — it used to render every
 *    row inline and push the footer below the fold.
 *
 * Mock mode only: installs the account + statements + create routes on top of
 * the generic /sws/** mock that login() seeds.
 */

const ACCOUNT_ID = 'acc-import';

const ACCOUNTS = [
  {
    id: ACCOUNT_ID,
    name: 'Cuenta bancaria de prueba',
    type: 'B',
    currentBalance: 10000,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1221000418450200051332',
    isDefault: true,
    pendingCount: 0,
    bankConnected: false,
  },
];

const SUMMARY = { totalBalance: 10000, currency: 'EUR' };

const LINE_TOTAL = 120;

/**
 * The canonical English headers the pre-ETP-4954 importer accepted. They are
 * kept as field aliases precisely so a file written before the change still
 * auto-maps, which is what the "6/6 columns" test asserts.
 */
const CANONICAL_HEADER_ROW = [
  'Transaction Date',
  'Reference No.',
  'Business Partner Name',
  'Amount OUT',
  'Amount IN',
  'Description',
].join(',');

/** One CSV data row in canonical-header order. Blank amount cells are legal. */
function csvRow({
  date = '01/02/2026',
  reference = 'REF-0001',
  bpartnerName = 'Acme Holdings S.L.',
  out = '',
  amountIn = '',
  description,
}) {
  return [date, reference, bpartnerName, out, amountIn, description].join(',');
}

function csvFile(rows, name = 'extracto-prueba.csv') {
  return {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from([CANONICAL_HEADER_ROW, ...rows].join('\n'), 'utf8'),
  };
}

/** `count` valid inflow rows, described `MOVIMIENTO 1` … `MOVIMIENTO count`. */
function inflowRows(count) {
  return Array.from({ length: count }, (_, i) => csvRow({
    reference: `REF-${String(i + 1).padStart(4, '0')}`,
    amountIn: '100',
    description: `MOVIMIENTO ${i + 1}`,
  }));
}

const NO_AMOUNT_DESCRIPTION = 'SIN IMPORTE';
const BOTH_AMOUNTS_DESCRIPTION = 'AMBOS IMPORTES';

/** Two good rows around one that carries no amount at all. */
const NO_AMOUNT_FILE = csvFile([
  csvRow({ reference: 'REF-0001', amountIn: '100', description: 'MOVIMIENTO 1' }),
  csvRow({ reference: 'REF-0002', description: NO_AMOUNT_DESCRIPTION }),
  csvRow({ reference: 'REF-0003', out: '250', description: 'MOVIMIENTO 3' }),
]);

/** One good row plus one with an amount on both sides — the ETP-4954 rule. */
const BOTH_AMOUNTS_FILE = csvFile([
  csvRow({ reference: 'REF-0001', amountIn: '100', description: 'MOVIMIENTO 1' }),
  csvRow({ reference: 'REF-0002', out: '50', amountIn: '20', description: BOTH_AMOUNTS_DESCRIPTION }),
]);

/**
 * @returns {Array<object>} every `?action=create` body the page sent, in order.
 *   Populated as the test runs — read it AFTER the confirm click.
 */
async function installMocks(page) {
  const createPayloads = [];

  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    const rows = ACCOUNTS.map(({ pendingCount, ...rest }) => ({
      ...rest, eTGOPendingCount: pendingCount,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: rows.length, summary: SUMMARY } }),
    });
  });

  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { accounts: ACCOUNTS, summary: SUMMARY } } }),
    });
  });

  await page.route('**/sws/neo/financial-account-transactions{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { transactions: [], totals: { balance: 10000, inflows: 0, outflows: 0, currency: 'EUR' } } } }),
    });
  });

  // One route for every bank-statements verb; branch on the action query param.
  // Every statements endpoint is query-string-based (no sub-paths), so the glued
  // `**` catch-all is enough here — see the route gotcha in docs/e2e-testing-guide.md.
  await page.route('**/sws/neo/bank-statements**', async (route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { statements: [], lines: [] } } }),
      });
      return;
    }
    if (url.includes('action=create')) {
      createPayloads.push(request.postDataJSON());
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: 'stmt-1',
              name: 'extracto-prueba',
              fileName: 'extracto-prueba.csv',
              statementDate: '2026-02-01T00:00:00Z',
              processed: true,
            },
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  return createPayloads;
}

const continueButton = (page) => page.getByRole('button', { name: /Continuar/i });
const confirmButton = (page) => page.getByRole('button', { name: 'Importar', exact: true });

/** Opens the wizard on step 1 with `file` picked but not yet analyzed. */
async function pickFile(page, file) {
  await page.getByTestId('detail-tab-statements').click();
  await page.getByTestId('statements-import-button').click();
  await page.getByTestId('import-statement-file-input').setInputFiles(file);
}

/** Step 2 — the file is parsed locally, its columns mapped and its rows reviewed. */
async function gotoMappingStep(page, file) {
  await pickFile(page, file);
  await continueButton(page).click();
  await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toBeVisible();
}

/** Step 3 — the confirmation preview, one more Continue past the mapping step. */
async function gotoPreviewStep(page, file) {
  await gotoMappingStep(page, file);
  await continueButton(page).click();
  await expect(confirmButton(page)).toBeVisible();
}

test.describe('Import bank statement wizard — mocked', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  async function land(page) {
    const createPayloads = await installMocks(page);
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    return createPayloads;
  }

  test('step 1 offers both downloadable templates', async ({ page }) => {
    await land(page);
    await page.getByTestId('detail-tab-statements').click();
    await page.getByTestId('statements-import-button').click();

    await expect(page.getByTestId('import-statement-template-csv')).toBeVisible();
    await expect(page.getByTestId('import-statement-template-xlsx')).toBeVisible();
  });

  test('a file with the canonical headers auto-assigns all 6 columns on the mapping step', async ({ page }) => {
    await land(page);
    await gotoMappingStep(page, csvFile(inflowRows(3)));

    await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('6/6');
    // Nothing to correct, so the review queue reports no errors at all.
    await expect(page.getByTestId('import-review-error-summary')).toHaveCount(0);
    await expect(page.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveText('0');
    await expect(page.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveText('3');
  });

  test('"Mostrar todas" on a 120-line file keeps the modal inside the viewport and the Importar button reachable', async ({ page }) => {
    const createPayloads = await land(page);
    await gotoPreviewStep(page, csvFile(inflowRows(LINE_TOTAL)));

    const confirm = confirmButton(page);
    await expect(confirm).toBeVisible();

    await page.getByRole('button', { name: /Mostrar todas/i }).click();

    // Every line is rendered…
    await expect(page.getByText(`MOVIMIENTO ${LINE_TOTAL}`, { exact: true })).toBeAttached();

    // …inside its own scroller, and the modal still fits the viewport.
    const scroller = page.getByTestId('import-preview-lines-scroll');
    await expect(scroller).toBeVisible();
    const overflows = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(overflows).toBe(true);

    const viewport = page.viewportSize();
    const dialog = page.locator('[role="dialog"]').first();
    const box = await dialog.boundingBox();
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.y).toBeGreaterThanOrEqual(0);

    // The confirmation button is still visible AND clickable, which is the
    // actual user-facing bug: it used to end up below the fold.
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeInViewport();
    await confirm.click();
    await expect(dialog).toHaveCount(0);

    // …and all 120 lines were sent to the endpoint the manual form posts to.
    expect(createPayloads).toHaveLength(1);
    expect(createPayloads[0].FIN_Financial_Account_ID).toBe(ACCOUNT_ID);
    expect(createPayloads[0].process).toBe(true);
    expect(createPayloads[0].lines).toHaveLength(LINE_TOTAL);
  });

  test('a row carrying no amount is a correctable error on the review step and is never sent', async ({ page }) => {
    const createPayloads = await land(page);
    await gotoMappingStep(page, NO_AMOUNT_FILE);

    // The row is reported, not silently dropped: one error, on the amount cell,
    // with the specific "needs a positive amount" message.
    await expect(page.getByTestId('import-review-error-summary')).toBeVisible();
    await expect(page.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveText('1');

    await page.getByTestId('ImportReviewQueue__statusFilter-error').click();
    await expect(page.getByTestId('ImportReviewQueue__fieldError-1-in'))
      .toContainText(/importe positivo/i);
    // The generic "unsupported format" copy must NOT be what the user sees.
    await expect(page.getByText(/Formato no válido/i)).toHaveCount(0);

    // The other two rows can still be imported, and only those two are sent.
    await continueButton(page).click();
    await confirmButton(page).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    expect(createPayloads).toHaveLength(1);
    expect(createPayloads[0].lines).toHaveLength(2);
    expect(createPayloads[0].lines.map((l) => l.description))
      .not.toContain(NO_AMOUNT_DESCRIPTION);
  });

  test('the preview warns how many lines will be skipped for having no amount', async ({ page }) => {
    await land(page);
    await gotoPreviewStep(page, NO_AMOUNT_FILE);

    await expect(page.getByTestId('import-discarded-lines')).toBeVisible();
    await expect(page.getByTestId('import-discarded-lines')).toContainText('1');
  });

  test('a row with an amount on both sides is flagged on both cells and is never sent', async ({ page }) => {
    const createPayloads = await land(page);
    await gotoMappingStep(page, BOTH_AMOUNTS_FILE);

    await expect(page.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveText('1');
    await page.getByTestId('ImportReviewQueue__statusFilter-error').click();
    await expect(page.getByTestId('ImportReviewQueue__fieldError-1-out'))
      .toContainText(/no en las dos/i);
    await expect(page.getByTestId('ImportReviewQueue__fieldError-1-in'))
      .toContainText(/no en las dos/i);

    await continueButton(page).click();
    await expect(page.getByTestId('import-discarded-lines')).toContainText('1');
    await confirmButton(page).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    expect(createPayloads).toHaveLength(1);
    expect(createPayloads[0].lines).toHaveLength(1);
    expect(createPayloads[0].lines.map((l) => l.description))
      .not.toContain(BOTH_AMOUNTS_DESCRIPTION);
  });
});
