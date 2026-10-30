// ETP-5716 — models the backend marks as unavailable to the tenant in the fiscal models catalog
// answer (backend-only flag `fiscal-model-390`, evaluated in com.etendoerp.go
// `FiscalModel390Flag`). The SPA never evaluates the flag: it only reacts to the answer.
//
// While the flag is off, `GET <neo>/fiscal-models-catalog` answers without the `390` key and with
// `"_unavailable": ["390"]`. That marker is metadata, not a model: it is split off here, inside the
// one catalog reader (`useFiscalModelsCatalog`), so no surface ever counts it as a model or sends
// it back on save. The absent `390` key already hides every surface that shows only ACTIVE models
// (declarations list, new declaration, Organization's Modelo 390 / legal representatives section);
// `unavailableModels` additionally hides the catalog drawer's toggle. With no answer at all (still
// loading, or the read failed) the drawer falls back to `unavailableWithoutAnswer()`: fail hidden,
// like the backend default.
//
// Owned by the flag: when it retires (always on), the backend stops sending the marker and this
// file plus its two call sites go.

/** Metadata key of the catalog answer listing the unavailable model ids. */
export const UNAVAILABLE_KEY = '_unavailable';

/**
 * Models hidden while there is no catalog answer to react to — before the first read settles and
 * after a failed read. This is the backend's default (flag off = hidden) mirrored for the "no
 * answer" case, not a second evaluator: any successful answer replaces it, so with the flag on
 * (no marker) the 390 appears as soon as the catalog is read. Lives only in this file so it goes
 * with the flag.
 */
const UNAVAILABLE_WITHOUT_ANSWER = Object.freeze(['390']);

/**
 * The unavailable model ids to use while the catalog has not answered (loading or read failure).
 *
 * @returns {string[]} a fresh array
 */
export function unavailableWithoutAnswer() {
  return [...UNAVAILABLE_WITHOUT_ANSWER];
}

/**
 * Splits a raw catalog answer into the active-models map and the unavailable model ids.
 *
 * @param {object|null|undefined} data the parsed `GET /fiscal-models-catalog` body
 * @returns {{ activeModels: object, unavailableModels: string[] }}
 */
export function splitCatalogAnswer(data) {
  if (!data || typeof data !== 'object') return { activeModels: {}, unavailableModels: [] };
  const { [UNAVAILABLE_KEY]: unavailable, ...activeModels } = data;
  const unavailableModels = Array.isArray(unavailable) ? unavailable.map(String) : [];
  for (const id of unavailableModels) delete activeModels[id];
  return { activeModels, unavailableModels };
}

/**
 * Registry models the catalog drawer may offer: every model the backend did not mark unavailable.
 *
 * @param {Array<{id: string}>} models registry entries
 * @param {string[]} [unavailableModels]
 */
export function filterAvailableModels(models, unavailableModels = []) {
  if (!unavailableModels.length) return models;
  const hidden = new Set(unavailableModels);
  return models.filter(m => !hidden.has(m.id));
}
