import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Advanced filter builder — apply / save preset (mocked). ETP-5007.
 *
 * Three regressions of the builder's Apply + "save as preset" rules:
 *   1. Removing the last condition must leave Apply usable, so the filter
 *      currently applied to the grid can actually be dropped.
 *   2. Saving a preset persists the DRAFT the user configured, even when they
 *      never pressed Apply (it used to persist the applied filter instead).
 *   3. A half-written condition blocks the save — loading a preset applies it,
 *      so a preset must be something that could have been applied.
 *
 * Mock mode only: window-specific routes are installed on top of the generic
 * /sws/** mock seeded by login(), so no backend is needed. `contacts` exposes
 * its main tab as the `businessPartner` entity, not `header`.
 */

const WINDOW = 'contacts';
const ENTITY = 'businessPartner';

const ROWS = [
  { id: 'bp-001', name: 'ACME Corp', etgoEmail: 'acme@example.com', etgoPhone: '111', customer: true, vendor: false },
  { id: 'bp-002', name: 'Globex SA', etgoEmail: 'globex@example.com', etgoPhone: '222', customer: true, vendor: false },
];

/** List + detail mock. Two separate routes on purpose — see the `word**` gotcha
 * in docs/e2e-testing-guide.md; a bare `entity**` glob never matches `entity/{id}`. */
async function installEntityMock(page) {
  const handler = async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    const detail = new RegExp(`/${ENTITY}/[^/?]+`).test(url);
    if (detail) {
      const m = url.match(new RegExp(`/${ENTITY}/([^/?]+)`));
      const found = ROWS.find((r) => r.id === m?.[1]) ?? ROWS[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
    });
  };
  await page.route(`**/sws/neo/${WINDOW}/${ENTITY}/**`, handler);
  await page.route(`**/sws/neo/${WINDOW}/${ENTITY}**`, handler);
}

/**
 * Preset endpoints (`useWindowFilterPresets`). These MUST be mocked separately:
 * the generic catch-all answers a GET with `{ data: [], totalRows: 0 }`, which
 * the hook would happily read as two presets named "data" and "totalRows".
 * Returns a live array collecting every write the UI performs.
 */
async function installPresetMock(page, initialPresets = {}) {
  const writes = [];
  const handler = async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'PUT' || method === 'DELETE') {
      writes.push({
        method,
        name: decodeURIComponent(req.url().split('/').pop()),
        body: method === 'PUT' ? JSON.parse(req.postData() || 'null') : null,
      });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(initialPresets),
    });
  };
  await page.route(`**/sws/neo/filters/${WINDOW}/**`, handler);
  await page.route(`**/sws/neo/filters/${WINDOW}**`, handler);
  return writes;
}

async function openBuilder(page) {
  await page.getByTestId('filter-advanced').click();
  await expect(page.getByTestId('advanced-filter-apply')).toBeVisible();
}

/** Picks an option out of the Radix Select the trigger belongs to. */
async function chooseOption(page, trigger, nameRe) {
  await trigger.click();
  await page.getByRole('option', { name: nameRe }).first().click();
}

/** The column the `/nombre|name/i` option matches first in the contacts list. */
const FIELD_KEY = 'etgoFirstname';

/** Fills row 0 with "<Nombre> contains <value>". Leaves the panel open. */
async function fillFirstCondition(page, value) {
  const row = page.getByTestId('advanced-filter-row-0');
  await chooseOption(page, row.getByTestId('advanced-filter-field'), /nombre|name/i);
  await chooseOption(page, row.getByTestId('advanced-filter-operator'), /^contiene$|^contains$/i);
  await row.locator('input').first().fill(value);
}

test.describe('Advanced filter — apply and save preset (ETP-5007)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installEntityMock(page);
    await page.goto(`/${WINDOW}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('removing the last condition leaves Apply usable, so the filter can be dropped', async ({ page }) => {
    await installPresetMock(page);
    await openBuilder(page);
    await fillFirstCondition(page, 'ACME');

    const apply = page.getByTestId('advanced-filter-apply');
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(apply).toBeHidden();

    // Reopen and delete the only condition. The builder re-seeds one pristine
    // empty row — Apply must stay enabled so the applied filter can be cleared.
    await openBuilder(page);
    await page.getByLabel('Remove condition').first().click();
    await expect(page.getByTestId('advanced-filter-row-0')).toBeVisible();
    await expect(page.getByTestId('advanced-filter-apply')).toBeEnabled();

    await page.getByTestId('advanced-filter-apply').click();
    await expect(page.getByTestId('advanced-filter-apply')).toBeHidden();
  });

  test('saving a preset persists the draft even when Apply was never pressed', async ({ page }) => {
    const writes = await installPresetMock(page);
    await openBuilder(page);
    await fillFirstCondition(page, 'ACME');

    // Deliberately NOT clicking Apply — this is the reported bug.
    await page.getByTestId('advanced-filter-presets-menu').click();
    await page.getByTestId('advanced-filter-save-preset').click();
    await page.getByTestId('preset-name-input').fill('Draft only');

    const putRequest = page.waitForRequest(
      (r) => r.url().includes(`/sws/neo/filters/${WINDOW}/`) && r.method() === 'PUT',
    );
    await page.getByTestId('preset-save-confirm').click();
    await putRequest;

    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('Draft only');
    const condition = writes[0].body.advancedFilter.conditions[0];
    expect(condition).toMatchObject({ field: FIELD_KEY, operator: 'iContains', value: 'ACME' });
  });

  test('saving is blocked while a condition is half-written', async ({ page }) => {
    const writes = await installPresetMock(page);
    await openBuilder(page);

    // Field picked, no operator and no value: started, not complete.
    const row = page.getByTestId('advanced-filter-row-0');
    await chooseOption(page, row.getByTestId('advanced-filter-field'), /nombre|name/i);

    await page.getByTestId('advanced-filter-presets-menu').click();
    await expect(page.getByTestId('save-preset-blocked-reason')).toBeVisible();
    const saveItem = page.getByTestId('advanced-filter-save-preset');
    await expect(saveItem).toHaveAttribute('data-disabled', /.*/);

    await saveItem.click({ force: true });
    await expect(page.getByTestId('preset-name-input')).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });
});
