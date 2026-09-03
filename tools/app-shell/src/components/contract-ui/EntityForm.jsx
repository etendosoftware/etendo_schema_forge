import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FIELD_HEIGHT, ROW_GAP_Y, LABEL_GAP } from '@/components/ui/formDensity';
import { PillToggle } from '@/components/PillToggle';
import { ArrowUpRight, ChevronDown, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useLabel, useLocaleSwitch, useMenuLabel, useUI } from '@/i18n';
import { clampNumericFieldMax, getNumericFieldError, numericFieldToastId, trackSaveBlockToast } from '@/lib/numericValidation.js';
import { getContactsTextFieldError, filterContactsInputValue } from './contactsFieldValidation.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { resolveFkNavigation } from './fkNavigation.js';
import { ImageField } from './ImageField.jsx';
import ProductSearchDrawer from './ProductSearchDrawer.jsx';
import { CreateContactContext } from './CreateContactContext.js';
import { PartnerAddressPicker } from './PartnerAddressPicker.jsx';
import { CurrencyRatePicker } from './CurrencyRatePicker.jsx';
import PrefixedInput from './PrefixedInput.jsx';
import { SelectorChip } from './SelectorChip.jsx';
import { SelectorInput } from './SelectorInput.jsx';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';
import { InlineCreateSelector } from './InlineCreateSelector.jsx';
import LocationModalField from './LocationModalField.jsx';

function buildSelectPlaceholder(ui, label) {
  return `${ui('selectLabelPrefix')} ${label}...`;
}

// ETP-4737 scope-down: the saved/selected-value translation added below (renderSelectorField)
// only makes sense for windows whose DocumentType vocabulary the optionTranslator keywords
// (credit/memo/return/devoluci/rectific) actually understand. `payment-out`'s real doc types
// ("AP Payment", "Payment Proposal") and `purchase-order`'s ("Credit Order", "Return Material")
// either fall through to the wrong tab label (defaulting to "Factura") or get mistranslated
// into an invoice-only concept ("Nota de Crédito") that doesn't apply to an order/payment
// context. Scope the saved-value translation to the two windows it was built for; the
// pre-existing ETP-4600 options-list optionTranslator itself is untouched and still applies
// to every `reference: 'DocumentType'` field regardless of window.
const SAVED_VALUE_TRANSLATION_WINDOWS = new Set(['sales-invoice', 'purchase-invoice']);

// Static-select onChange value mapping: boolean-backed options may carry real
// booleans OR string values from different sources, hence the `String(id)`
// coercion before comparing to 'true'. Non-boolean fields pass the id through.
function resolveEnumChangeValue(id, isBoolean) {
  if (!isBoolean) return id;
  if (id === '' || id === null || id === undefined) return '';
  return String(id) === 'true';
}

function evalReadOnlyLogic(field, data) {
  if (typeof field?.readOnlyLogic !== 'function') return false;
  try {
    return !!field.readOnlyLogic(data ?? {});
  } catch (err) {
    console.error(`[readOnlyLogic] field='${field.key}' threw:`, err, '| record:', data);
    return false;
  }
}

function evalDisplayLogic(field, data) {
  if (typeof field?.displayLogic !== 'function') return true;
  try {
    return !!field.displayLogic(data ?? {});
  } catch (err) {
    console.error(`[displayLogic] field='${field.key}' threw:`, err, '| record:', data);
    return true;
  }
}

function buildSearchPlaceholder(ui, label) {
  return `${ui('searchLabelPrefix')} ${label}...`;
}

/** Resolve an i18n key to its label (falling back to the key), or undefined when absent. */
function resolveUiKey(ui, key) {
  return key ? (ui(key) ?? key) : undefined;
}

/**
 * Resolve the grid utility classes for an EntityForm container.
 * Extracted from a nested ternary to satisfy Sonar S3358 — the three branches
 * (override via `cols`, horizontal header form, vertical line form) have
 * distinct visual contracts and should read as independent statements.
 */
function resolveGridClass(cols, layout) {
  if (cols) return 'grid';
  if (layout === 'horizontal') return `grid grid-cols-2 gap-x-5 ${ROW_GAP_Y} md:grid-cols-4`;
  return 'grid grid-cols-2 gap-3 md:grid-cols-3';
}

/**
 * Button that opens the ProductSearchDrawer popup for fields with popup: true.
 */
function PopupSearchInput({ field, value, displayValue, onChange, label, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const displayText = displayValue || (value ? value : '');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`field-${field.key}`}
        className={`w-full ${FIELD_HEIGHT} text-sm rounded-lg border border-[hsl(var(--border-control))] bg-card p-2 text-left flex items-center gap-2 shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors`}
      >
        <Search
          className="h-4 w-4 text-muted-foreground shrink-0"
          data-testid={"Search__" + field.id} />
        {displayText ? (
          <span className="truncate text-foreground">{displayText}</span>
        ) : (
          <span className="truncate text-muted-foreground">{buildSearchPlaceholder(ui, label)}</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onChange(item.id, item.label || item.name); setOpen(false); }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={label}
        data-testid={"ProductSearchDrawer__" + field.id} />
    </>
  );
}

/**
 * Dropdown selector for plain FK fields with many options (inputMode: 'search') — e.g.
 * Business Partner/Contacto, Warehouse/Almacén, UoM. Delegates the actual search UI to
 * CreatableSearchSelect in `serverSearch` mode (ETP-4600 Phase 2b) so all FK search pickers
 * share one component. This thin wrapper only exists because the "Create contact" affordance
 * reads CreateContactContext via a hook, which is only legal inside a component body —
 * `renderSearchField` itself is a plain function, not a component, so the hook can't be
 * called there directly.
 */
function SearchSelectField({ f, value, displayValue, onChange, formData, resolvedLabel, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  // Optional "Create contact" capability injected by custom windows via context (ported
  // 1:1 from the old SearchInput): gates the create action to a single configured field,
  // e.g. sales-order's Business Partner (createContactCtxValue.fieldKey === 'businessPartner').
  const createCtx = React.useContext(CreateContactContext);
  const canCreate = !!createCtx && createCtx.fieldKey === f.key;
  return (
    <CreatableSearchSelect
      field={f}
      value={value}
      displayValue={displayValue}
      onChange={onChange}
      formData={formData}
      resolvedLabel={resolvedLabel}
      selectorUrl={selectorUrl}
      selectorContext={selectorContext}
      token={token}
      serverSearch
      createLabel={canCreate ? `+ ${ui('createContact')}` : undefined}
      onCreateRequest={canCreate
        // createCtx.onOpen(query, onSelect) opens the caller's creation modal; onSelect is
        // invoked with a `{ id, name }` object (see useCreateContactModal.jsx), whereas
        // CreatableSearchSelect's onCreated expects `(id, name)` positional args — adapt here.
        ? (query, onCreated) => createCtx.onOpen(query, (opt) => onCreated(opt.id, opt.name))
        : undefined}
      data-testid="CreatableSearchSelect__a8d626" />
  );
}

// SelectorInput moved to './SelectorInput.jsx' to be reused by both the form view
// here and the inline add-row in DataTable.

/**
 * Dependent Select for FK fields that require a parent context.
 * Re-fetches options whenever the parent value changes.
 */
function DependentSelect({ field, value, displayValue, onChange, catalogs, formData, resolvedLabel, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  const apiFetch = useApiFetch();
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const parentKey = field.dependsOn?.field;
  const parentValue = formData?.[parentKey];
  // Compare selectorContext by content, not by reference. DetailView recreates the
  // context object on every editing mutation even when values are identical, which
  // would otherwise refetch options on every callout cascade.
  const contextKey = JSON.stringify(selectorContext ?? {});

  React.useEffect(() => {
    if (!parentValue || !selectorUrl || !token) {
      setDynamicOptions([]);
      return;
    }

    setLoading(true);
    const url = buildUrlWithParams(selectorUrl, {
      ...selectorContext,
      [field.dependsOn?.filterKey]: parentValue,
    });
    apiFetch(url, { baseUrl: '', token })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.items) {
          const items = data.items.map(i => ({ id: i.id, name: i.label || i.name || i.id, ...i }));
          setDynamicOptions(items);
          // ETP-3894: when the parent changes and the previous value is no longer in
          // the new options list, auto-select the first available option (FIC parity —
          // the user explicitly chose the parent, so filling the dependent is helpful).
          // If no options exist and the field had a stale value, clear it.
          const noAutoSelect = field.dependsOn?.noAutoSelect;
          const currentValid = value && items.some(i => i.id === value);
          if (!currentValid) {
            if (!noAutoSelect && items.length > 0) {
              onChange(items[0].id, items[0].name);
            } else if (value) {
              onChange('', '');
            }
          }
        }
      })
      .catch(() => {
        setDynamicOptions([]);
      })
      .finally(() => setLoading(false));
  }, [parentValue, selectorUrl, contextKey, token, apiFetch, field.dependsOn?.filterKey]);

  // If the current value isn't in options (real data from existing record), add it
  const hasValue = value && dynamicOptions.some(opt => opt.id === value);
  const options = (!hasValue && value && displayValue)
    ? [...dynamicOptions, { id: value, name: displayValue }]
    : dynamicOptions;

  // Auto-clear dependent field if parent is cleared
  React.useEffect(() => {
    if (!parentValue && value) {
      onChange('', '');
    }
  }, [parentValue, value]);

  return (
    <Select
      value={value || '__empty__'}
      onValueChange={(val) => {
        if (val === '__empty__') {
          onChange('', '', null);
          return;
        }
        const opt = options.find(o => o.id === val);
        onChange(val, opt?.name, opt);
      }}
      required={field.required}
      disabled={(!parentValue && !value) || loading}
      data-testid={"Select__" + field.id}>
      <SelectTrigger id={field.key} data-testid={`field-${field.key}`} className="focus:ring-2 focus:ring-primary">
        <SelectValue
          placeholder={loading ? ui('loading') : (parentValue ? buildSelectPlaceholder(ui, resolvedLabel) : ui('selectParentFirst'))}
          data-testid={"SelectValue__" + field.id} />
        {loading && <Loader2
          className="h-4 w-4 text-muted-foreground animate-spin ml-auto mr-1"
          data-testid={"Loader2__" + field.id} />}
      </SelectTrigger>
      <SelectContent data-testid={"SelectContent__" + field.id}>
        {!field.required && <SelectItem value="__empty__" data-testid={"SelectItem__" + field.id}>&nbsp;</SelectItem>}
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id} data-testid={`option-${field.key}-${opt.id}`}>{opt.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Form field that opens a ProductSearchDrawer for lookup-enabled search fields.
 */
function LookupFormField({ field, value, displayValue, selectorUrl, selectorContext, token, resolvedLabel, onChange }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const display = displayValue || value || '';
  return (
    <>
      <button
        type="button"
        data-testid={`field-${field.key}`}
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 ${FIELD_HEIGHT} rounded-lg border border-[hsl(var(--border-control))] bg-card p-2 text-sm text-left shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors`}
      >
        <Search
          className="h-4 w-4 text-muted-foreground shrink-0"
          data-testid={"Search__" + field.id} />
        {display ? (
          <span className="flex-1 truncate text-foreground">{display}</span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">{buildSearchPlaceholder(ui, resolvedLabel)}</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          onChange(item.id, item.label || item.name || item._identifier || '', item);
          setOpen(false);
        }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={resolvedLabel}
        data-testid={"ProductSearchDrawer__" + field.id} />
    </>
  );
}

// Only two shapes of `auxData` are a real aux contract: the `standardPrice` price-list
// mapping (below) and the nested `_aux` object (e.g. `product_PSTD`, `_PLIM`, `_UOM`,
// `_CURR` — suffixes that already start with `_`, so `f.key + auxSuffix` composes a valid
// field name). Every OTHER top-level key on `auxData` is just a raw field the selector's
// server item happened to carry (id, name, active, searchKey, ...) — NOT a suffix to
// concatenate onto `f.key`. Treating it as one produced bogus field names like
// `assetCategoryid` (f.key + 'id', no separator) that then slipped past the callout
// ignore-guard and fired spurious duplicate callouts (ETP-4600 regression).
function applyLookupAuxData(auxData, isGross, onChange, f) {
  for (const [suffix, auxVal] of Object.entries(auxData)) {
    // Price from the document's price list. Mapping depends on price list type:
    //   - Gross list (isTaxIncluded=true): standardPrice is the gross price → grossUnitPrice
    //   - Net list   (isTaxIncluded=false): standardPrice is the net price   → unitPrice
    if (suffix === 'standardPrice' && auxVal != null) {
      if (isGross) {
        onChange?.('grossUnitPrice', auxVal);
      } else {
        // Mirror InlineAddRow: for net price lists, standardPrice is the net price →
        // populate both unitPrice and listPrice so sidebar and add-row behave identically.
        onChange?.('unitPrice', auxVal);
        onChange?.('listPrice', auxVal);
      }
    } else if (suffix === '_aux' && auxVal && typeof auxVal === 'object') {
      for (const [auxSuffix, auxSuffixVal] of Object.entries(auxVal)) {
        onChange?.(f.key + auxSuffix, auxSuffixVal);
      }
    }
    // Any other key (id, name, active, searchKey, isTaxIncluded, ...) is intentionally
    // ignored — it is a raw selector-item field, not an aux suffix.
  }
}

function PopupSearchField(props) {
  return (
    <div className={LABEL_GAP}>
      <Label
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {props.label}{(props.f.required || props.f.requiredVisual) ? <span className="text-destructive ml-0.5">*</span> : ""}
      </Label>
      <PopupSearchInput
        field={props.f}
        value={props.data?.[props.f.key] ?? ""}
        displayValue={props.data?.[props.f.key + "$_identifier"]}
        onChange={props.onChange}
        label={props.label}
        selectorUrl={props.selectorUrl}
        selectorContext={props.selectorContext}
        token={props.token}
        data-testid="PopupSearchInput__a8d626" />
    </div>
  );
}

function getCheckboxStateClass(checked) {
  return checked
      ? 'bg-primary text-primary-foreground'
      : 'bg-transparent';
}

// Callers of this helper (PopupSearchField's sibling paths, DependentFkField,
// the lookup/search label) are only reached along the editable branch of their
// wrapping renderers (the isReadOnly branch early-returns to a read-only
// display before the label is built), so no explicit isReadOnly gate is needed
// here — see labelMarker/requiredAsteriskIfEditable for the gated equivalents.
function requiredAsterisk(f) {
  return (f.required || f.requiredVisual) ? <span className="text-destructive ml-0.5">*</span> : null;
}

/**
 * Trailing marker rendered after a field label.
 * Required fields get a red asterisk; otherwise, when `optionalSuffix` is enabled
 * for the form (Figma list-modal style), a muted "(opcional)" suffix is shown.
 * Generic + opt-in: forms that don't pass `optionalSuffix` keep the old behaviour
 * (asterisk only). The suffix text comes from the i18n `optional` key.
 * `f.requiredVisual` renders the same asterisk WITHOUT enforcing validation — for
 * fields whose obligatoriness is conditional on another field and can't use a real
 * `required: true`.
 */
function labelMarker(f, isReadOnly, optionalSuffix, ui) {
  if ((f.required || f.requiredVisual) && !isReadOnly) return <span className="text-[hsl(var(--destructive))] ml-0.5">*</span>;
  if (optionalSuffix && !isReadOnly) {
    return <span className="ml-1 font-normal text-[hsl(var(--muted-foreground))]">({ui('optional')})</span>;
  }
  return null;
}

/**
 * Helper text rendered below a field input (e.g. "Menor número = mayor prioridad").
 * `f.help` is an i18n key resolved via useUI; raw strings are passed through so the
 * component stays usable with literal copy too.
 */
function FieldHelp({ field, ui }) {
  if (!field?.help) return null;
  const text = ui(field.help) ?? field.help;
  return <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]" data-testid={`help-${field.key}`}>{text}</p>;
}

function formatReadOnlyDisplayValue(f, isReadOnly, rawDisplayValue) {
  if (!(f.type === 'number' && isReadOnly && Number.isFinite(Number(rawDisplayValue)))) {
    return rawDisplayValue;
  }
    return parseFloat(Number(rawDisplayValue).toFixed(10));
}

function buildSearchSelectorUrl(apiBaseUrl, entity, f, apiSelectorEntry) {
  return apiBaseUrl ? (() => {
    const base = `${apiBaseUrl}/${entity}/selectors/${f.column}`;
    if (apiSelectorEntry?.url?.includes('?')) {
      return `${base}?${apiSelectorEntry.url.split('?')[1]}`;
    }
    return base;
  })() : null;
}

function requiredAsteriskIfEditable(f, isReadOnly) {
  return (f.required || f.requiredVisual) && !isReadOnly ? <span className="text-destructive ml-0.5">*</span> : null;
}

function getInputStateClass(isReadOnly) {
  return isReadOnly ? 'bg-muted/50' : 'bg-card focus:ring-2 focus:ring-focus-ring focus:outline-none';
}

// Renders only the dependent selector itself (no wrapping label) — the label lives
// in the caller's wrapper div (renderDependentField), matching the same label/selector
// split renderSearchSelectField uses, so renderFieldWithError's cloneElement-injected
// error <p> (ETP-3894) lands inside a real div that renders {props.children} — see
// ETP-4773. Keeping the label OUT of this component (rather than just deduplicating it)
// is what makes that injection possible: DependentFkField previously returned its own
// <div> with no children slot for the caller to append into.
function DependentFkField(props) {
  return props.f.column === "C_BPartner_Location_ID" ? (
      <PartnerAddressPicker
        field={props.f}
        value={props.data?.[props.f.key] ?? ""}
        displayValue={props.data?.[props.f.key + "$_identifier"]}
        onChange={props.onChange}
        formData={props.data}
        resolvedLabel={props.label}
        selectorUrl={props.selectorUrl}
        selectorContext={props.selectorContext}
        token={props.token}
        apiBaseUrl={props.apiBaseUrl}
        data-testid="PartnerAddressPicker__a8d626" />
  ) : (
      <DependentSelect
        field={props.f}
        value={props.data?.[props.f.key] ?? ""}
        displayValue={props.data?.[props.f.key + "$_identifier"]}
        onChange={props.onChange}
        catalogs={props.catalogs}
        formData={props.data}
        resolvedLabel={props.label}
        selectorUrl={props.selectorUrl}
        selectorContext={props.selectorContext}
        token={props.token}
        data-testid="DependentSelect__a8d626" />
  );
}

function buildDependentSelectorUrl(apiBaseUrl, entity, f) {
  return apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null;
}

// Selector URL for a pure-dropdown FK field. Always computed from apiBaseUrl so the
// full server path is included; appends query params from the api.selectors entry
// (e.g. ?isSOTrx=Y) when present.
function buildEntitySelectorUrl(apiBaseUrl, entity, f, api) {
  if (!apiBaseUrl) return null;
  const entry = api?.selectors?.find(s => s.entity === entity && s.field === f.key);
  const base = `${apiBaseUrl}/${entity}/selectors/${f.column}`;
  return entry?.url?.includes('?') ? `${base}?${entry.url.split('?')[1]}` : base;
}

// Propagate a selector's aux payload onto sibling form fields. `_aux` is the ONLY known
// aux contract here: a nested object of suffix→value pairs whose suffixes already start
// with `_` (e.g. `_PSTD`, `_PLIM`, `_UOM`), so `f.key + auxSuffix` composes a valid field
// name. `auxData` itself is the raw selector-item object (CreatableSearchSelect's
// `handleSelect` passes the whole `opt`), so every OTHER top-level key (id, name, active,
// searchKey, ...) must be ignored — treating them as suffixes produced bogus concatenated
// field names (e.g. `assetCategoryid`) that slipped past the callout ignore-guard and
// fired spurious duplicate callouts (ETP-4600 regression).
function applySelectorAuxData(auxData, onChange, f) {
  const auxObj = auxData?._aux;
  if (!auxObj || typeof auxObj !== 'object') return;
  for (const [auxSuffix, auxSuffixVal] of Object.entries(auxObj)) {
    onChange?.(f.key + auxSuffix, auxSuffixVal);
  }
}

function isSelectFieldWithOptions(f) {
  return f.type === 'select' && f.options?.length;
}

function getInputType(f) {
  return f.type === 'number' ? 'number' : 'text';
}

function isCurrencyRateSelectorField(entity, apiBaseUrl, f) {
  return f.column === 'C_Currency_ID'
    && (entity === 'header' || entity === 'quotation')
    && /\/(sales-order|purchase-order|sales-quotation|sales-invoice|purchase-invoice)(\/|$)/.test(apiBaseUrl || '');
}


function getFieldValue(isReadOnly, displayValue, data, f) {
  return isReadOnly ? displayValue : (data?.[f.key] ?? '');
}

function getReadOnlyBgClass(isReadOnly) {
  return isReadOnly ? 'bg-muted/50 cursor-default' : 'bg-card';
}

/**
 * Commit-on-blur text/number input (opt-in via `field.calloutOn === 'blur'`).
 *
 * Unlike the default input — which is fully controlled by `data` and commits every
 * keystroke to the parent form state — this variant keeps a LOCAL draft buffer while
 * the field is focused and commits to the parent `onChange` ONLY on blur. The single
 * blur commit both updates the form state (`hook.editing`) AND fires the column callout
 * through the normal `onChange` path, so EVERYTHING that reads `editing` live (e.g. the
 * Assets "Depreciation Summary" sidebar mirroring `assetValue`) stays stable until the
 * user leaves the field — one mechanism for both the callout deferral and the mirror
 * deferral.
 *
 * Controlled-input sync rules (classic "controlled input with local draft"):
 *  - Initialize the buffer from `committedValue`.
 *  - While UNFOCUSED, follow `committedValue` (callout results, record load/switch,
 *    defaults applied externally) so the displayed value stays correct.
 *  - While FOCUSED, hold the buffer untouched so external churn never clobbers the
 *    user's in-progress typing.
 *  - On blur, commit the buffer to the parent in a single `onChange(key, value, column)`.
 *
 * `committedValue` is the same `data?.[f.key] ?? ''` the default path reads, so the
 * value semantics are identical — only the commit TIMING differs.
 */
function DeferredInput({ f, committedValue, onCommit, onFieldBlur, onValidateBlur, placeholder, className, required, disabled, maxLength }) {
  const [buffer, setBuffer] = useState(committedValue);
  const focusedRef = useRef(false);
  // The last value the USER actually committed (or that arrived externally while the field
  // was idle). The on-blur "did it change?" gate compares against THIS, not committedValue
  // (= hook.editing). committedValue is mutated by callout collateral writes behind the
  // user's back — e.g. editing AssetValue makes the callout write DepreciationAmt and a 0
  // Residual into editing; if we gated on committedValue, clearing AssetValue (→ '0') when a
  // collateral 0 already sits in editing would compare 0 === 0 and SKIP the commit, so the
  // Residual recompute never fires. Tracking the user's own last value fixes that. ETP-4333.
  const lastUserValueRef = useRef(committedValue);

  // While the field is not focused, follow the committed value so external updates
  // (callout results, record switch, defaults) are reflected. While focused, the
  // user's draft wins and we ignore committed-value changes to avoid clobbering input.
  // Idle external changes also become the new "last value" baseline so they are not
  // mistaken for a user edit on the next blur.
  useEffect(() => {
    if (!focusedRef.current) {
      setBuffer(committedValue);
      lastUserValueRef.current = committedValue;
    }
  }, [committedValue]);

  const isNumber = getInputType(f) === 'number';
  const sameAsLast = (v) => {
    const prev = lastUserValueRef.current;
    return isNumber ? Number(v) === Number(prev ?? '') : String(v) === String(prev ?? '');
  };

  return (
    <Input
      id={f.key}
      name={f.key}
      data-testid={`field-${f.key}`}
      type={getInputType(f)}
      value={buffer ?? ''}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => setBuffer(e.target.value)}
      onBlur={(e) => {
        focusedRef.current = false;
        // For NUMBER fields, coerce a cleared/blank value to '0' on commit. Otherwise the
        // empty string short-circuits the generic fireCallout guard (`if (!value) return`)
        // in DetailView, so clearing the field would leave dependent amounts (e.g. the
        // Assets Residual) stale. Committing '0' fires the callout with 0 and leaves the
        // input showing 0. Text fields keep their raw value (no coercion). ETP-4333.
        const raw = e.target.value;
        let v = (isNumber && raw.trim() === '') ? '0' : raw;
        // Silently clamp to the field's declared `max` (e.g. Annual Depreciation % ≤ 100).
        // This is a correction, not a validation — it never blocks the commit or shows a
        // toast, unlike getNumericFieldError below which only handles `min`/`integer`. ETP-4887.
        v = clampNumericFieldMax(f, v);
        // Re-sync the displayed buffer to the (possibly coerced) committed value.
        setBuffer(v);
        // Only COMMIT (fires the callout via onChange) when the value differs from the
        // value the USER last committed — so a no-op blur (focus then leave untouched)
        // does nothing, while a genuine edit (including clearing back to 0 after a
        // collateral write) always fires. Record the new user value either way so the
        // next blur compares against the correct baseline. ETP-4333.
        const changed = !sameAsLast(v);
        lastUserValueRef.current = v;
        if (changed) onCommit?.(f.key, v, f.column);
        // Validate the RAW value the user left (pre-'0' coercion) so a genuinely
        // empty field is not reported as below-min. ETP-4542.
        onValidateBlur?.(f, raw);
        onFieldBlur?.(f.key);
      }}
      placeholder={placeholder}
      className={className}
      required={required}
      disabled={disabled}
      maxLength={maxLength}
    />
  );
}

/**
 * Generic Entity Form component.
 * Layouts: 'horizontal' (grid-based edit form) | 'vertical' (stack-based sidebar)
 * 
 * Props:
 *  - fields: Array<{ key, label, type, required, reference, inputMode, dependsOn }>
 *  - data: object with current field values
 *  - onChange: (fieldKey, value) => void
 *  - catalogs: Record<string, Array<{ id, name, ... }>> for FK reference data
 *  - displayLogic: { readOnly: { fieldName: bool }, visibility: { fieldName: bool } }
 *  - trailing: optional React node rendered as an ADDITIONAL grid item after the
 *    field cells, INSIDE the same grid container — so it flows into the next free
 *    grid cell instead of starting a new grid. Undefined for every existing caller.
 *  - renderAsFragment: when true, emit the field cell(s) WITHOUT the wrapping grid
 *    container (a bare fragment), so the caller can splice them into another
 *    EntityForm's grid via its `trailing` slot. Opt-in; default false.
 */
export function EntityForm({ entity, windowName, fields = [], data, onChange, catalogs, layout, cols, section, excludeFields = [], displayLogic, api, token, apiBaseUrl, selectorContext = {}, readOnly: formReadOnly = false, onFieldBlur, savingField = null, labelOverrides, registerFields, fieldErrors, optionalSuffix = false, trailing, renderAsFragment = false, navigate }) {
  const t = useLabel(labelOverrides ?? api?.labelOverrides);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const effectiveSelectorContext = useMemo(() => selectorContext ?? {}, [selectorContext]);
  const visibleBaseFields = fields.filter(f => !excludeFields.includes(f.key));
  let displayFields;
  if (section) {
    // When filtering by section, include all fields (editable + readOnly) for that section
    displayFields = visibleBaseFields.filter(f => f.section === section);
  } else if (layout === 'horizontal') {
    displayFields = visibleBaseFields.filter(f => !f.readOnly);
  } else {
    displayFields = visibleBaseFields;
  }

  // Apply visibility from evaluate-display (hide fields where visibility === false).
  // Only honor the evaluate-display result if the field declares server-side gating —
  // either a truthy `displayLogic` value OR `visibilitySource === 'server'` (the marker
  // generate-frontend.js emits for non-evaluable raw AD expressions, e.g. server macros
  // like @ACCT_DIMENSION_DISPLAY@ — those fields carry NO `displayLogic` property at all,
  // only `visible: null, visibilitySource: 'server', displayLogicReason: '...'`, per
  // buildDisplayLogicPart() in generate-frontend.js). Fields with neither marker have a
  // static visibility decision that evaluate-display must not override (prevents AD
  // displayLogic bugs from incorrectly hiding fields like businessPartner).
  // Fields with a function-based displayLogic are handled entirely client-side (second
  // filter below) and must NOT be removed here — the server result is irrelevant for them.
  if (displayLogic?.visibility && Object.keys(displayLogic.visibility).length > 0) {
    displayFields = displayFields.filter(f =>
      typeof f.displayLogic === 'function'
        || (!f.displayLogic && f.visibilitySource !== 'server')
        || displayLogic.visibility[f.key] !== false
    );
  }

  // Apply function-based displayLogic evaluated client-side against current data.
  // This mirrors the readOnlyLogic pattern and handles fields like customer/vendor
  // tabs where visibility depends on a sibling checkbox value (no server round-trip needed).
  displayFields = displayFields.filter(f => evalDisplayLogic(f, data));

  // Stable ID unique to this EntityForm instance. Used as the Map key in useEntity's
  // formFieldsRef so multiple EntityForms on the same screen accumulate rather than
  // overwrite each other.
  const formId = React.useId();

  // Register only the currently visible fields with useEntity so handleSave validates
  // what the user can actually see and fill — not hidden fields controlled by displayLogic.
  // Cleanup removes this form's entry when the component unmounts (e.g. conditional blocks).
  React.useEffect(() => {
    if (typeof registerFields !== 'function') return;
    registerFields(displayFields, formId);
    return () => registerFields(null, formId);
  // displayFields is recomputed on every render; the effect intentionally re-runs
  // whenever visibility changes so the validation set stays in sync with the form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerFields, formId, data, displayLogic, fields, excludeFields, section, layout]);

  if (displayFields.length === 0) return null;

  const gridClass = resolveGridClass(cols, layout);
  // minmax(0, 1fr) (not bare `1fr`) — a plain `1fr` track's implicit minimum is
  // `auto` (the item's min-content size), so a long unbreakable value (e.g. a
  // long contact name in a CreatableSearchSelect chip) would grow the column
  // past its fair share instead of letting `truncate` clip it (ETP-4600 Gap D).
  // Tailwind's own `grid-cols-N` utility (the `resolveGridClass` default path)
  // already bakes this in; this inline-style override path needs it explicitly.
  const gridStyle = cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 } : undefined;

  // If there's an image field (not inline), pin it to the right — rest of fields render in a 3-col grid on the left
  const imageField = displayFields.find(f => f.type === 'image' && !f.inline);
  const fieldsToRender = imageField ? displayFields.filter(f => f.type !== 'image' || f.inline) : displayFields;

  // Shared by both the editable DocumentType selector (renderSelectorField below) and the
  // read-only FK renderer (renderReadOnlyFk) — a saved record must show the SAME translated
  // label the options list shows, in EITHER mode, not just while the field is still
  // editable (ETP-4737 follow-up: a completed purchase invoice's read-only DocumentType
  // field was falling through to the raw AD name, "(compras)" suffix and all).
  const translateDocumentTypeName = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('reversed')) return null;
    if (lower.includes('credit') || lower.includes('memo')) return ui('creditNotesTab');
    if (lower.includes('return') || lower.includes('devoluci')) return ui('returnsTab');
    if (lower.includes('rectific')) return ui('rectificativeInvoicesTab');
    return ui('invoicesTab');
  };

  // FK-style field renderers hoisted out of renderField to keep its cognitive
  // complexity low. They close over the EntityForm scope; per-field values
  // (f, label, isReadOnly) are passed in.
  const renderReadOnlyFk = (f, label) => {
    const rawIdentifier = resolveIdentifier(data, f.key) || data?.[f.key] || '';
    // Scoped exactly like the editable path's SAVED_VALUE_TRANSLATION_WINDOWS guard — only
    // sales-invoice/purchase-invoice's DocumentType field gets the translated label; every
    // other read-only FK (business partner, warehouse, etc.) keeps its raw AD identifier.
    const displayValue = f.reference === 'DocumentType' && SAVED_VALUE_TRANSLATION_WINDOWS.has(windowName) && rawIdentifier
      ? (translateDocumentTypeName(rawIdentifier) ?? rawIdentifier)
      : rawIdentifier;
    // ETP-5075 — a read-only FK whose column is in the fkNavigation registry renders as a
    // click-through to the referenced record instead of an inert disabled input. Fails
    // closed on every count: no registry entry, no resolvable id, or no `navigate` handed
    // down (EntityForm is rendered outside a Router in unit tests) all keep the input.
    const navigateTo = navigate ? resolveFkNavigation(f.column, data) : null;
    return (
      <div key={f.key} data-testid={`field-${f.key}`} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}
        </Label>
        {navigateTo ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(navigateTo); }}
            className={`${FIELD_HEIGHT} inline-flex w-full items-center justify-between gap-1 rounded-md border border-border-subtle bg-card px-3 text-left text-sm text-foreground underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]`}
            data-testid={`fk-link-${f.key}`}>
            <span className="truncate">{displayValue}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0" data-testid="ArrowUpRight__a8d626" />
          </button>
        ) : (
          <Input
            id={f.key}
            name={f.key}
            value={displayValue}
            disabled
            data-testid="Input__a8d626" />
        )}
      </div>
    );
  };

  // Renders the shared searchable combobox (CreatableSearchSelect, serverSearch mode) for
  // FK `type:'selector'` fields — both the opt-in `searchSelect: true` fields (decisions)
  // and, since ETP-4600, the DEFAULT for any plain FK selector (see renderSelectorField).
  // When the field also declares `allowCreate` + create target, render the create-capable
  // variant whose "+ create" action opens a name-only modal (e.g. match-rule transaction
  // type → ETGO_Transaction_Type). Only reached for editable fields (renderSelectorField
  // returns early when read-only). `serverSearch: true` is always on here: every
  // `type:'selector'` field resolves to the same `/selectors/{column}` endpoint
  // (buildEntitySelectorUrl / buildSearchSelectorUrl produce the same URL shape), which
  // already supports the `?q=` server-side search used by `type:'search'` fields — data
  // must come from the DB, never a locally-filtered fetch-once page.
  const renderSearchSelectField = (f, label, selectorOnChange, selectorUrl) => {
    const commonProps = {
      field: f,
      value: data?.[f.key] ?? '',
      displayValue: resolveIdentifier(data, f.key),
      onChange: selectorOnChange,
      formData: data,
      resolvedLabel: label,
      selectorUrl,
      selectorContext: effectiveSelectorContext,
      token,
      emptyOptionLabel: resolveUiKey(ui, f.emptyOptionLabelKey),
      serverSearch: true,
    };
    const canCreate = !!(f.allowCreate && f.createSpec && f.createEntity && apiBaseUrl);
    const createTitle = f.createTitleKey
      ? resolveUiKey(ui, f.createTitleKey)
      : (resolveUiKey(ui, f.createLabelKey) ?? '');
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, false, optionalSuffix, ui)}
        </Label>
        {canCreate ? (
          <InlineCreateSelector
            {...commonProps}
            apiBaseUrl={apiBaseUrl}
            createSpec={f.createSpec}
            createEntity={f.createEntity}
            createLabel={resolveUiKey(ui, f.createLabelKey)}
            createTitle={createTitle}
            namePlaceholder={resolveUiKey(ui, f.createNamePlaceholderKey)}
            data-testid="InlineCreateSelector__a8d626" />
        ) : (
          <CreatableSearchSelect {...commonProps} data-testid="CreatableSearchSelect__a8d626" />
        )}
      </div>
    );
  };

  const renderSelectorField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const selectorOnChange = (val, lbl, auxData) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
      if (auxData) applySelectorAuxData(auxData, onChange, f);
    };
    const selectorUrl = buildEntitySelectorUrl(apiBaseUrl, entity, f, api);
    // DocumentType-reference selector fields (e.g. purchase/sales-invoice's
    // "transactionDocument") drive an optionTranslator that renames/hides options
    // (invoices vs. returns vs. credit-notes tab labels) — CreatableSearchSelect has no
    // equivalent prop, so these stay on the plain SelectorInput rather than silently
    // dropping the translation (ETP-4600 narrow carve-out). Every other `type:'selector'`
    // field — explicit `searchSelect: true` AND, as of ETP-4600, the plain default case —
    // renders the shared searchable component instead of the plain dropdown.
    const needsOptionTranslator = f.reference === 'DocumentType';
    // Explicit per-field OPT-OUT: `searchSelect: false` (not merely absent) forces the
    // field back onto the old plain SelectorInput below, bypassing the ETP-4600 default.
    // TEMPORARY carve-out for Assets' `assetCategory` (see AssetsDetailPanel.jsx) — the
    // unified CreatableSearchSelect's interaction timing exposes a pre-existing DetailView
    // save→refetch/callout race (`pendingEditingRef`/fresh-callout snapshot) that silently
    // reverts `depreciate` to false on save, so the "Crear Amortización" button never
    // renders. Remove this opt-out once that race has its own fix (tracked separately from
    // ETP-4600). Absent/`true` still routes to the unified component — no behavior change
    // for any other field.
    const explicitOptOut = f.searchSelect === false;
    if (!explicitOptOut && (f.searchSelect || !needsOptionTranslator)) {
      return renderSearchSelectField(f, label, selectorOnChange, selectorUrl);
    }
    // Only the DocumentType carve-out needs option renaming — the explicit `searchSelect:
    // false` opt-out (e.g. Assets' assetCategory) just wants the plain SelectorInput with
    // its options unchanged, so it must NOT get the DocumentType-specific translator.
    const optionTranslator = needsOptionTranslator ? translateDocumentTypeName : undefined;
    // The saved/selected value must show the SAME translated label the options list
    // shows (ETP-4737) — otherwise a saved "Factura Rectificativa (compras)" record
    // displays the raw AD name with its Classic-only "(compras)" suffix instead of the
    // simplified GO label. `optionTranslator` can return null for the 'reversed' case
    // (intentionally hidden from the options list), so fall back to the raw identifier
    // rather than rendering a blank value for an already-saved record of that type.
    // Scoped to sales-invoice/purchase-invoice only (ETP-4737 follow-up) — see
    // SAVED_VALUE_TRANSLATION_WINDOWS above for why payment-out/purchase-order must NOT
    // get this and instead keep showing their raw identifier, exactly as before this fix.
    const rawIdentifier = resolveIdentifier(data, f.key);
    const applySavedValueTranslation = optionTranslator && SAVED_VALUE_TRANSLATION_WINDOWS.has(windowName);
    // Guard against calling optionTranslator on a null/undefined identifier (e.g. a new
    // record with no document type selected yet) — its `name.toLowerCase()` would throw.
    const displayValue = applySavedValueTranslation && rawIdentifier
      ? (optionTranslator(rawIdentifier) ?? rawIdentifier)
      : rawIdentifier;
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
        </Label>
        <SelectorInput
          entityName={entity}
          field={f}
          value={data?.[f.key] ?? ''}
          displayValue={displayValue}
          onChange={selectorOnChange}
          catalogs={catalogs}
          resolvedLabel={label}
          selectorUrl={selectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          optionTranslator={optionTranslator}
          data-testid="SelectorInput__a8d626" />
      </div>
    );
  };

  const renderSearchField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const apiSelectorEntry = api?.selectors?.find(s => s.entity === entity && s.field === f.key);
    const selectorUrl = buildSearchSelectorUrl(apiBaseUrl, entity, f, apiSelectorEntry);
    const searchOnChange = (val, lbl, auxData) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
      if (auxData) {
        const isGross = auxData.isTaxIncluded !== false;
        applyLookupAuxData(auxData, isGross, onChange, f);
      }
    };
    // Opt-in (decisions: `editModal: "location"`): a single C_Location FK that opens the
    // shared LocationEditorModal to create/edit the address inline, instead of a pick-only
    // dropdown of existing records (ETP-4526, Warehouse Location/Address field).
    if (f.editModal === 'location') {
      return (
        <LocationModalField
          key={f.key}
          field={f}
          value={data?.[f.key] ?? ''}
          displayValue={data?.[f.key + '$_identifier']}
          onChange={searchOnChange}
          apiBaseUrl={apiBaseUrl}
          token={token}
          resolvedLabel={label}
          required={!!(f.required || f.requiredVisual)}
          selectorContext={effectiveSelectorContext}
          data-testid="LocationModalField__a8d626" />
      );
    }
    if (f.popup) {
      return (
        <PopupSearchField
          key={f.key}
          label={label}
          f={f}
          data={data}
          onChange={(val, lbl) => {
            onChange?.(f.key, val, f.column);
            if (lbl) onChange?.(f.key + '$_identifier', lbl);
          }}
          selectorUrl={selectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          data-testid="PopupSearchField__a8d626" />
      );
    }
    if (f.lookup) {
      return (
        <div key={f.key} className={LABEL_GAP}>
          <Label
            htmlFor={f.key}
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">
            {label}{requiredAsterisk(f)}
          </Label>
          <LookupFormField
            field={f}
            value={data?.[f.key] ?? ''}
            displayValue={data?.[f.key + '$_identifier']}
            selectorUrl={selectorUrl}
            selectorContext={effectiveSelectorContext}
            token={token}
            resolvedLabel={label}
            onChange={searchOnChange}
            data-testid="LookupFormField__a8d626" />
        </div>
      );
    }
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{requiredAsterisk(f)}
        </Label>
        <SearchSelectField
          f={f}
          value={data?.[f.key] ?? ''}
          displayValue={data?.[f.key + '$_identifier']}
          onChange={searchOnChange}
          formData={data}
          resolvedLabel={label}
          selectorUrl={selectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          data-testid="SearchSelectField__a8d626" />
      </div>
    );
  };

  // Enum/list field (`type: 'select'` with options) — DEFAULT rendering (ETP-4600) for
  // every fixed-list enum: local-filtered static options via the unified searchable chip,
  // no API call. Read-only renders a plain disabled input. This is the parity-complete
  // successor to the old renderSelectField (plain Radix Select) below: it matches its
  // boolean valueType mapping, locale-aware labels, and empty/clear choice for optional
  // fields, so `searchSelect: true` is no longer required to opt in — see the renderField
  // gate below.
  const staticSelectOptionLabel = (opt) => opt.labels?.[locale] ?? tMenu(opt.label);
  const renderStaticCreatableSelect = (f, label, isReadOnly) => {
    const isBoolean = f.valueType === 'boolean';
    const rawVal = data?.[f.key];
    let selectValue;
    if (isBoolean) {
      if (rawVal === true || rawVal === 'Y' || rawVal === 'true') {
        selectValue = 'true';
      } else if (rawVal === false || rawVal === 'N' || rawVal === 'false') {
        selectValue = 'false';
      } else {
        selectValue = '';
      }
    } else {
      selectValue = rawVal ?? '';
    }
    const selOpt = f.options.find(o => String(o.value) === String(selectValue));
    if (isReadOnly) {
      return (
        <div key={f.key} data-testid={`field-${f.key}`} className={LABEL_GAP}>
          <Label
            htmlFor={f.key}
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">{label}</Label>
          <Input
            id={f.key}
            name={f.key}
            value={selOpt ? staticSelectOptionLabel(selOpt) : ''}
            disabled
            data-testid="Input__a8d626" />
        </div>
      );
    }
    const staticOpts = f.options.map(o => ({ id: o.value, name: staticSelectOptionLabel(o) }));
    const emptyOptionLabel = f.required
      ? undefined
      : (resolveUiKey(ui, f.emptyOptionLabelKey) ?? ' ');
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
        </Label>
        <CreatableSearchSelect
          field={f}
          value={selectValue}
          displayValue={selOpt ? staticSelectOptionLabel(selOpt) : ''}
          onChange={(id) => onChange?.(f.key, resolveEnumChangeValue(id, isBoolean), f.column)}
          resolvedLabel={label}
          staticOptions={staticOpts}
          emptyOptionLabel={emptyOptionLabel}
          data-testid="CreatableSearchSelect__a8d626" />
      </div>
    );
  };

  // Date field (DateField wrapper).
  const renderDateField = (f, label, isReadOnly) => (
    <div key={f.key} className={LABEL_GAP}>
      <Label
        htmlFor={f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {label}{requiredAsteriskIfEditable(f, isReadOnly)}
      </Label>
      <DateField
        id={f.key}
        name={f.key}
        data-testid={`field-${f.key}`}
        value={data?.[f.key] ?? ''}
        onChange={(iso) => onChange?.(f.key, iso, f.column)}
        onBlur={() => onFieldBlur?.(f.key)}
        disabled={isReadOnly || savingField === f.key}
        required={f.required && !isReadOnly}
      />
    </div>
  );

  // Default single-line text/number input (the fall-through renderer).
  // Opt-in `calloutOn: 'blur'` switches to a commit-on-blur input (DeferredInput): while
  // typing, only a LOCAL buffer updates — the parent form state (`hook.editing`) and the
  // column callout are NOT touched. On blur, a single onChange commits the value, which
  // both updates `editing` (so anything mirroring it, e.g. the Assets sidebar, defers too)
  // AND fires the callout in one shot. Fields without the flag keep the default fully
  // controlled path: every keystroke commits and fires the callout immediately.
  // Generic on-blur numeric feedback (min / integer), driven by the field config.
  // A no-op for fields that declare neither constraint (getNumericFieldError → null),
  // so no existing window changes behaviour. ETP-4542.
  const validateNumericOnBlur = (f, value) => {
    const err = getNumericFieldError(f, value);
    // Shared `id` with the useEntity.js save-gate toast for this same field: if
    // the user clicks "Save" without leaving the input first, blur fires just
    // before the click's onClick, and sonner dedupes the two same-id calls into
    // one visible toast instead of stacking duplicates. ETP-4542.
    if (err) {
      const toastId = numericFieldToastId(f.key);
      toast.error(ui(err.key, err.params), { id: toastId });
      // ETP-5002: track it here too — a blur-raised toast outlives the blur, so a
      // subsequent successful save must be able to clear it, not just one raised by
      // the save gate itself.
      trackSaveBlockToast(toastId);
      return;
    }
    // ETP-5031: Contacts-only text-field validation (length + unsafe chars). A
    // no-op for every other window — getContactsTextFieldError gates on
    // windowName === 'contacts' as its first check.
    const contactsErr = getContactsTextFieldError(windowName, f, value);
    if (contactsErr) {
      const toastId = `contacts-field-${f.key}`;
      toast.error(ui(contactsErr.key, contactsErr.params), { id: toastId });
      trackSaveBlockToast(toastId);
    }
  };

  const renderInputField = (f, label, isReadOnly, displayValue) => {
    const calloutOnBlur = f.calloutOn === 'blur';
    // ETP-4749: a fixed, non-editable chip (e.g. "https://") shown immediately before
    // the input when `f.inputPrefix` is declared — shared with OrganizationPage.jsx's
    // hand-built "Sitio web" field via PrefixedInput.jsx (single source for the chip
    // markup, not a parallel hand-copied implementation). `border-0` on the input hands
    // the border to the wrapper (Input's own cn() merges it correctly regardless of prop
    // order). `rounded-none focus-visible:ring-0 focus-visible:outline-none` hands the
    // FOCUS ring to the wrapper too (QA review round) — without this, the input drew its
    // own rounded ring at its own (larger) radius, floating inside the wrapper's smaller
    // one instead of the whole chip+input lighting up as one piece. Fields without
    // `inputPrefix` render exactly as before — PrefixedInput passes `children` through
    // unwrapped in that case, byte-identical output.
    const hasPrefix = Boolean(f.inputPrefix);
    // `prefixed-input-control` is a stable marker (not a Tailwind utility) so
    // per-window CSS that themes `input.rounded-lg` (e.g. Contacts' contacts.css,
    // scoped to `.contacts-rows`) can still apply its default/hover background to
    // this input even though it no longer carries `rounded-lg` — the input lost that
    // class here on purpose so it stops drawing its own (mismatched-radius) border/
    // focus ring, but it should still LOOK like every other input otherwise.
    const inputClassName = getInputStateClass(isReadOnly)
      + (hasPrefix ? ' border-0 rounded-none focus-visible:ring-0 focus-visible:outline-none prefixed-input-control' : '');
    const inputEl = calloutOnBlur && !isReadOnly ? (
      <DeferredInput
        f={f}
        committedValue={data?.[f.key] ?? ''}
        onCommit={onChange}
        onFieldBlur={onFieldBlur}
        onValidateBlur={validateNumericOnBlur}
        placeholder={resolveUiKey(ui, f.placeholderKey)}
        className={inputClassName}
        required={f.required && !isReadOnly}
        disabled={isReadOnly || savingField === f.key}
        maxLength={f.maxLength}
        data-testid="DeferredInput__a8d626" />
    ) : (
      <Input
        id={f.key}
        name={f.key}
        data-testid={`field-${f.key}`}
        type={getInputType(f)}
        value={getFieldValue(isReadOnly, displayValue, data, f)}
        onChange={(e) => onChange?.(f.key, filterContactsInputValue(windowName, f, e.target.value), f.column)}
        onBlur={(e) => {
          if (!isReadOnly) {
            validateNumericOnBlur(f, e.target.value);
          }
          onFieldBlur?.(f.key);
        }}
        placeholder={!isReadOnly ? resolveUiKey(ui, f.placeholderKey) : undefined}
        className={inputClassName}
        required={f.required && !isReadOnly}
        disabled={isReadOnly || savingField === f.key}
        maxLength={f.maxLength}
      />
    );
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
        </Label>
        <PrefixedInput
          prefix={f.inputPrefix}
          testId={`field-${f.key}-prefix-wrapper`}
          data-testid="PrefixedInput__a8d626">
          {inputEl}
        </PrefixedInput>
      </div>
    );
  };

  // Multi-line text field. `rows` controls height; absent rows gets a min-height.
  const renderTextareaField = (f, label, isReadOnly, displayValue) => {
    const rowCount = f.rows ?? 4;
    const minHeightClass = f.rows ? '' : ' min-h-[96px]';
    const placeholder = !isReadOnly ? resolveUiKey(ui, f.placeholderKey) : undefined;
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{requiredAsteriskIfEditable(f, isReadOnly)}
        </Label>
        <textarea
          id={f.key}
          name={f.key}
          data-testid={`field-${f.key}`}
          rows={rowCount}
          value={getFieldValue(isReadOnly, displayValue, data, f)}
          onChange={(e) => onChange?.(f.key, e.target.value, f.column)}
          onBlur={() => onFieldBlur?.(f.key)}
          placeholder={placeholder}
          disabled={isReadOnly}
          maxLength={f.maxLength}
          className={[
            'flex w-full rounded-lg border border-[hsl(var(--border-control))] p-2 text-sm shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)]',
            `placeholder:text-muted-foreground resize-none${minHeightClass}`,
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:bg-muted/50 disabled:cursor-not-allowed',
            getReadOnlyBgClass(isReadOnly),
          ].join(' ')}
        />
      </div>
    );
  };

  // Dependent FK selector: options filtered by a parent field's value.
  const renderDependentField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const fieldSelectorUrl = buildDependentSelectorUrl(apiBaseUrl, entity, f);
    const fieldOnChange = (val, lbl) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
    };
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{requiredAsterisk(f)}
        </Label>
        <DependentFkField
          f={f}
          label={label}
          data={data}
          onChange={fieldOnChange}
          selectorUrl={fieldSelectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          apiBaseUrl={apiBaseUrl}
          catalogs={catalogs}
          data-testid="DependentFkField__a8d626" />
      </div>
    );
  };

  // YESNO checkbox. Values arrive as boolean true, 'Y' or 'true' (checked), or
  // false/'N'/'false'/null/undefined (unchecked) — plain `!!value` is wrong (`!!'N'` is true).
  const renderCheckboxField = (f, label, isReadOnly) => {
    const checked = data?.[f.key] === true || data?.[f.key] === 'Y' || data?.[f.key] === 'true';
    return (
      <div key={f.key} className="flex items-center gap-2 pt-6">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          disabled={isReadOnly}
          id={f.key}
          data-testid={`field-${f.key}`}
          onClick={() => {
            if (isReadOnly) return;
            onChange?.(f.key, !checked, f.column);
            // Checkboxes have no native blur event to hang autosave off of
            // (unlike text/selector fields, whose onBlur already drives
            // autoSaveOnBlur — see DetailView's handleFieldBlur). Firing
            // onFieldBlur right after onChange gives checkbox/toggle fields
            // the same immediate-save + error-toast + revert-on-failure
            // behavior. No-op when the window doesn't pass onFieldBlur
            // (autoSaveOnBlur off). ETP-4670.
            //
            // MUST be deferred to a macrotask (setTimeout 0), not called
            // synchronously: onChange schedules a React state update that
            // hasn't committed yet when this handler runs, so DetailView's
            // handleFieldBlurRef still holds the closure from the PREVIOUS
            // render — hasUnsavedEdits(oldEditing, selected) sees no diff
            // (the flip hasn't landed in `editing` yet) and handleSave()
            // never fires. React flushes the re-render before a setTimeout(0)
            // callback runs, so by then the ref has the fresh closure with
            // the flipped value already in `editing`. A queueMicrotask does
            // NOT work here — microtasks run before the browser yields to
            // paint/commit, still ahead of the DOM-effect timing React needs.
            setTimeout(() => onFieldBlur?.(f.key), 0);
          }}
          className={[
            'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
            'flex items-center justify-center',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            getCheckboxStateClass(checked),
          ].join(' ')}
        >
          {checked && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium cursor-pointer"
          data-testid="Label__a8d626">
          {label}
        </Label>
      </div>
    );
  };

  // A boolean field flagged `toggle` (grid cellType 'toggle') renders as the shared PillToggle
  // switch in its form position — same control as the grid, instead of a plain checkbox.
  const renderToggleField = (f, label, isReadOnly) => {
    const checked = data?.[f.key] === true || data?.[f.key] === 'Y' || data?.[f.key] === 'true';
    return (
      <div key={f.key} className="flex items-center gap-2 pt-6">
        <PillToggle
          checked={checked}
          disabled={isReadOnly}
          onCheckedChange={(next) => {
            if (isReadOnly) return;
            onChange?.(f.key, next, f.column);
            // See renderCheckboxField above (ETP-4670): toggles have no blur
            // event either, so fire onFieldBlur right after onChange — but
            // deferred to setTimeout(0), not synchronously (same stale-ref
            // race as the checkbox: onChange's state update hasn't committed
            // when this handler runs).
            setTimeout(() => onFieldBlur?.(f.key), 0);
          }}
          id={f.key}
          data-testid={`field-${f.key}`} />
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium cursor-pointer"
          data-testid="Label__a8d626">
          {label}
        </Label>
      </div>
    );
  };

  const renderField = (f) => {
    // Resolution order: per-window labels dict (locale-pinned) → AD_Field label → camelCase key
    const label = f.labels?.[locale] ?? f.labels?.en_US ?? t(f.column) ?? f.label ?? f.key;
    // Field is read-only if statically declared, dynamically set by evaluate-display, or readOnlyLogic evaluates to true
    const isReadOnly = formReadOnly
      || f.readOnly
      || displayLogic?.readOnly?.[f.key] === true
      || evalReadOnlyLogic(f, data);
    const rawDisplayValue = resolveIdentifier(data, f.key) ?? data?.[f.key] ?? '';
    // Strip floating-point noise (e.g. 243.20999999999998 → 243.21) for read-only number fields.
    // toFixed(10) preserves up to 10 significant decimal places while eliminating IEEE 754 drift.
    const displayValue = formatReadOnlyDisplayValue(f, isReadOnly, rawDisplayValue);
    // Custom field renderer: when a field declares `customRenderer` (a React component reference),
    // delegate rendering entirely to that component. This is an escape hatch for fields that
    // require specialized input UIs that cannot be expressed through the standard field types
    // (e.g. a split prefix+suffix input for account codes).
    // The component receives: value, onChange(newValue), record (full form data), readOnly.
    if (f.customRenderer) {
      const Renderer = f.customRenderer;
      return (
        <div key={f.key} className="space-y-1.5">
          <Label
            htmlFor={f.key}
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">
            {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
          </Label>
          <Renderer
            value={data?.[f.key] ?? ''}
            onChange={(v) => onChange?.(f.key, v, f.column)}
            record={data}
            readOnly={isReadOnly}
            data-testid="Renderer__a8d626" />
        </div>
      );
    }
    if (f.type === 'checkbox' && f.toggle) {
      return renderToggleField(f, label, isReadOnly);
    }
    if (f.type === 'checkbox') {
      return renderCheckboxField(f, label, isReadOnly);
    }
    if (f.type === 'dependent') {
      return renderDependentField(f, label, isReadOnly);
    }
    if (f.type === 'selector') {
      // Currency selector on order header: use CurrencyRatePicker for searchable rate display
      if (isCurrencyRateSelectorField(entity, apiBaseUrl, f)) {
        const isRateReadOnly = formReadOnly || f.readOnly || displayLogic?.readOnly?.[f.key] === true || evalReadOnlyLogic(f, data);
        return (
          <CurrencyRatePicker
            key={f.key}
            field={f}
            value={data?.[f.key] ?? ''}
            displayValue={resolveIdentifier(data, f.key)}
            onChange={onChange}
            formData={data}
            resolvedLabel={label}
            token={token}
            apiBaseUrl={apiBaseUrl}
            entityPath={entity}
            isReadOnly={isRateReadOnly}
            data-testid="CurrencyRatePicker__a8d626" />
        );
      }
      return renderSelectorField(f, label, isReadOnly);
    }
    if (f.type === 'search') {
      return renderSearchField(f, label, isReadOnly);
    }
    if (isSelectFieldWithOptions(f)) {
      return renderStaticCreatableSelect(f, label, isReadOnly);
    }
    if (f.type === 'textarea') {
      return renderTextareaField(f, label, isReadOnly, displayValue);
    }
    if (f.type === 'date') {
      return renderDateField(f, label, isReadOnly);
    }
    return renderInputField(f, label, isReadOnly, displayValue);
  };

  // ETP-3894: append an inline error message under any field whose key appears in
  // fieldErrors. Uses cloneElement so we don't have to thread the prop through every
  // branch in renderField — the wrapper <div key={f.key}> already exists for each.
  const renderFieldWithError = (f) => {
    const SPAN_CLASS = { 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' };
    const spanClass = f.span ? (SPAN_CLASS[f.span] ?? '') : '';

    if (f.type === 'image') {
      const label = t(f.column) ?? f.label ?? f.key;
      const isReadOnly = formReadOnly || f.readOnly || displayLogic?.readOnly?.[f.key] === true || evalReadOnlyLogic(f, data);
      const imageClass = [`${LABEL_GAP} row-span-2 flex flex-col`, spanClass].filter(Boolean).join(' ');
      return (
        <div key={f.key} className={imageClass}>
          <Label
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">{label}</Label>
          <ImageField
            imageId={data?.[f.key] ?? ''}
            onChange={(newId) => onChange?.(f.key, newId, f.column)}
            token={token}
            apiBaseUrl={apiBaseUrl}
            readOnly={isReadOnly}
            fieldKey={f.key}
            stretch
            data-testid="ImageField__a8d626" />
        </div>
      );
    }

    let node = renderField(f);
    const err = fieldErrors?.[f.key];

    // Append the field help text (if any) inside the field wrapper, below the input.
    // Done centrally here so every field branch gets help support without per-branch edits.
    if (f.help && React.isValidElement(node)) {
      const existing = node.props.children;
      node = React.cloneElement(
        node,
        { className: `${node.props.className ?? ''}`.trim() },
        existing,
        <FieldHelp key="__help" field={f} ui={ui} data-testid="FieldHelp__a8d626" />,
      );
    }

    if (err && React.isValidElement(node)) {
      const existing = node.props.children;
      node = React.cloneElement(
        node,
        { className: `${node.props.className ?? ''}`.trim() },
        existing,
        React.createElement(
          'p',
          { key: '__err', role: 'alert', className: 'text-xs text-destructive mt-0.5', 'data-testid': `error-${f.key}` },
          err
        )
      );
    }

    if (spanClass && React.isValidElement(node)) {
      return React.cloneElement(node, { className: `${node.props.className ?? ''} ${spanClass}`.trim() });
    }

    return node;
  };

  // `renderAsFragment` (opt-in) emits the field cell(s) WITHOUT the wrapping grid
  // container, so a caller can splice them into ANOTHER EntityForm's grid (e.g. the
  // Taxes header form's `trailing` slot) and have them flow into the next free grid
  // cell instead of starting their own grid row. Only the bare cell markup differs —
  // field registration, readOnly/display logic, errors and onChange are unchanged.
  // The image-pin layout is a full grid container by definition, so it is never
  // fragment-rendered (an image footer would not opt into this path).
  if (renderAsFragment) {
    return (
      <>
        {fieldsToRender.map(renderFieldWithError)}
        {trailing}
      </>
    );
  }

  if (imageField) {
    const imgLabel = imageField.label ?? t(imageField.column) ?? imageField.key;
    const imgReadOnly = formReadOnly
      || imageField.readOnly
      || displayLogic?.readOnly?.[imageField.key] === true
      || evalReadOnlyLogic(imageField, data);
    return (
      <div className="flex gap-6 items-stretch">
        <div className={`flex-1 min-w-0 ${gridClass}`} style={gridStyle}>
          {fieldsToRender.map(renderFieldWithError)}
          {trailing}
        </div>
        <div className="shrink-0 w-64 flex flex-col">
          <ImageField
            imageId={data?.[imageField.key] ?? ''}
            onChange={(newId) => onChange?.(imageField.key, newId, imageField.column)}
            token={token}
            apiBaseUrl={apiBaseUrl}
            readOnly={imgReadOnly}
            fieldKey={imageField.key}
            label={imgLabel}
            stretch
            data-testid="ImageField__a8d626" />
        </div>
      </div>
    );
  }

  return (
    <div className={gridClass} style={gridStyle}>
      {displayFields.map(renderFieldWithError)}
      {/* Additional grid item(s) rendered INSIDE the same grid container so they
          flow into the next free cell(s) after the native fields (opt-in; undefined
          for every existing caller → strictly additive). */}
      {trailing}
    </div>
  );
}
