/**
 * Contact category (C_BP_Group) contact-type rules shared by the window's custom components
 * (ETP-5791): the list's contact-type quick filter, the header form wrapper and the Accounting
 * tab panel.
 *
 * A category is Customer (`etgoIscustomer`), Vendor/Creditor (`etgoIsvendor`) or both. The
 * backend (com.etendoerp.go BusinessPartnerCategoryHandler) refuses a category with neither.
 */

export const CUSTOMER_FIELD = 'etgoIscustomer';
export const VENDOR_FIELD = 'etgoIsvendor';
export const CUSTOMER_COLUMN = 'EM_Etgo_Iscustomer';
export const VENDOR_COLUMN = 'EM_Etgo_Isvendor';

/**
 * The two contact-type cards of the Accounting tab, in display order. Each card is headed by its
 * type checkbox (`typeField`, labelled with the AD column `typeColumn`) and, when checked, lists
 * its accounts. Account fields are the `C_BP_Group_Acct` API names; labels come from the AD column
 * (`useLabel`) unless the account sets a `labelKey` (a `useUI` key), which renames it in this tab
 * only — the AD column label stays as is in the other windows that show the same column
 * (Contactos, Configuración contable). `required` mirrors the AD (validator F19); it draws the
 * asterisk and hides the clear button (`AccountSelect`) — every account is PATCHed on its own, so
 * it never blocks a save.
 */
export const ACCOUNT_SECTIONS = [
  {
    key: 'customer',
    typeField: CUSTOMER_FIELD,
    typeColumn: CUSTOMER_COLUMN,
    accounts: [
      { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', required: true },
      { key: 'customerPrepayment', column: 'C_Prepayment_Acct' },
      { key: 'writeoff', column: 'WriteOff_Acct', required: true },
    ],
  },
  {
    key: 'vendor',
    typeField: VENDOR_FIELD,
    typeColumn: VENDOR_COLUMN,
    accounts: [
      { key: 'vendorLiability', column: 'V_Liability_Acct', labelKey: 'bpCategoryVendorLiability', required: true },
      { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', labelKey: 'bpCategoryVendorPrepayment' },
    ],
  },
];

/** YesNo values arrive as `true`/`'Y'`/`'true'` (checked) or anything else (unchecked). */
export function isChecked(value) {
  return value === true || value === 'Y' || value === 'true';
}

/**
 * Resolves which account sections are checked for the current (possibly unsaved) header values.
 * Nothing is ever cleared: an unchecked section keeps its stored account values.
 *
 * @param {object} record  the live header record (the form's editing state)
 * @returns {{ noType: boolean, sections: Array<object> }}
 *   `noType` is true when neither type is checked; `sections` lists the checked sections.
 */
export function resolveAccountSections(record) {
  const sections = ACCOUNT_SECTIONS.filter((s) => isChecked(record?.[s.typeField]));
  return { noType: sections.length === 0, sections };
}

/** Number of contact types checked on the record (0, 1 or 2) — the Accounting tab's badge. */
export function countCheckedTypes(record) {
  return resolveAccountSections(record).sections.length;
}

/**
 * Options of the list's contact-type quick filter. "All contacts" is the `null` value. Each
 * option filters SERVER-SIDE on the real AD column (Y/N, the representation NEO filters booleans
 * with — see `toBackendBoolean` in core gridQuery.js), so "Customer" also lists the categories that
 * are both customer and vendor.
 */
export const CONTACT_TYPE_FILTERS = {
  customer: { field: CUSTOMER_FIELD, column: CUSTOMER_COLUMN },
  vendor: { field: VENDOR_FIELD, column: VENDOR_COLUMN },
};
export const CONTACT_TYPE_FILTER_CODES = Object.keys(CONTACT_TYPE_FILTERS);

/**
 * The ListView `baseFilter` of a quick-filter value: a `criteria=` query segment, or `null` for
 * "All contacts" (and any unknown value).
 *
 * @param {string|null|undefined} code  a key of `CONTACT_TYPE_FILTERS`
 * @returns {string|null}
 */
export function contactTypeBaseFilter(code) {
  const option = code ? CONTACT_TYPE_FILTERS[code] : null;
  if (!option) return null;
  const criteria = [{ fieldName: option.field, operator: 'equals', value: 'Y' }];
  return `criteria=${encodeURIComponent(JSON.stringify(criteria))}`;
}

/**
 * The NEO selector of an account field of the category's accounting entity — the same endpoint
 * the generated accounting tabs' account popup uses (`{apiBaseUrl}/{entity}/selectors/{column}`).
 * The ValidCombination selector lists posting accounts only.
 *
 * @param {string|null|undefined} apiBaseUrl  the window's NEO base (`/sws/neo/<spec>`)
 * @param {string} entity  the accounting entity name
 * @param {{ column: string }} account  an entry of `ACCOUNT_SECTIONS[].accounts`
 * @returns {string|null}
 */
export function accountSelectorUrl(apiBaseUrl, entity, account) {
  return apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${account.column}` : null;
}
