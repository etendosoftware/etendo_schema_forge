import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Loader2, Pencil, Check, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useCurrencyPrecision } from '@/hooks/useCurrencyPrecision.js';

/**
 * CurrencyRatePicker — searchable currency selector for order header fields.
 *
 * Replaces the standard SelectorInput for the C_Currency_ID field on sales-order
 * and purchase-order header entities. Shows each currency option as "{isoCode} — {rate}"
 * where the rate is the conversion from org currency to that currency for the order's date.
 *
 * An inline pencil icon allows the user to override the displayed rate. The override is
 * staged via `onChange('eTGOCurrencyRate', rate)` and saved with the normal form save.
 *
 * Falls back to the recordId-less state (no rate fetching) for new records.
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
  isReadOnly,
  precision = 4,
}) {
  const orgPrecision = useCurrencyPrecision();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const recordId = formData?.id;
  const hasRecord = recordId && recordId !== 'new';

  // Use the user-overridden rate if staged, otherwise fall back to system rate from options
  const stagedRate = formData?.eTGOCurrencyRate != null ? parseFloat(formData.eTGOCurrencyRate) : null;

  const selectedOption = options.find(o => o.id === value);
  const displayRate = stagedRate ?? selectedOption?.rate ?? null;
  const displayIso = selectedOption?.isoCode ?? displayValue ?? value ?? '';

  // Fetch options when the dropdown opens (lazy load)
  // For new records (no ID yet) we pass 'new' — the backend falls back to session context.
  useEffect(() => {
    if (!open || !apiBaseUrl || !token) return;
    let cancelled = false;
    setLoading(true);
    const fetchId = hasRecord ? recordId : 'new';
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/${entityPath}/${fetchId}/action/currencyOptions`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          const list = json?.response?.data ?? json ?? [];
          setOptions(Array.isArray(list) ? list : []);
        }
      } catch {
        // silently fall back — network error or endpoint unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, hasRecord, recordId, apiBaseUrl, token]); // hasRecord kept so re-fetch fires when record gets saved

  // Eagerly fetch options when the record is first saved so the rate is visible in the
  // trigger and the pencil icon appears without requiring the user to open the dropdown.
  useEffect(() => {
    if (!hasRecord || !apiBaseUrl || !token) return;
    let cancelled = false;
    const fetchId = recordId;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/${entityPath}/${fetchId}/action/currencyOptions`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled || !res.ok) return;
        const json = await res.json();
        const list = json?.response?.data ?? json ?? [];
        setOptions(Array.isArray(list) ? list : []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [hasRecord, recordId, apiBaseUrl, token]);

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

  const handleSelect = useCallback((opt) => {
    // Stage currency change
    onChange(field.key, opt.id, field.column);
    onChange(field.key + '$_identifier', opt.isoCode);
    // Stage the system rate for this currency (user can override with pencil)
    if (opt.rate != null) {
      onChange('eTGOCurrencyRate', opt.rate, 'EM_ETGO_Currency_Rate');
    }
    setOpen(false);
    setSearch('');
  }, [field, onChange]);

  const handleRateEdit = useCallback((e) => {
    e.stopPropagation();
    setRateInput(displayRate != null ? String(displayRate) : '');
    setEditingRate(true);
  }, [displayRate]);

  const handleRateConfirm = useCallback(() => {
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      onChange('eTGOCurrencyRate', parsed, 'EM_ETGO_Currency_Rate');
    }
    setEditingRate(false);
  }, [rateInput, onChange]);

  const handleRateCancel = useCallback(() => {
    setEditingRate(false);
    setRateInput('');
  }, []);

  const formatRate = (rate) => {
    if (rate == null) return '';
    const n = parseFloat(rate);
    if (isNaN(n)) return '';
    // Prefer the org-level precision from /sws/neo/session; fall back to the prop or 4.
    const decimals = orgPrecision ?? (typeof precision === 'number' && precision >= 0 ? precision : 4);
    return n.toFixed(decimals);
  };

  if (isReadOnly) {
    return (
      <div className="space-y-1.5" data-testid={`field-${field.key}`}>
        <Label className="text-sm text-foreground font-medium">{resolvedLabel}</Label>
        <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm cursor-default">
          {displayIso}
          {displayRate != null && (
            <span className="text-muted-foreground ml-1">— {formatRate(displayRate)}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 relative" data-testid={`field-${field.key}`} ref={containerRef}>
      <Label htmlFor={field.key} className="text-sm text-foreground font-medium">
        {resolvedLabel}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {/* Trigger */}
      {editingRate ? (
        <div className="w-full flex items-center gap-1 rounded-md border border-input bg-white dark:bg-background px-2 py-1.5 text-sm">
          <span className="font-medium shrink-0">{displayIso} —</span>
          <input
            data-testid="currency-rate-input"
            type="number"
            step="0.0001"
            min="0.000001"
            className="flex-1 min-w-0 bg-transparent outline-none tabular-nums"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
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
            className="text-green-600 hover:text-green-700 p-0.5 rounded"
            title="Confirmar"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            data-testid="currency-rate-cancel"
            type="button"
            onClick={handleRateCancel}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center gap-1">
          <button
            data-testid="currency-rate-trigger"
            id={field.key}
            type="button"
            className="flex-1 flex items-center justify-between rounded-md border border-input bg-white dark:bg-background px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
            onClick={() => setOpen((v) => !v)}
          >
            {value ? (
              <span>
                <span className="font-medium">{displayIso}</span>
                {displayRate != null && (
                  <span className="text-muted-foreground ml-1.5 tabular-nums">
                    — {formatRate(displayRate)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Seleccionar {resolvedLabel}...
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
          </button>
          {value && hasRecord && (
            <button
              data-testid="currency-rate-pencil"
              type="button"
              title="Editar tipo de cambio"
              onClick={handleRateEdit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
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
              placeholder="Buscar moneda..."
              className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                Sin resultados
              </div>
            )}
            {!loading &&
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={[
                    'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left transition-colors',
                    opt.id === value ? 'bg-muted/60 font-medium' : '',
                  ].join(' ')}
                  onClick={() => handleSelect(opt)}
                >
                  <span>{opt.isoCode}</span>
                  <span className="text-muted-foreground tabular-nums ml-3">
                    {formatRate(opt.rate)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
