import { useState } from 'react';
import { X } from 'lucide-react';
import { useUI } from '@/i18n';
import KindRenderer from './kinds/KindRenderer.jsx';
import { CREATE_COMPONENTS } from './strategies.js';

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
        checked ? 'bg-gray-900' : 'bg-gray-300',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

function FieldRow({ labelText, valueText, checked, onToggle, toggleDisabled, expanded, children }) {
  return (
    <div className="rounded-xl">
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0 flex-1 text-sm text-gray-900">
          {labelText}: {valueText ? <span className="font-semibold">{valueText}</span> : null}
        </div>
        <Toggle
          checked={checked}
          onChange={onToggle}
          disabled={toggleDisabled}
          data-testid="Toggle__80a87a" />
      </div>
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

  const handleSubmit = () => {
    const result = { vendor: null, documentNo: null, invoiceDate: null, dueDate: null };
    for (const field of fields) {
      const entry = state[field.key];
      const usable = entry?.enabled && hasUsableValue(field, entry?.value);
      result[field.key] = usable ? entry.value : null;
    }
    onSubmit(result);
  };

  const canSubmit = fields.every((field) => {
    if (field.key !== 'vendor') return true;
    const entry = state[field.key];
    return entry?.enabled && hasUsableValue(field, entry?.value);
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{ui('ocrReviewTitle')}</h2>
            <p className="mt-1 text-sm text-gray-500">{ui('ocrReviewSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={ui('ocrReviewCancel')}
            className="text-gray-400 hover:text-gray-600"
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
            className="rounded-full border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            {ui('ocrReviewCancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ui('ocrReviewContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}
