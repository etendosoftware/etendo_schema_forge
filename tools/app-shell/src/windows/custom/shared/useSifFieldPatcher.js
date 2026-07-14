import { useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';

export const CLAVE_TIPO_OPTIONS = [
  { value: 'F1', labelKey: 'sifDataTabs.option.invoice' },
  { value: 'F2', labelKey: 'sifDataTabs.option.simplifiedInvoice' },
  { value: 'F4', labelKey: 'sifDataTabs.option.simplifiedInvoiceSummary' },
  { value: 'R', labelKey: 'sifDataTabs.option.correctiveInvoice' },
];

export const PURCHASE_CLAVE_TIPO_FC_OPTIONS = [
  { value: 'F6', labelKey: 'sifDataTabs.option.accountingDocument' },
  { value: 'LC', labelKey: 'sifDataTabs.option.customsComplementarySettlement' },
  { value: 'F5', labelKey: 'sifDataTabs.option.importDua' },
  { value: 'F1', labelKey: 'sifDataTabs.option.invoice' },
];

export const VERIFACTU_INV_TYPE_OPTIONS = [
  { value: 'F1', labelKey: 'sifDataTabs.option.vfF1' },
  { value: 'F2', labelKey: 'sifDataTabs.option.vfF2' },
  { value: 'F3', labelKey: 'sifDataTabs.option.vfF3' },
  { value: 'R1', labelKey: 'sifDataTabs.option.vfR1' },
  { value: 'R2', labelKey: 'sifDataTabs.option.vfR2' },
  { value: 'R3', labelKey: 'sifDataTabs.option.vfR3' },
  { value: 'R4', labelKey: 'sifDataTabs.option.vfR4' },
  { value: 'R5', labelKey: 'sifDataTabs.option.vfR5' },
];

export const VERIFACTU_REVERSE_TYPE_OPTIONS = [
  { value: 'I', labelKey: 'sifDataTabs.option.vfReverseByDifference' },
  { value: 'S', labelKey: 'sifDataTabs.option.vfReverseBySubstitution' },
];

// ETP-4463: SIF fields no longer persist themselves via a per-field PATCH on
// blur/change. Instead they write into the shared `editing` state that
// DetailView already maintains for the header form — via the `onChange`
// prop DetailView passes down to every `placement: 'tab'` custom tab (which
// is `hook.handleChange` under the hood). `data` (also passed down) already
// reflects those pending edits, since DetailView derives it from
// `hook.editing || currentItem`. This means:
//   - No local `siiForm` shadow state is needed: `getVal`/`getDateVal` can
//     read `data` directly, since it's already "live" (pending-edit-aware).
//   - No `savingField`/per-field spinner: the batch save (header "Guardar" /
//     "Confirmar") persists everything together, including SIF fields.
//   - No per-field error handling: failures surface through the same save
//     error path the header form already uses.
// This also makes DateField's onBlur-timing bugs (fixed separately in
// schema_forge_core) irrelevant here — SIF fields only ever need `onChange`.
export function useSifFieldPatcher({ data, recordId, apiBaseUrl, onChange }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';

  const { profile } = useFiscalConfig(orgId, apiBaseUrl);
  const { showSii, showTbai, showVerifactu } = getInvoiceFiscalTargets(specName, profile);
  const isPurchaseInvoice = specName === 'purchase-invoice';
  const siiTypeField = isPurchaseInvoice ? 'aeatsiiClaveTipoFc' : 'aeatsiiClaveTipo';
  const siiDescriptionMasterIdentifier = isPurchaseInvoice
    ? data?.['aeatsiiPurDescription$_identifier']
    : data?.['aeatsiiDescription$_identifier'];
  const siiTypeOptions = isPurchaseInvoice ? PURCHASE_CLAVE_TIPO_FC_OPTIONS : CLAVE_TIPO_OPTIONS;

  const isDraft = data?.documentStatus === 'DR';
  const isSentToSii = data?.aeatsiiIssent === true || data?.aeatsiiIssent === 'Y';
  const dateReadOnly = !isDraft;
  const siiFieldReadOnly = isSentToSii;

  const vfInvTypeDefaultedRef = useRef(null);

  function getVal(key) {
    return data?.[key] ?? '';
  }

  function getDateVal(key) {
    return normalizeDateInputValue(data?.[key] ?? '');
  }

  // ETP-4390: Classic defaults etvfacInvType ("Tipo de Factura") to 'F1' at the AD
  // column level (DefaultValue: F1). Invoices created before this column existed
  // have it stored as NULL, and InitialValidator.java's `etvfacInvType == null`
  // check blocks completion unless the user happens to touch the Select. Showing
  // F1 only client-side (via a visual fallback) is not enough to satisfy that
  // backend check, so the default must be actively written into the pending edit
  // state the first time the Verifactu panel is shown for a draft record with no
  // existing value. Scoped to this single field only — see task notes for why the
  // other new fields don't need this treatment.
  useEffect(() => {
    if (!showVerifactu || !isDraft || !recordId) return;
    if (vfInvTypeDefaultedRef.current === recordId) return;
    if (data?.etvfacInvType) return; // already has a value — never clobber
    vfInvTypeDefaultedRef.current = recordId;
    onChange?.('etvfacInvType', 'F1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVerifactu, isDraft, recordId, data?.etvfacInvType, onChange]);

  return {
    ui,
    specName,
    isPurchaseInvoice,
    siiTypeField,
    siiDescriptionMasterIdentifier,
    siiTypeOptions,
    showSii,
    showTbai,
    showVerifactu,
    isDraft,
    isSentToSii,
    dateReadOnly,
    siiFieldReadOnly,
    getVal,
    getDateVal,
  };
}
