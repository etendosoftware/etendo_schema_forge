import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { SEPA_REMITTANCES_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';

// ── SEPA direct-debit mandate (ETP-6148) ─────────────────────────────────
// The customer's mandate, stored on the Business Partner by the OBSEPAD
// module (EM_Obsepad_Mandate_Identifier / EM_Obsepad_Mandate_Date). Both
// fields are declared `form: false` in `artifacts/contacts/decisions.json`,
// so this section is their only editor; it rides the same `onChange` as
// FiscalDefaultsSection, so the values are saved with the record.
//
// The values are STORED by the backend (ContactSepaMandateDefaults, behind the
// `sepa-remittances` flag): when a customer is created, an empty mandate ID is
// saved as the contact's tax ID and an empty signature date as today; the new
// form already receives the date from DEFAULTS. On any later save of a
// customer, each mandate field that is empty in the DB and not sent in the
// body is filled (ID = current tax ID, date = creation date), so old customers
// get theirs on their next save. A sent value always wins; a field sent empty
// is cleared for that save only (the next save refills it); a tax-ID change
// never moves a stored ID; non-customers are never filled. So the fields show
// real stored values, re-read with the record; one muted line under both
// fields (no placeholder, no per-field hint) says where they come from. The
// browser never fills the ID itself — the server does it on save.

/** Max length of `EM_Obsepad_Mandate_Identifier` (NVARCHAR(35), the SEPA mandate id). */
export const MANDATE_ID_MAX_LENGTH = 35;

/**
 * Whether the section applies — exported for tests. Only for a customer (a
 * mandate authorizes collecting from them) and only while the account has
 * SEPA remittances on. Fails closed on an unloaded capability map.
 */
export function shouldShowSepaMandate({ capabilities, isCustomer }) {
  return Boolean(isCustomer) && isCapabilityVisible(capabilities, SEPA_REMITTANCES_CAPABILITY);
}

/**
 * The two field descriptors. EntityForm resolves a label as
 * `labels[locale] ?? labels.en_US ?? t(column) ?? label`; the AD labels of
 * these OBSEPAD columns ("Mandate Identification", "Mandate Date of
 * Signature") are not the product's wording, so the already-translated UI
 * label is handed in under `labels.en_US`, the slot read for every locale.
 */
export function buildSepaMandateFields(ui) {
  return [
    {
      key: 'obsepadMandateIdentifier',
      column: 'EM_Obsepad_Mandate_Identifier',
      type: 'string',
      section: 'principal',
      maxLength: MANDATE_ID_MAX_LENGTH,
      labels: { en_US: ui('sepaMandateId') },
    },
    {
      key: 'obsepadMandateDate',
      column: 'EM_Obsepad_Mandate_Date',
      type: 'date',
      section: 'principal',
      labels: { en_US: ui('sepaMandateSignedOn') },
    },
  ];
}

export default function SepaMandateSection(props) {
  const ui = useUI();
  const capabilities = useCapabilitiesSafe();
  const { data } = props;

  if (!shouldShowSepaMandate({ capabilities, isCustomer: data?.customer })) return null;

  return (
    <>
      <hr className="border-t border-border mx-5" />
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5" data-testid="SepaMandateSection">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-text-primary">{ui('sepaMandate')}</div>
          <div className="text-xs text-text-secondary">{ui('sepaMandateDescription')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <EntityForm
            {...props}
            fields={buildSepaMandateFields(ui)}
            cols={2}
            data-testid="EntityForm__sepa-mandate" />
          {/* One explanation for both fields: a single muted line under the two-column row, on
              the fields' left edge (no placeholder or per-field hint inside the form). */}
          <p className="mt-1.5 text-xs text-muted-foreground" data-testid="SepaMandateSection-autofill-hint">
            {ui('sepaMandateAutofillHint')}
          </p>
        </div>
      </div>
    </>
  );
}
