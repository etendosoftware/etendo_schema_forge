import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Import bank statement wizard — mocked.
 *
 * Regression cover for the "Importar extracto" modal growing past the viewport:
 * with a 100+ line file, clicking "Mostrar todas" used to render every row
 * inline, pushing the footer (and the Importar button) off screen so the user
 * could not finish the flow. The modal now caps its height and scrolls the line
 * list internally.
 *
 * Also covers the two backend rules aligned with Classic in the same change:
 * a file whose lines carry no amount is rejected with a specific message
 * (NO_VALID_LINES) instead of the generic "invalid format" one, and a partially
 * pruned import warns how many lines were skipped.
 *
 * Mock mode only: installs the account + statements + preview/import routes on
 * top of the generic /sws/** mock that login() seeds.
 */

const ACCOUNT_ID = 'acc-import';

const ACCOUNTS = [
  {
    id: ACCOUNT_ID,
    name: 'Cuenta de Banco',
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

function previewLines(count) {
  return Array.from({ length: count }, (_, i) => ({
    lineNo: (i + 1) * 10,
    date: '2026-02-01T00:00:00Z',
    description: `MOVIMIENTO ${i + 1}`,
    bpartnerName: 'Acme Holdings S.L.',
    reference: `REF-${String(i + 1).padStart(4, '0')}`,
    cramount: 100,
    dramount: 0,
  }));
}

/** Preview payload the modal renders in step 2. */
function previewPayload({ lineCount = LINE_TOTAL, discardedLines = 0 } = {}) {
  return {
    format: 'GENERIC_CSV',
    fileName: 'extracto-prueba.csv',
    lineCount,
    discardedLines,
    totalIn: lineCount * 100,
    totalOut: 0,
    periodFrom: '2026-02-01T00:00:00Z',
    periodTo: '2026-02-28T00:00:00Z',
    lines: previewLines(lineCount),
  };
}

async function installMocks(page, { preview, importResult } = {}) {
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
  await page.route('**/sws/neo/bank-statements**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { statements: [], lines: [] } } }),
      });
      return;
    }
    if (url.includes('action=preview')) {
      const p = preview ?? { status: 200, data: previewPayload() };
      await route.fulfill({
        status: p.status,
        contentType: 'application/json',
        body: JSON.stringify(p.status === 200
          ? { response: { data: p.data } }
          : { error: p.error }),
      });
      return;
    }
    if (url.includes('action=import')) {
      const r = importResult ?? { id: 'stmt-1', fileName: 'extracto-prueba.csv', lineCount: LINE_TOTAL, discardedLines: 0 };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: r } }),
      });
      return;
    }
    await route.fallback();
  });
}

/** Opens the wizard on step 2 for the given CSV content. */
async function gotoReviewStep(page) {
  await page.getByTestId('detail-tab-statements').click();
  await page.getByTestId('statements-import-button').click();
  await page.getByTestId('import-statement-file-input').setInputFiles({
    name: 'extracto-prueba.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Transaction Date,Reference No.,Business Partner Name,Amount OUT,Amount IN,Description\n'
      + '01/02/2026,REF-0001,Acme,0,100,Movimiento\n',
    ),
  });
  await page.getByRole('button', { name: /Continuar/i }).click();
}

test.describe('Import bank statement wizard — mocked', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  async function land(page, opts) {
    await installMocks(page, opts);
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  test('"Mostrar todas" on a 120-line file keeps the modal inside the viewport and the Importar button reachable', async ({ page }) => {
    await land(page);
    await gotoReviewStep(page);

    const confirm = page.getByRole('button', { name: /^Importar$/ });
    await expect(confirm).toBeVisible();

    await page.getByRole('button', { name: /Mostrar todas/i }).click();

    // Every line is rendered…
    await expect(page.getByText('MOVIMIENTO 120')).toBeAttached();

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
  });

  test('a file whose lines carry no amount is rejected with the specific message', async ({ page }) => {
    await land(page, {
      preview: {
        status: 400,
        error: { message: 'The file contains no valid lines to import', status: 400, code: 'NO_VALID_LINES' },
      },
    });
    await gotoReviewStep(page);

    await expect(page.getByText(/no contiene líneas válidas/i)).toBeVisible();
    await expect(page.getByText(/Formato no válido/i)).toHaveCount(0);
  });

  test('warns in step 2 how many lines will be skipped for having no amount', async ({ page }) => {
    await land(page, {
      preview: { status: 200, data: previewPayload({ lineCount: 9, discardedLines: 1 }) },
    });
    await gotoReviewStep(page);

    await expect(page.getByTestId('import-discarded-lines')).toBeVisible();
    await expect(page.getByTestId('import-discarded-lines')).toContainText('1');
  });
});
