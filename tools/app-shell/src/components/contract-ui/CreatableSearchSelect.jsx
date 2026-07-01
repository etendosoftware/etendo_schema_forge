import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { SelectorChip } from './SelectorChip.jsx';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';

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
 * @param {string}   [emptyOptionLabel] - Label for an explicit empty/null choice pinned at
 *                                      the top of the dropdown (e.g. "All accounts"). When set,
 *                                      selecting it clears the value to null — mirroring the
 *                                      `emptyOptionLabelKey` behaviour of the plain SelectorInput.
 *                                      Only rendered when the field is not required.
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
  emptyOptionLabel,
  staticOptions,
}) {
  const ui = useUI();
  const [query, setQuery] = useState(displayValue || '');
  const [options, setOptions] = useState(staticOptions ?? []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Selected value renders as a Figma-style chip; clicking the chip body flips
  // editingIntent so the user can type to search again. Mirrors SearchInput.
  const [editingIntent, setEditingIntent] = useState(false);

  // Tracks whether the user is actively typing to prevent external syncs from fighting input
  const isEditingRef = useRef(false);
  // Prevents re-fetching on focus if the current parent value's options are already loaded
  const loadedForRef = useRef(null);
  const inputRef = useRef(null);
  // Anchor for the portaled options panel — its bounding rect drives the panel's
  // fixed position so the panel never affects the modal's scroll height.
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  // Computed fixed-position style for the portaled panel; null until first measured.
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [openUp, setOpenUp] = useState(false);

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
    if (staticOptions) return;
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
    setEditingIntent(false);
    setQuery(opt.name);
    setOpen(false);
    onChange(opt.id, opt.name, opt);
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setEditingIntent(false);
    setQuery('');
    setOpen(true);
    onChange('', '');
  };

  // Explicit empty/null choice (e.g. "All accounts"): clears the value and shows
  // the empty-option label as the chip, mirroring SelectorInput's "__empty__" item.
  const showEmptyOption = !!emptyOptionLabel && !field.required;
  const handleSelectEmpty = () => {
    isEditingRef.current = false;
    setEditingIntent(false);
    setQuery('');
    setOpen(false);
    onChange('', '', null);
  };

  // Chip mode: show the Figma chip when a value is selected and the user is
  // not actively editing. Clicking the chip body flips editingIntent so the
  // input becomes typeable again.
  const showChip = hasSelection && !editingIntent && !isDisabled;
  const handleChipClick = () => {
    setEditingIntent(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const handleCreate = () => {
    isEditingRef.current = false;
    setOpen(false);
    // The create button uses onMouseDown + preventDefault (so it fires before blur),
    // which keeps focus on this input — leaving the dropdown able to reopen behind the
    // create modal. Explicitly drop focus so the selector fully closes.
    setEditingIntent(false);
    inputRef.current?.blur();
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

  // When an empty-option label is configured and nothing is selected, surface it
  // as the placeholder (e.g. "All accounts") instead of the generic search prompt —
  // matching SelectorInput's trigger, where the empty label reads on the closed control.
  const placeholder = (showEmptyOption && !hasSelection)
    ? emptyOptionLabel
    : `${ui('searchLabelPrefix')} ${resolvedLabel}...`;

  const showDropdown = open && !isDisabled && (showEmptyOption || createLabel || loading || filteredOptions.length > 0 || query.trim());

  // Measure the trigger and compute a viewport-anchored (fixed) position for the
  // panel. Mirrors InlineSearchCombo: open downward by default, flip upward when
  // there is more room above than below. Because the panel is portaled to
  // document.body with position:fixed, it never contributes to the modal's
  // scrollable height — fixing the "modal scrolls when the panel opens" bug.
  const updateDropdownDirection = useCallback(() => {
    if (!rootRef.current || typeof window === 'undefined') return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    setOpenUp(shouldOpenUp);
    const maxHeight = Math.max(120, (shouldOpenUp ? spaceAbove : spaceBelow) - 12);
    // pointerEvents:'auto' is required because the panel is portaled to
    // document.body, which Radix Dialog (modal) marks pointer-events:none while
    // open. Without it the options render but every click passes through to the
    // form behind them — the panel looks active but nothing is selectable.
    setDropdownStyle(shouldOpenUp
      ? {
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + 4,
          maxHeight,
          zIndex: 1000,
          pointerEvents: 'auto',
        }
      : {
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          top: rect.bottom + 4,
          maxHeight,
          zIndex: 1000,
          pointerEvents: 'auto',
        });
  }, []);

  // Recompute on open and keep the panel glued to the trigger on scroll/resize.
  useEffect(() => {
    if (!showDropdown) return;
    updateDropdownDirection();
    const onReflow = () => updateDropdownDirection();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [showDropdown, updateDropdownDirection]);

  return (
    /*
      Single wrapper acts as the visual field box AND the popup anchor — same
      structure as SearchInput so the chip + chevron-right pattern is consistent
      across all FK pickers (Contacto, Tarifa, Dirección, etc.).
    */
    <div
      ref={rootRef}
      className={`relative flex ${FIELD_HEIGHT} w-full items-center rounded-lg border border-[#D1D4DB] bg-transparent shadow-[0px_1px_2px_rgba(18,18,23,0.05)] pl-2 pr-2 gap-1 focus-within:ring-2 focus-within:ring-primary${isDisabled ? ' opacity-50 cursor-not-allowed' : ''}`}
      onClick={showChip && !isDisabled ? handleChipClick : undefined}
    >
      {showChip ? (
        <SelectorChip
          label={displayValue || query}
          onClick={handleChipClick}
          onClear={handleClear}
          clearAriaLabel={ui('clear')}
          testId={`field-${field.key}-chip`}
          data-testid={"SelectorChip__" + field.id} />
      ) : (
        <input
          ref={inputRef}
          id={field.key}
          name={field.key}
          data-testid={`field-${field.key}`}
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={isDisabled}
          required={field.required && !isDisabled}
          autoComplete="off"
          className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none py-2 text-sm placeholder:text-[#6C6C89] disabled:cursor-not-allowed"
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
            setTimeout(() => {
              setOpen(false);
              // Revert to chip if the user blurred without picking another option
              if (hasSelection) setEditingIntent(false);
            }, 200);
          }}
        />
      )}
      {loading ? (
        <Loader2
          className="h-4 w-4 text-[#828FA3] animate-spin shrink-0 ml-auto"
          data-testid={"Loader2__" + field.id} />
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (showChip) { handleChipClick(); return; }
            if (open) {
              setOpen(false);
            } else {
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
          className="shrink-0 ml-auto flex items-center"
        >
          <ChevronDown
            className="h-4 w-4 text-[#828FA3]"
            data-testid={"ChevronDown__" + field.id} />
        </button>
      )}
      {showDropdown && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          data-testid={`options-${field.key}`}
          className="bg-white border rounded-md shadow-lg overflow-auto"
          style={dropdownStyle}
          data-open-up={openUp ? 'true' : 'false'}
        >
          {/* Empty/null choice (e.g. "All accounts") — pinned at the top, hidden while filtering */}
          {showEmptyOption && !query.trim() && (
            <button
              type="button"
              data-testid={`option-${field.key}-__empty__`}
              className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 border-b border-border/40 cursor-pointer"
              onMouseDown={(e) => { e.preventDefault(); handleSelectEmpty(); }}
            >
              {emptyOptionLabel}
            </button>
          )}

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
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
            >
              {opt.name}
            </button>
          ))}

          {!loading && filteredOptions.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {ui('noResultsFor')} &ldquo;{query}&rdquo;
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
