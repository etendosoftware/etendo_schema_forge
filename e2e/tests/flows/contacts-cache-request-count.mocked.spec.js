import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts client-cache — request-amplification counter (mocked). ETP-4564 / SEC T-01.
 *
 * ── What this measures ────────────────────────────────────────────────────
 * It drives a deterministic Contacts flow (list → detail → child tabs →
 * attachments → back → reopen) while intercepting every `/sws/**` request and
 * counting hits per COARSE endpoint label. The per-endpoint counts are printed
 * at the end (console + attached to the Playwright report) so we can capture
 * before/after evidence for the shared-cache migration.
 *
 * Endpoints counted (GET reads only):
 *   list:businessPartner          GET .../contacts/businessPartner            (no /:id)
 *   record:businessPartner        GET .../contacts/businessPartner/:id
 *   child:{contact|bankAccount|locationAddress|customerAccounting|vendorAccounting}
 *                                 GET .../contacts/{entity}?parentId=...
 *   kpi:bp-stats                  GET .../contacts/bp-stats?businessPartnerId=...
 *   kpi:bp-trend                  GET .../contacts/bp-trend?businessPartnerId=...
 *   attachments                   GET .../sws/neo/attachments/{table}/{recordId}
 *   selectors                     GET .../selectors/...
 *   defaults:businessPartner      GET .../contacts/businessPartner/defaults    (out of cache scope)
 *   child-defaults:{entity}       GET .../contacts/{entity}/defaults?parentId=  (out of cache scope)
 *
 * ── Before/after methodology (how to produce the evidence) ────────────────
 * Run THE SAME spec on two branches and diff the printed `counts` object:
 *
 *   # BEFORE  (base epic, pre-4564 — no shared cache for these read paths)
 *   git checkout epic/ETP-3504        # or the pre-4564 commit
 *   make dev &                        # published preview already ships app-shell-core/data
 *   cd e2e && npx playwright test tests/flows/contacts-cache-request-count.mocked.spec.js
 *
 *   # AFTER   (this branch, feature/ETP-4564 — reads routed through the cache)
 *   git checkout feature/ETP-4564
 *   make dev &
 *   cd e2e && npx playwright test tests/flows/contacts-cache-request-count.mocked.spec.js
 *
 * The delta is the win: on BEFORE, reopening the same contact re-issues the
 * record/children/KPI GETs (counts scale with the number of opens) and
 * attachments are fetched eagerly on detail open; on AFTER, reopening reuses the
 * cache (delta 0 within the 30s record-freshness window) and attachments are
 * requested only when the Attachments tab is activated.
 *
 * This file only needs to be GREEN on feature/ETP-4564. The assertions below
 * encode the AFTER wins (delta-0 on reopen, attachments lazy) — kept tolerant
 * (deltas, not exact equality) so React StrictMode double-effects (deduped by
 * the in-flight cache into a single network request) don't make them flaky.
 *
 * ── Harness / serving prereqs ─────────────────────────────────────────────
 * - Serve the app with `make dev` (http://localhost:3100). No BASE_URL → mock
 *   mode: login() seeds a fake token and a generic /sws/** mock; this spec
 *   installs a more-specific /sws/** route AFTER login() (Playwright matches
 *   routes LIFO) that both counts and fulfils the Contacts fixtures.
 * - The shared cache only engages when a DataProvider is mounted. On this
 *   branch app-shell-core/data resolves from the published preview package
 *   (node_modules/@etendosoftware/app-shell-core, 0.3.13-preview.*) that ships
 *   the `data` module, so plain `make dev` is enough — LOCAL_CORE is NOT
 *   required here. (LOCAL_CORE is only needed when the preview package predates
 *   the `data` export; run `make dev-local-core` in that case.)
 * - Run command used:
 *     cd e2e && npx playwright test tests/flows/contacts-cache-request-count.mocked.spec.js --project=mocked
 */

const CHILD_ENTITIES = ['contact', 'bankAccount', 'locationAddress', 'customerAccounting', 'vendorAccounting'];

// Two synthetic contacts. Contact A ("Contact Alpha") is the one reopened.
const ROWS = [
  { id: 'bp-alpha', name: 'Contact Alpha', searchKey: 'ALPHA', customer: true, vendor: false, etgoIsperson: 'N' },
  { id: 'bp-beta', name: 'Contact Beta', searchKey: 'BETA', customer: false, vendor: true, etgoIsperson: 'N' },
];
const CONTACT_A = ROWS[0];

const jsonBody = (route, obj) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(obj),
});

/**
 * Classify a /sws request into a coarse endpoint label (GET reads only).
 * Returns null for non-GET requests (writes are not read-amplification).
 */
function classify(url, method) {
  if (method !== 'GET') return null;
  const path = new URL(url).pathname;

  if (/\/sws\/neo\/attachments\//.test(path)) return 'attachments';
  if (path.includes('/selectors/')) return 'selectors';

  const m = path.match(/\/sws\/neo\/contacts\/([^/]+)(?:\/([^/?]+))?/);
  if (!m) return 'other';
  const [, seg0, seg1] = m;

  if (seg0 === 'bp-stats') return 'kpi:bp-stats';
  if (seg0 === 'bp-trend') return 'kpi:bp-trend';

  if (seg0 === 'businessPartner') {
    if (seg1 === 'defaults') return 'defaults:businessPartner';
    if (seg1) return 'record:businessPartner';
    return 'list:businessPartner';
  }
  if (CHILD_ENTITIES.includes(seg0)) {
    return seg1 === 'defaults' ? `child-defaults:${seg0}` : `child:${seg0}`;
  }
  return `other:${seg0}`;
}

/**
 * Install the counting + fixture route. Runs AFTER login() so it wins (LIFO).
 * Counts every classified GET, fulfils the Contacts read fixtures, and falls
 * back to login()'s generic mock for everything else (session, currency,
 * dashboard, selectors, writes).
 */
async function installCountingMock(page, counts) {
  const bump = (label) => { if (label) counts[label] = (counts[label] || 0) + 1; };

  await page.route('**/sws/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const label = classify(url, method);
    bump(label);

    if (method === 'GET') {
      if (label === 'list:businessPartner') {
        return jsonBody(route, { response: { data: ROWS, totalRows: ROWS.length } });
      }
      if (label === 'record:businessPartner') {
        const id = new URL(url).pathname.split('/businessPartner/')[1]?.split('/')[0];
        const rec = ROWS.find((r) => r.id === id) ?? ROWS[0];
        return jsonBody(route, { response: { data: [rec] } });
      }
      if (label?.startsWith('child:')) {
        return jsonBody(route, { response: { data: [] } });
      }
      if (label === 'kpi:bp-stats') {
        return jsonBody(route, { response: { data: [] } });
      }
      if (label === 'kpi:bp-trend') {
        return jsonBody(route, { response: { data: { labels: [], revenue: [], expenses: [] } } });
      }
      if (label === 'attachments') {
        return jsonBody(route, { items: [] });
      }
      if (label === 'defaults:businessPartner' || label?.startsWith('child-defaults:')) {
        return jsonBody(route, { defaults: {} });
      }
    }
    // selectors, session, dashboard, currency, writes → login()'s generic mock
    return route.fallback();
  });
}

// Deep-ish snapshot of the coarse counters.
const snap = (counts) => ({ ...counts });
const get = (o, k) => o[k] ?? 0;

test.describe('Contacts client-cache — request amplification (mocked)', () => {
  test('reopening a contact reuses the cache; attachments stay lazy', async ({ page }, testInfo) => {
    const counts = {};
    await login(page);
    await installCountingMock(page, counts);

    // ── Step 1: open the Contacts list ───────────────────────────────────
    await page.goto('/contacts');
    const rowA = page.locator('tbody tr').filter({ hasText: 'Contact Alpha' }).first();
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    const afterList = snap(counts);

    // ── Step 2: open contact A (detail) ──────────────────────────────────
    await rowA.click();
    await expect(page).toHaveURL(/\/contacts\/bp-alpha/);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
    // Let the eager detail reads (record + 5 children + KPIs) settle.
    await expect
      .poll(() => get(counts, 'record:businessPartner'), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => CHILD_ENTITIES.every((e) => get(counts, `child:${e}`) >= 1), { timeout: 10_000 })
      .toBe(true);

    // ── Step 3: visit each of the 5 child tabs ───────────────────────────
    // Children were fetched eagerly on detail open; clicking each tab must not
    // add child GETs (already-loaded + cache), so we snapshot after visiting.
    for (const entity of CHILD_ENTITIES) {
      const tab = page.getByTestId(`tab-${entity}`);
      await expect(tab).toBeVisible({ timeout: 10_000 });
      await tab.click();
    }
    const afterFirstOpen = snap(counts);

    // Attachments must NOT have been requested yet (lazy-load win).
    expect(get(afterFirstOpen, 'attachments')).toBe(0);

    // ── Step 4: open the Attachments tab ─────────────────────────────────
    const attTab = page.getByTestId('tab-custom:attachments');
    await expect(attTab).toBeVisible({ timeout: 10_000 });
    await attTab.click();
    await expect
      .poll(() => get(counts, 'attachments'), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    const afterAttachments = snap(counts);

    // ── Step 5: go back to the list (SPA history pop — keeps cache warm) ──
    // page.goBack() pops the react-router pushState nav WITHOUT a full document
    // reload, so the app-root DataProvider (and its cache) stays mounted.
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(rowA).toBeVisible({ timeout: 10_000 });

    // ── Step 6: reopen the SAME contact A ────────────────────────────────
    await rowA.click();
    await expect(page).toHaveURL(/\/contacts\/bp-alpha/);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    // Give any (unexpected) network reads a chance to fire before snapshotting.
    await page.waitForTimeout(500);
    const afterSecondOpen = snap(counts);

    // ── Step 7: switch organization — SKIPPED in the mocked harness ──────
    // In mock mode login() only seeds a token (sf_auth_token); it never
    // populates selectedRole/selectedOrg, and the topbar context switcher's
    // role/org comboboxes are sourced from a live environment listing that does
    // not exist here. There is no reachable UI to apply an org change, so this
    // step is not feasible and is intentionally skipped. (On a real backend the
    // org switch would change the DataProvider scope and clear the cache, so the
    // subsequent reopen would legitimately refetch everything.)

    // ── Step 8: open contact A again (bonus reopen) ──────────────────────
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(rowA).toBeVisible({ timeout: 10_000 });
    await rowA.click();
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const afterThirdOpen = snap(counts);

    // ── Report: print + attach per-endpoint counts ───────────────────────
    const report = {
      afterList,
      afterFirstOpen,
      afterAttachments,
      afterSecondOpen,
      afterThirdOpen,
      final: snap(counts),
    };
    // eslint-disable-next-line no-console
    console.log('CONTACTS_CACHE_COUNTS ' + JSON.stringify(report.final));
    // eslint-disable-next-line no-console
    console.log('CONTACTS_CACHE_REPORT ' + JSON.stringify(report, null, 2));
    await testInfo.attach('contacts-cache-request-counts.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    // ── Assertions: encode the AFTER (cached-branch) wins ────────────────

    // (a) Attachments are lazy: none before the tab, at least one after.
    expect(get(afterFirstOpen, 'attachments')).toBe(0);
    expect(get(afterAttachments, 'attachments')).toBeGreaterThanOrEqual(1);

    // (b) Reopening contact A does NOT re-issue the record GET (cache win).
    expect(get(afterSecondOpen, 'record:businessPartner'))
      .toBe(get(afterFirstOpen, 'record:businessPartner'));

    // (c) Reopening does NOT re-issue any of the 5 child GETs (cache win).
    for (const entity of CHILD_ENTITIES) {
      expect(get(afterSecondOpen, `child:${entity}`))
        .toBe(get(afterFirstOpen, `child:${entity}`));
    }

    // (d) Reopening does NOT re-issue the finance KPI GETs (cache win).
    expect(get(afterSecondOpen, 'kpi:bp-stats')).toBe(get(afterFirstOpen, 'kpi:bp-stats'));
    expect(get(afterSecondOpen, 'kpi:bp-trend')).toBe(get(afterFirstOpen, 'kpi:bp-trend'));

    // (e) The list GET is served from cache on the SPA return (no growth).
    expect(get(afterSecondOpen, 'list:businessPartner'))
      .toBe(get(afterFirstOpen, 'list:businessPartner'));

    // (f) A third reopen still adds no record/children/KPI reads.
    expect(get(afterThirdOpen, 'record:businessPartner'))
      .toBe(get(afterFirstOpen, 'record:businessPartner'));
    for (const entity of CHILD_ENTITIES) {
      expect(get(afterThirdOpen, `child:${entity}`))
        .toBe(get(afterFirstOpen, `child:${entity}`));
    }
  });
});
