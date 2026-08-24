import { EntityForm } from '@/components/contract-ui';
import { PillToggle } from '@/components/PillToggle';
import { useUI, useLabel } from '@/i18n';
import { useSiiTbaiActive, resolveOrganizationId } from './fiscalDefaults.utils.js';

// ── SII (AEAT) / TicketBAI invoicing defaults — read at invoicing time in
// Classic, no callout of their own here. (ETP-4784 part 2 UX fix, further
// split into two conditional sub-blocks in the follow-up UX pass below.)
//
// "Invoice type key" only makes sense once "Default Key" is on, mirroring
// the AD displayLogic @EM_Aeatsii_Defaultsiikey@='Y' (see
// artifacts/contacts/contract.json, entity "customer"). Option value/labels
// copied from that same contract — AD_Ref_List values are static, not
// derived per-record.
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

// ── Blocking-style toggle (canonical PillToggle switch) ─────────────────────
// Same wrapper as the Billing Preferences "Bloquear" toggles — label above,
// switch below. Used here instead of EntityForm's SquareCheckbox for
// `aeatsiiDefaultsiikey` / `tbaiIssimplifiedinv` per the UX ask (ETP-4784).
function FiscalToggle({ label, value, onCheckedChange, testId }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
      <div className="flex items-center gap-3 h-10">
        <PillToggle
          checked={value}
          onCheckedChange={onCheckedChange}
          aria-label={label}
          data-testid={testId} />
      </div>
    </div>
  );
}

// ── Fiscal defaults section ──────────────────────────────────────────────
// Groups the 3 Business Partner fields used as billing-time defaults by the
// Classic AEAT SII / TicketBAI modules into two independently-gated
// sub-blocks, so a contact only sees the defaults relevant to the fiscal
// system(s) actually active for its organization:
//   - "SII" block (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`): shown only
//     when the org has an active SII configuration (`acogidaAlSII`).
//   - "TicketBAI" block (`tbaiIssimplifiedinv`): shown only when the org has
//     an active TicketBAI configuration record (existence IS the signal).
// If neither applies, the whole section (title + description) is hidden —
// see `useSiiTbaiActive` for the detection + fail-safe-hide logic.
export default function FiscalDefaultsSection(props) {
  const ui = useUI();
  const t = useLabel();
  const { data, onChange, apiBaseUrl } = props;

  const organizationId = resolveOrganizationId(data?.organization);
  const { loading, sii: siiActive, tbai: tbaiActive } = useSiiTbaiActive(organizationId, apiBaseUrl);

  // Fail-safe: while we don't yet know (loading) or once we know neither
  // system applies, render nothing at all — no title, no description.
  if (loading || (!siiActive && !tbaiActive)) return null;

  return (
    <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
      <div className="flex flex-col gap-1 w-[148px] shrink-0">
        <div className="text-sm font-semibold text-text-primary">{ui('fiscalDefaults')}</div>
        <div className="text-xs text-text-secondary">{ui('fiscalDefaultsDescription')}</div>
      </div>
      <div className="flex-1 flex flex-col gap-4">
        {siiActive && (
          <div className="flex flex-col gap-3" data-testid="FiscalDefaultsSection__sii-block">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {ui('fiscalDefaultsSiiBlock')}
            </div>
            <div className="flex flex-row gap-5 items-start">
              <div className="flex-1 min-w-0">
                <FiscalToggle
                  label={t('EM_Aeatsii_Defaultsiikey')}
                  value={data?.aeatsiiDefaultsiikey}
                  onCheckedChange={(next) => onChange?.('aeatsiiDefaultsiikey', next, 'EM_Aeatsii_Defaultsiikey')}
                  testId="FiscalToggle__aeatsii-default" />
              </div>
              <div className="flex-1 min-w-0">
                <EntityForm
                  {...props}
                  fields={aeatsiiKeyListField}
                  cols={1}
                  data-testid="EntityForm__fiscal-aeatsii-keylist" />
              </div>
            </div>
          </div>
        )}
        {tbaiActive && (
          <div className="flex flex-col gap-3" data-testid="FiscalDefaultsSection__tbai-block">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {ui('fiscalDefaultsTbaiBlock')}
            </div>
            <FiscalToggle
              label={t('EM_Tbai_Issimplifiedinv')}
              value={data?.tbaiIssimplifiedinv}
              onCheckedChange={(next) => onChange?.('tbaiIssimplifiedinv', next, 'EM_Tbai_Issimplifiedinv')}
              testId="FiscalToggle__tbai-simplified" />
          </div>
        )}
      </div>
    </div>
  );
}
