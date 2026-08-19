import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectorInput } from '@/components/contract-ui/SelectorInput.jsx';
import {
  useSifFieldPatcher,
  VERIFACTU_INV_TYPE_OPTIONS,
  SII_MOTIVO_RECTIF_OPTIONS,
} from '@/windows/custom/shared/useSifFieldPatcher.js';
import SifAttachmentsSection from '@/windows/custom/shared/SifAttachmentsSection.jsx';

function Field({ label, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-sm text-foreground font-medium"
        data-testid="Label__b99c8b">{label}</Label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ id, value }) {
  return (
    <Input
      id={id}
      type="text"
      value={value ?? '—'}
      disabled
      readOnly
      className="bg-muted/40"
      data-testid="Input__b99c8b" />
  );
}

function CheckboxField({ id, checked, disabled, onToggle }) {
  return (
    <div className="h-10 flex items-center">
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onToggle(!checked)}
        className={[
          'h-5 w-5 shrink-0 rounded-sm border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)]',
          'flex items-center justify-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent',
        ].join(' ')}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
    </div>
  );
}

const PILL_CLS = {
  pending: 'bg-status-warning text-status-warning-foreground',
  success: 'bg-status-success text-status-success-foreground',
  neutral: 'bg-[hsl(var(--muted))] text-foreground',
  danger: 'bg-destructive text-destructive-foreground',
};

const SII_STATUS = {
  CO: { key: 'sifDataTabs.status.sii.correct', cls: PILL_CLS.success },
  AE: { key: 'sifDataTabs.status.sii.acceptedWithErrors', cls: PILL_CLS.pending },
  IN: { key: 'sifDataTabs.status.sii.incorrect', cls: PILL_CLS.danger },
  EE: { key: 'sifDataTabs.status.sii.sendError', cls: PILL_CLS.danger },
  PE: { key: 'sifDataTabs.status.sii.pending', cls: PILL_CLS.pending },
  AN: { key: 'sifDataTabs.status.sii.cancelled', cls: PILL_CLS.neutral },
  BA: { key: 'sifDataTabs.status.sii.dropped', cls: PILL_CLS.neutral },
  NR: { key: 'sifDataTabs.status.sii.notRegistrable', cls: PILL_CLS.neutral },
};

const SII_DEFAULT = { key: 'sifDataTabs.status.sii.pending', cls: PILL_CLS.pending };

const VERIFACTU_STATUS = {
  AC: { key: 'sifDataTabs.status.verifactu.accepted', cls: PILL_CLS.success },
  AE: { key: 'sifDataTabs.status.verifactu.acceptedWithErrors', cls: PILL_CLS.pending },
  IN: { key: 'sifDataTabs.status.verifactu.invalid', cls: PILL_CLS.danger },
  ER: { key: 'sifDataTabs.status.verifactu.rejected', cls: PILL_CLS.danger },
  PE: { key: 'sifDataTabs.status.verifactu.pending', cls: PILL_CLS.pending },
};

const VERIFACTU_DEFAULT = { key: 'sifDataTabs.status.verifactu.notSent', cls: PILL_CLS.neutral };

const pillCls = (size = 'md') => {
  const base = 'inline-flex items-center font-normal rounded-full';
  return size === 'sm'
    ? `${base} text-[11px] px-2 py-0.5`
    : `${base} text-xs px-2 py-1`;
};

function SiiStatusBadge({ estado, ui, size = 'md' }) {
  const current = SII_STATUS[estado] ?? SII_DEFAULT;
  return (
    <span className={`${pillCls(size)} ${current.cls}`}>{ui(current.key)}</span>
  );
}

function VerifactuBadge({ status, sent, ui, size = 'md' }) {
  const normalized = status || (sent === true || sent === 'Y' ? 'AC' : null);
  const current = VERIFACTU_STATUS[normalized] ?? VERIFACTU_DEFAULT;
  return (
    <span className={`${pillCls(size)} ${current.cls}`}>{ui(current.key)}</span>
  );
}

const RAIL_META = {
  sii: { labelKey: 'sifDataTabs.tab.sii', subtitleKey: 'sifDataTabs.rail.sii.subtitle' },
  verifactu: { labelKey: 'sifDataTabs.tab.verifactu', subtitleKey: 'sifDataTabs.rail.verifactu.subtitle' },
  tbai: { labelKey: 'sifDataTabs.tab.tbai', subtitleKey: 'sifDataTabs.rail.tbai.subtitle' },
};

const PANEL_META = {
  sii: { titleKey: 'sifDataTabs.panel.sii.title', subtitleKey: 'sifDataTabs.panel.sii.subtitle' },
  verifactu: { titleKey: 'sifDataTabs.panel.verifactu.title', subtitleKey: 'sifDataTabs.panel.verifactu.subtitle' },
  tbai: { titleKey: 'sifDataTabs.panel.tbai.title', subtitleKey: 'sifDataTabs.panel.tbai.subtitle' },
};

function resolveDefaultTab(showSii, showVerifactu) {
  if (showSii) return 'sii';
  if (showVerifactu) return 'verifactu';
  return 'tbai';
}

function resolveEffectiveTab(activeTab, showSii, showVerifactu, showTbai, defaultTab) {
  if (activeTab === 'sii' && showSii) return 'sii';
  if (activeTab === 'verifactu' && showVerifactu) return 'verifactu';
  if (activeTab === 'tbai' && showTbai) return 'tbai';
  return defaultTab;
}

function PanelHeader({ titleKey, subtitleKey, badge, ui }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{ui(titleKey)}</span>
        <span className="text-xs text-muted-foreground">{ui(subtitleKey)}</span>
      </div>
      {badge}
    </div>
  );
}

function Panel({ titleKey, subtitleKey, badge, ui, children }) {
  return (
    <>
      <PanelHeader
        titleKey={titleKey}
        subtitleKey={subtitleKey}
        badge={badge}
        ui={ui}
        data-testid="PanelHeader__b99c8b" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 overflow-y-auto">{children}</div>
    </>
  );
}

function ReadOnlyField({ id, labelKey, value, ui }) {
  return (
    <Field label={ui(labelKey)} htmlFor={id} data-testid="Field__b99c8b">
      <ReadOnlyValue id={id} value={value} data-testid="ReadOnlyValue__b99c8b" />
    </Field>
  );
}

// ETP-4751 (Block B): SII exemption cause, replicating Classic's ExemptTaxes parity for
// both invoice types. Backed by the existing `/header/selectors/aeatsiiCauseExemption`
// selector endpoint (target table AEATSII_CAUSE_EXEMPTION). The FK value/identifier pair
// mirrors DimensionsPanel: `onChange` writes both the id (`aeatsiiCauseExemption`) that
// CRUD persists and the `$_identifier` used for display.
//
// Editability gate (Classic parity): the field is editable ONLY when the invoice actually
// carries an exempt tax (`hasExemptTaxes`, served by the backend NeoHandler), is still a
// draft, and has not been sent to SII (`siiFieldReadOnly`). With no exempt taxes it renders
// READ-ONLY but stays visible (Classic keeps it on the form). The "should indicate an
// exemption cause" case is NOT shown inline here — it is surfaced as a warning toast fired
// on invoice LINE save (see the exemption-signal effect below), because the field lives in
// the SIF tab (not the header) and gluing the warning to the field is poor UX.
// No hardcoded `label` here — the visible label/placeholder is resolved through
// i18n at render time (see `resolvedLabel` below), which SelectorInput uses for
// both the field label and the "Select …" placeholder.
const EXEMPTION_CAUSE_FIELD = {
  id: 'sif-exemption',
  key: 'aeatsiiCauseExemption',
  column: 'aeatsiiCauseExemption',
  required: false,
};

function ExemptionCauseField({ ui, data, apiBaseUrl, token, editable, onChange }) {
  const selectedCause = data?.aeatsiiCauseExemption;

  if (!editable) {
    return (
      <ReadOnlyField
        id="sif-exemption"
        labelKey="sifDataTabs.field.exemptionCause"
        value={data?.['aeatsiiCauseExemption$_identifier']}
        ui={ui}
        data-testid="ReadOnlyField__b99c8b" />
    );
  }
  const value = selectedCause ?? '';
  const displayValue = data?.['aeatsiiCauseExemption$_identifier'] ?? '';
  const selectorUrl = apiBaseUrl
    ? `${apiBaseUrl}/header/selectors/aeatsiiCauseExemption`
    : null;
  return (
    <Field
      label={ui('sifDataTabs.field.exemptionCause')}
      htmlFor="sif-exemption"
      data-testid="Field__b99c8b">
      <SelectorInput
        entityName="header"
        field={EXEMPTION_CAUSE_FIELD}
        value={value}
        displayValue={displayValue}
        onChange={(val, lbl) => {
          onChange?.('aeatsiiCauseExemption', val);
          onChange?.('aeatsiiCauseExemption$_identifier', lbl ?? '');
        }}
        catalogs={null}
        resolvedLabel={ui('sifDataTabs.field.exemptionCause')}
        selectorUrl={selectorUrl}
        token={token}
        data-testid="SelectorInput__b99c8b" />
    </Field>
  );
}

// Shared by the SII and Verifactu panels: Classic's displayLogic for this field is
// `@etvfac_has_configuration@='Y' | @TBAI_ExistTBAIConfig@=1 | @AEATSII_AcogidaSII@='Y'`,
// i.e. it must render whenever ANY fiscal regime is configured, not just SII.
//
// ETP-4463: writes go straight into the shared `editing` state via `onChange`
// on every keystroke/commit — there's no separate per-field save anymore, so
// we no longer depend on DateField's `onBlur` firing (or firing with a fresh
// value) at all. The batch header save picks this up like any other field.
function OperationDateField({ ui, getDateVal, onChange, disabled }) {
  return (
    <Field
      label={ui('sifDataTabs.field.operationDate')}
      htmlFor="sif-etsgDateOperation"
      data-testid="Field__b99c8b">
      <DateField
        id="sif-etsgDateOperation"
        value={getDateVal('etsgDateOperation')}
        onChange={iso => onChange?.('etsgDateOperation', iso)}
        disabled={disabled}
        data-testid="DateField__b99c8b" />
    </Field>
  );
}

// Classic displayLogic: `@etvfac_has_configuration@='Y' & @EM_Etvfac_Inv_Type@!'R5' & @EM_Etvfac_Inv_Type@!'F2'`
function shouldShowSimplifiedArt7273(invType) {
  return invType !== 'R5' && invType !== 'F2';
}

// Classic displayLogic: `@etvfac_has_configuration@='Y' & (@EM_Etvfac_Inv_Type@='R5' | @EM_Etvfac_Inv_Type@='F2')`
// Mutually exclusive with shouldShowSimplifiedArt7273 by design.
function shouldShowNoRecipientIdArt61d(invType) {
  return invType === 'R5' || invType === 'F2';
}

// Classic displayLogic (verbatim, operator-precedence quirk intentional — `&` binds tighter than `|`

export default function SifTab({ recordId, data, token, apiBaseUrl, onChange, onVisibilityChange }) {
  const {
    ui,
    siiTypeField,
    siiTypeOptions,
    showSii,
    showVerifactu,
    showTbai,
    dateReadOnly,
    siiFieldReadOnly,
    isDraft,
    getVal,
    getDateVal,
  } = useSifFieldPatcher({ data, recordId, token, apiBaseUrl, onChange });

  // ETP-4751 (Block B): exempt-tax signal served by the invoice-header NeoHandler
  // (AbstractInvoiceHeaderHandler#enrichHasExemptTaxes). Refreshed on every line
  // add/edit/delete (useEntity#refreshHeaderTotals re-GETs the header), so it always
  // reflects the CURRENT line state and correctly gates the exemption-cause field
  // read-only when the invoice no longer carries any exempt tax.
  const hasExemptTaxes = data?.hasExemptTaxes === true || data?.hasExemptTaxes === 'Y';
  const exemptionCauseEditable = hasExemptTaxes && isDraft && !siiFieldReadOnly;

  // ETP-4783: Replicates SiiAuthorizationCallout for the Go frontend (ETP-4783).
  // fireCallout in DetailView filters out 'Y'/'N' values (only UUIDs/numbers/dates pass),
  // so we fire the callout manually here when the authorization checkbox changes.
  // The backend's afterCallout → applySiiAuthorizationCallout validates AEATSIIConfig and
  // either returns the authorization number (injected into updates) or an ERROR message.
  const handleAuthorizationToggle = useCallback(async (val) => {
    onChange?.('aeatsiiIsauthorization', val); // optimistic update
    if (!apiBaseUrl || !token) return;
    try {
      const res = await fetch(`${apiBaseUrl}/header/callout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'aeatsiiIsauthorization', value: val ? 'Y' : 'N', formState: data ?? {} }),
      });
      if (!res.ok) return;
      const result = await res.json();
      let hasError = false;
      for (const msg of (result.messages ?? [])) {
        const text = msg.text || msg.message || '';
        if (!text) continue;
        const type = (msg.type || '').toUpperCase();
        if (type === 'ERROR') { toast.error(text); hasError = true; }
        else if (type === 'WARNING') toast.warning(text);
        else toast.info(text);
      }
      if (hasError) {
        onChange?.('aeatsiiIsauthorization', !val); // revert on error
      } else {
        for (const [field, entry] of Object.entries(result.updates ?? {})) {
          // Backend update entries are { value: "..." } objects — unwrap like applyCalloutFieldUpdates.
          onChange?.(field, typeof entry === 'object' && entry !== null ? entry.value : entry);
        }
      }
    } catch { /* network error — keep optimistic state */ }
  }, [apiBaseUrl, token, data, onChange]);

  // ETP-4783: Per-field lock conditions that differ from the general siiFieldReadOnly gate.
  // Classic parity: SII desc and accounting-register date are editable even on completed
  // invoices — they only lock once the invoice has been sent to SII (aeatsiiIssent = 'Y').
  // aeatsiiIssent has type=boolean in the contract, so the server returns true/false;
  // handle both boolean and legacy string serializations.
  const siiSentReadOnly = data?.aeatsiiIssent === true || data?.aeatsiiIssent === 'Y';
  // Modificada-error-registral follows AD readOnly logic: editable only when SII estado
  // is CO (Correcto) or AE (Aceptado con errores) and the invoice is not voided.
  const errorRegistralReadOnly =
    !['CO', 'AE'].includes(data?.aeatsiiEstado ?? '') || data?.documentStatus === 'VO';

  // ETP-4751 (Block B/F): Classic parity for the SII module's ExemptTaxes line-save behaviour.
  // The invoice-LINE NeoHandler (InvoiceLineHandler#autoFillExemptionCauseAfterLineSave) stamps
  // AT MOST ONE mutually-exclusive signal on its line-save response, mirrored onto the header
  // `data` by useEntity#applyExemptionCauseSignals:
  //   • exemptionCauseAutoFilled → a default cause existed and was written → info toast
  //     ("Causa de exención modificada"). DORMANT in Etendo GO (no default cause is seeded).
  //   • exemptionCauseWarning → an exempt tax is present, no header cause, and NO default cause
  //     to auto-fill → warning toast ("Debería indicarse una causa de exención"), telling the
  //     user to pick a cause in this SIF tab.
  // Each fires once per line save; the guard re-arms when the flag flips back to false between
  // saves (applyExemptionCauseSignals always writes the resolved boolean).
  const autoFillToastedRef = useRef(false);
  const warningToastedRef = useRef(false);
  useEffect(() => {
    if (data?.exemptionCauseAutoFilled && !autoFillToastedRef.current) {
      autoFillToastedRef.current = true;
      toast.info(ui('sifDataTabs.toast.exemptionCauseModified.title'), {
        description: ui('sifDataTabs.toast.exemptionCauseModified.description'),
      });
    }
    if (!data?.exemptionCauseAutoFilled) {
      autoFillToastedRef.current = false;
    }
  }, [data?.exemptionCauseAutoFilled, ui]);
  useEffect(() => {
    if (data?.exemptionCauseWarning && !warningToastedRef.current) {
      warningToastedRef.current = true;
      toast.warning(ui('sifDataTabs.toast.exemptionCauseRequired.title'), {
        description: ui('sifDataTabs.toast.exemptionCauseRequired.description'),
      });
    }
    if (!data?.exemptionCauseWarning) {
      warningToastedRef.current = false;
    }
  }, [data?.exemptionCauseWarning, ui]);

  const defaultTab = resolveDefaultTab(showSii, showVerifactu);
  const [activeTab, setActiveTab] = useState(defaultTab);
  // Read live (possibly unsaved) pending value so dependent Verifactu fields react
  // immediately as the user picks a Tipo de Factura — `data` already reflects the
  // pending edit (shared `editing` state) as soon as onChange fires.
  const vfInvType = getVal('etvfacInvType');

  // Report up to DetailView whether the SIF tab has anything to show at all. ETP-4888
  // reintroduces a minimal TBAI rail (Adjuntos only — see the "tbai" panel below), so a
  // TBAI-only fiscal configuration is no longer empty either; only a configuration with
  // NONE of the 3 targets active has nothing for this tab to display, and the tab itself
  // disappears from the tab bar instead of showing an empty placeholder. `onVisibilityChange`
  // is optional: this must be a no-op-safe call for any consumer that doesn't pass it.
  useEffect(() => {
    onVisibilityChange?.(showSii || showVerifactu || showTbai);
  }, [showSii, showVerifactu, showTbai, onVisibilityChange]);

  if (!showSii && !showVerifactu && !showTbai) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8">
        {ui('sifDataTabs.sectionTitle')}
      </div>
    );
  }

  const effectiveTab = resolveEffectiveTab(activeTab, showSii, showVerifactu, showTbai, defaultTab);

  const railItems = [
    showSii && { key: 'sii', ...RAIL_META.sii },
    showVerifactu && { key: 'verifactu', ...RAIL_META.verifactu },
    showTbai && { key: 'tbai', ...RAIL_META.tbai },
  ].filter(Boolean);

  return (
    <div className="flex gap-2 p-2 h-full min-h-0">
      <div className="w-56 shrink-0 flex flex-col gap-1 border border-border/40 rounded-lg bg-card p-2">
        {railItems.map(item => {
          const active = effectiveTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-md cursor-pointer text-left transition-colors ${
                active ? 'bg-muted border-l-2 border-primary' : 'hover:bg-muted/60'
              }`}
            >
              <span className={`text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                {ui(item.labelKey)}
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                {ui(item.subtitleKey)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 border border-border/40 rounded-lg bg-card overflow-hidden flex flex-col min-h-0">
        {effectiveTab === 'sii' && showSii && (
          <Panel
            titleKey={PANEL_META.sii.titleKey}
            subtitleKey={PANEL_META.sii.subtitleKey}
            badge={<SiiStatusBadge estado={data?.aeatsiiEstado} ui={ui} data-testid="SiiStatusBadge__b99c8b" />}
            ui={ui}
            data-testid="Panel__b99c8b">
            <OperationDateField
              ui={ui}
              getDateVal={getDateVal}
              onChange={onChange}
              disabled={dateReadOnly}
              data-testid="OperationDateField__b99c8b" />
            <Field
              label={ui('sifDataTabs.field.invoiceType')}
              htmlFor="sif-siiType"
              data-testid="Field__b99c8b">
              <Select
                value={getVal(siiTypeField) || undefined}
                onValueChange={val => onChange?.(siiTypeField, val)}
                disabled={siiFieldReadOnly}
                data-testid="Select__b99c8b">
                <SelectTrigger id="sif-siiType" data-testid="SelectTrigger__b99c8b">
                  <SelectValue placeholder="—" data-testid="SelectValue__b99c8b" />
                </SelectTrigger>
                <SelectContent data-testid="SelectContent__b99c8b">
                  {siiTypeOptions.map(o => (
                    <SelectItem key={o.value} value={o.value} data-testid="SelectItem__b99c8b">{o.value} — {ui(o.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {getVal(siiTypeField) === 'R' && (
              <Field
                label={ui('sifDataTabs.field.rectificationReason')}
                htmlFor="sif-siiMotivoRectif"
                data-testid="Field__b99c8b">
                <Select
                  value={getVal('aeatsiiMotivoRectif') || undefined}
                  onValueChange={val => onChange?.('aeatsiiMotivoRectif', val)}
                  disabled={siiFieldReadOnly}
                  data-testid="Select__b99c8b">
                  <SelectTrigger id="sif-siiMotivoRectif" data-testid="SelectTrigger__b99c8b">
                    <SelectValue placeholder="—" data-testid="SelectValue__b99c8b" />
                  </SelectTrigger>
                  <SelectContent data-testid="SelectContent__b99c8b">
                    {SII_MOTIVO_RECTIF_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} data-testid="SelectItem__b99c8b">{o.value} — {ui(o.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field
              label={ui('sifDataTabs.field.siiDescription')}
              htmlFor="sif-siiDesc"
              data-testid="Field__b99c8b">
              <Input
                id="sif-siiDesc"
                type="text"
                value={getVal('aeatsiiDescripcionSii')}
                onChange={e => onChange?.('aeatsiiDescripcionSii', e.target.value)}
                disabled={siiSentReadOnly}
                className="bg-card"
                data-testid="Input__b99c8b" />
            </Field>
            <ExemptionCauseField
              ui={ui}
              data={data}
              apiBaseUrl={apiBaseUrl}
              token={token}
              editable={exemptionCauseEditable}
              onChange={onChange}
              data-testid="ExemptionCauseField__b99c8b" />
            <Field
              label={ui('sifDataTabs.field.authorization')}
              htmlFor="sif-auth"
              data-testid="Field__b99c8b">
              <CheckboxField
                id="sif-auth"
                checked={Boolean(getVal('aeatsiiIsauthorization'))}
                disabled={siiFieldReadOnly}
                onToggle={handleAuthorizationToggle}
                data-testid="CheckboxField__b99c8b" />
            </Field>
            {getVal('aeatsiiIsauthorization') && (
              <ReadOnlyField
                id="sif-authorizationNo"
                labelKey="sifDataTabs.field.authorizationNo"
                value={getVal('aeatsiiAuthorizationno')}
                ui={ui}
                data-testid="ReadOnlyField__b99c8b" />
            )}
            <Field
              label={ui('sifDataTabs.field.accountingRegDate')}
              htmlFor="sif-accountingRegDate"
              data-testid="Field__b99c8b">
              <DateField
                id="sif-accountingRegDate"
                value={getDateVal('aeatsiiFechaRegCont')}
                onChange={iso => onChange?.('aeatsiiFechaRegCont', iso)}
                disabled={siiSentReadOnly}
                data-testid="DateField__b99c8b" />
            </Field>
            {siiSentReadOnly && (
              <Field
                label={ui('sifDataTabs.field.registerError')}
                htmlFor="sif-registerError"
                data-testid="Field__b99c8b">
                <CheckboxField
                  id="sif-registerError"
                  checked={Boolean(getVal('aeatsiiErrorRegistral'))}
                  disabled={errorRegistralReadOnly}
                  onToggle={val => onChange?.('aeatsiiErrorRegistral', val)}
                  data-testid="CheckboxField__b99c8b" />
              </Field>
            )}
            <ReadOnlyField
              id="sif-siiYear"
              labelKey="sifDataTabs.field.siiYear"
              value={data?.aeatsiiEjercicio}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <ReadOnlyField
              id="sif-siiPeriod"
              labelKey="sifDataTabs.field.siiPeriod"
              value={data?.aeatsiiPeriodo}
              ui={ui}
              data-testid="ReadOnlyField__b99c8b" />
            <SifAttachmentsSection
              tableName="aeatsii_facturas"
              recordId={data?.aeatsiiFacturaId}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="SifAttachmentsSection__sii" />
          </Panel>
        )}

        {effectiveTab === 'verifactu' && showVerifactu && (
          <Panel
            titleKey={PANEL_META.verifactu.titleKey}
            subtitleKey={PANEL_META.verifactu.subtitleKey}
            badge={<VerifactuBadge
              status={data?.etvfacInvoiceStatus}
              sent={data?.etvfacSentToVerifac}
              ui={ui}
              data-testid="VerifactuBadge__b99c8b" />}
            ui={ui}
            data-testid="Panel__b99c8b">
            <OperationDateField
              ui={ui}
              getDateVal={getDateVal}
              onChange={onChange}
              disabled={dateReadOnly}
              data-testid="OperationDateField__b99c8b" />
            <Field
              label={ui('sifDataTabs.field.vfInvoiceType')}
              htmlFor="sif-vfInvType"
              data-testid="Field__b99c8b">
              <Select
                value={getVal('etvfacInvType') || undefined}
                onValueChange={val => onChange?.('etvfacInvType', val)}
                disabled={dateReadOnly}
                data-testid="Select__b99c8b">
                <SelectTrigger id="sif-vfInvType" data-testid="SelectTrigger__b99c8b">
                  <SelectValue placeholder="—" data-testid="SelectValue__b99c8b" />
                </SelectTrigger>
                <SelectContent data-testid="SelectContent__b99c8b">
                  {VERIFACTU_INV_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} data-testid="SelectItem__b99c8b">{o.value} — {ui(o.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={ui('sifDataTabs.field.vfOperationDescription')}
              htmlFor="sif-vfDesc"
              data-testid="Field__b99c8b">
              <Input
                id="sif-vfDesc"
                type="text"
                value={getVal('etvfacVerifacDesc')}
                onChange={e => onChange?.('etvfacVerifacDesc', e.target.value)}
                disabled={dateReadOnly}
                className="bg-card"
                data-testid="Input__b99c8b" />
            </Field>
            {shouldShowSimplifiedArt7273(vfInvType) && (
              <Field
                label={ui('sifDataTabs.field.simplifiedInvoiceArt7273')}
                htmlFor="sif-vfSimp7273"
                data-testid="Field__b99c8b">
                <CheckboxField
                  id="sif-vfSimp7273"
                  checked={Boolean(getVal('etvfacSimpinvart7273'))}
                  disabled={dateReadOnly}
                  onToggle={val => onChange?.('etvfacSimpinvart7273', val)}
                  data-testid="CheckboxField__b99c8b" />
              </Field>
            )}
            {shouldShowNoRecipientIdArt61d(vfInvType) && (
              <Field
                label={ui('sifDataTabs.field.noRecipientIdArt61d')}
                htmlFor="sif-vfNoId61d"
                data-testid="Field__b99c8b">
                <CheckboxField
                  id="sif-vfNoId61d"
                  checked={Boolean(getVal('etvfacInvNoIDArt61d'))}
                  disabled={dateReadOnly}
                  onToggle={val => onChange?.('etvfacInvNoIDArt61d', val)}
                  data-testid="CheckboxField__b99c8b" />
              </Field>
            )}
            {shouldShowReverseInvType(showVerifactu, vfInvType) && (
              <Field
                label={ui('sifDataTabs.field.correctiveInvoiceType')}
                htmlFor="sif-vfReverseType"
                data-testid="Field__b99c8b">
                <Select
                  value={getVal('etvfacReverseinvtype') || undefined}
                  onValueChange={val => onChange?.('etvfacReverseinvtype', val)}
                  disabled={dateReadOnly}
                  data-testid="Select__b99c8b">
                  <SelectTrigger id="sif-vfReverseType" data-testid="SelectTrigger__b99c8b">
                    <SelectValue placeholder="—" data-testid="SelectValue__b99c8b" />
                  </SelectTrigger>
                  <SelectContent data-testid="SelectContent__b99c8b">
                    {VERIFACTU_REVERSE_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} data-testid="SelectItem__b99c8b">{o.value} — {ui(o.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <SifAttachmentsSection
              tableName="etvfac_c_invoice_verifactu"
              recordId={data?.invoiceVerifactuId}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="SifAttachmentsSection__verifactu" />
          </Panel>
        )}

        {effectiveTab === 'tbai' && showTbai && (
          <Panel
            titleKey={PANEL_META.tbai.titleKey}
            subtitleKey={PANEL_META.tbai.subtitleKey}
            ui={ui}
            data-testid="Panel__b99c8b">
            {/* ETP-4888: minimal TBAI rail — Adjuntos only. No date/type/checkbox fields here
                (that per-invoice field panel was intentionally removed in ETP-4401, since TBAI
                chaining sequences are now generated automatically per fiscal configuration). */}
            <SifAttachmentsSection
              tableName="tbai_syncinvoice"
              recordId={data?.tbaiSyncInvoiceId}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="SifAttachmentsSection__tbai" />
          </Panel>
        )}
      </div>
    </div>
  );
}
