/**
 * Helpers for the NEO `contacts` spec. Only the URL deriver remains —
 * BusinessPartner + location creation now goes through the generic /batch
 * endpoint, so the per-call `createContact` / `createContactLocation`
 * wrappers were retired alongside the old client-side OCR orchestration.
 *
 *   ContactCreatePopup uses `deriveContactsApiBase` to build country/region
 *   selector URLs (`<base>/contacts/locationAddress/selectors/...`).
 */

/**
 * Derive the contacts spec base URL from any other spec's base URL.
 * Both follow `<host>/sws/neo/<spec>` so swapping the trailing segment works.
 */
export function deriveContactsApiBase(apiBaseUrl) {
  if (!apiBaseUrl) return '/sws/neo/contacts';
  return apiBaseUrl.replace(/\/[^/]+$/, '/contacts');
}
