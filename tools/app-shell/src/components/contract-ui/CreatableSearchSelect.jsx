import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';

/**
 * CreatableSearchSelect — generic search-style selector with an inline "Create X" action.
 *
 * ## Visual pattern
 * Text input + dropdown list. The create action (e.g. "+ Add address") appears as the
 * first item in the dropdown, above the fetched options — matching the contact selector
 * style where "+ Create contact" lives inside the dropdown, not as an external button.
 *
 * ## Key features
 * - **Server-side options**: fetched lazily on first focus (or parent change).
 * - **Local text filter**: once options are loaded the user can type to narrow the list
 *   without extra server round-trips (suitable for short lists such as addresses).
 * - **Dependent filtering**: when `field.dependsOn` is set, options are fetched with
 *   `{ [filterKey]: parentValue }` appended to every request. The field is disabled and
 *   shows "Select parent first" until the parent has a value.
 * - **Auto-clear**: when the parent field is cleared the dependent value is also cleared.
 * - **Auto-select first**: when the parent changes and the current value is no longer
 *   present in the new options, the first option is selected automatically.
 * - **Inline creation**: clicking the create action calls `onCreateRequest(query, onCreated)`.
 *   The caller opens whatever modal it needs, then calls `onCreated(id, name)` to
 *   auto-select the result and refresh the option list from the server.
 * - **Clear button**: shown when a value is selected.
 *
 * ## Props
 * @param {object}   field            - Field definition from the contract.
 *   - `field.key`                    - Used for id/data-testid attributes.
 *   - `field.required`               - Marks the input as required.
 *   - `field.dependsOn`              - Optional `{ field, filterKey }` for dependent mode.
 * @param {string}   value            - Current selected record ID.
 * @param {string}   displayValue     - Human-readable label for the current value.
 * @param {Function} onChange         - `(id: string, label: string, opt?: object) => void`
 * @param {object}   formData         - Full form state; used to read the parent value
 *                                     when `field.dependsOn` is configured.
 * @param {string}   resolvedLabel    - Translated field label shown in the placeholder.
 * @param {string}   selectorUrl      - Server endpoint for fetching options.
 * @param {object}   selectorContext  - Extra query params appended to every selector request.
 * @param {string}   token            - JWT bearer token.
 * @param {string}   [createLabel]    - Text for the create action, e.g. "+ Add address".
 *                                     When omitted the create option is not rendered.
 * @param {Function} [onCreateRequest] - `(query: string, onCreated: (id, name) => void) => void`
 *                                      Called when the user clicks the create option.
 *                                      The caller opens a creation modal; once saved it
 *                                      must call `onCreated(id, name)` so the component
 *                                      can auto-select the new item and refresh its list.
 *
 * ## Usage example (address picker wired to LocationEditorModal)
 * ```jsx
 * <CreatableSearchSelect
 *   field={field}
 *   value={value}
 *   displayValue={displayValue}
 *   onChange={onChange}
 *   formData={formData}
 *   resolvedLabel={resolvedLabel}
 *   selectorUrl={selectorUrl}
 *   selectorContext={selectorContext}
 *   token={token}
 *   createLabel={ui('addAddress')}
 *   onCreateRequest={(query, onCreated) => {
 *     // open modal; on save call onCreated(newId, newName)
 *   }}
 * />
 * ```
 */
export function CreatableSearchSelect({
  field,
  value,
  displayValue,
  onChange,
  formData,
  resolvedLabel,
  selectorUrl,
  selectorContext,
  token,
  createLabel,
  onCreateRequest,
}) {
  const ui = useUI();
  const [query, setQuery] = useState(displayValue || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Tracks whether the user is actively typing to prevent external syncs from fighting input
  const isEditingRef = useRef(false);
  // Prevents re-fetching on focus if the current parent value's options are already loaded
  const loadedForRef = useRef(null);

  // Stable refs so useEffect closures can read current values without adding them to deps
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const parentKey = field.dependsOn?.field;
  const filterKey = field.dependsOn?.filterKey;
  const parentValue = formData?.[parentKey];
  const isDisabled = !!(parentKey && !parentValue && !value);

  // Sync displayed text from outside when the user is not actively typing
  useEffect(() => {
    if (!isEditingRef.current) {
      setQuery(displayValue || '');
    }
  }, [displayValue]);

  // Fetch options whenever the parent value changes or after a forced refresh (refreshKey)
  useEffect(() => {
    if (parentKey && !parentValue) {
      setOptions([]);
      loadedForRef.current = null;
      if (valueRef.current) onChangeRef.current('', '');
      return;
    }
    if (!selectorUrl || !token) return;

    const cacheKey = `${parentValue ?? ''}:${refreshKey}`;
    if (loadedForRef.current === cacheKey) return;
    loadedForRef.current = cacheKey;

    setLoading(true);
    const params = { ...selectorContext };
    if (parentKey && parentValue && filterKey) params[filterKey] = parentValue;

    fetch(buildUrlWithParams(selectorUrl, params), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const items = (data?.items ?? []).map(i => ({
          id: i.id,
          name: i.label || i.name || i.id,
          ...i,
        }));
        setOptions(items);
        // When the parent changes and the previous selection is no longer valid,
        // auto-select the first available option (FIC parity — the user explicitly
        // chose the parent so auto-filling the dependent is helpful, not silent).
        // Only clear when there are no options and the field had a stale value.
        const currentValid = valueRef.current && items.some(o => o.id === valueRef.current);
        if (!currentValid && parentValue) {
          if (items.length > 0) {
            onChangeRef.current(items[0].id, items[0].name);
          } else if (valueRef.current) {
            onChangeRef.current('', '');
          }
        }
      })
      .catch(() => { setOptions([]); })
      .finally(() => setLoading(false));
  // selectorContext intentionally omitted — it is memoized upstream and its reference
  // is stable across renders for all current callers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentValue, selectorUrl, token, filterKey, refreshKey]);

  // When options load and we still lack a display label for the current value, fill it in
  useEffect(() => {
    if (value && !displayValue && !isEditingRef.current) {
      const opt = options.find(o => o.id === value);
      if (opt) setQuery(opt.name);
    }
  }, [options, value, displayValue]);

  // Local filter: narrow the server-fetched list by the typed query (no extra server calls)
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const hasSelection = value != null && value !== '';

  const handleSelect = (opt) => {
    isEditingRef.current = false;
    setQuery(opt.name);
    setOpen(false);
    onChange(opt.id, opt.name, opt);
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setQuery('');
    setOpen(true);
    onChange('', '');
  };

  const handleCreate = () => {
    isEditingRef.current = false;
    setOpen(false);
    if (!onCreateRequest) return;
    onCreateRequest(query, (newId, newName) => {
      if (!newId) return;
      // Optimistically add the new item so the selection is immediate
      setOptions(prev => prev.some(o => o.id === newId) ? prev : [...prev, { id: newId, name: newName || newId }]);
      setQuery(newName || '');
      onChange(newId, newName);
      // Re-fetch from server so the full record (with server-computed name etc.) is reflected
      setRefreshKey(k => k + 1);
    });
  };

  const placeholder = `${ui('searchLabelPrefix')} ${resolvedLabel}...`;

  const showDropdown = open && !isDisabled && (createLabel || loading || filteredOptions.length > 0 || query.trim());

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          id={field.key}
          name={field.key}
          data-testid={`field-${field.key}`}
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={isDisabled}
          required={field.required && !isDisabled}
          autoComplete="off"
          className="w-full h-10 pl-8 pr-8 text-sm rounded-lg border border-[#D1D4DB] bg-transparent shadow-[0px_1px_2px_rgba(18,18,23,0.05)] focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onChange={(e) => {
            isEditingRef.current = true;
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // Lazy-load: if options for the current parent are not yet fetched, trigger fetch
            const cacheKey = `${parentValue ?? ''}:${refreshKey}`;
            if (loadedForRef.current !== cacheKey) {
              setRefreshKey(k => k); // identity update — effect re-evaluates its cache check
            }
          }}
          onBlur={() => {
            isEditingRef.current = false;
            setTimeout(() => setOpen(false), 200);
          }}
        />
        {hasSelection && !isDisabled && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
            aria-label={ui('clear')}
            className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div data-testid={`options-${field.key}`} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          {/* Create action — always pinned at the top */}
          {createLabel && onCreateRequest && (
            <button
              type="button"
              data-testid={`action-create-${field.key}`}
              className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-blue-50 border-b border-border/40 transition-colors"
              style={{ color: '#202452' }}
              onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
            >
              {createLabel}
            </button>
          )}

          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">{ui('loading')}</div>
          )}

          {!loading && filteredOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              data-testid={`option-${field.key}-${opt.id}`}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
              onMouseDown={() => handleSelect(opt)}
            >
              {opt.name}
            </button>
          ))}

          {!loading && filteredOptions.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {ui('noResultsFor')} &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
