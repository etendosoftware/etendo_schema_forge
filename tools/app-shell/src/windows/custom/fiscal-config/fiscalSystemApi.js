// ETP-6053 — the Fiscal Configuration window activates a billing system (SIF) through the same
// backend actions agents use, on organization/organization (com.etendoerp.go
// FiscalSystemConfigureAction):
//   GET  /organization/organization/{orgId}/action/fiscalSystemCatalog  — territory × system rules
//   POST /organization/organization/{orgId}/action/configureFiscalSystem — creates the records
// The window keeps no copy of the rules: which systems a territory allows and every value a record
// carries for it (SII flags and tax type, TicketBAI territory, VERI*FACTU tax type) come from the
// catalog, and the records are built by the server.

import { parseApiError } from './fiscalConfig.utils.js';

const ORGANIZATION_PATH = '/organization/organization';

/** spec / entity of each record system the action reports in `created`. */
const RECORD_ENDPOINTS = {
  SII: { key: 'sii', spec: 'sii-config', entity: 'siiConfiguration' },
  TBAI: { key: 'tbai', spec: 'tbai-config', entity: 'header' },
  VERIFACTU: { key: 'verifactu', spec: 'verifactu-config', entity: 'cabeceraDeConfiguraciónVerifactu' },
};

function actionPath(orgId, action) {
  return `${ORGANIZATION_PATH}/${encodeURIComponent(orgId)}/action/${action}`;
}

/** A body that may come wrapped in `response.data` (NEO) or bare (an action's own JSON). */
function unwrap(json) {
  return json?.response?.data && !Array.isArray(json.response.data) ? json.response.data : json;
}

/**
 * Reads the territory × system rules.
 *
 * @param {Function} apiFetch - from `useApiFetch`
 * @param {string} orgId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ systems: string[], territories: Array<object> }>}
 */
export async function fetchFiscalCatalog(apiFetch, orgId, { signal } = {}) {
  const res = await apiFetch(actionPath(orgId, 'fiscalSystemCatalog'), { signal });
  if (!res.ok) throw new Error(await parseApiError(res));
  return unwrap(await res.json());
}

/**
 * Activates a billing system. On refusal throws an Error whose message is the server's own,
 * already in the request language (test mode, one active SIF, territory…).
 *
 * @param {Function} apiFetch
 * @param {string} orgId
 * @param {{ system: string, territory?: string|null }} params - `territory` may be left out only
 *   when adding SII to an existing TicketBAI ("Añadir SII"); the server then takes TicketBAI's.
 * @returns {Promise<{ system: string, territory: string, created: Array<{system, spec, entity, id}> }>}
 */
export async function configureFiscalSystem(apiFetch, orgId, { system, territory = null }) {
  const body = territory ? { system, territory } : { system };
  const res = await apiFetch(actionPath(orgId, 'configureFiscalSystem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return unwrap(await res.json());
}

/**
 * Reads back the records `configureFiscalSystem` created, keyed `sii` / `tbai` / `verifactu`.
 * A record that cannot be read back is left as its `{ id }`, so the detail step still has its id.
 *
 * @param {Function} apiFetch
 * @param {Array<{ system: string, id: string }>} created
 * @returns {Promise<{ sii?: object, tbai?: object, verifactu?: object }>}
 */
export async function fetchCreatedRecords(apiFetch, created) {
  const records = {};
  for (const item of created ?? []) {
    const endpoint = RECORD_ENDPOINTS[item?.system];
    if (!endpoint || !item.id) continue;
    const fetched = await apiFetch(`/${endpoint.spec}/${encodeURIComponent(endpoint.entity)}/${item.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => j?.response?.data?.[0] ?? null)
      .catch(() => null);
    records[endpoint.key] = fetched ?? { id: item.id };
  }
  return records;
}
