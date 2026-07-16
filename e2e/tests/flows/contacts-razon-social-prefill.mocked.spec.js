import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Razón Social (name) pre-fill on Person → Company switch (mocked).
 *
 * Behavior under test (ContactTypeToggle.handleSelect):
 *   When a contact is in Person mode and the user has typed a first/last name,
 *   switching the type toggle to Company (Empresa) pre-fills the Razón Social
 *   (`name`) field with "First Last" — but ONLY if `name` was blank. If `name`
 *   already holds a value it is left untouched.
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

  test('re-syncs on a later switch while auto-owned, then respects a manual edit', async ({ page }) => {
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

    // 2) Back to Persona, change the last name, switch to Empresa again. The
    //    Razón Social is still owned by auto (unchanged since the last write), so
    //    it MUST re-sync to the new "Ada Byron".
    await switchToPersona(page);
    await expect(last).toBeVisible();
    await last.fill('Byron');
    await last.blur();
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('Ada Byron');

    // 3) In Empresa, hand-edit the Razón Social to a bespoke value → user-owned.
    await nameInput(page).fill('ACME SL');
    await nameInput(page).blur();

    // 4) Back to Persona, change the last name again, switch to Empresa. The
    //    manual edit must be respected — `name` stays "ACME SL".
    await switchToPersona(page);
    await expect(last).toBeVisible();
    await last.fill('Turing');
    await last.blur();
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('ACME SL');
  });
});
