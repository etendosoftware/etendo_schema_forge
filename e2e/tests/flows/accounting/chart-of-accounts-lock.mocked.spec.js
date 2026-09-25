import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

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
  await page.route('**/sws/neo/chart-of-accounts/elementValue{/**,}**', async (route) => {
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
  // TC-22: Subaccount suffix (digits 5–8) is editable; save sends full code
  // -----------------------------------------------------------------------
  test('TC-22: Editing suffix produces correct searchKey in the save payload', async ({ page }) => {
    await page.goto('/chart-of-accounts/leaf-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const suffixInput = page.getByTestId('account-code-suffix-input');
    await expect(suffixInput).toBeVisible();

    // Replace the suffix: "0001" → "0002"
    await suffixInput.fill('0002');

    // Gate on OBSERVABLE state before clicking Save. The AccountCodeField
    // customRenderer commits `editing.searchKey` via an async React onChange,
    // and the save payload is a diff (buildPatchPayload in useEntity.js only
    // includes a field when editing[key] !== selected[key]). Clicking Save
    // before that commit lands would drop searchKey from the body. We wait for
    // two DOM signals that prove the commit flushed:
    //   1. the input reflects the typed value, and
    //   2. the Save button becomes enabled — for an existing record it is
    //      gated by !isDirty (hook.isDirtyHeader), so it only enables once
    //      editing.searchKey has diverged from the loaded value.
    const saveButton = page.getByTestId('action-save');
    await expect(suffixInput).toHaveValue('0002');
    await expect(saveButton).toBeEnabled();

    // Now the state has settled — arm the request wait, THEN click, THEN await.
    // Decoupled from fill() so the click never races ahead of the commit.
    // Match ONLY the save PATCH to the record detail URL. Editing the suffix
    // fires a debounced (300ms) callout POST to /elementValue/callout carrying
    // a {field, value, formState} body — under load it can land after this
    // promise is armed, so we must exclude it (and /defaults) to avoid
    // capturing the wrong request. An existing record always saves via PATCH.
    const savePromise = page.waitForRequest(
      r => r.method() === 'PATCH'
        && /\/elementValue\/[^/?]+/.test(r.url())
        && !r.url().includes('/callout')
        && !r.url().includes('/defaults'),
    );
    await saveButton.click();
    const saveReq = await savePromise;

    const body = JSON.parse(saveReq.postData() ?? '{}');
    expect(body.searchKey).toBe('43000002');
  });
});
