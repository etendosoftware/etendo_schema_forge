import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Organization save — regression suite for ETP-5112 (mocked).
 *
 * The "Organización" screen (`/organization`) is the only screen that writes TWO
 * entities in a single save — `AD_Org` (spec entity `organization`) and `AD_OrgInfo`
 * (spec entity `information`) — and that made it the first screen to reproduce two
 * chained defects. Both are guarded here.
 *
 * Bug 1 — 400 `missing_updated`.
 *   ETP-5073 made the backend require the `updated` optimistic-locking token of the
 *   record as it was read. The token was only remembered by `useEntity`, so every
 *   panel that reads with `apiFetch` directly (this one) patched without it and the
 *   server refused the write. Fixed centrally in `@etendosoftware/app-shell-core`
 *   (`auth/api.js` now harvests the token on every GET). Covered by
 *   "PATCH carries the updated token …".
 *
 * Bug 1b — the token cache must be keyed by (entity, id), not by id alone.
 *   In Etendo, `AD_Org` and `AD_OrgInfo` SHARE the same primary key value, so this
 *   screen reads two different records under one id. With an id-only cache the second
 *   GET overwrote the first record's token and one of the two PATCHes went out with
 *   the other record's version. Covered by "each entity sends its own token …".
 *
 * Bug 2 — 500 false concurrency conflict.
 *   Once bug 1 was fixed, the two PATCHes (then fired with `Promise.all`) landed on two
 *   Tomcat threads in the same millisecond, and core's `JsonToDataConverter` parses the
 *   `updated` token through a `private final static SimpleDateFormat` — which is not
 *   thread-safe. The two parses corrupted each other and one write came back 500 with
 *   "The record you are saving has already been changed by another user", against a
 *   record nobody else had touched. Fixed in `useOrganizationData.js` by awaiting the
 *   two PATCHes in sequence. Covered by "the two PATCH requests never overlap".
 *
 *   That test deliberately asserts NON-OVERLAP (second request starts after the first
 *   one finished), not arrival order: `Promise.all` also fires them in order, so an
 *   order-only assertion would pass against the exact bug this spec exists to catch.
 *
 * Mock mode only — this spec installs entity-specific routes on top of the generic
 * `/sws/**` mock that `login()` seeds, so it needs no backend.
 * Run with: `cd e2e && npx playwright test tests/flows/organization-save.mocked.spec.js`
 */

// AD_Org and AD_OrgInfo share this id on purpose — that is the real Etendo shape and
// the whole point of the per-entity token assertions below.
const ORG_ID = 'e2e-org-0001';

// Deliberately different, and deliberately not date-shaped: the client must forward
// whatever opaque string the read returned, and a crossed token has to be obvious in
// the failure message rather than "two timestamps that look alike".
const ORG_TOKEN = 'ORG-2026-09-01T11:45:37+00:00';
const INFO_TOKEN = 'INFO-2026-09-01T11:45:37+00:00';

const headerRecord = (updated) => ({
  id: ORG_ID,
  name: 'E2E Organización',
  socialName: 'E2E Nombre Comercial',
  etgoBusinessType: '',
  'currency$_identifier': 'EUR',
  updated,
});

const infoRecord = (updated) => ({
  id: ORG_ID,
  taxID: 'B12345678',
  locationAddress: 'e2e-location-0001',
  'locationAddress$_identifier': 'Calle Falsa - 123 - 28001 - Madrid - España',
  yourCompanyDocumentImage: '',
  etgoEmail: 'e2e@example.com',
  etgoPhone: '600000000',
  etgoWeb: '',
  updated,
});

/**
 * Installs GET/PATCH mocks for both entities of the `organization` spec and returns a
 * journal the tests assert on.
 *
 * Two routes per entity, never one: a glob ending in a bare `word**` does NOT cross a
 * `/`, so `…/organization**` alone would match neither `/organization/<id>` nor any
 * sub-route, and the request would silently fall through to `login()`'s `/sws/**`
 * catch-all. See docs/e2e-testing-guide.md § "Gotcha: a route pattern ending in a bare
 * `word**`".
 *
 * MUST be called AFTER `login()` — Playwright matches routes in reverse registration
 * order, so the generic stub would otherwise win.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{orgPatchDelayMs?: number, orgPatchStatus?: number}} [options]
 *   `orgPatchDelayMs` holds the `organization` PATCH open for that long, which is what
 *   makes an overlap observable at all: without it two concurrent writes and two
 *   serialized writes produce indistinguishable timestamps.
 */
async function installOrganizationMock(page, options = {}) {
  const { orgPatchDelayMs = 0, orgPatchStatus = 200 } = options;

  /** @type {{patches: Array<{entity: string, body: any, startedAt: number, finishedAt: number}>}} */
  const journal = { patches: [] };

  const handlerFor = (entity) => async (route) => {
    const request = route.request();
    const method = request.method();
    const updated = entity === 'organization' ? ORG_TOKEN : INFO_TOKEN;
    const record = entity === 'organization' ? headerRecord(updated) : infoRecord(updated);

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [record] } }),
      });
      return;
    }

    if (method === 'PATCH') {
      const startedAt = Date.now();
      let body = null;
      try {
        body = JSON.parse(request.postData() ?? 'null');
      } catch {
        // A non-JSON body is a failure the assertions should surface as `null`, not
        // as an exception inside the route handler (which Playwright reports as an
        // unrelated "route was not handled" error).
      }
      const status = entity === 'organization' ? orgPatchStatus : 200;
      if (entity === 'organization' && orgPatchDelayMs > 0) {
        await new Promise((resolve) => { setTimeout(resolve, orgPatchDelayMs); });
      }
      const finishedAt = Date.now();
      journal.patches.push({ entity, body, startedAt, finishedAt });
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { response: { data: [record] } }
            : { error: { message: 'The record you are saving has already been changed by another user' } },
        ),
      });
      return;
    }

    await route.fallback();
  };

  for (const entity of ['organization', 'information']) {
    await page.route(`**/sws/neo/organization/${entity}/**`, handlerFor(entity));
    await page.route(`**/sws/neo/organization/${entity}**`, handlerFor(entity));
  }

  return journal;
}

/**
 * `OrganizationPage` reads its record id from `useAuth().selectedOrg`, which `login()`
 * does not seed (it only seeds token + role). Without this the page has no orgId, never
 * fetches, and renders an empty form with no save button.
 */
async function seedSelectedOrg(page) {
  await page.addInitScript((orgId) => {
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: orgId, name: 'E2E Organización' }));
  }, ORG_ID);
}

async function openOrganization(page, options) {
  await login(page);
  await seedSelectedOrg(page);
  const journal = await installOrganizationMock(page, options);
  await page.goto('/organization');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('OrganizationPage__phone')).toBeVisible({ timeout: 15_000 });
  return journal;
}

/** Edits the phone field (a free-text, always-optional field) so the save bar appears. */
async function editPhoneAndSave(page, value) {
  const phone = page.getByTestId('OrganizationPage__phone');
  await phone.fill(value);
  const save = page.getByTestId('OrganizationPage__save');
  await expect(save).toBeVisible();
  await save.click();
}

/** The PATCH the journal recorded for one entity, with a message that names the entity. */
function patchFor(journal, entity) {
  const found = journal.patches.find((p) => p.entity === entity);
  expect(found, `Expected a PATCH to the "${entity}" entity, got: ${JSON.stringify(journal.patches.map((p) => p.entity))}`).toBeTruthy();
  return found;
}

test.describe('Organization save — ETP-5112', () => {
  test('PATCH carries the updated token harvested from the GET (bug 1: 400 missing_updated)', async ({ page }) => {
    const journal = await openOrganization(page);

    await editPhoneAndSave(page, '600111222');
    await expect.poll(() => journal.patches.length, { timeout: 15_000 }).toBe(2);

    // Both entities must forward a token; a missing one is exactly what the server
    // answers 400 `missing_updated` to.
    for (const entity of ['organization', 'information']) {
      const patch = patchFor(journal, entity);
      expect(
        patch.body?.updated,
        `PATCH /${entity}/${ORG_ID} went out without an \`updated\` token — the server answers 400 missing_updated. Body: ${JSON.stringify(patch.body)}`,
      ).toBeTruthy();
    }

    expect(patchFor(journal, 'organization').body.updated).toBe(ORG_TOKEN);
  });

  test('each entity sends its own token, never the other one (bug 1b: cache keyed by entity+id)', async ({ page }) => {
    const journal = await openOrganization(page);

    await editPhoneAndSave(page, '600333444');
    await expect.poll(() => journal.patches.length, { timeout: 15_000 }).toBe(2);

    const orgPatch = patchFor(journal, 'organization');
    const infoPatch = patchFor(journal, 'information');

    // AD_Org and AD_OrgInfo share ORG_ID, so an id-only version cache would make the
    // second read clobber the first and one of these two would carry the wrong token.
    expect(
      orgPatch.body.updated,
      'PATCH /organization must carry the token returned by GET /organization, not the one from GET /information',
    ).toBe(ORG_TOKEN);
    expect(
      infoPatch.body.updated,
      'PATCH /information must carry the token returned by GET /information, not the one from GET /organization',
    ).toBe(INFO_TOKEN);
  });

  test('the two PATCH requests never overlap (bug 2: 500 false concurrency conflict)', async ({ page }) => {
    // 150ms is long enough that a concurrent second request would demonstrably start
    // inside the first one's window, and short enough not to slow the suite down.
    const journal = await openOrganization(page, { orgPatchDelayMs: 150 });

    await editPhoneAndSave(page, '600555666');
    await expect.poll(() => journal.patches.length, { timeout: 15_000 }).toBe(2);

    const orgPatch = patchFor(journal, 'organization');
    const infoPatch = patchFor(journal, 'information');

    // Arrival ORDER is not the property under test — `Promise.all` also dispatches in
    // order. The property is that the second request starts only once the first one has
    // been answered, so the two never sit on two Tomcat threads at the same instant.
    expect(
      infoPatch.startedAt,
      `The two PATCHes overlapped: /information started at +${infoPatch.startedAt - orgPatch.startedAt}ms while /organization was still open (it finished at +${orgPatch.finishedAt - orgPatch.startedAt}ms). They must be awaited in sequence — see useOrganizationData.js save().`,
    ).toBeGreaterThanOrEqual(orgPatch.finishedAt);
  });

  test('a failing PATCH is reported and leaves the screen usable', async ({ page }) => {
    const journal = await openOrganization(page, { orgPatchStatus: 500 });

    await editPhoneAndSave(page, '600777888');
    await expect.poll(() => journal.patches.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Sonner v2 marks each toast with data-type — see docs/e2e-testing-guide.md.
    await expect(page.locator('[data-type="error"]')).toBeVisible({ timeout: 10_000 });

    // The screen must survive the failure: the unsaved edit is still there and the save
    // bar is still actionable, so the user can retry.
    await expect(page.getByTestId('OrganizationPage__phone')).toHaveValue('600777888');
    await expect(page.getByTestId('OrganizationPage__save')).toBeEnabled();
  });
});
