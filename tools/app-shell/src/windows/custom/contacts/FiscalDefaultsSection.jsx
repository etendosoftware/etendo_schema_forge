import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';

// ── SII (AEAT) / TicketBAI invoicing defaults — read at invoicing time in
// Classic, no callout of their own here. Grouped into a single visual block
// (ETP-4784 part 2 UX fix) regardless of the Classic tab each field
// originally lived in (Customer vs. header/General): all three are plain
// C_BPartner columns consumed later by the SII trigger / TBAI XML builder,
// so splitting them across the header form and a nested Customer block (as
// shipped in part 2) made them read as unrelated stray fields instead of one
// coherent "fiscal defaults" concept.
//
// "Invoice type key" only makes sense once "Default Key" is on, mirroring
// the AD displayLogic @EM_Aeatsii_Defaultsiikey@='Y' (see
// artifacts/contacts/contract.json, entity "customer"). Option value/labels
// copied from that same contract — AD_Ref_List values are static, not
// derived per-record.
const tbaiSimplifiedInvoiceField = [
  { key: 'tbaiIssimplifiedinv', column: 'EM_Tbai_Issimplifiedinv', type: 'checkbox', section: 'principal' },
];
const aeatsiiDefaultKeyField = [
  { key: 'aeatsiiDefaultsiikey', column: 'EM_Aeatsii_Defaultsiikey', type: 'checkbox', section: 'principal' },
];
const aeatsiiKeyListField = [
  {
    key: 'aeatsiiSiikeylist',
    column: 'EM_Aeatsii_Siikeylist',
    type: 'select',
    section: 'principal',
    options: [
      { value: 'R', label: 'Corrective invoice', labels: { es_ES: 'Factura rectificativa' } },
      { value: 'F1', label: 'Invoice' },
      { value: 'F2', label: 'Simplified invoice', labels: { es_ES: 'Factura simplificada' } },
      { value: 'F4', label: 'Simplified invoices summary', labels: { es_ES: 'Asiento resumen facturas simplificadas' } },
    ],
    displayLogic: (record) => !!record?.aeatsiiDefaultsiikey,
  },
];

// ── Fiscal defaults section ──────────────────────────────────────────────
// Groups the 3 Business Partner fields used as billing-time defaults by the
// Classic AEAT SII / TicketBAI modules under one clearly-labeled block, so
// they read as a single configuration concept instead of 3 loose fields.
// `tbaiIssimplifiedinv` always applies (it was previously auto-rendered in
// the header form — see `decisions.json → entities.businessPartner.fields.
// tbaiIssimplifiedinv.form: false`). `aeatsiiDefaultsiikey`/`aeatsiiSiikeylist`
// keep the pre-existing "only meaningful for customers" gate on `data.customer`,
// unchanged from the block they were extracted out of in `BillingPreferencesForm`.

export default function FiscalDefaultsSection(props) {
  const ui = useUI();
  const { data } = props;

  return (
    <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
      <div className="flex flex-col gap-1 w-[148px] shrink-0">
        <div className="text-sm font-semibold text-text-primary">{ui('fiscalDefaults')}</div>
        <div className="text-xs text-text-secondary">{ui('fiscalDefaultsDescription')}</div>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <EntityForm
          {...props}
          fields={tbaiSimplifiedInvoiceField}
          cols={1}
          data-testid="EntityForm__fiscal-tbai" />
        {data?.customer && (
          <div className="flex flex-row gap-5 items-start">
            <div className="flex-1 min-w-0">
              <EntityForm
                {...props}
                fields={aeatsiiDefaultKeyField}
                cols={1}
                data-testid="EntityForm__fiscal-aeatsii-default" />
            </div>
            <div className="flex-1 min-w-0">
              <EntityForm
                {...props}
                fields={aeatsiiKeyListField}
                cols={1}
                data-testid="EntityForm__fiscal-aeatsii-keylist" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
