/**
 * Default country for a NEW address (ETP-5103).
 *
 * Two unrelated popups let a user create an address — the Contacts window's
 * "Nueva dirección" (LocationEditorModal) and the "Nuevo contacto" popup shown
 * from every document (CreateContactModal → AddressSection) — and both must
 * open with Spain preselected. They resolve the option list differently (one
 * asks the selector for a single `?q=Spain` page, the other already holds the
 * whole paginated catalog), so what they share is not the fetch: it is the
 * alias set and the label→option matching, which live here so the strings are
 * declared once.
 */

import { matchOptionByLabel } from './matchOptionLabel.js';

/**
 * Term for the selector's `q` filter. It matches C_Country.NAME — core seed
 * data, always the English "Spain" — OR the request-language translation, so
 * the query hits in any locale. Only needed by callers that must ASK for the
 * option; a caller holding the full catalog matches the aliases directly.
 */
export const DEFAULT_COUNTRY_QUERY = 'Spain';

/**
 * Labels that identify the default country in a returned option. The selector
 * exposes no ISO code, and the label IS translated, so both the Spanish and
 * the English spelling have to be tried.
 */
export const DEFAULT_COUNTRY_LABEL_ALIASES = ['España', 'Spain'];

/** Page size for the `?q=` probe — the aliases match within the first few rows. */
export const DEFAULT_COUNTRY_LIMIT = 5;

/**
 * Find the default-country option in a list of selector options.
 *
 * Returns null when no alias matches. The caller then leaves the country empty,
 * which is the pre-ETP-5103 behaviour and lets the user pick manually. Never
 * guess an id: a wrong country the user cannot see is worse than an empty one.
 *
 * @param {Array<{id: string, label: string}>} options
 * @returns {{id: string, label: string}|null}
 */
export function findDefaultCountryOption(options) {
  const list = Array.isArray(options) ? options : [];
  for (const alias of DEFAULT_COUNTRY_LABEL_ALIASES) {
    const matchedId = matchOptionByLabel(list, alias);
    if (matchedId) return list.find(option => option.id === matchedId);
  }
  return null;
}

/**
 * Same lookup, reduced to the id — for callers whose form field holds an option
 * id and has no use for the label.
 *
 * @param {Array<{id: string, label: string}>} options
 * @returns {string} the option id, or '' when unresolved
 */
export function resolveDefaultCountryId(options) {
  return findDefaultCountryOption(options)?.id ?? '';
}
