import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Loader2, Pencil, Check, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { FIELD_HEIGHT, LABEL_GAP } from '@/components/ui/formDensity';
import { useCurrencyPrecision } from '@/hooks/useCurrencyPrecision.js';
import { getCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { parseCalendarDate, formatCalendarDate } from '@/lib/dateOnly.js';
import {
  resolveSelectedIndex, prependCurrentSelection, nextActiveIndex, arrowStartIndexFor,
} from './selectorSelection.js';
import { useLocateCommittedValue } from './useLocateCommittedValue.js';

// ETP-5479: the Moneda field must look and behave exactly like the field it replaces.
// In every window NOT matched by EntityForm's isCurrencyRateSelectorField (e.g. Albaranes)
// Moneda is a CreatableSearchSelect when editable and a disabled Input when read-only.
// This picker used to draw its own shell — rounded-md, px-3 py-2, `hover:bg-muted/40` (a
// much lighter hover) and NO focus style at all — so Pedido de compra showed no focus
// ring while Albaranes did. Same box, hover fill, focus ring and disabled look now.
const FIELD_SHELL = `${FIELD_HEIGHT} rounded-lg border px-2 text-sm`;
const ENABLED_SHELL = `${FIELD_SHELL} border-[hsl(var(--border-control))] bg-card text-text-primary shadow-[0px_1px_2px_hsl(var(--foreground)_/_0.05)]`;
const DISABLED_SHELL = `${FIELD_SHELL} border-[hsl(var(--field-disabled-border))] bg-[hsl(var(--field-hover))] text-text-disabled cursor-not-allowed`;

// AD column of the accounting date. A document that carries one (invoices) takes its
// exchange rate from the conversion ranges valid on that date; one that does not
// (quotations, orders) takes it from its declared document date.
const ACCOUNTING_DATE_COLUMN = 'DateAcct';

/**
 * ETP-5840 — the header field whose (unsaved) form value is the exchange-rate reference date.
 *
 * Structural, not per-window: the header field bound to the `DateAcct` AD column when the form
 * declares one, otherwise the window's `documentDateField`. `documentDateField` is NOT used
 * directly for invoices because it also drives the invoiceDate → accountingDate cascade and
 * must stay `invoiceDate` there, while the rate follows the accounting date.
 *
 * @param {Array<{key: string, column?: string}>} fields  the header form's field definitions
 * @param {string|null|undefined} documentDateField       the window's declared document date
 * @returns {string|null} the field key, or null when neither is known
 */
export function resolveRateDateField(fields, documentDateField) {
  const accountingDate = Array.isArray(fields)
    ? fields.find(f => f?.column === ACCOUNTING_DATE_COLUMN)
    : null;
  return accountingDate?.key ?? documentDateField ?? null;
}

// `yyyy-MM-dd` for the currencyOptions `date` query param, read in local-calendar space so a
// date-only value is never shifted a day by the host's timezone.
function toCalendarISO(raw) {
  const d = parseCalendarDate(raw);
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The form's organization id: an FK value is a plain id string, or an object carrying `id`.
function resolveOrganizationId(formData) {
  const rawOrg = formData?.organization;
  return typeof rawOrg === 'string' ? rawOrg : (rawOrg?.id ?? null);
}

// `?date=…&organization=…` for the currencyOptions action, or '' when neither is known.
function buildCurrencyOptionsQuery(rateDate, organizationId) {
  const params = new URLSearchParams();
  if (rateDate) params.set('date', rateDate);
  if (organizationId) params.set('organization', organizationId);
  const query = params.toString();
  return query ? `?${query}` : '';
}

// The option list out of either envelope (`{response: {data}}` or a bare array); [] otherwise.
function readCurrencyOptions(json) {
  const list = json?.response?.data ?? json ?? [];
  return Array.isArray(list) ? list : [];
}

// The rate the trigger shows. The form's own rate is what will be saved, so it wins. The
// option's rate is only a fallback when the form has never carried the field (key absent) or
// for the org currency (whose rate is not a conversion). An explicit null on a foreign currency
// means "no range on this date" and must render as «—», not as some other date's rate.
function resolveDisplayRate(formRate, selectedOption, isOrgCurrency) {
  const stagedRate = formRate != null && formRate !== '' ? parseFloat(formRate) : null;
  if (stagedRate != null) return stagedRate;
  const useOptionRate = formRate === undefined || isOrgCurrency;
  return useOptionRate ? selectedOption?.rate ?? null : null;
}

/**
 * CurrencyRatePicker — searchable currency selector for document header fields.
 *
 * Replaces the standard SelectorInput for the C_Currency_ID field on the header of the
 * quotation, order and invoice windows. Shows each currency option as "{isoCode} — {rate}"
 * where the rate is the conversion from org currency to that currency on the rate reference
 * date CURRENTLY in the form (`rateDateField`, unsaved value included — ETP-5840). A
 * currency with no conversion range on that date shows «—» instead of a rate; selecting it
 * stages an empty rate the user can type.
 *
 * An inline pencil icon allows the user to override the rate, on new and saved documents.
 * The override is staged via `onChange('eTGOCurrencyRate', rate)` and saved with the normal
 * form save; it is kept until the reference date or the currency changes, when the header
 * callout recalculates it (see isCurrencyRateRecalcTarget in detailViewHelpers.jsx). The
 * pencil is hidden when the selected option is the org's own currency (`isOrgCurrency`) —
 * there is no conversion to override in that case.
 *
 * Props (same shape as SelectorInput / EntityForm selector slots):
 * @param {object}   field         - Contract field definition (key, column, required, …)
 * @param {string}   value         - Current C_Currency_ID
 * @param {string}   displayValue  - Human-readable label for the current value
 * @param {Function} onChange      - EntityForm's top-level `(fieldKey, value, column?) => void`
 * @param {object}   formData      - Full form data (reads: id, eTGOCurrencyRate)
 * @param {string}   resolvedLabel - Translated field label
 * @param {string}   token         - JWT bearer token
 * @param {string}   apiBaseUrl    - Window base URL, e.g. http://…/sws/neo/sales-order
 * @param {string}   [entityPath]  - Entity path segment for action URLs (default: 'header').
 *                                   Pass the actual entity name when the header entity is not
 *                                   called 'header' (e.g. 'quotation' for sales-quotation).
 * @param {string}   [rateDateField] - Header field holding the rate reference date (see
 *                                   resolveRateDateField). Absent ⇒ no `date` param is sent
 *                                   and the backend falls back to the saved document.
 * @param {boolean}  isReadOnly    - When true renders a plain read-only display
 * @param {number}   [precision=4] - Decimal places for rate display. Pass org currency's
 *                                   Standard Precision when available; defaults to 4.
 */
export function CurrencyRatePicker({
  field,
  value,
  displayValue,
  onChange,
  formData,
  resolvedLabel,
  token,
  apiBaseUrl,
  entityPath = 'header',
  rateDateField = null,
  isReadOnly,
  precision = 4,
}) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const ui = useUI();
  const orgPrecision = useCurrencyPrecision();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const interactedRef = useRef(false);

  const recordId = formData?.id;
  const hasRecord = recordId && recordId !== 'new';
  const fetchId = hasRecord ? recordId : 'new';
  const rateDate = rateDateField ? toCalendarISO(formData?.[rateDateField]) : null;
  // The form's organization scopes the rates (a NEW document has no saved org yet, and its org can
  // differ from the session's), so the list rate matches the rate the save will compute.
  const organizationId = resolveOrganizationId(formData);

  const selectedOption = options.find(o => o.id === value);
  const isOrgCurrency = selectedOption?.isOrgCurrency === true;
  const displayRate = resolveDisplayRate(formData?.eTGOCurrencyRate, selectedOption, isOrgCurrency);
  const displayIso = selectedOption?.isoCode ?? displayValue ?? value ?? '';
  const showMissingRate = !!value && displayRate == null && !!selectedOption && !isOrgCurrency;

  // Options depend on the record and on the rate reference date in the form, so they are
  // refetched whenever either changes — eagerly, so the trigger shows the rate and the pencil
  // knows whether the selected currency is the org's one without opening the dropdown.
  // `reloadKey` forces a refresh when the dropdown is opened.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let cancelled = false;
    setLoading(true);
    const query = buildCurrencyOptionsQuery(rateDate, organizationId);
    (async () => {
      try {
        const res = await apiFetch(`/${entityPath}/${fetchId}/action/currencyOptions${query}`, { token });
        if (cancelled || !res.ok) return;
        setOptions(readCurrencyOptions(await res.json()));
      } catch {
        // silently fall back — network error or endpoint unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchId, rateDate, organizationId, reloadKey, entityPath, apiBaseUrl, token, apiFetch]);

  // Auto-focus the search input when dropdown opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter(o =>
    !search || o.isoCode.toLowerCase().includes(search.toLowerCase()),
  );
  // ETP-5948 — a stored currency the list no longer offers (no rate range at all, or inactive) is
  // pinned on top with the ISO the form already holds, so reopening still shows what is selected.
  const pinned = !search && value && !loading ? [{ id: value, isoCode: displayValue || value }] : [];
  const rows = prependCurrentSelection(filtered, pinned, value);
  const selectedIndex = resolveSelectedIndex(rows, value);
  const optionId = (opt) => `${field.key}-currency-option-${opt.id}`;

  useEffect(() => { setActiveIdx(-1); }, [open, search]);

  // ETP-5948 — the ETP-5903 reopen behaviour; the list is not paged, so only the centring applies.
  useLocateCommittedValue({
    open, query: search, value, dropdownRef: listRef, interactedRef, paged: false,
    panelLoading: loading, selectedIndex, renderedCount: rows.length,
  });

  useEffect(() => {
    if (activeIdx < 0) return;
    listRef.current?.querySelector(`[data-option-index="${activeIdx}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx]);

  const handleSelect = useCallback((opt) => {
    // ETP-5948 — re-picking the current currency changes nothing: restaging its rate would wipe a
    // manual rate, or (for a pinned currency with no rate) leave one the save refuses.
    if (opt.id === value) {
      setOpen(false);
      setSearch('');
      return;
    }
    // Stage currency change
    onChange(field.key, opt.id, field.column);
    onChange(field.key + '$_identifier', opt.isoCode);
    // Stage the rate valid on the reference date — ALWAYS, so a previous currency's (or a
    // manual) rate never survives a currency change. `null` when no range covers the date:
    // the rate stays empty for the user to type, and saving it empty is refused by the backend.
    onChange('eTGOCurrencyRate', opt.rate ?? null, 'EM_ETGO_Currency_Rate');
    setOpen(false);
    setSearch('');
  }, [field, onChange, value]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    interactedRef.current = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIdx(i => nextActiveIndex(i, arrowStartIndexFor(search, selectedIndex), delta, rows.length));
    } else if (e.key === 'Enter' && activeIdx >= 0 && rows[activeIdx]) {
      e.preventDefault();
      handleSelect(rows[activeIdx]);
    }
  };

  const handleRateEdit = useCallback((e) => {
    e.stopPropagation();
    // Seeded with the canonical value; MaskedAmountInput renders it in the configured convention.
    setRateInput(displayRate != null ? String(displayRate) : '');
    setEditingRate(true);
  }, [displayRate]);

  const handleRateConfirm = useCallback(() => {
    // `rateInput` is MaskedAmountInput's CLEAN value (digits, optional '-', at most one '.'), so a
    // typed comma has already been normalized. parseLocaleNumber still guards against a partial
    // entry ('', '-', '0,'). NOT the grouping-aware parseAmountInput: a rate of 1.500 legitimately
    // means 1.5, which that parser would read as 1500 — and with grouping off the component never
    // inserts a thousands separator to strip.
    const parsed = parseLocaleNumber(rateInput).value;
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange('eTGOCurrencyRate', parsed, 'EM_ETGO_Currency_Rate');
    }
    setEditingRate(false);
  }, [rateInput, onChange]);

  const handleRateCancel = useCallback(() => {
    setEditingRate(false);
    setRateInput('');
  }, []);

  const toggleOpen = useCallback(() => {
    if (!open) setReloadKey(k => k + 1);
    setOpen(!open);
  }, [open]);

  const formatRate = (rate) => {
    if (rate == null) return '';
    const n = parseFloat(rate);
    if (isNaN(n)) return '';
    // Prefer the org-level precision from /sws/neo/session; fall back to the prop or 4.
    const decimals = orgPrecision ?? (typeof precision === 'number' && precision >= 0 ? precision : 4);
    const fixed = n.toFixed(decimals);
    // A rate is NOT a currency amount, so this deliberately does not go through formatCurrency:
    // that would force exactly two decimals and silently truncate a 4- or 6-decimal rate. Only the
    // decimal separator is localized — the org's own precision decides how many digits there are.
    // Before ETP-5107's reopened round the raw toFixed output leaked a period into the currency
    // dropdown ("GBP 0.86", "USD 1.47") in an otherwise comma-decimal UI.
    const { decimalSeparator } = getCurrencyFormatConfig();
    return decimalSeparator === '.' ? fixed : fixed.replace('.', decimalSeparator);
  };

  if (isReadOnly) {
    return (
      <div className={LABEL_GAP} data-testid={`field-${field.key}`}>
        <Label
          className="text-sm text-foreground font-medium"
          data-testid={"Label__" + field.id}>{resolvedLabel}</Label>
        <div
          className={`flex w-full items-center ${DISABLED_SHELL}`}
          aria-disabled="true"
          data-testid="currency-rate-readonly">
          {displayIso}
          {displayRate != null && (
            <span className="text-muted-foreground ml-1">— {formatRate(displayRate)}</span>
          )}
          {showMissingRate && (
            <span className="text-muted-foreground ml-1" title={ui('currencyRateNotAvailable')}>—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${LABEL_GAP} relative`} data-testid={`field-${field.key}`} ref={containerRef}>
      <Label
        htmlFor={field.key}
        className="text-sm text-foreground font-medium"
        data-testid={"Label__" + field.id}>
        {resolvedLabel}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {/* Trigger */}
      {editingRate ? (
        <div className={`w-full flex items-center gap-1 ${ENABLED_SHELL} ring-2 ring-transparent focus-within:ring-primary`}>
          <span className="font-medium shrink-0">{displayIso} —</span>
          {/* The canonical masked input, not a hand-rolled one: it owns the keystroke filtering
              (letters and a second separator never reach the value), renders the configured decimal
              separator, and reports a clean dot-decimal value outward. A native `type="number"`
              rejected the comma keystroke outright, so the rate could not be typed the way it was
              displayed (ETP-5107).
              `grouping={false}` because this is a RATE, not an amount: no thousands separator, no
              forced two decimals — the org's precision decides, and 1.500 stays 1.5. */}
          <MaskedAmountInput
            data-testid="currency-rate-input"
            bare
            grouping={false}
            className="flex-1 min-w-0 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 tabular-nums"
            value={rateInput}
            onChange={(clean) => setRateInput(clean)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRateConfirm();
              if (e.key === 'Escape') handleRateCancel();
            }}
            autoFocus
          />
          <button
            data-testid="currency-rate-confirm"
            type="button"
            onClick={handleRateConfirm}
            className="text-status-success-foreground hover:text-status-success-foreground p-0.5 rounded"
            title={ui('confirm')}
          >
            <Check className="h-3.5 w-3.5" data-testid={"Check__" + field.id} />
          </button>
          <button
            data-testid="currency-rate-cancel"
            type="button"
            onClick={handleRateCancel}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
            title={ui('cancel')}
          >
            <X className="h-3.5 w-3.5" data-testid={"X__" + field.id} />
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center gap-1">
          <button
            data-testid="currency-rate-trigger"
            id={field.key}
            type="button"
            aria-expanded={open}
            // The ring stays on while the list is open: the search box takes focus then,
            // but CreatableSearchSelect keeps its ring for as long as its list is open too.
            className={`flex-1 min-w-0 flex items-center justify-between ${ENABLED_SHELL} hover:bg-[hsl(var(--field-hover))] focus:outline-none ring-2 focus:ring-primary${open ? ' ring-primary' : ' ring-transparent'}`}
            onClick={toggleOpen}
          >
            {value ? (
              <span>
                <span className="font-medium">{displayIso}</span>
                {displayRate != null && (
                  <span className="text-muted-foreground ml-1.5 tabular-nums">
                    — {formatRate(displayRate)}
                  </span>
                )}
                {showMissingRate && (
                  <span
                    className="text-muted-foreground ml-1.5"
                    title={ui('currencyRateNotAvailable')}
                    data-testid="currency-rate-missing">
                    —
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {ui('currencyRateSelectPlaceholder', { label: resolvedLabel })}
              </span>
            )}
            {loading ? (
              <Loader2
                className="h-4 w-4 text-[hsl(var(--text-disabled))] animate-spin shrink-0 ml-1"
                data-testid={"Loader2__trigger__" + field.id} />
            ) : (
              <ChevronDown
                className="h-4 w-4 opacity-50 shrink-0 ml-1"
                data-testid={"ChevronDown__" + field.id} />
            )}
          </button>
          {/* The org's own currency is always returned by the currencyOptions action with
              rate exactly 1.0 (hardcoded server-side — see CurrencyOptionsHandler.java —
              never a queried conversion rate), so it doubles as an org-currency marker
              without a separate lookup. There is no conversion to override when the
              header currency IS the org currency, so the pencil has no effect there —
              hide it rather than let the user "edit" a rate that never applies to
              anything (ETP-4029). */}
          {value && !isOrgCurrency && (
            <button
              data-testid="currency-rate-pencil"
              type="button"
              title={ui('currencyRateEdit')}
              aria-label={ui('currencyRateEdit')}
              onClick={handleRateEdit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" data-testid={"Pencil__" + field.id} />
            </button>
          )}
        </div>
      )}
      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[200px] rounded-md border border-input bg-popover shadow-md">
          <div className="p-2 border-b border-input">
            <input
              ref={searchRef}
              type="text"
              placeholder={ui('currencyRateSearchPlaceholder')}
              className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={(e) => { interactedRef.current = true; setSearch(e.target.value); }}
              onKeyDown={handleSearchKeyDown}
              aria-activedescendant={activeIdx >= 0 && rows[activeIdx] ? optionId(rows[activeIdx]) : undefined}
            />
          </div>
          {rateDate && (
            <div
              className="px-3 pt-2 pb-1 text-xs text-muted-foreground"
              data-testid="currency-rate-date">
              {ui('currencyRatesAtDate', { date: formatCalendarDate(rateDate) })}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1" role="listbox" ref={listRef}>
            {loading && (
              <div className="px-3 py-2 text-xs text-muted-foreground" data-testid={"Loading__" + field.id}>
                {ui('loading')}
              </div>
            )}
            {!loading && rows.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                {ui('noResults')}
              </div>
            )}
            {!loading &&
              rows.map((opt, idx) => {
                // ETP-5948 — the ETP-5903 contract: ✓ + aria-selected mark the COMMITTED currency;
                // the keyboard highlight is data-highlighted (exposed via aria-activedescendant).
                const isSelected = idx === selectedIndex;
                const isHighlighted = idx === activeIdx;
                return (
                <button
                  key={opt.id}
                  id={optionId(opt)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-option-index={idx}
                  data-testid={`currency-rate-option-${opt.id}`}
                  {...(isHighlighted ? { 'data-highlighted': 'true' } : {})}
                  className={[
                    'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left transition-colors',
                    isHighlighted ? 'bg-muted' : '',
                    isSelected ? 'font-medium' : '',
                  ].join(' ')}
                  onClick={() => handleSelect(opt)}
                >
                  <span className="flex items-center gap-1.5">
                    {isSelected
                      ? <Check className="h-3.5 w-3.5 text-primary shrink-0" data-testid="currency-rate-option-check" />
                      : <span className="w-3.5 shrink-0" />}
                    {opt.isoCode}
                  </span>
                  {opt.rate == null && !opt.isOrgCurrency ? (
                    <span
                      className="text-muted-foreground ml-3"
                      title={ui('currencyRateNotAvailable')}
                      data-testid="currency-rate-option-missing">
                      —
                    </span>
                  ) : (
                    <span className="text-muted-foreground tabular-nums ml-3">
                      {formatRate(opt.rate)}
                    </span>
                  )}
                </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
