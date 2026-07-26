import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
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
 * @param {boolean}  [field.clearable] - Controls whether the chip's clear (X) button is shown.
 *                                      Defaults to `true` (X shown) for every selector, including
 *                                      required fields. Set `"clearable": false` in the field's
 *                                      decisions.json to opt a specific field out and hide the X.
 * @param {boolean}  [preferDown]     - When true, the panel always opens downward instead of
 *                                      auto-flipping up when space below is tight. Useful when the
 *                                      selector is the last element on a scrollable page and an
 *                                      upward panel would cover the fields above it.
 * @param {boolean}  [serverSearch]   - When true, switches from "fetch-once + local filter" to
 *                                      "debounced server-side search" (ETP-4600 Phase 2a) —
 *                                      required for large catalogs (e.g. Business Partner) where
 *                                      filtering the full list client-side would silently miss
 *                                      records outside the initial page. Typing >= 2 chars sends
 *                                      `?q=<term>` to `selectorUrl` (debounced 300ms); the shown
 *                                      options ARE the server's response (not locally re-filtered),
 *                                      capped to 20. An initial page loads on first focus/open with
 *                                      an empty query. When `value` is set without `displayValue`,
 *                                      the label is resolved via a `?id=<value>` fetch into the
 *                                      same `resolvedDisplay` fallback used by the fetch-once mode.
 *                                      Default false preserves the original fetch-once + local
 *                                      filter behaviour untouched.
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
/** Derives the trigger/dropdown visual flags from the field/selection state (extracted to keep
 * CreatableSearchSelect's own cognitive complexity down — pure, no side effects). */
function computeSelectDisplayState({
  parentKey, parentValue, value, emptyOptionLabel, required, editingIntent, open,
  createLabel, loading, filteredOptions, query, resolvedLabel, ui,
}) {
  const hasSelection = value != null && value !== '';
  const isDisabled = !!(parentKey && !parentValue && !value);
  const showEmptyOption = !!emptyOptionLabel && !required;
  const showChip = hasSelection && !editingIntent && !isDisabled;
  const placeholder = (showEmptyOption && !hasSelection)
    ? emptyOptionLabel
    : `${ui('searchLabelPrefix')} ${resolvedLabel}...`;
  // Coerced to a real boolean (not left as the short-circuited `createLabel`/query string) —
  // it now also drives aria-expanded on the input, which must render "true"/"false", not
  // arbitrary text (ETP-4600 Gap A regression caught live: aria-expanded="+ Add address").
  const showDropdown = !!(open && !isDisabled
    && (showEmptyOption || createLabel || loading || filteredOptions.length > 0 || query.trim()));
  return { hasSelection, isDisabled, showEmptyOption, showChip, placeholder, showDropdown };
}

/** Builds the query params for a server-search request: base `selectorContext`, the
 * dependsOn filter (when configured), and `q` only once the typed term is long enough to be
 * worth sending — mirrors SearchInput's `triggerServerSearch` (EntityForm.jsx). Extracted so
 * the fetch call site itself stays a simple `fetch(...)` chain. */
function buildServerSearchParams({ selectorContext, parentKey, parentValue, filterKey, query }) {
  const params = { ...selectorContext };
  if (parentKey && parentValue && filterKey) params[filterKey] = parentValue;
  if (query && query.trim().length >= 2) params.q = query.trim();
  return params;
}

/** Fetches and maps selector options from the server for the server-search mode. Shared by
 * the debounced typing flow and the initial on-focus/on-open load (ETP-4600 Phase 2a). */
function fetchServerOptions({ selectorUrl, selectorContext, token, parentKey, parentValue, filterKey, query }) {
  const params = buildServerSearchParams({ selectorContext, parentKey, parentValue, filterKey, query });
  return fetch(buildUrlWithParams(selectorUrl, params), {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(res => (res.ok ? res.json() : null))
    .then(data => (data?.items ?? []).map(i => ({ id: i.id, name: i.label || i.name || i.id, ...i })));
}

/** Pinned "create X" / "use typed value" action rendered at the top of the dropdown panel. */
function CreateAction({ field, createLabel, onCreateRequest, onCreate, query }) {
  if (!createLabel || !onCreateRequest || (typeof createLabel === 'function' && !query.trim())) {
    return null;
  }
  return (
    <button
      type="button"
      data-testid={`action-create-${field.key}`}
      // block (not the <button> UA default inline-block) is required alongside w-full:
      // Chrome resolves a width:100% *inline-block* child's contribution to an ancestor's
      // width:max-content shrink-to-fit size using far more than the child's own content
      // width (observed ~2x the trigger rect instead of the longest option's text width —
      // this is the 3rd width iteration, see ETP-4600 dropdownStyle comment above). A
      // width:100% *block* child is correctly treated as indeterminate during that
      // calculation, so the panel collapses to the widest option's content width while the
      // row itself still stretches to fill the panel (bg-accent highlight spans edge-to-edge).
      className="w-full block text-left px-3 py-2 text-sm font-medium hover:bg-status-info border-b border-border/40 transition-colors whitespace-nowrap"
      style={{ color: 'hsl(var(--foreground))' }}
      onMouseDown={(e) => { e.preventDefault(); onCreate(); }}
    >
      {typeof createLabel === 'function' ? createLabel(query.trim()) : createLabel}
    </button>
  );
}

/** Contents of the portaled options panel: empty-choice, create action, loading, list, no-results. */
function SearchSelectOptionsPanel({
  field, ui, query, showEmptyOption, emptyOptionLabel, onSelectEmpty,
  createLabel, onCreateRequest, onCreate, loading, filteredOptions, onSelect,
  activeIndex, onHoverOption,
}) {
  return (
    // min-w-full + w-max: sizes this inner content wrapper to the widest option's natural
    // content width (at least the panel's own width). The option/create/empty buttons below
    // are `w-full block` — i.e. 100% of THIS wrapper, not of the outer portaled panel — so
    // when the panel is wide enough to scroll horizontally (ETP-4600 Fix 1, pathological case
    // where content is wider than the whole viewport and a horizontal scrollbar is
    // unavoidable), each row's hover/active background spans the FULL scrollable width instead
    // of being cut off at the visible viewport edge. This is a `block` div (not inline-block),
    // so it does NOT reintroduce the max-content doubling bug described in the CreateAction
    // comment below — a block child sized by its own content is treated normally by the
    // ancestor's width:max-content shrink-to-fit calculation.
    <div className="min-w-full w-max">
      {showEmptyOption && !query.trim() && (
        <button
          type="button"
          data-testid={`option-${field.key}-__empty__`}
          // block required alongside w-full — see the CreateAction className comment above.
          className="w-full block text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 border-b border-border/40 cursor-pointer whitespace-nowrap"
          onMouseDown={(e) => { e.preventDefault(); onSelectEmpty(); }}
        >
          {emptyOptionLabel}
        </button>
      )}
      <CreateAction
        field={field}
        createLabel={createLabel}
        onCreateRequest={onCreateRequest}
        onCreate={onCreate}
        query={query}
        data-testid={"CreateAction__" + field.id} />
      {loading && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{ui('loading')}</div>
      )}
      {!loading && filteredOptions.map((opt, index) => (
        <button
          key={opt.id}
          id={`${field.key}-option-${opt.id}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          data-option-index={index}
          data-testid={`option-${field.key}-${opt.id}`}
          // block required alongside w-full — see the CreateAction className comment above.
          className={`w-full block text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer whitespace-nowrap${index === activeIndex ? ' bg-accent text-accent-foreground' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}
          onMouseEnter={() => onHoverOption?.(index)}
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
  );
}

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
  preferDown = false,
  serverSearch = false,
}) {
  const ui = useUI();
  // `query` is PURE search text — it must never be prefilled with the selected value's
  // label (ETP-4600 Gap B). The chip's label comes from `displayValue` (caller-provided)
  // or `resolvedDisplay` (this component's own lookup fallback) below, never from `query`.
  const [query, setQuery] = useState('');
  // Fallback label used only when the caller passes `value` without a matching
  // `displayValue` (e.g. label not yet resolved by the caller). Decoupled from `query`
  // so opening/reopening the dropdown never leaks the resolved label into the search box.
  // When even this hasn't resolved yet (server round-trip in flight, or it fails), the chip
  // renders the raw `value` as a last-resort label (ETP-4600 Phase 2b) — matching SearchInput's
  // original behaviour of showing the raw id until the async label resolution lands, instead of
  // a blank chip.
  const [resolvedDisplay, setResolvedDisplay] = useState('');
  const [options, setOptions] = useState(staticOptions ?? []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Selected value renders as a Figma-style chip; clicking the chip body flips
  // editingIntent so the user can type to search again. Mirrors SearchInput.
  const [editingIntent, setEditingIntent] = useState(false);
  // Keyboard navigation index over `filteredOptions` (ETP-4600 Gap A). -1 = nothing
  // highlighted (mouse-only interaction so far).
  const [activeIndex, setActiveIndex] = useState(-1);
  // serverSearch mode only: the server's current result page. `null` means "not loaded yet"
  // (distinct from `[]` = "loaded, no matches") so the on-focus initial load only fires once
  // per reset (ETP-4600 Phase 2a).
  const [serverOptions, setServerOptions] = useState(null);

  // Tracks whether the user is actively typing to prevent external syncs from fighting input
  const isEditingRef = useRef(false);
  // Prevents re-fetching on focus if the current parent value's options are already loaded
  const loadedForRef = useRef(null);
  // Debounce timer for serverSearch mode's typing-triggered fetch.
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  // Anchor for the portaled options panel — its bounding rect drives the panel's
  // fixed position so the panel never affects the modal's scroll height.
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  // Computed fixed-position style for the portaled panel; null until first measured.
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [openUp, setOpenUp] = useState(false);
  // ETP-4600 Fix 2: when the trigger sits near the right viewport edge and the panel's
  // natural content is wide (e.g. long option labels), left-anchoring makes the panel hit the
  // viewport's maxWidth cap and forces a horizontal scrollbar. anchorRight flips the panel to
  // grow LEFTWARD from the trigger's right edge instead — mirrors the vertical openUp flip.
  const [anchorRight, setAnchorRight] = useState(false);

  // Stable refs so useEffect closures can read current values without adding them to deps
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const parentKey = field.dependsOn?.field;
  const filterKey = field.dependsOn?.filterKey;
  const parentValue = formData?.[parentKey];

  // Clears the search text AND, in serverSearch mode, discards the cached server page.
  // Every place that clears `query` back to '' on close/reopen MUST go through this —
  // otherwise `serverOptions` keeps the last typed filter's results, and the `onFocus`
  // lazy-load guard (`serverOptions === null`) never fires on reopen: the dropdown shows a
  // stale filtered list next to an empty search box (ETP-4600 serverSearch stale-page bug).
  const resetSearchState = useCallback(() => {
    setQuery('');
    if (serverSearch) setServerOptions(null);
  }, [serverSearch]);

  // Re-sync local options whenever the caller passes a NEW staticOptions array — e.g. a catalog
  // fetched asynchronously after mount (starts as `[]`, then populated once the request resolves).
  // The initial `useState(staticOptions ?? [])` above only covers the first render, so without this
  // effect a caller that loads its options after the component mounts would see an empty dropdown
  // forever (ETP-4530). Callers passing a stable array (e.g. a module-level constant) are unaffected.
  //
  // staticOptions is compared BY CONTENT (not by reference) against the last value this effect
  // actually synced from: many callers pass an inline-mapped array (a new reference every render),
  // and syncing unconditionally on every reference change would (a) trigger an extra render per
  // parent render, resetting dropdown/scroll state while open, and (b) clobber a locally-created
  // option (`handleCreate` below adds it into `options` immutably via `setOptions(prev => ...)`)
  // the moment the parent next re-renders with a content-identical-but-new-reference array.
  const lastSyncedStaticOptionsRef = useRef(undefined);
  useEffect(() => {
    if (!staticOptions) return;
    const lastSynced = lastSyncedStaticOptionsRef.current;
    const unchanged = lastSynced
      && lastSynced.length === staticOptions.length
      && lastSynced.every((opt, i) => opt.id === staticOptions[i]?.id && opt.name === staticOptions[i]?.name);
    if (unchanged) return;
    lastSyncedStaticOptionsRef.current = staticOptions;
    setOptions(staticOptions);
  }, [staticOptions]);

  // Fetch options whenever the parent value changes or after a forced refresh (refreshKey).
  // Skipped entirely in serverSearch mode — that mode fetches on typing/focus instead (below).
  useEffect(() => {
    if (serverSearch) return;
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
  }, [serverSearch, parentValue, selectorUrl, token, filterKey, refreshKey]);

  // When options load and we still lack a display label for the current value, resolve
  // one locally so the chip is never blank while the caller catches up (ETP-4600 Gap B —
  // this fallback label is intentionally separate from `query`, the search text).
  useEffect(() => {
    if (!value) { setResolvedDisplay(''); return; }
    if (displayValue) return;
    const opt = options.find(o => o.id === value);
    if (opt) setResolvedDisplay(opt.name);
  }, [options, value, displayValue]);

  // serverSearch mode only: when a value is set but the caller hasn't supplied a
  // displayValue (e.g. an existing record loaded straight from the API), resolve the label
  // via a single `?id=<value>` request — ported from SearchInput's equivalent effect
  // (EntityForm.jsx) — and feed it into `resolvedDisplay`, NOT `query`, so the chip shows
  // the right label without disturbing the empty-search-on-open behaviour (ETP-4600 Phase 2a).
  useEffect(() => {
    if (!serverSearch) return;
    if (!value || displayValue) return;
    if (!selectorUrl || !token) return;
    let cancelled = false;
    fetch(buildUrlWithParams(selectorUrl, { ...selectorContext, id: value }), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        const match = (data?.items ?? []).find(i => i.id === value);
        if (match) setResolvedDisplay(match.label || match.name || value);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // selectorContext intentionally omitted — see the fetch-once effect above for the same rationale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSearch, value, displayValue, selectorUrl, token]);

  // serverSearch mode only: debounced fetch triggered by typing, and the initial page load
  // triggered on first focus/open (both call this). Cleared on unmount so no stale timer
  // fires a setState after the component is gone.
  const triggerServerSearch = useCallback((searchQuery) => {
    if (!serverSearch || !selectorUrl || !token) return;
    setLoading(true);
    fetchServerOptions({ selectorUrl, selectorContext, token, parentKey, parentValue, filterKey, query: searchQuery })
      .then(items => setServerOptions(items))
      .catch(() => setServerOptions([]))
      .finally(() => setLoading(false));
  // selectorContext intentionally omitted — see the fetch-once effect above for the same rationale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSearch, selectorUrl, token, parentKey, parentValue, filterKey]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // serverSearch mode only: reset the cached page whenever the dependent parent changes (a
  // stale page for the old parent must never be shown under the new one), and auto-clear the
  // dependent value when the parent is cleared — mirroring the fetch-once effect's behaviour.
  useEffect(() => {
    if (!serverSearch) return;
    setServerOptions(null);
    if (parentKey && !parentValue && valueRef.current) onChangeRef.current('', '');
  }, [serverSearch, parentKey, parentValue]);

  // Options shown in the dropdown:
  // - serverSearch mode: the server's own result page IS the filtered list (no local
  //   re-filtering — the server already applied `q`), capped to 20 to match SearchInput.
  // - fetch-once mode (default): narrow the pre-fetched list by the typed query locally.
  const filteredOptions = useMemo(() => {
    if (serverSearch) return (serverOptions ?? []).slice(0, 20);
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q));
  }, [serverSearch, serverOptions, options, query]);

  // Reset keyboard highlight whenever the dropdown opens/closes or the search text changes —
  // a stale index from a previous open/query would highlight the wrong row (ETP-4600 Gap A).
  useEffect(() => {
    setActiveIndex(-1);
  }, [open, query]);

  // Keep the highlighted option scrolled into view when navigating with the keyboard.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = dropdownRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  // Derived visibility/state flags for the trigger and dropdown — computed together
  // since they all depend on the same selection/parent/query inputs.
  const { hasSelection, isDisabled, showEmptyOption, showChip, placeholder, showDropdown } =
    computeSelectDisplayState({
      parentKey, parentValue, value, emptyOptionLabel, required: field.required,
      editingIntent, open, createLabel, loading, filteredOptions, query, resolvedLabel, ui,
    });

  const handleSelect = (opt) => {
    isEditingRef.current = false;
    setEditingIntent(false);
    // Search text is cleared on close (ETP-4600 Gap B) — the chip renders the label from
    // displayValue/resolvedDisplay instead. Optimistically seed resolvedDisplay so the chip
    // shows the picked label immediately even if the caller's displayValue update lags a render.
    resetSearchState();
    setResolvedDisplay(opt.name);
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
  const handleSelectEmpty = () => {
    isEditingRef.current = false;
    setEditingIntent(false);
    resetSearchState();
    setOpen(false);
    onChange('', '', null);
  };

  // Chip mode: show the Figma chip when a value is selected and the user is
  // not actively editing. Clicking the chip body flips editingIntent so the
  // input becomes typeable again. Search text starts empty (ETP-4600 Gap B) —
  // entering edit mode must never prefill the box with the current label.
  const handleChipClick = () => {
    setEditingIntent(true);
    resetSearchState();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // Keyboard navigation over filteredOptions (ETP-4600 Gap A): ArrowUp/Down move the
  // highlight, Enter selects it, Esc closes without changing the selection, Home/End jump
  // to the ends of the list.
  const handleInputKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (filteredOptions.length > 0) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (filteredOptions.length > 0) { e.preventDefault(); setActiveIndex(filteredOptions.length - 1); }
        break;
      case 'Enter':
        if (activeIndex >= 0 && filteredOptions[activeIndex]) {
          e.preventDefault();
          handleSelect(filteredOptions[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        isEditingRef.current = false;
        setOpen(false);
        resetSearchState();
        if (hasSelection) setEditingIntent(false);
        break;
      default:
        break;
    }
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
      // Search text stays empty (ETP-4600 Gap B) — the chip picks up the label via
      // resolvedDisplay, mirroring handleSelect.
      setQuery('');
      setResolvedDisplay(newName || '');
      onChange(newId, newName);
      // Re-fetch from server so the full record (with server-computed name etc.) is reflected
      setRefreshKey(k => k + 1);
    });
  };

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
    const shouldOpenUp = !preferDown && spaceBelow < 220 && spaceAbove > spaceBelow;
    setOpenUp(shouldOpenUp);
    const maxHeight = Math.max(120, (shouldOpenUp ? spaceAbove : spaceBelow) - 12);
    // Auto-width, non-truncating panel (ETP-4600 Gap C): the trigger stays a fixed width
    // (rect.width, unchanged) but the DROPDOWN grows to fit its longest option instead of
    // truncating it — clamped to the viewport so it never overflows an edge.
    //
    // ETP-4600 Fix 2: two horizontal anchors, mirroring the vertical shouldOpenUp flip.
    // Left-anchored (default): panel grows rightward from the trigger's left edge, capped
    // to the space between the trigger and the right viewport edge. Right-anchored
    // (anchorRight, decided by the measurement effect below once real content width is
    // known): panel grows LEFTWARD from the trigger's right edge, capped to the space
    // between the left viewport edge and the trigger's right edge. This is what lets a
    // field near the right edge (e.g. "Clave NIF País Residencia") show a long option like
    // "Documento oficial de identificación..." without a horizontal scrollbar.
    const spaceRight = window.innerWidth - rect.left - 12;
    const spaceLeft = rect.right - 12;
    const maxWidth = anchorRight ? Math.max(rect.width, spaceLeft) : Math.max(rect.width, spaceRight);
    const horizontalAnchor = anchorRight
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left };
    // pointerEvents:'auto' is required because the panel is portaled to
    // document.body, which Radix Dialog (modal) marks pointer-events:none while
    // open. Without it the options render but every click passes through to the
    // form behind them — the panel looks active but nothing is selectable.
    setDropdownStyle(shouldOpenUp
      ? {
          position: 'fixed',
          ...horizontalAnchor,
          minWidth: rect.width,
          width: 'max-content',
          maxWidth,
          bottom: window.innerHeight - rect.top + 4,
          maxHeight,
          zIndex: 1000,
          pointerEvents: 'auto',
        }
      : {
          position: 'fixed',
          ...horizontalAnchor,
          minWidth: rect.width,
          width: 'max-content',
          maxWidth,
          top: rect.bottom + 4,
          maxHeight,
          zIndex: 1000,
          pointerEvents: 'auto',
        });
  }, [preferDown, anchorRight]);

  // Recompute on open and keep the panel glued to the trigger on scroll/resize.
  useEffect(() => {
    if (!showDropdown) return;
    updateDropdownDirection();
    const onReflow = (e) => {
      // 'scroll' is captured at the window level (capture=true) so the panel stays glued
      // to its trigger when an ANCESTOR scrolls (e.g. the modal body). But capture-phase
      // listeners on window also see the dropdown's OWN internal scroll (scrolling the
      // options list itself), which re-triggers this on every scroll tick — fighting the
      // user's own scroll gesture inside a long options list (e.g. a full chart of
      // accounts). Skip recompute when the scroll originated from inside the dropdown.
      // Only 'scroll' events carry a Node target here — a 'resize' event's target is
      // `window` itself, which Node.contains() throws on, so gate the containment check
      // to 'scroll' and always recompute on 'resize'.
      if (e.type === 'scroll' && dropdownRef.current?.contains(e.target)) return;
      updateDropdownDirection();
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [showDropdown, updateDropdownDirection]);

  // ETP-4600 Fix 2: decide the horizontal anchor from the panel's REAL content width, once
  // it's actually in the DOM. We can't know the natural width up front (it's `max-content`,
  // sized by the browser), so this runs as a second pass after the panel mounts/updates:
  // measure each option/create/empty button's own scrollWidth (their content width,
  // independent of the outer panel's current maxWidth cap — a `block` element's scrollWidth
  // reflects the text it actually contains, not the box it's currently constrained to), take
  // the widest one, and compare it against the space available on each side of the trigger.
  // Using the buttons' own scrollWidth (rather than the panel's) keeps this measurement
  // stable regardless of which anchor is currently applied — so the effect converges in at
  // most one extra render instead of oscillating between anchors.
  useLayoutEffect(() => {
    if (!showDropdown || !dropdownStyle || !rootRef.current || !dropdownRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left - 12;
    const spaceLeft = rect.right - 12;
    const buttons = dropdownRef.current.querySelectorAll('button');
    let naturalWidth = rect.width;
    buttons.forEach((btn) => {
      if (btn.scrollWidth > naturalWidth) naturalWidth = btn.scrollWidth;
    });
    const overflowsRight = naturalWidth > spaceRight;
    const shouldAnchorRight = overflowsRight && spaceLeft > spaceRight;
    setAnchorRight((prev) => (prev === shouldAnchorRight ? prev : shouldAnchorRight));
  }, [showDropdown, dropdownStyle, filteredOptions, query]);

  // Reset to the default left anchor on close so the next open always re-measures fresh
  // instead of possibly flashing a stale right-anchored panel from a previous field.
  useEffect(() => {
    if (!showDropdown) setAnchorRight(false);
  }, [showDropdown]);

  return (
    /*
      Single wrapper acts as the visual field box AND the popup anchor — same
      structure as SearchInput so the chip + chevron-right pattern is consistent
      across all FK pickers (Contacto, Tarifa, Dirección, etc.).
    */
    <div
      ref={rootRef}
      className={`group relative flex ${FIELD_HEIGHT} w-full min-w-0 items-center rounded-lg border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] pl-2 pr-2 gap-1 focus-within:ring-2 focus-within:ring-primary${isDisabled ? ' bg-muted text-text-disabled cursor-not-allowed' : ` bg-card${showChip ? ' hover:bg-[hsl(var(--muted))]' : ''}`}`}
      onClick={showChip && !isDisabled ? handleChipClick : undefined}
    >
      {showChip ? (
        <SelectorChip
          label={displayValue || resolvedDisplay || value}
          onClick={handleChipClick}
          onClear={handleClear}
          clearAriaLabel={ui('clear')}
          testId={`field-${field.key}-chip`}
          clearable={field.clearable !== false}
          data-testid={"SelectorChip__" + field.id} />
      ) : (
        <input
          ref={inputRef}
          id={field.key}
          name={field.key}
          data-testid={`field-${field.key}`}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={`options-${field.key}`}
          aria-activedescendant={
            activeIndex >= 0 && filteredOptions[activeIndex]
              ? `${field.key}-option-${filteredOptions[activeIndex].id}`
              : undefined
          }
          value={query}
          placeholder={placeholder}
          disabled={isDisabled}
          required={field.required && !isDisabled}
          autoComplete="off"
          className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] disabled:cursor-not-allowed"
          onChange={(e) => {
            isEditingRef.current = true;
            const newQuery = e.target.value;
            setQuery(newQuery);
            if (!open) setOpen(true);
            if (serverSearch) {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                triggerServerSearch(newQuery);
              }, 300);
            }
          }}
          onFocus={() => {
            setOpen(true);
            if (serverSearch) {
              // Lazy-load the initial page once per reset — `serverOptions === null` means
              // no fetch has landed yet for the current parent/reset cycle.
              if (serverOptions === null) triggerServerSearch(query);
              return;
            }
            // Lazy-load: if options for the current parent are not yet fetched, trigger fetch
            const cacheKey = `${parentValue ?? ''}:${refreshKey}`;
            if (loadedForRef.current !== cacheKey) {
              setRefreshKey(k => k); // identity update — effect re-evaluates its cache check
            }
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            isEditingRef.current = false;
            setTimeout(() => {
              setOpen(false);
              resetSearchState();
              // Revert to chip if the user blurred without picking another option
              if (hasSelection) setEditingIntent(false);
            }, 200);
          }}
        />
      )}
      {loading ? (
        <Loader2
          className="h-4 w-4 text-[hsl(var(--text-disabled))] animate-spin shrink-0 ml-auto"
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
            className="h-4 w-4 text-[hsl(var(--text-disabled))]"
            data-testid={"ChevronDown__" + field.id} />
        </button>
      )}
      {showDropdown && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          id={`options-${field.key}`}
          role="listbox"
          data-testid={`options-${field.key}`}
          className="bg-card border rounded-md shadow-lg overflow-auto"
          style={dropdownStyle}
          data-open-up={openUp ? 'true' : 'false'}
          // Radix Dialog (react-remove-scroll) locks body scroll while open by attaching a
          // global, capture-phase wheel listener that calls preventDefault() on any wheel
          // event outside the dialog's own DOM subtree — it only recognizes elements nested
          // inside Dialog.Content as scrollable exceptions. This panel is portaled to
          // document.body as a SIBLING of the dialog content (so it can be positioned
          // relative to the viewport instead of the modal, see the comment on
          // updateDropdownDirection above), so react-remove-scroll never allowlists it: the
          // browser's native wheel-to-scroll translation gets cancelled before it can move
          // this element's scrollTop, even though overflow:auto and a real maxHeight are
          // correctly set (confirmed live: scrollTop stayed 0 after a wheel event, but a
          // direct `el.scrollTop = x` assignment worked fine — only the NATIVE scroll
          // mechanism is blocked). Bypass it manually, matching the same fix already used by
          // LookupPicker.jsx for the identical scenario. Only do the manual adjustment when
          // e.defaultPrevented is already true — react-remove-scroll's capture-phase listener
          // runs before this bubble-phase handler, so that flag tells us whether native scroll
          // was actually blocked. When this component is used OUTSIDE a Dialog (no
          // react-remove-scroll active), native scrolling works normally and adding deltaY on
          // top of it here would double-scroll the panel.
          onWheel={(e) => {
            e.stopPropagation();
            if (e.defaultPrevented) {
              e.currentTarget.scrollTop += e.deltaY;
            }
          }}
        >
          <SearchSelectOptionsPanel
            field={field}
            ui={ui}
            query={query}
            showEmptyOption={showEmptyOption}
            emptyOptionLabel={emptyOptionLabel}
            onSelectEmpty={handleSelectEmpty}
            createLabel={createLabel}
            onCreateRequest={onCreateRequest}
            onCreate={handleCreate}
            loading={loading}
            filteredOptions={filteredOptions}
            onSelect={handleSelect}
            activeIndex={activeIndex}
            onHoverOption={setActiveIndex}
            data-testid={"SearchSelectOptionsPanel__" + field.id} />
        </div>,
        document.body,
      )}
    </div>
  );
}
