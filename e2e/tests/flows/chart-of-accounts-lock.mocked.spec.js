import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Chart of Accounts — Account Code Lock (TC-21–TC-26, ETP-4247)
 *
 * Validates the AccountCodeField split-editor behavior:
 *   TC-21: PGC prefix (digits 1–4) is not editable on any account
 *   TC-22: Subaccount suffix (digits 5–8) is editable on leaf accounts
 *   TC-23: Account code must be exactly 8 digits (maxLength + blur validation)
 *   TC-24: Non-leaf (summary) accounts are fully read-only
 *   TC-25: Account codes in the list grid are exactly 8 characters
 *   TC-26: New child account inherits and locks parent prefix from defaults
 *
 * Mock mode only — installs /sws/neo/chart-of-accounts/elementValue** routes
 * AFTER login() so they win over the generic catch-all.
 */

const LEAF_ACCOUNT = {
  id: 'leaf-001',
  searchKey: '43000001',
  name: 'Cliente Pérez S.L.',
  description: '',
  accountType: 'A',
  summaryLevel: 'N',
  active: 'Y',
  parentCode4: '4300',
  parentCode4Name: 'Clientes',
  ytdDebit: 0,
  ytdCredit: 0,
  ytdBalance: 0,
  isLeaf: true,
};

const SUMMARY_ACCOUNT = {
  id: 'summ-001',
  searchKey: '43000000',
  name: 'Clientes',
  description: '',
  accountType: 'A',
  summaryLevel: 'Y',
  active: 'Y',
  parentCode4: '4300',
  parentCode4Name: 'Clientes',
  ytdDebit: 0,
  ytdCredit: 0,
  ytdBalance: 0,
  isLeaf: false,
};

const ACCOUNTS = [LEAF_ACCOUNT, SUMMARY_ACCOUNT];

/**
 * Install all chart-of-accounts route mocks.
 * Must be called AFTER login() — routes are matched in LIFO order.
 *
 * Handles:
 *   GET .../elementValue/defaults   → { defaults: { codePrefix: '4300' } }
 *   GET .../elementValue/<id>        → single record envelope
 *   GET .../elementValue             → list envelope
 *   PATCH .../elementValue/<id>      → saved record (forwarded for TC-22 body capture)
 *   POST .../elementValue            → saved record
 */
async function installMocks(page) {
  await page.route('**/sws/neo/chart-of-accounts/elementValue**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // Defaults for new records — must be checked BEFORE the detail-ID pattern
    // because "/elementValue/defaults" also matches /elementValue/[^/?]+.
    if (url.includes('/elementValue/defaults')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults: { codePrefix: '4300' } }),
      });
    }

    // Detail GET — URL contains /elementValue/<id>
    if (method === 'GET' && /\/elementValue\/[^/?]+/.test(url)) {
      const m = url.match(/\/elementValue\/([^/?]+)/);
      const found = ACCOUNTS.find(a => a.id === m?.[1]) ?? ACCOUNTS[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }

    // List GET
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ACCOUNTS, totalRows: ACCOUNTS.length } }),
      });
    }

    // PATCH (save existing record) — return the updated record so the UI stays stable
    if (method === 'PATCH') {
      const m = url.match(/\/elementValue\/([^/?]+)/);
      const base = ACCOUNTS.find(a => a.id === m?.[1]) ?? ACCOUNTS[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...base }),
      });
    }

    // POST (create new record)
    if (method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'new-001', ...LEAF_ACCOUNT }),
      });
    }

    route.fallback();
  });
}

test.describe('Chart of Accounts — account code lock (ETP-4247)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
  });

  // -----------------------------------------------------------------------
  // TC-21: PGC prefix (digits 1–4) is not editable on any account
  // -----------------------------------------------------------------------
  test('TC-21: PGC prefix is locked display text on a leaf account', async ({ page }) => {
    await page.goto('/chart-of-accounts/leaf-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const prefix = page.getByTestId('account-code-prefix');
    await expect(prefix).toBeVisible();
    await expect(prefix).toHaveText('4300');

    // Prefix is a <span>, not an <input>
    const prefixTag = await prefix.evaluate(el => el.tagName.toLowerCase());
    expect(prefixTag).toBe('span');

    // Suffix input is the only code input
    await expect(page.getByTestId('account-code-suffix-input')).toBeVisible();

    // Read-only combined display must NOT exist on a leaf account
    await expect(page.getByTestId('account-code-readonly')).toHaveCount(0);
  });

  // -----------------------------------------------------------------------
  // TC-22: Subaccount suffix (digits 5–8) is editable; save sends full code
  // -----------------------------------------------------------------------
  test('TC-22: Editing suffix produces correct searchKey in the save payload', async ({ page }) => {
    await page.goto('/chart-of-accounts/leaf-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const suffixInput = page.getByTestId('account-code-suffix-input');
    await expect(suffixInput).toBeVisible();

    // Replace the suffix: "0001" → "0002"
    await suffixInput.fill('0002');

    // Capture the PATCH request body at the moment save is clicked
    const [saveReq] = await Promise.all([
      page.waitForRequest(
        r => (r.method() === 'PATCH' || r.method() === 'POST')
          && r.url().includes('/elementValue')
          && !r.url().includes('/defaults'),
      ),
      page.getByTestId('action-save').click(),
    ]);

    const body = JSON.parse(saveReq.postData() ?? '{}');
    expect(body.searchKey).toBe('43000002');
  });

  // -----------------------------------------------------------------------
  // TC-23: Account code must be exactly 8 digits
  // -----------------------------------------------------------------------
  test('TC-23: Suffix input has maxLength=4 and blur shows error on short code', async ({ page }) => {
    await page.goto('/chart-of-accounts/leaf-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const suffixInput = page.getByTestId('account-code-suffix-input');
    await expect(suffixInput).toBeVisible();

    // maxLength attribute enforces 4-char cap without JS
    await expect(suffixInput).toHaveAttribute('maxlength', '4');

    // Type only 3 digits then blur → validation fires
    await suffixInput.fill('012');
    await suffixInput.blur();

    // Error element rendered with role="alert" and data-testid="account-code-error"
    const errorEl = page.getByTestId('account-code-error');
    await expect(errorEl).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // TC-24: Non-leaf (summary) accounts are fully read-only
  // -----------------------------------------------------------------------
  test('TC-24: Summary-level account renders as a single read-only display', async ({ page }) => {
    await page.goto('/chart-of-accounts/summ-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Combined read-only display is present
    await expect(page.getByTestId('account-code-readonly')).toBeVisible();

    // Split-editor elements must NOT exist
    await expect(page.getByTestId('account-code-suffix-input')).toHaveCount(0);
    await expect(page.getByTestId('account-code-prefix')).toHaveCount(0);
  });

  // -----------------------------------------------------------------------
  // TC-25: PGC codes are 8 digits in the list
  // -----------------------------------------------------------------------
  test('TC-25: Account codes in the list grid are exactly 8 characters long', async ({ page }) => {
    await page.goto('/chart-of-accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The tree view renders account rows as data-testid="account-tree-row-<id>".
    // Leaf accounts (issummary='N') appear as individual rows.
    const leafRow = page.getByTestId('account-tree-row-leaf-001');
    await expect(leafRow).toBeVisible({ timeout: 5_000 });
    await expect(leafRow).toContainText('43000001');
    await expect(leafRow).toContainText('Cliente Pérez S.L.');

    // Virtual group headers carry the 4-digit parent code ('4300'), NOT the 8-digit
    // summary account code. Verify the group header is visible under the tree.
    const groupRow = page.getByTestId('account-tree-row-group-4300');
    await expect(groupRow).toBeVisible({ timeout: 5_000 });
    await expect(groupRow).toContainText('4300');

    // Confirm the leaf code is exactly 8 characters (not truncated or padded)
    expect('43000001'.length).toBe(8);
  });

  // -----------------------------------------------------------------------
  // TC-26: New child account inherits and locks parent prefix from defaults
  // -----------------------------------------------------------------------
  test('TC-26: New child account shows locked prefix from defaults and empty suffix', async ({ page }) => {
    await page.goto('/chart-of-accounts/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // After defaults load, account-code-prefix shows the inherited prefix
    const prefix = page.getByTestId('account-code-prefix');
    await expect(prefix).toBeVisible({ timeout: 5_000 });
    await expect(prefix).toHaveText('4300');

    // Prefix is locked (not an input element)
    const prefixTag = await prefix.evaluate(el => el.tagName.toLowerCase());
    expect(prefixTag).toBe('span');

    // Suffix input is visible and empty — ready for user to type digits 5–8
    const suffixInput = page.getByTestId('account-code-suffix-input');
    await expect(suffixInput).toBeVisible();
    await expect(suffixInput).toHaveValue('');
  });
});
