import { registerFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { classifyCandidates } from '@etendosoftware/app-shell-core/lib/import/resolveForeignKeys.js';
// Relative, not `@/lib/...`: this module is reachable from plain `node --test`
// through the descriptor, and Node cannot resolve the Vite alias.
import { readCredentialHeaders } from '../../../lib/sessionHeaders.js';

registerFkResolver('contacts-country', async (value, { simSearchFn = simSearch }) => {
  const [result] = await simSearchFn({ entityName: 'Country', items: [value], qtyResults: 5 });
  return classifyCandidates(result?.candidates ?? []);
});

// ETP-4576 — this used to bail on `!token` and hand-build `Authorization:
// Bearer`. Under a cookie session no token is ever held, so the guard turned
// every region lookup into `null`, every candidate got filtered out as
// belonging to another country, and a perfectly valid region came back as
// "needs review". The credential now comes from the active scheme, which is
// empty-but-correct under cookie because the browser sends the `__Host-` one.
async function defaultFetchRegionCountryId(regionId, apiBaseUrl) {
  if (!regionId) return null;
  const contactsBase = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/contacts') : '/sws/neo/contacts';
  const where = `id='${String(regionId).replace(/'/g, "''")}'`;
  const url = `${contactsBase}/region?_neoWhere=${encodeURIComponent(where)}&limit=1`;
  try {
    const res = await fetch(url, { credentials: 'include', headers: readCredentialHeaders() });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    return data[0]?.country || null;
  } catch (e) {
    return null;
  }
}

/**
 * Region names collide across countries (e.g. "Córdoba" exists in both Argentina and
 * Spain), so a plain distinct-value simSearch isn't enough — verified against the
 * schema: `simSearch`'s webhook has no way to scope the query by a second column, and
 * `C_Region` rows carry their own `c_country_id`. This resolver runs the free-text
 * search unscoped, then keeps only the candidates whose own country matches the row's
 * already-resolved country before classifying — `fetchRegionCountryId` is injected so
 * tests never need a real NEO fetch.
 */
registerFkResolver('contacts-region', async (value, { countryId, apiBaseUrl, simSearchFn = simSearch, fetchRegionCountryId = defaultFetchRegionCountryId }) => {
  const [result] = await simSearchFn({ entityName: 'Region', items: [value], qtyResults: 10 });
  const candidates = result?.candidates ?? [];
  const candidateCountryIds = await Promise.all(
    candidates.map((candidate) => fetchRegionCountryId(candidate.id, apiBaseUrl)),
  );
  const scoped = candidates.filter((_, i) => candidateCountryIds[i] === countryId);
  return classifyCandidates(scoped);
});
