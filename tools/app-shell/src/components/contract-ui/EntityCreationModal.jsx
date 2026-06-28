import { useState, useMemo, useCallback } from 'react';
import { useUI } from '@/i18n';
import { MODAL_STYLES } from './modal-styles.js';
import { LABEL_GAP, FIELD_HEIGHT_IMPORTANT } from '@/components/ui/formDensity';

const INPUT_BASE =
  'w-full rounded-md border border-input bg-white px-3 focus:ring-2 focus:ring-primary focus:outline-none';
const INPUT_CLS = `${INPUT_BASE} ${FIELD_HEIGHT_IMPORTANT} !text-[14px]`;
const SELECT_CLS =
  `w-full ${FIELD_HEIGHT_IMPORTANT} rounded-md border border-input bg-white px-3 !text-[14px] focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer`;
// ETP-4321: height now comes from the FIELD_HEIGHT class (36px). Keep fontSize
// only — the inline height/minHeight would otherwise override the token.
const SELECT_STYLE = { fontSize: '14px' };

export function DynamicSelect({
  value,
  onChange,
  options = [],
  loading,
  error,
  onRetry,
  loadingLabel,
  errorLabel,
  retryLabel,
  placeholder = '—',
}) {
  if (loading) {
    return (
      <select disabled style={SELECT_STYLE} className={`${SELECT_CLS} opacity-50`}>
        <option>{loadingLabel}</option>
      </select>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2">
        <select disabled style={SELECT_STYLE} className={`${SELECT_CLS} flex-1 opacity-50`}>
          <option>{errorLabel}</option>
        </select>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap transition-colors"
        >
          {retryLabel}
        </button>
      </div>
    );
  }
  return (
    <select style={SELECT_STYLE} className={SELECT_CLS} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FieldRenderer({ field, value, onChange, opts, ui, form, autoFocus }) {
  const selector = field.optionsKey ? (opts[field.optionsKey] ?? {}) : {};
  const dynProps = {
    loading: selector.loading,
    error: selector.error,
    onRetry: selector.onRetry,
    loadingLabel: ui('loadingOptions'),
    errorLabel: ui('errorLoadingOptions'),
    retryLabel: ui('retryLoad'),
  };

  if (field.type === 'select') {
    return (
      <select style={SELECT_STYLE} className={SELECT_CLS} value={value} onChange={e => onChange(field.id, e.target.value)}>
        {!field.required && <option value="">—</option>}
        {(field.options ?? []).map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'dynamicSelect') {
    return (
      <DynamicSelect
        {...dynProps}
        value={value}
        onChange={e => onChange(field.id, e.target.value)}
        options={selector.options ?? []}
        data-testid={"DynamicSelect__" + field.id} />
    );
  }

  if (field.type === 'conditionalSelect') {
    const hasOptions = (selector.options ?? []).length > 0;
    const isLoading = selector.loading;
    const parentValue = field.dependsOn ? form[field.dependsOn] : null;
    if (!isLoading && !hasOptions && parentValue) {
      return (
        <input
          type="text"
          className={INPUT_CLS}
          value={value}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder ?? ''}
        />
      );
    }
    return (
      <DynamicSelect
        {...dynProps}
        value={value}
        onChange={e => onChange(field.id, e.target.value)}
        options={selector.options ?? []}
        placeholder={field.dependsOn && !form[field.dependsOn] ? ui('selectCountryFirst') : '—'}
        data-testid={"DynamicSelect__" + field.id} />
    );
  }

  return (
    <input
      type={
        getInputType(field)
      }
      className={INPUT_CLS}
      value={value}
      onChange={e => onChange(field.id, e.target.value)}
      placeholder={field.placeholder ?? ''}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
    />
  );
}

function getInputType(field) {
  if (field.type === 'number') {
    return 'number';
  } else {
    if (field.type === 'email') {
      return 'email';
    } else {
      return field.type === 'tel' ? 'tel'
          : 'text';
    }
  }
}

function RepeatableSection({ section, rows, onAdd, onUpdate, onRemove, ui }) {
  const emptyRow = useMemo(
    () => Object.fromEntries((section.fields ?? []).map(f => [f.id, ''])),
    [section.fields]
  );

  if (section.noHeaders) {
    return (
      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              {i === 0 && (
                <div className="grid grid-cols-4 gap-3 mb-1.5">
                  {section.fields.map(f => (
                    <label key={f.id} style={MODAL_STYLES.fieldLabel}>
                      {ui(f.labelKey)}
                    </label>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-3">
                {section.fields.map(f => f.type === 'select' ? (
                  <select
                    key={f.id}
                    style={SELECT_STYLE}
                    className={SELECT_CLS}
                    value={row[f.id] ?? ''}
                    onChange={e => onUpdate(i, f.id, e.target.value)}
                  >
                    <option value="">—</option>
                    {(f.options ?? []).map(o => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    key={f.id}
                    type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                    style={{ fontSize: '14px' }}
                    className={`${INPUT_CLS} w-full`}
                    value={row[f.id] ?? ''}
                    placeholder={ui(f.labelKey)}
                    onChange={e => {
                      const v = f.type === 'tel' ? e.target.value.replace(/[^\d\s+\-().]/g, '') : e.target.value;
                      onUpdate(i, f.id, v);
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-muted-foreground hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0 mb-1"
              style={{ width: '20px' }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onAdd({ ...emptyRow })}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          + {ui(section.addLabelKey)}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                {section.fields.map(f => (
                  <th key={f.id} className="text-left px-3 py-2 font-medium text-muted-foreground">
                    {ui(f.labelKey)}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {section.fields.map(f => (
                    <td key={f.id} className="px-2 py-1.5">
                      <input
                        type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                        className={`${INPUT_BASE} h-7 text-xs`}
                        value={row[f.id] ?? ''}
                        onChange={e => onUpdate(i, f.id, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="text-muted-foreground hover:text-red-500 transition-colors text-base leading-none"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => onAdd({ ...emptyRow })}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
      >
        + {ui(section.addLabelKey)}
      </button>
    </div>
  );
}

function renderFieldInput(f, { form, onChange, opts, ui }) {
  return (
    <FieldRenderer
      field={f}
      value={form[f.id] ?? ''}
      onChange={onChange}
      opts={opts}
      ui={ui}
      form={form}
      data-testid="FieldRenderer__195103" />
  );
}

function CollapsibleFieldSection({ section, form, onChange, opts, ui }) {
  const [expanded, setExpanded] = useState(false);
  const allFields = section.fields ?? [];
  const hasData = allFields.some(f => !!form[f.id]);
  const summaryText = allFields
    .filter(f => f.inSummary && form[f.id])
    .map(f => form[f.id])
    .join(', ');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {ui(section.contentLabelKey ?? section.labelKey)}
        </span>
        {!expanded && !hasData && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            + {ui('add')}
          </button>
        )}
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            &minus;
          </button>
        )}
      </div>
      {!expanded && !hasData && (
        <p className="text-xs text-muted-foreground">{ui(section.emptyTextKey)}</p>
      )}
      {!expanded && hasData && (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex-1 text-left px-3 py-2 text-xs text-foreground hover:bg-muted/20 transition-colors truncate"
            >
              {summaryText || ui(section.contentLabelKey ?? section.labelKey)}
            </button>
            <button
              type="button"
              onClick={() => {
                allFields.forEach(f => onChange(f.id, ''));
                setExpanded(false);
              }}
              className="px-3 py-1.5 text-muted-foreground hover:text-red-500 transition-colors text-base leading-none shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {expanded && (
        <div className="grid grid-cols-4 gap-3">
          {allFields.map(f => (
            <div key={f.id} className={`${LABEL_GAP}${f.fullWidth ? ' col-span-4' : ''}`}>
              <label style={MODAL_STYLES.fieldLabel}>{ui(f.labelKey)}</label>
              {renderFieldInput(f, { form, onChange, opts, ui })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generic entity creation modal — structural shell with no business logic.
 *
 * Props:
 *   title          string — modal heading
 *   saveLabel      string — save button text (defaults to genericLabels.save)
 *   titleRightContent ReactNode — optional content rendered in title bar right side
 *   headerContent  ReactNode — optional content rendered above header fields
 *   headerFields   FieldConfig[] — always-visible fields above the tabs
 *   sections       SectionConfig[] — one tab per section
 *   requiredFields string[] — field IDs that must be non-empty to show Save
 *   onSave         async (form, repeatables) => void
 *   onCancel       () => void
 *   initialValues  object — pre-filled form values
 *   opts           { [optionsKey]: { options, loading, error, onRetry } }
 *   componentMap   { [name]: ReactComponent } — resolves section.component
 *   onFieldChange  (id, value) => void — called after every field change
 *   validate       (form, repeatables) => string | null — optional validation before save
 *
 * FieldConfig: { id, labelKey, type, required?, placeholder?, optionsKey?,
 *               dependsOn?, clearOnDependencyChange?, inSummary?, fullWidth? }
 * SectionConfig: { id, labelKey, contentLabelKey?, emptyTextKey?,
 *                  fields?, repeatable?, addLabelKey?, component? }
 */
export default function EntityCreationModal({
  title,
  saveLabel,
  titleRightContent = null,
  headerContent = null,
  headerFields = [],
  sections = [],
  requiredFields = [],
  onSave,
  onCancel,
  initialValues = {},
  opts = {},
  componentMap = {},
  onFieldChange,
  validate,
}) {
  const ui = useUI();
  const [tab, setTab] = useState(sections[0]?.id ?? '');
  const [form, setForm] = useState(initialValues);

  const [repeatables, setRepeatables] = useState(() =>
    Object.fromEntries(
      sections.filter(s => s.repeatable).map(s => {
        const emptyRow = Object.fromEntries((s.fields ?? []).map(f => [f.id, '']));
        const rows = Array.from({ length: s.initialRows ?? 0 }, () => ({ ...emptyRow }));
        return [s.id, rows];
      })
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const allDeclaredFields = useMemo(() => [
    ...headerFields,
    ...sections.flatMap(s => s.fields ?? []),
  ], [headerFields, sections]);

  const onChange = useCallback((id, value) => {
    const dependents = allDeclaredFields.filter(f => f.dependsOn === id && f.clearOnDependencyChange);
    setForm(f => {
      const next = { ...f, [id]: value };
      dependents.forEach(dep => { next[dep.id] = ''; });
      return next;
    });
    onFieldChange?.(id, value);
  }, [allDeclaredFields, onFieldChange]);


  const isSaveDisabled = loading || !requiredFields.every(id => {
    const val = form[id];
    return val !== undefined && val !== null && val !== '';
  });

  const handleSave = async () => {
    const validationError = validate?.(form, repeatables);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSave(form, repeatables);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderSectionContent = (section) => {
    if (section.component) {
      const Component = componentMap[section.component];
      if (!Component) return null;
      return (
        <Component
          form={form}
          onChange={onChange}
          opts={opts}
          requiredFields={requiredFields}
          data-testid="Component__195103" />
      );
    }
    if (section.plain && section.fields) {
      return (
        <div className="grid grid-cols-4 gap-3">
          {section.fields.map(f => (
            <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={MODAL_STYLES.fieldLabel}>{ui(f.labelKey)}</label>
              {renderFieldInput(f, { form, onChange, opts, ui })}
            </div>
          ))}
        </div>
      );
    }
    if (section.repeatable) {
      const rows = repeatables[section.id] ?? [];
      return (
        <RepeatableSection
          section={section}
          rows={rows}
          onAdd={(row) => setRepeatables(r => ({ ...r, [section.id]: [...(r[section.id] ?? []), row] }))}
          onUpdate={(i, k, v) =>
            setRepeatables(r => ({
              ...r,
              [section.id]: r[section.id].map((row, j) => (j === i ? { ...row, [k]: v } : row)),
            }))
          }
          onRemove={(i) =>
            setRepeatables(r => ({
              ...r,
              [section.id]: r[section.id].filter((_, j) => j !== i),
            }))
          }
          ui={ui}
          data-testid="RepeatableSection__195103" />
      );
    }
    if (section.fields) {
      return (
        <CollapsibleFieldSection
          section={section}
          form={form}
          onChange={onChange}
          opts={opts}
          ui={ui}
          data-testid="CollapsibleFieldSection__195103" />
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div className="entity-creation-modal" onClick={e => e.stopPropagation()} style={MODAL_STYLES.dialog}>
        {/* Title */}
        <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 16px 20px', gap: '20px', width: '100%', height: '64px', borderBottom: '1px solid #E8EAEF', flexShrink: 0 }}>
          <h2 style={MODAL_STYLES.title}>{title}</h2>
          {titleRightContent}
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 0px 0px', width: '100%', flex: 1, overflow: 'auto', alignSelf: 'stretch' }}>

        {/* Header fields — always visible, 4-col grid */}
        {headerContent && (
          <div style={{ padding: '0px 20px 12px 20px', width: '100%', alignSelf: 'stretch' }}>
            {headerContent}
          </div>
        )}

        {headerFields.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '0px 20px 12px 20px', gap: '20px', width: '100%', alignSelf: 'stretch' }}>
            {headerFields.map((f, idx) => (
              <div key={f.id} style={{ ...MODAL_STYLES.field, gridColumn: f.fullWidth ? 'span 4' : undefined }}>
                <label style={MODAL_STYLES.fieldLabel}>
                  {ui(f.labelKey)}{f.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
                </label>
                <FieldRenderer
                  field={f}
                  value={form[f.id] ?? ''}
                  onChange={onChange}
                  opts={opts}
                  ui={ui}
                  form={form}
                  autoFocus={idx === 0}
                  data-testid="FieldRenderer__195103" />
              </div>
            ))}
          </div>
        )}

        {/* Tab bar + progress bar */}
        <div style={MODAL_STYLES.tabBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {sections.map(s => {
              const active = tab === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTab(s.id)}
                  style={{
                    height: '48px',
                    padding: '8px 12px 16px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: active ? '2px solid #121217' : '2px solid transparent',
                    borderRadius: 0,
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 400,
                    color: active ? '#121217' : '#9ca3af',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s',
                  }}
                >
                  {ui(s.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div style={MODAL_STYLES.tabContent}>
          {sections.map(s => (
            <div key={s.id} style={{ display: tab === s.id ? 'block' : 'none', width: '100%' }}>
              {renderSectionContent(s)}
            </div>
          ))}
          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        </div>
        {/* /Body */}

        {/* Footer */}
        <div style={MODAL_STYLES.footer}>
          <div style={{ ...MODAL_STYLES.btnGroup, marginLeft: 'auto' }}>
            <button type="button" onClick={onCancel} style={MODAL_STYLES.btnCancel}>
              {ui('cancel')}
            </button>
            <button type="button" onClick={handleSave} disabled={isSaveDisabled} style={isSaveDisabled ? MODAL_STYLES.btnSaveDisabled : MODAL_STYLES.btnSaveEnabled}>
              {loading ? ui('processing') : (saveLabel ?? ui('save'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
