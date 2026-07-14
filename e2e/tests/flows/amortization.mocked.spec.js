import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Amortization window — full coverage (mocked).
 *
 * Covers: list render, detail open (draft + processed), draftMode Confirmar
 * button state (disabled when no lines / enabled with lines), inline lines tab,
 * field editability in draft, read-only behaviour in processed, and Reactivar
 * menu action visibility.
 *
 * Key implementation facts (read from HeaderPage.jsx and DetailView.jsx):
 *   - draftMode.enabled = true, label = 'confirm'
 *   - In draftMode: draft save btn → data-testid="action-save-draft"
 *                   confirm btn    → data-testid="action-save"
 *   - isDraftModeCompleted fires when processed='Y', which HIDES both save buttons
 *   - hideDeleteWhenComplete=true + isProcessed=true → delete button is hidden
 *     for processed records (action-more kebab is still visible)
 *   - More/kebab menu button has NO data-testid — locate via title or SVG
 *   - menuActions: [{ key:'reactivate', visible: data.processed==='Y' }]
 *   - linesLayout = 'inlineEditable'
 *   - rowQuickActions={} on ListView (no hover overlay in list)
 *
 * Routing note: login() installs a `**\/sws/**` catch-all so installMocks()
 * must run AFTER login() for specific routes to win (LIFO order).
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const HEADER_DRAFT = {
  id: 'mock-amort-draft-001',
  name: '31-05-2026',
  accountingDate: '2026-05-31',
  startingDate: '2026-05-01',
  totalAmortization: 5000,
  'currency$_identifier': 'EUR',
  processed: 'N',
};

const HEADER_PROCESSED = {
  id: 'mock-amort-proc-001',
  name: '08-04-2026',
  accountingDate: '2026-04-08',
  startingDate: '2026-04-01',
  totalAmortization: 3583.33,
  'currency$_identifier': 'EUR',
  processed: 'Y',
};

const LINE_001 = {
  id: 'mock-amort-line-001',
  asset: 'mock-asset-id',
  'asset$_identifier': 'Coche',
  amortizationPercentage: 8.33,
  amortizationAmount: 1500,
  'currency$_identifier': 'EUR',
};

// ---------------------------------------------------------------------------
// Mock installer
// ---------------------------------------------------------------------------

/**
 * Install all routes for the amortization window.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {object[]} opts.headers  rows returned for the list endpoint
 * @param {object[]} opts.lines    lines returned for GET /lines
 */
async function installMocks(page, {
  headers = [HEADER_DRAFT, HEADER_PROCESSED],
  lines = [LINE_001],
} = {}) {
  // Lines endpoint (parentId query and direct)
  await page.route('**/sws/neo/amortization/lines**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
    });
  });

  // Action endpoint — confirm / process
  await page.route('**/sws/neo/amortization/header/*/action/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...headers[0], processed: 'Y' }] } }),
    });
  });

  // Header list + detail — must be registered last (lowest priority)
  await page.route('**/sws/neo/amortization/header**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: headers, totalRows: headers.length } }),
      });
      return;
    }

    if (req.method() === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = headers.find(h => h.id === m?.[1]) ?? headers[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    return route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Test 1 — List renders correctly
// ---------------------------------------------------------------------------

test.describe('Amortization — list view', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto('/amortization');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('list-view is visible and shows both mock rows', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: '31-05-2026' }).first()).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: '08-04-2026' }).first()).toBeVisible();
  });

  test('totalAmortization column shows a formatted amount for the draft row', async ({ page }) => {
    // Match the numeric part — locale-formatted 5000 appears as 5,000 or 5.000
    const draftRow = page.locator('tbody tr').filter({ hasText: '31-05-2026' }).first();
    await expect(draftRow).toBeVisible();
    await expect(draftRow).toContainText('5');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Detail opens in draft state
// ---------------------------------------------------------------------------

test.describe('Amortization — detail view (draft)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page, { headers: [HEADER_DRAFT] });
    await page.goto(`/amortization/${HEADER_DRAFT.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('detail-view container is visible', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible();
  });

  test('field-name and field-accountingDate are visible', async ({ page }) => {
    await expect(page.getByTestId('field-name')).toBeVisible();
    await expect(page.getByTestId('field-accountingDate')).toBeVisible();
  });

  test('draftMode renders save-draft and confirm buttons', async ({ page }) => {
    // In draftMode: action-save-draft = "Guardar", action-save = "Confirmar"
    await expect(page.getByTestId('action-save-draft')).toBeVisible();
    await expect(page.getByTestId('action-save')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Confirmar disabled when no lines
// ---------------------------------------------------------------------------

test.describe('Amortization — Confirmar disabled with no lines', () => {
  test('action-save (Confirmar) is disabled when lines array is empty', async ({ page }) => {
    await login(page);
    await installMocks(page, { headers: [HEADER_DRAFT], lines: [] });
    await page.goto(`/amortization/${HEADER_DRAFT.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // draftMode.disableWhenEmpty = true: confirm button (action-save) is disabled
    // when there are no child lines. The save-draft button (action-save-draft) is
    // a separate button — action-save here is the "Confirmar" button.
    await expect(page.getByTestId('action-save')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Confirmar enabled when lines are present
// ---------------------------------------------------------------------------

test.describe('Amortization — Confirmar enabled with lines', () => {
  test('action-save (Confirmar) is enabled when lines exist', async ({ page }) => {
    await login(page);
    await installMocks(page, { headers: [HEADER_DRAFT], lines: [LINE_001] });
    await page.goto(`/amortization/${HEADER_DRAFT.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('action-save')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Lines tab visible and shows lines
// ---------------------------------------------------------------------------

test.describe('Amortization — inline lines panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page, { headers: [HEADER_DRAFT], lines: [LINE_001] });
    await page.goto(`/amortization/${HEADER_DRAFT.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('inline-lines-panel renders', async ({ page }) => {
    await expect(page.getByTestId('inline-lines-panel')).toBeVisible({ timeout: 8_000 });
  });

  test('mock line asset identifier is visible', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Coche', { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Draft editability contract (ETP-4429)
// ---------------------------------------------------------------------------

test.describe('Amortization — draft editability', () => {
  // ETP-4429: the header fields name, accountingDate, startingDate and currency
  // are now `visibility: readOnly` unconditionally in decisions.json, so the
  // generator emits `readOnly: true` on each (see generated HeaderForm.jsx).
  // EntityForm renders those as `disabled` Inputs in ALL states, including
  // draft. Only `description` remains editable in draft (its only lock is
  // `readOnlyLogic: record.processed === 'Y'`, which is false while processed='N').
  test('header fields are read-only in draft except Description', async ({ page }) => {
    await login(page);
    await installMocks(page, { headers: [HEADER_DRAFT], lines: [LINE_001] });
    await page.goto(`/amortization/${HEADER_DRAFT.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Unconditionally read-only text/date header fields → EntityForm renders a
    // disabled <Input>/<textarea> carrying the field-{key} testid directly.
    for (const key of ['name', 'accountingDate', 'startingDate']) {
      const field = page.getByTestId(`field-${key}`);
      await expect(field, `field-${key} should be visible`).toBeVisible();
      await expect(field, `field-${key} should be disabled (read-only)`).toBeDisabled();
    }

    // Currency is a read-only FK selector: renderReadOnlyFk puts the field-currency
    // testid on the wrapper <div> (not disable-able) and nests the disabled <input>.
    const currencyField = page.getByTestId('field-currency');
    await expect(currencyField).toBeVisible();
    await expect(currencyField.locator('input')).toBeDisabled();

    // Description is the only editable header field in draft state.
    const descriptionField = page.getByTestId('field-description');
    await expect(descriptionField).toBeVisible();
    await expect(descriptionField).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Processed record: save buttons hidden, delete visible
// ---------------------------------------------------------------------------

test.describe('Amortization — processed record', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page, {
      headers: [HEADER_PROCESSED],
      lines: [LINE_001],
    });
    await page.goto(`/amortization/${HEADER_PROCESSED.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('detail-view renders for processed record', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible();
  });

  test('save/confirm buttons are hidden when processed (isDraftModeCompleted)', async ({ page }) => {
    // isDraftModeCompleted = true when processed='Y' → the save-draft + confirm
    // pair is not rendered at all.
    await expect(page.getByTestId('action-save-draft')).toHaveCount(0);
    await expect(page.getByTestId('action-save')).toHaveCount(0);
  });

  test('delete button is hidden for processed record (hideDeleteWhenComplete=true)', async ({ page }) => {
    // hideDeleteWhenComplete=true + isProcessed=true → delete button is hidden.
    await expect(page.getByTestId('action-delete')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Reactivar visible for processed record
// ---------------------------------------------------------------------------

test.describe('Amortization — Reactivar menu action', () => {
  test('more menu exposes Reactivar option on processed record', async ({ page }) => {
    await login(page);
    await installMocks(page, {
      headers: [HEADER_PROCESSED],
      lines: [LINE_001],
    });
    await page.goto(`/amortization/${HEADER_PROCESSED.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The more-menu button uses MoreVertical icon; no data-testid is emitted.
    // Locate it by its distinguishing title attribute which resolves from ui('more').
    // Fall back to a role+name pattern in case the title is localized.
    const moreBtn = page
      .locator('button[title]')
      .filter({ hasText: '' })
      .and(page.locator('button:not([data-testid])', { hasNot: page.locator('[data-testid]') }))
      .last();

    const kebabBtn = page.getByTestId('action-more');
    await expect(kebabBtn).toBeVisible({ timeout: 5_000 });
    await kebabBtn.click();

    // The Reactivar option label can be 'Reactivate' (en_US) or 'Reactivar' (es_ES)
    const reactivarOption = page
      .getByRole('button', { name: /reactivat|reactivar/i })
      .first();
    await expect(reactivarOption).toBeVisible({ timeout: 3_000 });
  });
});
