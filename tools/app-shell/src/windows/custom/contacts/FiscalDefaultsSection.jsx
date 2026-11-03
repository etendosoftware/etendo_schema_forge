import CustomerForm from '@generated/contacts/generated/web/contacts/CustomerForm';
import { EntityForm } from '@/components/contract-ui';
import { PillToggle } from '@/components/PillToggle';
import { useUI, useLabel } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';

// ── SII (AEAT) / TicketBAI invoicing defaults — read at invoicing time in
// Classic, no callout of their own here. (ETP-4784)
//
// "Invoice type key" only makes sense once "Default Key" is on, mirroring
// the AD displayLogic @EM_Aeatsii_Defaultsiikey@='Y'.
//
// The four AD_Ref_List options and their AD_Ref_List_Trl labels are NOT
// written here: they are read off the generated `CustomerForm.fields` static,
// which the pipeline emits from `artifacts/contacts/contract.json` (entity
// "customer", `enumValues[].name` / `enumValues[].labels.es_ES`). That keeps
// the contract the single source of truth — options and translations follow
// AD through `make regen` instead of being hand-copied here and silently
// drifting, which is exactly how this list lost the Spanish label for 'F1'
// (ETP-4784). Same `@generated` import convention as this window's
// `ContactsBusinessPartnerForm.jsx`.
//
// Only `options` is taken from the contract. The rest of the descriptor stays
// explicit on purpose: `section` and `displayLogic` are this panel's own
// layout decisions, and spreading the whole generated field would also drag in
// its `defaultValue: 'F1'`, which this panel deliberately does not apply.
const contractSiiKeyOptions = CustomerForm.fields
  .find((f) => f.key === 'aeatsiiSiikeylist')
  .options;

const aeatsiiKeyListField = [
  {
    key: 'aeatsiiSiikeylist',
    column: 'EM_Aeatsii_Siikeylist',
    type: 'select',
    section: 'principal',
    options: contractSiiKeyOptions,
    displayLogic: (record) => !!record?.aeatsiiDefaultsiikey,
  },
];

// ── Inline switch (canonical PillToggle, label to its right) ────────────────
// The product's form switch pattern — same markup as EntityForm's `toggle`
// field renderer (switch first, label next to it, `gap-2`). Used instead of
// EntityForm's SquareCheckbox for `aeatsiiDefaultsiikey` / `tbaiIssimplifiedinv`
// per the UX ask (ETP-4784); label moved beside the switch in ETP-5519.
// `caption` is the muted secondary line under the label (label + caption, as in
// the shared ToggleRow) — here the fiscal system name, "SII" / "TicketBAI".
function FiscalToggle({ id, label, caption, value, onCheckedChange, disabled = false, 'data-testid': testId }) {
  return (
    <div className="flex items-center gap-2 min-h-10">
      <PillToggle
        id={id}
        checked={value}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        data-testid={testId} />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-[hsl(var(--foreground))] cursor-pointer">
          {label}
        </label>
        {caption && (
          <p className="text-xs text-text-secondary" data-testid={testId ? `${testId}-caption` : undefined}>
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Which blocks of the section apply (ETP-5831 CP-20) — exported for tests.
 * Each option depends on its own SIF being active for the organization: the SII
 * block on an active SII config (and, as before, on the partner being a customer),
 * the TicketBAI block on an active TicketBAI config. Fail closed: until the
 * fiscal config has settled, or when it could not be read, no block shows, so the
 * section never flashes in and back out. VERI*FACTU has no option here.
 */
export function resolveFiscalDefaultsBlocks({ fiscal, isCustomer }) {
  // useFiscalConfig starts at `loading: false, profile: null` before its first load
  // runs, so "settled" is a resolved profile or an error, not just `!loading`.
  const settled = Boolean(fiscal) && !fiscal.loading && (fiscal.profile !== null || fiscal.error != null);
  const ok = settled && !fiscal.error;
  return {
    showSii: ok && Boolean(fiscal.siiRecord) && Boolean(isCustomer),
    showTbai: ok && Boolean(fiscal.tbaiRecord),
  };
}

// ── Fiscal defaults section ──────────────────────────────────────────────
// Groups the 3 Business Partner fields used as billing-time defaults by the
// Classic AEAT SII / TicketBAI modules into two blocks, each shown only while
// its own SIF is active for the organization selected in the top-nav
// (`useFiscalConfig`, the same reader and org source as the invoice windows'
// SIF columns). This is a deliberate departure from Classic, whose AD
// DisplayLogic for these fields ignores the SIF configuration (ETP-5831 CP-20).
//   - "SII" block (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`): SII active AND
//     `data.customer` true — mirrors the same Customer-flag gate
//     `BillingPreferencesForm.jsx` uses for its own Cliente block, which is
//     where these two fields originally lived in Classic.
//   - "TicketBAI" block (`tbaiIssimplifiedinv`): TicketBAI active.
// With neither block the whole section (title and its divider included) is not
// rendered. The two blocks sit side by side in a 2-column grid so both switches
// share one row (ETP-5519); "Clave tipo factura" opens under the SII switch when
// it is on. The system name ("SII" / "TicketBAI") is each switch's caption.
export default function FiscalDefaultsSection(props) {
  const ui = useUI();
  const t = useLabel();
  const { data, onChange, readOnly = false, apiBaseUrl } = props;
  const { selectedOrg } = useAuth();
  const fiscal = useFiscalConfig(selectedOrg?.id ?? null, apiBaseUrl);
  const { showSii, showTbai } = resolveFiscalDefaultsBlocks({ fiscal, isCustomer: data?.customer });

  if (!showSii && !showTbai) return null;

  return (
    <>
      <hr className="border-t border-border mx-5" />
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-text-primary">{ui('fiscalDefaults')}</div>
          <div className="text-xs text-text-secondary">{ui('fiscalDefaultsDescription')}</div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-5 items-start">
          {showSii && (
            <div className="flex flex-col gap-3 min-w-0" data-testid="FiscalDefaultsSection__sii-block">
              <FiscalToggle
                id="fiscal-aeatsii-default"
                label={t('EM_Aeatsii_Defaultsiikey')}
                caption={ui('fiscalDefaultsSiiBlock')}
                value={data?.aeatsiiDefaultsiikey}
                onCheckedChange={(next) => onChange?.('aeatsiiDefaultsiikey', next, 'EM_Aeatsii_Defaultsiikey')}
                disabled={readOnly}
                data-testid="FiscalToggle__aeatsii-default" />
              <EntityForm
                {...props}
                fields={aeatsiiKeyListField}
                cols={1}
                data-testid="EntityForm__fiscal-aeatsii-keylist" />
            </div>
          )}
          {showTbai && (
            <div className="flex flex-col gap-3 min-w-0" data-testid="FiscalDefaultsSection__tbai-block">
              <FiscalToggle
                id="fiscal-tbai-simplified"
                label={t('EM_Tbai_Issimplifiedinv')}
                caption={ui('fiscalDefaultsTbaiBlock')}
                value={data?.tbaiIssimplifiedinv}
                onCheckedChange={(next) => onChange?.('tbaiIssimplifiedinv', next, 'EM_Tbai_Issimplifiedinv')}
                disabled={readOnly}
                data-testid="FiscalToggle__tbai-simplified" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
