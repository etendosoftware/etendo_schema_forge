import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Razón Social (name) pre-fill on Person → Company switch (mocked).
 *
 * Behavior under test (ContactTypeToggle.handleSelect):
 *   Person → Company: pre-fills the Razón Social (`name`) field with the trimmed
 *   "First Last" — but ONLY if `name` is auto-owned (blank, or still equal to the
 *   last value we auto-wrote). If `name` holds a user/persisted value it is left
 *   untouched. It THEN clears the person fields `etgoFirstname`/`etgoLastname`
 *   (a company has no personal name; they are hidden in company mode).
 *   Company → Person: clears the Razón Social (`name`) — the backend rebuilds
 *   Name from first+last on save, so a company name would be stale — and resets
 *   the auto-fill tracker. All writes go into the DetailView editing state and
 *   are persisted only on Save.
 *
 * Mock mode only: installs a contacts businessPartner list/detail route on top
 * of the generic /sws/** mock that login() seeds, so it needs no backend.
 * Person-mode records hide `name` and show etgoFirstname/etgoLastname; Company
 * mode hides first/last and shows `name` — so we type first/last while in
 * Person mode, then switch to Company where `field-name` becomes visible.
 */

const ROWS = [
  {
    id: 'contact-blank',
    name: '',
    etgoFirstname: '',
    etgoLastname: '',
    etgoIsperson: true,
    'businessPartnerCategory$_identifier': 'General',
  },
  {
    id: 'contact-named',
    name: 'ACME Existing SL',
    etgoFirstname: '',
    etgoLastname: '',
    etgoIsperson: true,
    'businessPartnerCategory$_identifier': 'General',
  },
];

/**
 * Install a contacts businessPartner list/detail mock. Must run AFTER login()
 * — Playwright matches routes in reverse registration order, so this specific
 * route wins over the generic /sws/** stub.
 */
async function installContactsMock(page) {
  await page.route('**/sws/neo/contacts/businessPartner**', async (route) => {
    const req = route.request();
    const url = req.url();

    // Selector lookups (…/businessPartner/selectors/…) must fall through to the
    // generic login() mock which returns a synthetic item list.
    if (url.includes('/selectors/')) {
      return route.fallback();
    }

    const isDetail = /\/businessPartner\/[^/?]+/.test(url);

    if (req.method() === 'GET' && !isDetail) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
    }

    if (req.method() === 'GET' && isDetail) {
      const m = url.match(/\/businessPartner\/([^/?]+)/);
      const found = ROWS.find((r) => r.id === m?.[1]) ?? ROWS[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }

    // PATCH from the toggle (etgoIsperson persistence) → acknowledge.
    if (['PATCH', 'POST', 'PUT'].includes(req.method())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{}] }, success: true }),
      });
    }

    return route.fallback();
  });
}

async function openDetail(page, id) {
  await page.goto(`/contacts/${id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
}

// EntityForm text fields put `field-{key}` on the <input> element itself.
function nameInput(page) {
  return page.getByTestId('field-name');
}

async function switchToCompany(page) {
  // The toggle lives in the detail-view topbar. Its radio labels render as
  // "Persona"/"Empresa" (es_ES) via ui('Person')/ui('company'). Scope to the
  // detail view so the "Empresas" subset filter in the list is not matched.
  const detail = page.getByTestId('detail-view');
  await detail.getByText(/empresa|company/i).first().click();
}

async function switchToPersona(page) {
  // Sibling of switchToCompany — selects the "Persona"/"Person" radio, scoped
  // to the detail view so list-side controls are not matched.
  const detail = page.getByTestId('detail-view');
  await detail.getByText(/persona|person/i).first().click();
}

test.describe('Contacts — Razón Social pre-fill on Person → Company switch', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installContactsMock(page);
  });

  test('pre-fills name with "First Last" when name was blank', async ({ page }) => {
    await openDetail(page, 'contact-blank');

    // Person mode: first/last are visible, name is hidden.
    const first = page.getByTestId('field-etgoFirstname');
    const last = page.getByTestId('field-etgoLastname');
    await expect(first).toBeVisible();
    await expect(last).toBeVisible();

    await first.fill('Ada');
    await last.fill('Lovelace');
    // Commit the last field's value to the detail editing state.
    await last.blur();

    await switchToCompany(page);

    // Company mode: name (Razón Social) becomes visible and holds the derived value.
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('Ada Lovelace');
  });

  test('does NOT overwrite name when it already has a value', async ({ page }) => {
    await openDetail(page, 'contact-named');

    const first = page.getByTestId('field-etgoFirstname');
    const last = page.getByTestId('field-etgoLastname');
    await first.fill('Ada');
    await last.fill('Lovelace');
    await last.blur();

    await switchToCompany(page);

    // name was pre-populated → must remain untouched.
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('ACME Existing SL');
  });

  test('re-syncs while auto-owned, clears person fields on each direction, and respects a manual edit', async ({ page }) => {
    await openDetail(page, 'contact-blank');

    const first = page.getByTestId('field-etgoFirstname');
    const last = page.getByTestId('field-etgoLastname');
    await expect(first).toBeVisible();
    await expect(last).toBeVisible();

    // 1) Blank name → type first/last → switch to Empresa: auto-fills "Ada Lovelace".
    await first.fill('Ada');
    await last.fill('Lovelace');
    await last.blur();
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('Ada Lovelace');

    // 2) Back to Persona. The previous Person → Company switch CLEARED the person
    //    fields, so first/last are now empty. Re-type them, then switch to Empresa
    //    again: `name` was cleared by the Company → Person switch, so it is
    //    auto-owned (blank) and re-syncs to the new "Ada Byron".
    await switchToPersona(page);
    await expect(first).toBeVisible();
    await expect(last).toBeVisible();
    await expect(first).toHaveValue('');
    await expect(last).toHaveValue('');
    await first.fill('Ada');
    await last.fill('Byron');
    await last.blur();
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('Ada Byron');

    // 3) Manual-edit respect WITHIN company mode (no trip through Persona). Hand-
    //    edit the Razón Social to a bespoke value → user-owned. Re-clicking the
    //    already-selected Empresa radio must NOT overwrite it: first/last were
    //    cleared on the last Person → Company switch, so there is nothing to
    //    auto-fill from and the value is user-owned.
    await nameInput(page).fill('ACME SL');
    await nameInput(page).blur();
    await switchToCompany(page);
    await expect(nameInput(page)).toHaveValue('ACME SL');

    // 4) Company → Person clears the Razón Social: go to Persona, then back to
    //    Empresa with blank first/last → `name` is empty (the person switch wiped
    //    the manual "ACME SL", and there is no first/last to derive a new value).
    await switchToPersona(page);
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('');
  });
});
