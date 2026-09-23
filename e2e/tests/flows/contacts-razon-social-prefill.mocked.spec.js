import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Razón Social (name) pre-fill on Person → Company switch (mocked).
 *
 * Behavior under test (ContactTypeToggle.handleSelect). ETP-5350 made the toggle
 * DRAFT-PRESERVING: each type banks the other type's fields locally, so a round trip
 * before Save cannot destroy them.
 *   Person → Company: banks first/last and clears them from the active state (a
 *   company has no personal name, and they must not be sent). `name` is then filled
 *   from the banked company draft when the user owns it, or derived from the trimmed
 *   "First Last" when that draft is empty or was itself auto-derived.
 *   Company → Person: banks `name` and clears it from the active state — the backend
 *   rebuilds Name from first+last for a person — then restores the banked first/last.
 *   A derivation with nothing to derive from never erases a bank, which is what makes
 *   re-selecting the already-active Empresa a no-op rather than a silent erase.
 *   A record stored as a PERSON has no company bank: its `name` is the backend-derived
 *   "First Last", not a user-owned legal name, so it is re-derived rather than
 *   preserved. The preservation guarantee is asserted on a company record.
 *   All writes go into the DetailView editing state and are persisted only on Save.
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
  // ETP-4793 — the same two records with `etgoIsperson` in Etendo's raw char(1)
  // storage encoding instead of a JSON boolean. See the describe block at the
  // bottom of this file for why both shapes must be served.
  {
    id: 'contact-person-y-shape',
    name: '',
    etgoFirstname: '',
    etgoLastname: '',
    etgoIsperson: 'Y',
    'businessPartnerCategory$_identifier': 'General',
  },
  {
    id: 'contact-company-n-shape',
    name: 'ACME Raw Shape SL',
    etgoFirstname: '',
    etgoLastname: '',
    etgoIsperson: 'N',
    'businessPartnerCategory$_identifier': 'General',
  },
];

/**
 * Install a contacts businessPartner list/detail mock. Must run AFTER login()
 * — Playwright matches routes in reverse registration order, so this specific
 * route wins over the generic /sws/** stub.
 */
async function installContactsMock(page) {
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
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

    // Unified explicit Save (etgoIsperson now travels in the same request as
    // name/etgoFirstname/etgoLastname, via the editing state) → acknowledge.
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

  test('does NOT overwrite an existing company legal name on a Persona round trip', async ({ page }) => {
    // The record has to be stored as a COMPANY for `name` to be a legal name the user owns;
    // see the file docblock for why a person record is re-derived instead. This one is served
    // with `etgoIsperson: 'N'`.
    await openDetail(page, 'contact-company-n-shape');
    await expect(nameInput(page)).toHaveValue('ACME Raw Shape SL');

    // Company → Person banks the legal name and clears it from the active payload.
    await switchToPersona(page);
    const first = page.getByTestId('field-etgoFirstname');
    const last = page.getByTestId('field-etgoLastname');
    await expect(first).toBeVisible();
    await expect(last).toBeVisible();
    await first.fill('Ada');
    await last.fill('Lovelace');
    await last.blur();

    await switchToCompany(page);

    // The bank was never auto-derived, so it wins over the "Ada Lovelace" the person fields
    // would otherwise produce: a persisted legal name is never silently replaced.
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('ACME Raw Shape SL');
  });

  test('re-syncs an auto-derived name, restores the banked drafts, and respects a manual edit', async ({ page }) => {
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

    // 2) Back to Persona. The switch RESTORES the person fields the previous one banked, so
    //    first/last come back as "Ada"/"Lovelace" instead of empty. Correct only the surname:
    //    the company draft is still auto-derived, so it re-syncs to "Ada Byron".
    await switchToPersona(page);
    await expect(first).toBeVisible();
    await expect(last).toBeVisible();
    await expect(first).toHaveValue('Ada');
    await expect(last).toHaveValue('Lovelace');
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

    // 4) Company → Person → Company KEEPS the manual "ACME SL". Going to Persona clears it
    //    from the active payload but banks it, and because it differs from the last
    //    auto-derived value the bank is user-owned, so the return trip restores it verbatim
    //    instead of re-deriving. Losing it here was the pre-ETP-5350 behavior.
    await switchToPersona(page);
    await switchToCompany(page);
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('ACME SL');
  });
});

/**
 * ETP-4793 — `etgoIsperson` boolean shape tolerance on the record-read path.
 *
 * Etendo stores booleans as char(1) 'Y'/'N', and the three call sites that decide
 * Person vs Company each hand-roll `=== true || === 'Y'`
 * (`ContactTypeToggle.jsx:46`, `windows/custom/contacts/index.jsx:25`,
 * `ContactsTable.jsx:19`). `!!value` would be wrong: `!!'N'` is `true`, which
 * would open every company record in Person mode.
 *
 * This is a DIFFERENT surface from the one `canonicalizeBooleanDefaults` fixed.
 * That post-pass normalizes `/defaults` only (see
 * boolean-defaults-tolerance.mocked.spec.js) — a record GET is not touched, so a
 * raw 'Y'/'N' arriving here stays a live possibility and the guards must stay.
 * `ContactTypeToggle` has a vitest for the 'Y' case; nothing covered the 'N' trap,
 * and nothing covered either shape end-to-end through the real window.
 *
 * Person mode and Company mode are told apart by which fields render:
 * Person shows etgoFirstname/etgoLastname and hides `name`; Company is the
 * inverse — the same distinction the tests above rely on.
 */
