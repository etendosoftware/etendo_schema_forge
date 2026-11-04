/**
 * Shared mocks for the org-level fiscal configuration (`useFiscalConfig`).
 *
 * Originally extracted from the sif-buttons-fiscal-config spec (ETP-5087), which was
 * every spec that depends on the SII / TicketBAI / VERI*FACTU profile of the
 * globally-selected organization wires it the same way. Two things are needed,
 * and BOTH are easy to miss — a spec that forgets either one renders no fiscal
 * UI at all and looks like a feature regression:
 *
 *   1. `seedSelectedOrg()` — `login()` in `helpers/auth.js` seeds
 *      `sf_auth_token` / `sf_auth_user` / `sf_auth_selected_role`, but NOT
 *      `sf_auth_selected_org`. `useFiscalConfig` short-circuits to
 *      `profile: 'unconfigured'` when the org id is falsy, so without this the
 *      fiscal columns/buttons never render.
 *   2. `installFiscalProfileMocks()` — the generic `**\/sws\/**` catch-all that
 *      `login()` installs answers GETs with an UNWRAPPED
 *      `{"data":[],"totalRows":0}`, while `useFiscalConfig` reads
 *      `json?.response?.data`. The config fetches must be answered with the
 *      `response.data` envelope, which is what these routes do.
 *
 * Route registration order matters: call `seedSelectedOrg()` BEFORE `login()`
 * (init scripts run in registration order, before React boots) and
 * `installFiscalProfileMocks()` AFTER it (Playwright matches routes in reverse
 * registration order, so these specific routes must win over the catch-all).
 */

import { FISCAL_SYSTEM_CATALOG } from '../../../tools/app-shell/src/windows/custom/fiscal-config/__tests__/fiscalSystemCatalog.fixture.js';

export { FISCAL_SYSTEM_CATALOG };

export function responseData(data) {
  return JSON.stringify({ response: { data } });
}

/**
 * Seed the globally-selected organization that `useFiscalConfig(orgId)` keys on.
 * Must be called BEFORE `login(page)`.
 */
export async function seedSelectedOrg(page, { id = 'ORG_1', name = 'QA Mock Org' } = {}) {
  await page.addInitScript(([orgId, orgName]) => {
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: orgId, name: orgName }));
  }, [id, name]);
}

/**
 * Answer the three fiscal-config reads `useFiscalConfig` fires so the hook
 * resolves to the requested profile. Must be called AFTER `login(page)`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'sii'|'sii-navarra'|'tbai'|'sii+tbai'|'verifactu'|null} profile
 * @param {{territory?: string}} [options] TBAI territory written to
 *   `etsgSifTerritory`. Only `BIZKAIA` makes a PURCHASE document TBAI-eligible
 *   (Batuz/LROE) — see `shared/fiscalTargets.js`.
 */
export async function installFiscalProfileMocks(page, profile, { territory = 'GIPUZKOA' } = {}) {
  const siiRecord = profile === 'sii'
    ? { taxtype: 'IVA' }
    : profile === 'sii-navarra'
      ? { navarra: 'Y', taxtype: 'IVA' }
      : profile === 'sii+tbai'
        ? { guipuzcoa: 'Y', taxtype: 'IVA' }
        : null;

  const tbaiRecord = profile === 'tbai' || profile === 'sii+tbai'
    ? { etsgSifTerritory: territory, tbaisystemdate: '2026-05-08' }
    : null;

  const verifactuRecord = profile === 'verifactu'
    ? { tAXType: '01', nextSendWaitTime: '60' }
    : null;

  await page.route('**/sws/neo/sii-config/siiConfiguration?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(siiRecord ? [siiRecord] : []),
    });
  });

  await page.route('**/sws/neo/tbai-config/header?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(tbaiRecord ? [tbaiRecord] : []),
    });
  });

  await page.route('**/sws/neo/verifactu-config/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(verifactuRecord ? [verifactuRecord] : []),
    });
  });
}

// ── Organization fiscal actions (ETP-6053) ────────────────────────────────────
//
// The Fiscal Configuration window reads the territory × system rules from
// `GET /sii-config/siiConfiguration/{orgId}/action/fiscalSystemCatalog` and activates a
// billing system with `POST …/action/configureFiscalSystem` (the server builds the
// records). Without the catalog mock the generic `**/sws/**` stub answers an empty
// body: the manual screen then offers no system and the "Estado" panel shows no
// territory. Both routes end in `/action/<name>` — two segments past the org id — so
// they are matched with a `*` per segment (see the e2e guide's glob gotcha).

const ACTION_ROUTE = '**/sws/neo/sii-config/siiConfiguration/*/action/';

/**
 * Answer the fiscal catalog. Must be called AFTER `login(page)`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ catalog?: object, errorMessage?: string|null }} [options] - `errorMessage`
 *   makes the read fail with a NEO error body (HTTP 500).
 */
export async function installFiscalCatalogMock(page, { catalog = FISCAL_SYSTEM_CATALOG, errorMessage = null } = {}) {
  await page.route(`${ACTION_ROUTE}fiscalSystemCatalog**`, async (route) => {
    if (errorMessage) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: errorMessage, status: 500 } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: responseData(catalog) });
  });
}

/** The record systems each activated system creates. */
const RECORD_SYSTEMS = { SII: ['SII'], TBAI: ['TBAI'], 'SII+TBAI': ['SII', 'TBAI'], VERIFACTU: ['VERIFACTU'] };

/**
 * Answer `configureFiscalSystem`. Must be called AFTER `login(page)`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ ids?: Record<string, string>, refusal?: string|null, onCreate?: Function }} [options]
 *   `ids` maps a record system (SII / TBAI / VERIFACTU) to the id the action reports;
 *   `refusal` makes the action refuse with that message (HTTP 409); `onCreate(body)` runs
 *   after a successful activation (e.g. to make the config lists return the new record).
 * @returns {Promise<Array<object>>} the parsed request bodies, in call order
 */
export async function installConfigureFiscalSystemMock(page, { ids = {}, refusal = null, onCreate = null } = {}) {
  const bodies = [];
  await page.route(`${ACTION_ROUTE}configureFiscalSystem**`, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    bodies.push(body);
    if (refusal) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: refusal, status: 409 } }),
      });
      return;
    }
    const created = (RECORD_SYSTEMS[body.system] ?? []).map(system => ({
      system,
      id: ids[system] ?? `e2e-${system.toLowerCase()}-created`,
    }));
    onCreate?.(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { system: body.system, territory: body.territory ?? null, created } } }),
    });
  });
  return bodies;
}
