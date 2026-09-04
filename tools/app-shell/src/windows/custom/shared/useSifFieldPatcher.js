import { useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { resolveInvoiceOrgId } from '@/windows/custom/shared/resolveInvoiceOrgId.js';

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

// ETP-4783: SII rectification reason (EM_Aeatsii_Motivo_Rectif) — only shown on rectificative invoices.
export const SII_MOTIVO_RECTIF_OPTIONS = [
  { value: 'R1', labelKey: 'sifDataTabs.option.siiMotivoR1' },
  { value: 'R2', labelKey: 'sifDataTabs.option.siiMotivoR2' },
  { value: 'R3', labelKey: 'sifDataTabs.option.siiMotivoR3' },
  { value: 'R4', labelKey: 'sifDataTabs.option.siiMotivoR4' },
  { value: 'R5', labelKey: 'sifDataTabs.option.siiMotivoR5' },
];

// ETP-4783: TicketBAI reverse-invoice code options — shown in the TBAI SIF
// panel when the transaction document type is marked as rectificative.
export const TBAI_REVERSEINVOICECODE_OPTIONS = [
  { value: 'R1', labelKey: 'sifDataTabs.option.tbaiReverseR1' },
  { value: 'R2', labelKey: 'sifDataTabs.option.tbaiReverseR2' },
  { value: 'R3', labelKey: 'sifDataTabs.option.tbaiReverseR3' },
  { value: 'R4', labelKey: 'sifDataTabs.option.tbaiReverseR4' },
  { value: 'R5', labelKey: 'sifDataTabs.option.tbaiReverseR5' },
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
  // ETP-5087: keyed by the INVOICE's own org (data.adOrgId), not the top-nav org
  // selector — see resolveInvoiceOrgId.js.
  const { selectedOrg } = useAuth();
  const orgId = resolveInvoiceOrgId(data, selectedOrg?.id);
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';

  const { profile, tbaiRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const territory = tbaiRecord?.etsgSifTerritory ?? null;
  const { showSii, showTbai, showVerifactu } = getInvoiceFiscalTargets(specName, profile, territory);
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
  const vfReverseTypeRef = useRef(null);
  const siiRectifTypeRef = useRef(null);

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

  // ETP-4783: When SII is configured and the selected document type is rectificative
  // (isRectificative injected by AbstractInvoiceHeaderHandler.enrichIsRectificative),
  // auto-set the SII "Tipo de Factura" field (aeatsiiClaveTipo) to 'R' (Factura
  // rectificativa). Keyed on recordId+isRectificative so a document-type change
  // mid-session re-fires. Never clobbers a value that is already 'R'.
  useEffect(() => {
    if (!showSii || !isDraft || !recordId) return;
    if (!data?.isRectificative) return;
    const currentVal = data?.[siiTypeField];
    if (currentVal === 'R') return; // already correct — no-op
    const key = `${recordId}:rectif`;
    if (siiRectifTypeRef.current === key) return;
    siiRectifTypeRef.current = key;
    onChange?.(siiTypeField, 'R');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSii, isDraft, recordId, data?.isRectificative, siiTypeField, onChange]);

  // ETP-4783: "Tipo de Factura Rectificativa" (etvfacReverseinvtype) is hidden from
  // the UI. When the Verifactu invoice type is rectificative (R1–R5) the field must
  // always be persisted as 'I' (Por Diferencias) — the only valid value. We write it
  // into the shared editing state so the batch save picks it up automatically.
  // Keyed on recordId + vfInvType so a type change within the same record re-fires.
  useEffect(() => {
    if (!showVerifactu || !isDraft || !recordId) return;
    const vfInvType = data?.etvfacInvType;
    if (typeof vfInvType !== 'string' || !vfInvType.startsWith('R')) return;
    const key = `${recordId}:${vfInvType}`;
    if (vfReverseTypeRef.current === key) return;
    vfReverseTypeRef.current = key;
    onChange?.('etvfacReverseinvtype', 'I');
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
