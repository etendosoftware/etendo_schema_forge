/**
 * Contact category (C_BP_Group) contact-type rules shared by the window's custom components
 * (ETP-5791): the header "Tipo de contacto" field and the Accounting tab panel.
 *
 * A category is Customer (`etgoIscustomer`), Vendor/Creditor (`etgoIsvendor`) or both. The
 * backend (com.etendoerp.go BusinessPartnerCategoryHandler) refuses a category with neither.
 */

export const CUSTOMER_FIELD = 'etgoIscustomer';
export const VENDOR_FIELD = 'etgoIsvendor';

/**
 * The two account sections of the Accounting tab, in display order. Fields are the
 * `C_BP_Group_Acct` API names; labels come from the AD column (`useLabel`) unless the account sets a
 * `labelKey` (a `useUI` key), which renames it in this tab only — the AD column label stays as is in
 * the other windows that show the same column (Contactos, Configuración contable). `required` mirrors the
 * AD (validator F19); it draws the asterisk and hides the clear button (`AccountSelect`) — every
 * account is PATCHed on its own, so it never blocks a save.
 */
export const ACCOUNT_SECTIONS = [
  {
    key: 'customer',
    typeField: CUSTOMER_FIELD,
    titleKey: 'bpCategoryCustomersSection',
    subtitleKey: 'bpCategoryCustomersSectionSubtitle',
    accounts: [
      { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', required: true },
      { key: 'customerPrepayment', column: 'C_Prepayment_Acct' },
      { key: 'writeoff', column: 'WriteOff_Acct', required: true },
    ],
  },
  {
    key: 'vendor',
    typeField: VENDOR_FIELD,
    titleKey: 'bpCategoryVendorsSection',
    subtitleKey: 'bpCategoryVendorsSectionSubtitle',
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
 * Resolves which account sections render for the current (possibly unsaved) header values.
 * The section of a type the category is NOT marked as is hidden; its stored account values are
 * kept, nothing is ever cleared.
 *
 * @param {object} record  the live header record (the form's editing state)
 * @returns {{ noType: boolean, sections: Array<object> }}
 *   `noType` is true when neither type is checked; `sections` lists the sections to render.
 */
export function resolveAccountSections(record) {
  const sections = ACCOUNT_SECTIONS.filter((s) => isChecked(record?.[s.typeField]));
  return { noType: sections.length === 0, sections };
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
