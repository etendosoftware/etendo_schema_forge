import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import {
  CLAVE_TIPO_OPTIONS,
  PURCHASE_CLAVE_TIPO_FC_OPTIONS,
  SII_MOTIVO_RECTIF_OPTIONS,
  TBAI_REVERSEINVOICECODE_OPTIONS,
  VERIFACTU_INV_TYPE_OPTIONS,
} from '@/windows/custom/shared/useSifFieldPatcher.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

/**
 * ETP-6179 — the "Datos fiscales" step of every modal that creates AND completes an invoice in one
 * call (order / quotation / shipment / receipt / return → invoice), on the confirm-with-invoice
 * path and on the "create invoice" path alike.
 *
 * Those flows build the invoice on the server and complete it at once, so the user never saw the
 * invoice's SIF tab: a rectificative left as an ordinary F1, with no SII motive and no TicketBAI
 * code. This step shows the editable SIF fields of the fiscal systems ACTIVE for the invoice's
 * organization, prefilled with what the invoice would get, before anything is confirmed.
 *
 * The backend is the single source of truth (`sifDefaults` action, `InvoiceSifPreset` in
 * com.etendoerp.go): which systems apply, which fields are editable, their allowed codes and
 * their defaults all come from it, so the screen and the server never disagree. The values go
 * back as `sifFields` in the invoice-creating action's body. When no system is active the
 * response lists none and the step simply does not exist.
 *
 * Each field reuses the SIF tab's own label key and option list (`SifTab.jsx`,
 * `useSifFieldPatcher.js`), so the step never drifts from what the tab shows.
 */

const FIELD_LABEL_KEYS = {
  etsgDateOperation: 'sifDataTabs.field.operationDate',
  aeatsiiClaveTipo: 'sifDataTabs.field.invoiceType',
  aeatsiiClaveTipoFc: 'sifDataTabs.field.invoiceType',
  aeatsiiMotivoRectif: 'sifDataTabs.field.rectificationReason',
  aeatsiiDescripcionSii: 'sifDataTabs.field.siiDescription',
  aeatsiiIsauthorization: 'sifDataTabs.field.authorization',
  aeatsiiFechaRegCont: 'sifDataTabs.field.accountingRegDate',
  etvfacInvType: 'sifDataTabs.field.vfInvoiceType',
  etvfacVerifacDesc: 'sifDataTabs.field.vfOperationDescription',
  etvfacSimpinvart7273: 'sifDataTabs.field.simplifiedInvoiceArt7273',
  etvfacInvNoIDArt61d: 'sifDataTabs.field.noRecipientIdArt61d',
  tbaiReverseinvoicecode: 'sifDataTabs.field.tbaiReverseinvoicecode',
};

const FIELD_OPTIONS = {
  aeatsiiClaveTipo: CLAVE_TIPO_OPTIONS,
  aeatsiiClaveTipoFc: PURCHASE_CLAVE_TIPO_FC_OPTIONS,
  aeatsiiMotivoRectif: SII_MOTIVO_RECTIF_OPTIONS,
  etvfacInvType: VERIFACTU_INV_TYPE_OPTIONS,
  tbaiReverseinvoicecode: TBAI_REVERSEINVOICECODE_OPTIONS,
};

const SYSTEM_LABEL_KEYS = {
  SII: 'sifDataTabs.tab.sii',
  TicketBAI: 'sifDataTabs.tab.tbai',
  Verifactu: 'sifDataTabs.tab.verifactu',
};

// The rectification codes a rectificative invoice cannot be confirmed without — mirrors the
// backend guard (RectificationFiscalCodeGuard), which refuses the same blanks with a 422.
const REQUIRED_ON_RECTIFICATIVE = ['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode', 'etvfacInvType'];

// SifTab.jsx's display logic for the two VERI*FACTU flags: mutually exclusive on the type.
function isFieldShown(name, values) {
  const invType = values.etvfacInvType;
  if (name === 'etvfacSimpinvart7273') return invType !== 'R5' && invType !== 'F2';
  if (name === 'etvfacInvNoIDArt61d') return invType === 'R5' || invType === 'F2';
  return true;
}

/**
 * The step's state: the backend preview, the values the user edits, and where the modal is.
 *
 * The preview is fetched when the user presses the modal's primary button (`start`), not when
 * the modal opens: a flow that ends up creating no invoice never asks, and the answer reflects
 * the record as it is at that moment. `start(proceed)` then either shows the step (a fiscal
 * system with editable fields is active) or calls `proceed` straight away, so a modal wires ONE
 * handler: `onClick={() => sif.start(handleConfirm)}` — on the step, the same click confirms.
 *
 * Fails OPEN on a preview the server could not answer: the backend applies the same defaults
 * (document-type VERI*FACTU type, R4 on a rectificative) and refuses an invalid invoice with its
 * own 422, so a failed preview never blocks the flow, it only skips the review.
 *
 * @param {object} args
 * @param {boolean} args.enabled whether an invoice is going to be created at all
 * @param {Function} args.apiFetch the caller's authenticated fetch (`useApiFetch`)
 * @param {string} args.defaultsUrl the source record's `.../action/sifDefaults` URL
 * @param {object} [args.body] the keys that select what is invoiced (`shipmentIds`, `receiptIds`)
 * @param {boolean} [args.absoluteUrl] `defaultsUrl` is already complete (no base prefix)
 */
export function useInvoiceSifStep({ enabled, apiFetch, defaultsUrl, body, absoluteUrl = false }) {
  const [preview, setPreview] = useState(null);
  const [values, setValues] = useState({});
  const [phase, setPhase] = useState('idle');
  const bodyKey = JSON.stringify(body ?? {});
  const cacheKey = `${defaultsUrl}|${bodyKey}`;
  const cacheRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Nothing to review once no invoice is requested any more (a toggle switched off).
  useEffect(() => {
    if (!enabled) setPhase('idle');
  }, [enabled]);

  const fetchPreview = useCallback(async () => {
    if (cacheRef.current?.key === cacheKey) return cacheRef.current.data;
    const data = await fetchSifPreview(apiFetch, defaultsUrl, bodyKey, { absoluteUrl });
    if (data) cacheRef.current = { key: cacheKey, data };
    return data;
  }, [apiFetch, defaultsUrl, bodyKey, absoluteUrl, cacheKey]);

  const start = useCallback(async (proceed) => {
    if (!enabled || !defaultsUrl || phase === 'active') {
      return proceed();
    }
    if (phase === 'loading') return undefined;
    setPhase('loading');
    const data = await fetchPreview();
    if (!aliveRef.current) return undefined;
    if ((data?.systems?.length ?? 0) > 0) {
      setPreview(prev => {
        if (prev !== data) setValues({ ...(data.fields ?? {}) });
        return data;
      });
      setPhase('active');
      return undefined;
    }
    setPhase('idle');
    return proceed();
  }, [enabled, defaultsUrl, phase, fetchPreview]);

  const active = enabled && phase === 'active' && !!preview;
  const valid = useMemo(() => {
    if (!active) return true;
    if (!preview.rectificative) return true;
    const specs = new Set((preview.fieldSpecs ?? []).map(s => s.name));
    return REQUIRED_ON_RECTIFICATIVE.every(name => !specs.has(name) || !!values[name]);
  }, [active, preview, values]);

  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  return {
    /** The preview is being fetched: the modal shows it as busy. */
    loading: enabled && phase === 'loading',
    /** The modal is showing the step. */
    active,
    preview,
    values,
    setValue,
    /** Every rectification code a rectificative needs is chosen. */
    valid,
    /** Primary click: shows the step, or runs `proceed` when there is none / it is showing. */
    start,
    /** Back to the modal's first screen; the values typed so far are kept. */
    back: () => setPhase('idle'),
    /** What to send as `sifFields`; `undefined` when the step is not showing. */
    payload: active ? values : undefined,
  };
}

/**
 * One `sifDefaults` call: the preview, or `null` when the server could not answer (callers fail
 * open on `null`, see {@link useInvoiceSifStep}).
 *
 * @param {Function} apiFetch an authenticated fetch (hook or module-level)
 * @param {string} url the source record's `.../action/sifDefaults` URL
 * @param {string|object} [body] the keys that select what is invoiced
 * @param {{absoluteUrl?: boolean}} [opts]
 */
export async function fetchSifPreview(apiFetch, url, body, { absoluteUrl = false } = {}) {
  try {
    const res = await apiFetch(url, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      ...(absoluteUrl ? { baseUrl: '' } : {}),
    });
    if (!res.ok) return null;
    return (await res.json())?.response?.data ?? null;
  } catch {
    return null;
  }
}

/** Whether a preview has anything to show (a fiscal system with editable fields is active). */
export function hasSifSystems(preview) {
  return (preview?.systems?.length ?? 0) > 0;
}

// The SII key: the one field that legitimately differs between the orders of one bulk run
// (customers with their own key). Any other differing field comes from data GO never fills itself
// (an order created in Classic), so it reads "per order" instead of "per customer".
const PER_CUSTOMER_FIELDS = new Set(['aeatsiiClaveTipo', 'aeatsiiClaveTipoFc']);

/** The label a field shows in the bulk summary when its value differs between the invoices. */
export function varyingFieldLabelKey(name) {
  return PER_CUSTOMER_FIELDS.has(name)
    ? 'invoiceSifStep.variesPerCustomer'
    : 'invoiceSifStep.variesPerOrder';
}

/**
 * Merges the previews of several invoices into one read-only summary: the systems and fields of
 * all of them, a field's value when every invoice gets the same one, and the field listed in
 * `varying` when they do not (or when an invoice does not have it at all).
 */
function mergePreviews(previews) {
  const systems = [];
  const specs = [];
  const seen = new Set();
  previews.forEach(p => {
    (p.systems ?? []).forEach(sys => { if (!systems.includes(sys)) systems.push(sys); });
    (p.fieldSpecs ?? []).forEach(spec => {
      if (!seen.has(spec.name)) { seen.add(spec.name); specs.push(spec); }
    });
  });
  const fields = {};
  const varying = {};
  specs.forEach(({ name }) => {
    const values = previews.map(p => JSON.stringify(p.fields?.[name] ?? null));
    const has = previews.every(p => Object.prototype.hasOwnProperty.call(p.fields ?? {}, name));
    if (has && values.every(v => v === values[0])) {
      fields[name] = previews[0].fields[name];
    } else {
      varying[name] = true;
    }
  });
  const first = previews.find(hasSifSystems) ?? previews[0];
  return {
    preview: {
      ...first,
      systems,
      fieldSpecs: specs,
      fields,
      siiAuthorizationAvailable: previews.every(p => p.siiAuthorizationAvailable === true),
    },
    varying,
  };
}

/**
 * ETP-6179 — the bulk "one invoice per selected order" flows. Fetches the preview of every order
 * and answers what the read-only summary shows:
 *   - `none`    : no order has an active fiscal system, or a preview could not be read (fail open,
 *                 as the single-record step does) — the flow runs as before, without a summary;
 *   - `summary` : a fiscal system is active — `preview` merges every order's data (a value when it
 *                 is the same for all, the field in `varying` when it is not) and `previews[i]` is
 *                 what order `i` will be sent as its own `sifFields`.
 *
 * @param {Function} apiFetch an authenticated fetch
 * @param {string[]} urls one `.../action/sifDefaults` URL per order
 * @returns {Promise<{kind: 'none'|'summary', preview?: object, varying?: object, previews: object[]}>}
 */
export async function resolveBulkSifPreview(apiFetch, urls) {
  const previews = await Promise.all((urls ?? []).map(url => fetchSifPreview(apiFetch, url)));
  if (previews.length === 0 || previews.some(p => p == null) || !previews.some(hasSifSystems)) {
    return { kind: 'none', previews };
  }
  return { kind: 'summary', ...mergePreviews(previews), previews };
}

/**
 * A fixed, read-only step over a preview, for {@link InvoiceSifStepModal} in `readOnly` mode;
 * `varying` names the fields whose value differs between the invoices of a bulk run.
 */
export function readOnlySifStep(preview, varying = {}) {
  return {
    preview, values: preview?.fields ?? {}, varying, setValue: () => {}, valid: true, back: () => {},
  };
}

/** Adds `sifFields` to an invoice-creating action's body when the step produced values. */
export function withSifFields(body, sif) {
  return sif?.payload ? { ...body, sifFields: sif.payload } : body;
}

function FieldRow({ label, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm text-foreground font-medium" data-testid="Label__sifstep">
        {label}
      </Label>
      {children}
    </div>
  );
}

function OptionField({ id, spec, value, onChange, ui, disabled }) {
  const allowed = new Set(spec.options ?? []);
  const options = (FIELD_OPTIONS[spec.name] ?? []).filter(o => allowed.size === 0 || allowed.has(o.value));
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled} data-testid={`Select__sifstep_${spec.name}`}>
      <SelectTrigger id={id} data-testid={`SelectTrigger__sifstep_${spec.name}`}>
        <SelectValue placeholder="—" data-testid="SelectValue__sifstep" />
      </SelectTrigger>
      <SelectContent className="z-[60]" data-testid="SelectContent__sifstep">
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} data-testid={`SelectItem__sifstep_${o.value}`}>
            {o.value} — {ui(o.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StepField({ spec, values, setValue, authorizationAvailable, ui, readOnly, varies }) {
  const id = `sif-step-${spec.name}`;
  const value = values[spec.name];
  const label = ui(FIELD_LABEL_KEYS[spec.name] ?? spec.name);
  let control;
  if (varies) {
    control = (
      <Input
        id={id}
        type="text"
        value={ui(varyingFieldLabelKey(spec.name))}
        disabled
        readOnly
        className="bg-muted/40 italic"
        data-testid={`Varies__sifstep_${spec.name}`} />
    );
  } else if (spec.type === 'option') {
    control = <OptionField id={id} spec={spec} value={value} onChange={v => setValue(spec.name, v)} ui={ui} disabled={readOnly} />;
  } else if (spec.type === 'date') {
    control = (
      <DateField
        id={id}
        value={normalizeDateInputValue(value ?? '')}
        onChange={iso => setValue(spec.name, iso || null)}
        disabled={readOnly}
        data-testid={`DateField__sifstep_${spec.name}`} />
    );
  } else if (spec.type === 'boolean') {
    const disabled = readOnly || (spec.name === 'aeatsiiIsauthorization' && !authorizationAvailable);
    control = (
      <div className="h-10 flex items-center">
        <CheckboxField
          id={id}
          checked={Boolean(value)}
          disabled={disabled}
          onToggle={v => setValue(spec.name, v)}
          data-testid={`CheckboxField__sifstep_${spec.name}`} />
      </div>
    );
  } else {
    control = (
      <Input
        id={id}
        type="text"
        value={value ?? ''}
        onChange={e => setValue(spec.name, e.target.value)}
        disabled={readOnly}
        className="bg-card"
        data-testid={`Input__sifstep_${spec.name}`} />
    );
  }
  return <FieldRow label={label} htmlFor={id}>{control}</FieldRow>;
}

/**
 * The step's body: one section per active system with its editable fields. A field shared by
 * two systems (the operation date) is shown once, under the first.
 */
export function InvoiceSifStepPanel({ sif, readOnly = false, notice }) {
  const ui = useUI();
  const { preview, values, setValue } = sif;
  if (!preview) return null;

  const specs = preview.fieldSpecs ?? [];
  const systems = preview.systems ?? [];
  return (
    <div data-testid="invoice-sif-step" className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground leading-snug">{notice ?? ui('invoiceSifStep.description')}</div>
      {systems.map(system => {
        const fields = specs.filter(s => s.system === system && isFieldShown(s.name, values));
        if (fields.length === 0) return null;
        return (
          <section key={system} data-testid={`invoice-sif-step-${system}`} className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
              {ui(SYSTEM_LABEL_KEYS[system] ?? system)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {fields.map(spec => (
                <StepField
                  key={spec.name}
                  spec={spec}
                  values={values}
                  setValue={setValue}
                  authorizationAvailable={preview.siiAuthorizationAvailable === true}
                  readOnly={readOnly}
                  varies={!!sif.varying?.[spec.name]}
                  ui={ui} />
              ))}
            </div>
          </section>
        );
      })}
      {!readOnly && !sif.valid && (
        <div data-testid="invoice-sif-step-required" className="text-xs text-muted-foreground">
          {ui('invoiceSifStep.rectificationRequired')}
        </div>
      )}
    </div>
  );
}

/**
 * The step as a dialog of its own, for a flow whose first step is a shared modal it cannot
 * extend (the quotation's ActionChoiceModal). Same panel, with Back / Confirm.
 *
 * `readOnly` + `notice` + `onCancel` turn it into the bulk summary (one invoice per selected
 * order): the values are shown, never edited, and the secondary button cancels the whole run.
 */
export function InvoiceSifStepModal({
  sif, confirmLabel, loading = false, error, onConfirm, onClose, readOnly = false, notice, onCancel,
}) {
  const ui = useUI();
  const disabled = loading || !sif.valid;
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="invoice-sif-step-modal"
      onClick={loading ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[480px] max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-card border border-border/40 shadow-lg"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border/40 text-[15px] font-semibold text-foreground">
          {ui('invoiceSifStep.title')}
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <InvoiceSifStepPanel sif={sif} readOnly={readOnly} notice={notice} />
        </div>
        {error && (
          <div className="px-5 py-2 text-xs text-destructive whitespace-pre-line" data-testid="invoice-sif-step-modal-error">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border/40">
          <button
            type="button"
            data-testid="invoice-sif-step-modal-back"
            onClick={onCancel ?? sif.back}
            disabled={loading}
            className="text-xs px-3.5 py-1.5 rounded-md border border-border text-muted-foreground disabled:opacity-50"
          >
            {onCancel ? ui('cancel') : ui('back')}
          </button>
          <button
            type="button"
            data-testid="invoice-sif-step-modal-confirm"
            onClick={onConfirm}
            disabled={disabled}
            className="text-[13px] font-medium px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? ui('soProcessing') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
