import { registerFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { simSearchEveryLanguage } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { classifyCandidates } from '@etendosoftware/app-shell-core/lib/import/resolveForeignKeys.js';

// ETP-5350 — same defect as the product UoM, unreported: C_COUNTRY holds "Spain" on the
// base row and "España" only in its es_ES translation, so the country resolved for a
// Spanish session and was refused for an English one.
registerFkResolver('contacts-country', async (value, { token, simSearchFn = simSearchEveryLanguage }) => {
  const [result] = await simSearchFn({ token, entityName: 'Country', items: [value], qtyResults: 5 });
  return classifyCandidates(result?.candidates ?? []);
});

/*
 * There is deliberately NO region resolver here (ETP-4997).
 *
 * There was one, and it could not work. Region names collide across countries ("Córdoba" is
 * both Spanish and Argentine) and `simSearch`'s webhook cannot scope a query by a second
 * column, so the resolver searched unscoped and then fetched each candidate's own country from
 * `GET /sws/neo/contacts/region` to filter. No NEO spec exposes a region entity, so every one
 * of those calls 404'd, every candidate was filtered out, and the descriptor skipped the field
 * without raising anything — an address imported with street, city, postal code and country and
 * no province, silently.
 *
 * Exposing a region entity would have fixed only half of it. A stock instance carries the 52
 * Spanish provinces twice — the System copy and the tenant's own, the latter with a trailing
 * space — both active and both readable, so the scoring gap between them is nil and no
 * client-side classifier can pick one. Choosing needs the session's client, which the browser
 * has no business deciding.
 *
 * So the province now travels as free text (`regionName`) and
 * `ContactsLocationAddressHandler.resolveRegionByName` resolves it: it already holds the
 * country from the same payload and runs inside the tenant's OBContext, which is where both
 * halves of the problem actually resolve.
 */
