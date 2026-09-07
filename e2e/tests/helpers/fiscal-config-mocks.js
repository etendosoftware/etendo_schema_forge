/**
 * Shared mocks for the org-level fiscal configuration (`useFiscalConfig`).
 *
 * Extracted from `tests/flows/sif-buttons-fiscal-config.spec.js` (ETP-5087) so
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
