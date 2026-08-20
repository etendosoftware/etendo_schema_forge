import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Cost Center / Service Project — simple master window CRUD (ETP-4892, mocked).
 *
 * Both windows are onboarded from the same simple-master template (Search Key,
 * Name, Description, Active) — `cost-center` on `C_Costcenter`, `service-project`
 * on `C_Project`. This spec parametrizes the 4 ETP-4892 test cases that are
 * pure frontend contract behavior across both windows:
 *
 *   1. Create with Search Key + Name → saves with Active=true by default.
 *   2. Duplicate Search Key on create → friendly duplicate-record validation
 *      error (useEntity.js normalizeServerError → 'validationDuplicateRecord'),
 *      never a raw/technical backend message.
 *   3. Empty Name on save → client-side required-field validation blocks the
 *      save with NO network round trip (useEntity.js getMissingRequiredFields
 *      runs before any fetch on `isNew`).
 *   4. The list grid shows Search Key, Name and Active columns. NOTE: per the
 *      generated contract (artifacts/<window>/contract.json), Description has
 *      `grid: false` for both windows — it is a form-only field, not a grid
 *      column. This spec asserts the ACTUAL 3-column grid, not the 4-column
 *      grid implied by the Jira ticket text; see the test-generator report for
 *      this discrepancy.
 *
 * Case 5 (Active=false hidden from a consuming document's selector) is NOT
 * covered here — see docs/e2e-testing-guide.md and the test-generator's final
 * report for why: the filtering, if any, happens server-side (NEO Headless's
 * NeoSelectorService routes FK selectors through Etendo core's ComboTableData),
 * so a page.route() mock cannot prove or disprove it; only a live-backend spec
 * could, and that would exercise an unrelated consuming window (e.g.
 * simple-g-l-journal, match-rule, amortization) rather than these two windows.
 *
 * Mock mode only: login() seeds a fake token + generic /sws/** catch-all; this
 * spec installs more specific routes AFTER login() so they win (Playwright
 * matches routes in reverse registration order — see e2e-testing-guide.md).
 *
 * data-testid conventions used (EntityForm.jsx / ListView.jsx / DataTable.jsx):
 *  - `field-{fieldKey}`        → input/control for a form field
 *  - `error-{fieldKey}`        → inline required-field error under an input
 *  - `action-new`              → list "New" button
 *  - `action-save`             → save button (non-draftMode window)
 *  - `list-view` / `detail-view` → container elements
 *  - `column-header-{key}`     → grid column header cell (DataTable.jsx)
 */

const WINDOWS = [
  { spec: 'cost-center', entity: 'costCenter' },
  { spec: 'service-project', entity: 'serviceProject' },
];

const EXISTING_ROWS = [
  { id: 'row-001', searchKey: 'MW-001', name: 'Existing One', description: 'Desc one', active: true },
  { id: 'row-002', searchKey: 'MW-002', name: 'Existing Two', description: '', active: false },
];

/**
 * Install list/detail/defaults/create routes for the given window.
 * `onCreatePost` optionally overrides the default 200 success response for
 * the POST (used by the duplicate-key scenario to simulate a backend rejection).
 */
async function installMocks(page, { spec, entity }, { onCreatePost } = {}) {
  const rows = EXISTING_ROWS;

  // Bare route (list GET + create POST) registered FIRST.
  //
  // IMPORTANT — Playwright route ordering discovery (verified against the
  // pinned @playwright/test 1.58.2, see e2e/package.json): docs/e2e-testing-guide.md
  // documents a "two-route" fix (register the `/**` sub-path route FIRST,
  // then the bare `word**` route SECOND) for a DIFFERENT, older bug where a
  // glued `word**` allegedly never crosses a `/`. Empirically, in THIS
  // Playwright version `word**` DOES match sub-paths (`/word/subpath`,
  // `/word/anything`) — verified with an isolated `page.route()` repro
  // outside the app. Because Playwright matches routes LIFO (last
  // registered wins), registering the guide's documented order (sub-path
  // first, bare second) makes the bare handler swallow EVERY request,
  // including sub-paths, since it also matches them and was registered
  // last. The fix is the OPPOSITE registration order: register the bare
  // pattern FIRST and the more specific `/**` sub-path pattern SECOND, so
  // the specific one — which also still matches, and wins LIFO — takes
  // priority for sub-paths while the bare one still catches the top-level
  // list/create requests. Reported to the coordinator; docs/e2e-testing-guide.md
  // may need a follow-up correction/re-verification for the current pin.
  await page.route(`**/sws/neo/${spec}/${entity}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }
    if (req.method() === 'POST') {
      if (onCreatePost) {
        await route.fulfill(onCreatePost);
        return;
      }
      const body = req.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'saved-row-001', ...body }] } }),
      });
      return;
    }
    route.fallback();
  });

  // Sub-path route (detail GET by id, /defaults GET) registered SECOND so it
  // wins LIFO over the bare route above for any URL with a segment after
  // `${entity}/`.
  await page.route(`**/sws/neo/${spec}/${entity}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();

    if (/\/defaults(\?|$)/.test(url)) {
      // Mirrors NEO Headless resolving the AD_Column DB default ('Y') for the
      // boolean Isactive column on a brand-new record.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults: { active: 'Y' } }),
      });
      return;
    }

    const m = url.match(new RegExp(`/${entity}/([^/?]+)`));
    const found = rows.find(r => r.id === m?.[1]) ?? rows[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [found] } }),
    });
  });
}

for (const { spec, entity } of WINDOWS) {
  test.describe(`${spec} — master window CRUD (ETP-4892)`, () => {
    // ── Case 1: create with default Active=true ─────────────────────────────
    test('creates a new record with Search Key + Name and Active defaults to true', async ({ page }) => {
      await login(page);
      await installMocks(page, { spec, entity });
      await page.goto(`/${spec}/new`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      const searchKeyInput = page.getByTestId('field-searchKey');
      await expect(searchKeyInput).toBeVisible({ timeout: 10_000 });

      // Active checkbox reflects the server-resolved default ('Y') before any
      // user interaction — proves the default is Active=true, not just that
      // the save silently forces it.
      const activeCheckbox = page.getByTestId('field-active');
      await expect(activeCheckbox).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });

      await searchKeyInput.fill('MW-NEW-001');
      await page.getByTestId('field-name').fill('New Master Record');

      const saveBtn = page.getByTestId('action-save');
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });

      const postReqPromise = page.waitForRequest(
        (r) => r.url().includes(`/sws/neo/${spec}/${entity}`) && r.method() === 'POST',
        { timeout: 10_000 },
      );
      await saveBtn.click();
      const postReq = await postReqPromise;
      const payload = postReq.postDataJSON();
      const activeValue = payload?.active;
      expect(activeValue === true || activeValue === 'Y').toBe(true);

      await expect(page).toHaveURL(new RegExp(`/${spec}/(?!new)`), { timeout: 10_000 });
    });

    // ── Case 2: duplicate Search Key ────────────────────────────────────────
    test('shows a friendly duplicate-record error when Search Key already exists', async ({ page }) => {
      await login(page);
      await installMocks(page, {
        spec,
        entity,
      }, {
        onCreatePost: {
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'duplicate key value violates unique constraint "c_costcenter_value_client_org_uq"',
            },
          }),
        },
      });
      await page.goto(`/${spec}/new`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      await page.getByTestId('field-searchKey').fill('MW-001'); // matches EXISTING_ROWS[0]
      await page.getByTestId('field-name').fill('Duplicate Attempt');

      const saveBtn = page.getByTestId('action-save');
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
      await saveBtn.click();

      const errorToast = page.locator('[data-type="error"]').first();
      await expect(errorToast).toBeVisible({ timeout: 10_000 });
      const toastText = await errorToast.innerText();
      // validationDuplicateRecord — es_ES (mock-mode default locale) / en_US.
      expect(toastText).toMatch(/ya existe un registro con el mismo valor|a record with the same value already exists/i);
      // Never leak the raw Postgres constraint name to the user.
      expect(toastText).not.toMatch(/violates unique constraint|c_costcenter_value/i);

      // Save was rejected — stays on /new, no accidental navigation.
      expect(page.url()).toMatch(new RegExp(`/${spec}/new`));
    });

    // ── Case 3: empty required Name ──────────────────────────────────────────
    test('blocks save and shows a required-field error when Name is empty', async ({ page }) => {
      await login(page);
      await installMocks(page, { spec, entity });
      await page.goto(`/${spec}/new`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      await page.getByTestId('field-searchKey').fill('MW-NEW-002');
      // Name intentionally left empty.

      // No SAVE POST should ever be sent — this is a pure client-side gate
      // (useEntity.js getMissingRequiredFields runs before any fetch on isNew).
      //
      // The matcher below is scoped to the bare create URL (`/sws/neo/{spec}/{entity}`,
      // optionally followed by a query string) rather than a loose `.includes()` on that
      // prefix. A loose prefix match also catches `POST /sws/neo/{spec}/{entity}/evaluate-display`
      // — the unconditional, debounced (300ms) display-logic re-evaluation call fired by
      // useDisplayLogic.js on every field-value change, header AND lines, regardless of
      // window or isNew (see DetailView.jsx's `cacheableKeys: DIMENSION_MACRO_KEYS` — the
      // dimension-macro fields are always considered "cacheable" so the `!values.id` skip
      // never applies). That call has nothing to do with the required-field save gate, but
      // it lands within the debounce window of this test's searchKey fill + save click, so
      // a loose matcher flakes on exactly the same race for ANY window in this suite —
      // reproduced locally for both `cost-center` and `service-project` by widening the
      // window between the click and the assertion.
      const savePostUrlRe = new RegExp(`/sws/neo/${spec}/${entity}(\\?|$)`);
      let postSent = false;
      page.on('request', (r) => {
        if (savePostUrlRe.test(r.url()) && r.method() === 'POST') postSent = true;
      });

      const saveBtn = page.getByTestId('action-save');
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
      await saveBtn.click();

      const nameError = page.getByTestId('error-name');
      await expect(nameError).toBeVisible({ timeout: 5_000 });

      const toastLocator = page.locator('[data-sonner-toast]').first();
      await expect(toastLocator).toBeVisible({ timeout: 5_000 });

      // Still on /new — save was blocked before any network round trip.
      expect(page.url()).toMatch(new RegExp(`/${spec}/new`));
      expect(postSent).toBe(false);
    });

    // ── Case 4: grid columns ─────────────────────────────────────────────────
    test('list grid shows Search Key, Name and Active columns (no Description column)', async ({ page }) => {
      await login(page);
      await installMocks(page, { spec, entity });
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('column-header-searchKey')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('column-header-name')).toBeVisible();
      await expect(page.getByTestId('column-header-active')).toBeVisible();
      // Per contract.json, description has grid:false for both windows — it's
      // form-only. Documented discrepancy vs the Jira ticket's 4-column
      // description; see the header comment and the final report.
      await expect(page.getByTestId('column-header-description')).toHaveCount(0);
    });
  });
}
