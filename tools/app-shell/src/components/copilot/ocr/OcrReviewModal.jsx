import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { getRouterBase } from '@/lib/deploymentBasePath.js';
import { useUI } from '@/i18n';
import KindRenderer from './kinds/KindRenderer.jsx';
import { CREATE_COMPONENTS } from './strategies.js';
import { checkBpHasLocation, findDuplicatePurchaseInvoices } from './ingest/purchaseInvoiceDescriptor.js';
import { getOcrDocType } from './ocrDocTypes.js';

/* eslint-disable react/prop-types */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-foreground' : 'bg-muted',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

function FieldRow({ labelText, valueText, checked, onToggle, toggleDisabled, expanded, notice, children }) {
  return (
    <div className="rounded-xl">
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0 flex-1 text-sm text-foreground">
          {labelText}: {valueText ? <span className="font-semibold">{valueText}</span> : null}
        </div>
        <Toggle
          checked={checked}
          onChange={onToggle}
          disabled={toggleDisabled}
          data-testid="Toggle__80a87a" />
      </div>
      {notice}
      {expanded && <div className="pb-2">{children}</div>}
    </div>
  );
}

function getExtractedValue(extracted, field) {
  if (Array.isArray(field.extractFrom)) {
    return extracted?.[field.extractFrom[0]] ?? extracted?.[field.extractFrom[1]] ?? null;
  }
  return extracted?.[field.extractFrom] ?? null;
}

function getInitialValue(field, extracted, preResolved) {
  // Entity fields must carry a resolved id (e.g. {id, label, bpId}). The raw
  // extracted text (vendor_name, tax_label, …) is only a search hint, never a
  // submittable value — surfacing it here would let the user submit a string
  // through the descriptor and end up with an unresolved $ref or a null FK.
  if (field.kind === 'entity') {
    const pre = preResolved?.[field.key];
    return pre && typeof pre === 'object' && pre.id ? pre : null;
  }
  return preResolved?.[field.key] ?? getExtractedValue(extracted, field);
}

function hasUsableValue(field, value) {
  if (value == null) return false;
  if (field.kind === 'entity') return Boolean(value?.id);
  return value !== '';
}

/**
 * Tracks whether the chosen vendor has an address. The invoice header cannot be saved without
 * one (C_Invoice.C_BPartner_Location_ID is NOT NULL), and a contact created from this modal
 * without filling its Dirección tab has none, so continuing would only end in "La acción
 * falló" after the lines review (ETP-5289). 'unknown' (the lookup itself failed) does not
 * block: the batch still reports a real failure if there is one.
 */
function useVendorAddressStatus({ vendorId, token, apiBaseUrl }) {
  const [status, setStatus] = useState({ vendorId: null, value: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!vendorId) return undefined;
    let cancelled = false;
    setStatus({ vendorId, value: 'checking' });
    checkBpHasLocation({ token, apiBaseUrl, bpId: vendorId })
      .then((value) => { if (!cancelled) setStatus({ vendorId, value }); });
    return () => { cancelled = true; };
  }, [vendorId, token, apiBaseUrl, attempt]);

  const value = vendorId && status.vendorId === vendorId ? status.value : 'idle';
  return { status: value, recheck: () => setAttempt(n => n + 1) };
}

function VendorAddressNotice({ status, onRecheck }) {
  const ui = useUI();
  if (status !== 'missing') return null;
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" data-testid="AlertCircle__80a87a" />
      <div className="min-w-0 flex-1">
        <p>{ui('ocrReviewVendorNoAddress')}</p>
        <button
          type="button"
          onClick={onRecheck}
          className="mt-1 font-medium underline underline-offset-2"
          data-testid="ocr-review-vendor-recheck"
        >
          {ui('ocrReviewVendorRecheck')}
        </button>
      </div>
    </div>
  );
}

/**
 * Looks up existing purchase invoices of the chosen vendor with the same supplier document
 * number, so uploading the same PDF twice is flagged (ETP-5654). Advisory only: the result
 * never feeds `canSubmit`, and a failed lookup ('unknown') shows nothing.
 */
function useDuplicateInvoice({ vendorId, documentNo, token, apiBaseUrl }) {
  const [state, setState] = useState({ key: null, invoices: [] });
  const wanted = String(documentNo ?? '').trim();
  const key = vendorId && wanted ? `${vendorId}\u0000${wanted.toLowerCase()}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    findDuplicatePurchaseInvoices({ token, apiBaseUrl, bpId: vendorId, documentNo: wanted })
      .then((result) => {
        if (!cancelled) setState({ key, invoices: result.status === 'duplicate' ? result.invoices : [] });
      });
    return () => { cancelled = true; };
  }, [key, vendorId, wanted, token, apiBaseUrl]);

  return { invoices: key && state.key === key ? state.invoices : [], documentNo: wanted };
}

// Placeholder substituted for the invoice link inside the translated duplicate-invoice message.
const DUPLICATE_LINK_TOKEN = '\u0001';

function DuplicateInvoiceNotice({ invoices, documentNo }) {
  const ui = useUI();
  if (!invoices.length) return null;
  const first = invoices[0];
  const prefix = getOcrDocType('purchase-invoice')?.routePrefix || '/purchase-invoice/';
  const label = first.documentNo || first.id;
  // The link text is the one dynamic part of the sentence; split the resolved message around a
  // placeholder token so the translation keeps full control of the word order.
  const [before, after = ''] = ui('ocrReviewDuplicateInvoice', { documentNo, invoice: DUPLICATE_LINK_TOKEN }).split(DUPLICATE_LINK_TOKEN);
  return (
    // InfoBanner always draws an accent border and cannot drop it through props, so this is a
    // plain div with InfoBanner's tone="warning" colour tokens minus the border and icon.
    <div
      className="mb-2 rounded-lg bg-status-warning px-3 py-2 text-xs font-medium leading-5 text-status-warning-foreground"
      data-testid="ocr-review-duplicate-invoice"
    >
      {before}
      <a
        href={`${getRouterBase()}${prefix}${first.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
        data-testid="ocr-review-duplicate-invoice-link"
      >
        {label}
      </a>
      {after}
    </div>
  );
}

function formatValue(value) {
  if (!value) return '';
  if (typeof value === 'object') return value.label || value.name || '';
  return String(value);
}

export default function OcrReviewModal({
  extracted,
  fields = [],
  preResolved = {},
  resolving,
  contactsBase,
  apiBaseUrl,
  token,
  onSubmit,
  onCancel,
}) {
  const ui = useUI();
  const [state, setState] = useState(() => Object.fromEntries(
    fields.map((field) => {
      const initialValue = getInitialValue(field, extracted, preResolved);
      return [field.key, {
        enabled: hasUsableValue(field, initialValue),
        value: initialValue,
        editing: false,
      }];
    }),
  ));

  const updateField = (fieldKey, patch) => {
    setState((prev) => ({
      ...prev,
      [fieldKey]: { ...prev[fieldKey], ...patch },
    }));
  };

  const vendorEntry = state.vendor;
  const vendorId = vendorEntry?.enabled ? vendorEntry?.value?.id || null : null;
  const vendorAddress = useVendorAddressStatus({ vendorId, token, apiBaseUrl });
  const documentNoEntry = state.documentNo;
  const documentNoValue = documentNoEntry?.enabled ? documentNoEntry?.value : null;
  const duplicate = useDuplicateInvoice({ vendorId, documentNo: documentNoValue, token, apiBaseUrl });
  const vendorAddressBlocks = vendorAddress.status === 'checking' || vendorAddress.status === 'missing';

  const handleSubmit = () => {
    const result = { vendor: null, documentNo: null, invoiceDate: null, dueDate: null };
    for (const field of fields) {
      const entry = state[field.key];
      const usable = entry?.enabled && hasUsableValue(field, entry?.value);
      result[field.key] = usable ? entry.value : null;
    }
    onSubmit(result);
  };

  const canSubmit = !vendorAddressBlocks && fields.every((field) => {
    if (field.key !== 'vendor') return true;
    const entry = state[field.key];
    return entry?.enabled && hasUsableValue(field, entry?.value);
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{ui('ocrReviewTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('ocrReviewSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={ui('ocrReviewCancel')}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <X size={18} data-testid="X__80a87a" />
          </button>
        </div>

        <div className="space-y-1 py-2">
          {fields.map((field) => {
            const entry = state[field.key] || { enabled: false, value: null, editing: false };
            const currentValue = formatValue(entry.value);
            const hasResolvedValue = hasUsableValue(field, entry.value);
            return (
              <FieldRow
                key={field.key}
                labelText={ui(field.label)}
                valueText={resolving && field.key === 'vendor' && !hasResolvedValue
                  ? ui('ocrReviewVendorChecking')
                  : currentValue}
                checked={Boolean(entry.enabled && hasResolvedValue)}
                onToggle={(checked) => updateField(field.key, { enabled: checked, editing: checked ? state[field.key]?.editing : false })}
                toggleDisabled={(field.key === 'vendor' && resolving) || !hasResolvedValue}
                expanded={!entry.enabled || !hasResolvedValue || entry.editing}
                notice={field.key === 'vendor'
                  ? (
                    <VendorAddressNotice
                      status={vendorAddress.status}
                      onRecheck={vendorAddress.recheck}
                      data-testid="VendorAddressNotice__80a87a" />
                  )
                  : (field.key === 'documentNo'
                    ? <DuplicateInvoiceNotice invoices={duplicate.invoices} documentNo={duplicate.documentNo} />
                    : null)}
                data-testid={"FieldRow__" + field.id}>
                <KindRenderer
                  mode="field"
                  kind={field.kind}
                  field={{ ...field, extracted }}
                  value={entry.value}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                  contactsBase={contactsBase}
                  createComponent={field.createComponent ? CREATE_COMPONENTS[field.createComponent] : null}
                  onChange={(value) => updateField(field.key, { value, enabled: true, editing: true })}
                  data-testid={"KindRenderer__" + field.id} />
              </FieldRow>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-control bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {ui('ocrReviewCancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ui('ocrReviewContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}
