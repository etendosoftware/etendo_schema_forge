import { extractSingleRow } from '@/hooks/useEntity.js';

/**
 * Reads the contact-type flags of a contact category (`C_BP_Group`), ETP-5791.
 *
 * Since ETP-5791 a category says whether its contacts are customers (`EM_Etgo_Iscustomer`,
 * NEO property `etgoIscustomer`) and/or vendors-creditors (`EM_Etgo_Isvendor`, `etgoIsvendor`).
 * The flags are read through the `business-partner-category` NEO spec — the same spec, entity
 * and property names the MCP `etendo_get` sees, and the same spec the contacts import already
 * reads categories from — so the Contacts window and an agent answer from one source.
 */

/** NEO spec that exposes `C_BP_Group`. */
export const CONTACT_CATEGORY_SPEC = 'business-partner-category';
const CONTACT_CATEGORY_ENTITY = 'businessPartnerCategory';

/**
 * `<host>/sws/neo/contacts` → `<host>/sws/neo/business-partner-category`. The same last-segment
 * swap `useCreateContactModal` uses to reach the contacts spec from a document's base.
 *
 * @returns {string|null}
 */
export function contactCategoryApiBaseUrl(contactsApiBaseUrl) {
  if (!contactsApiBaseUrl) return null;
  return String(contactsApiBaseUrl).replace(/\/[^/]+\/?$/, `/${CONTACT_CATEGORY_SPEC}`);
}

function isYes(value) {
  return value === true || value === 'Y' || value === 'true';
}

/**
 * The flags of a category row, or `null` when the row does not carry them — the spec does not
 * expose the columns (yet), or the row is not a category at all. `null` means "unknown", which
 * every caller treats as "do nothing", never as "no type".
 *
 * @returns {{ customer: boolean, vendor: boolean }|null}
 */
export function readContactCategoryFlags(row) {
  if (!row || typeof row !== 'object') return null;
  if (!('etgoIscustomer' in row) && !('etgoIsvendor' in row)) return null;
  return { customer: isYes(row.etgoIscustomer), vendor: isYes(row.etgoIsvendor) };
}

/**
 * GETs one category and returns its flags. Never throws: a refused read (a role with Contacts
 * but without the Contact Category window), a network error or a row without the flags all
 * resolve to `null` — "unknown".
 *
 * @param {Function} apiFetch bound to {@link contactCategoryApiBaseUrl}
 * @param {string} categoryId `C_BP_Group_ID`
 * @returns {Promise<{ customer: boolean, vendor: boolean }|null>}
 */
export async function fetchContactCategoryFlags(apiFetch, categoryId) {
  if (!categoryId || typeof apiFetch !== 'function') return null;
  try {
    const res = await apiFetch(`/${CONTACT_CATEGORY_ENTITY}/${encodeURIComponent(categoryId)}`);
    if (!res?.ok) return null;
    return readContactCategoryFlags(extractSingleRow(await res.json().catch(() => null)));
  } catch {
    return null;
  }
}

/**
 * Whether a category grants the contact type a create-from-document popup requires.
 *
 * Unknown flags (`null`) are let through: the popup must not lock a user out of every category
 * because the read was refused, and the backend still refuses a contact with no type at all.
 * A category with NEITHER flag (legacy, before data-fix R50) counts as unknown too: it defines
 * nothing, exactly as the backend's `ContactTypeRules` treats it (nothing is inherited from it).
 *
 * @param {{ customer: boolean, vendor: boolean }|null} flags
 * @param {'vendor'|'customer'} requiredType
 */
export function categoryGrantsContactType(flags, requiredType) {
  if (!flags || !requiredType) return true;
  if (!flags.customer && !flags.vendor) return true;
  return Boolean(flags[requiredType]);
}
