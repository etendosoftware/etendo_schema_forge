import { createContext, useContext } from 'react';
import { categoryGrantsContactType, fetchContactCategoryFlags } from './contactCategoryFlags.js';

/**
 * The contact type a "create contact" popup opened from a document must produce (ETP-5791).
 *
 * Since ETP-5791 the contact CATEGORY decides whether a new contact is a customer, a vendor or
 * both: the backend copies the category's `etgoIscustomer` / `etgoIsvendor` into the new
 * contact's `customer` / `vendor`. A contact created from a PURCHASE document must come back in
 * the purchase selectors, so it has to be a vendor; one created from a SALE document has to be a
 * customer. The popup therefore refuses a category that does not grant that type.
 *
 * Carried as a CONTEXT, provided by the create-contact flow (`useCreateContactModal`, the OCR
 * `CreateContactModalAdapter`) around `RecordCreateModal`, and read by the Contacts window's own
 * header form (`windows/custom/contacts/useContactCategoryTypeSync.js`). A context crosses the
 * dialog portal and the embedded window's router untouched, so neither `RecordCreateModal` nor
 * `EmbeddedWindowRoute` — both shared by every create target — has to know about contact types.
 * Outside such a popup the context is `null` and the Contacts window behaves as it always did.
 */
export const ContactTypeRequirementContext = createContext(null);

/** Document nature (`useCreateContactModal`'s `documentType`) → the contact type it needs. */
export const REQUIRED_CONTACT_TYPE_BY_DOCUMENT_TYPE = Object.freeze({
  purchase: 'vendor',
  sale: 'customer',
});

/**
 * The context value for a document nature, or `null` when the nature imposes no type (an OCR
 * extraction that could not tell, or no document at all).
 *
 * @param {string|null|undefined} documentType 'purchase' | 'sale'
 * @returns {{ requiredType: 'vendor'|'customer' }|null}
 */
export function contactTypeRequirementFor(documentType) {
  const requiredType = REQUIRED_CONTACT_TYPE_BY_DOCUMENT_TYPE[documentType];
  return requiredType ? { requiredType } : null;
}

/** i18n key of the error shown when a category does not grant the required type. */
export const NOT_GRANTED_MESSAGE_KEY = Object.freeze({
  vendor: 'contactCategoryNotVendor',
  customer: 'contactCategoryNotCustomer',
});

/**
 * The same refusal for `RecordCreateModal`'s FALLBACK form, which mounts the generated
 * `BusinessPartnerForm` instead of the Contacts window — so `useContactCategoryTypeSync` never
 * runs there. The fallback is reachable: `RecordCreateModal` drops to it whenever the dynamic
 * import of the Contacts window rejects (a stale chunk after a deploy, a network cut). Its
 * category is the `/defaults` one (no seed reaches that form), so from a purchase it is usually
 * "Cliente" — exactly the case to refuse.
 *
 * Returned as the target's `validateBeforeCreate(data)`: resolves to the translated message to
 * show (the create is not sent), or `null`. Same rule as the window: unknown flags and a category
 * with neither flag pass.
 *
 * @param {{ requirement: {requiredType: string}|null, apiFetch: Function, ui: Function }} p
 *   `apiFetch` bound to the `business-partner-category` spec base.
 * @returns {((data: object) => Promise<string|null>)|undefined} undefined without a requirement
 */
export function buildContactTypeCreateCheck({ requirement, apiFetch, ui }) {
  const requiredType = requirement?.requiredType;
  if (!requiredType) return undefined;
  return async (data) => {
    const flags = await fetchContactCategoryFlags(apiFetch, data?.businessPartnerCategory);
    if (categoryGrantsContactType(flags, requiredType)) return null;
    return ui(NOT_GRANTED_MESSAGE_KEY[requiredType], {
      category: data?.['businessPartnerCategory$_identifier'] ?? '',
    });
  };
}

/** `{ requiredType }` inside a create-contact popup opened from a document, `null` elsewhere. */
export function useContactTypeRequirement() {
  return useContext(ContactTypeRequirementContext);
}
