import { registerFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { classifyCandidates } from '@etendosoftware/app-shell-core/lib/import/resolveForeignKeys.js';

import { authHeaders } from '@/auth/api.js';
registerFkResolver('contacts-country', async (value, { token, simSearchFn = simSearch }) => {
  const [result] = await simSearchFn({ token, entityName: 'Country', items: [value], qtyResults: 5 });
  return classifyCandidates(result?.candidates ?? []);
});

async function defaultFetchRegionCountryId(regionId, token, apiBaseUrl) {
  if (!regionId || !token) return null;
  const contactsBase = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/contacts') : '/sws/neo/contacts';
  const where = `id='${String(regionId).replace(/'/g, "''")}'`;
  const url = `${contactsBase}/region?_neoWhere=${encodeURIComponent(where)}&limit=1`;
  try {
    const res = await fetch(url, { headers: authHeaders(token) });
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
registerFkResolver('contacts-region', async (value, { token, countryId, apiBaseUrl, simSearchFn = simSearch, fetchRegionCountryId = defaultFetchRegionCountryId }) => {
  const [result] = await simSearchFn({ token, entityName: 'Region', items: [value], qtyResults: 10 });
  const candidates = result?.candidates ?? [];
  const candidateCountryIds = await Promise.all(
    candidates.map((candidate) => fetchRegionCountryId(candidate.id, token, apiBaseUrl)),
  );
  const scoped = candidates.filter((_, i) => candidateCountryIds[i] === countryId);
  return classifyCandidates(scoped);
});
