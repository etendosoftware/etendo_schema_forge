import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { shouldAnchorDropdownRight } from '@/lib/dropdownAnchor.js';
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
 *                                      options ARE the server's response (not locally re-filtered).
 *                                      An initial page loads on first focus/open with an empty
 *                                      query. Both the initial load and every search fetch a page
 *                                      of `SERVER_SEARCH_PAGE` items (`limit`/`offset` sent
 *                                      explicitly); scrolling near the bottom of the dropdown
 *                                      (ETP-4975) fetches the next page and appends it — mirroring
 *                                      `SelectorInput.jsx`'s `fetchPage`/scroll-listener pattern —
 *                                      so the full catalog (e.g. 1214 IAE activity rows) stays
 *                                      reachable by scrolling instead of being capped at one page.
 *                                      A new query (typed or a parent change) always REPLACES the
 *                                      list and resets pagination to offset 0; scrolling for more
 *                                      of the SAME query APPENDS. When `value` is set without
 *                                      `displayValue`, the label is resolved via a `?id=<value>`
 *                                      fetch into the same `resolvedDisplay` fallback used by the
 *                                      fetch-once mode. Default false preserves the original
 *                                      fetch-once + local filter behaviour untouched.
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
  createLabel, loading, filteredOptions, query, resolvedLabel, ui, placeholderOverride,
}) {
  const hasSelection = value != null && value !== '';
  const isDisabled = !!(parentKey && !parentValue && !value);
  const showEmptyOption = !!emptyOptionLabel && !required;
  const showChip = hasSelection && !editingIntent && !isDisabled;
  const placeholder = (showEmptyOption && !hasSelection)
    ? emptyOptionLabel
    : (placeholderOverride || `${ui('searchLabelPrefix')} ${resolvedLabel}...`);
  // Coerced to a real boolean (not left as the short-circuited `createLabel`/query string) —
  // it now also drives aria-expanded on the input, which must render "true"/"false", not
  // arbitrary text (ETP-4600 Gap A regression caught live: aria-expanded="+ Add address").
  const showDropdown = !!(open && !isDisabled
    && (showEmptyOption || createLabel || loading || filteredOptions.length > 0 || query.trim()));
  return { hasSelection, isDisabled, showEmptyOption, showChip, placeholder, showDropdown };
}

// Page size for serverSearch mode's paginated fetches (initial load, search, and
// scroll-triggered "load more"). Matches SelectorInput.jsx's SELECTOR_PAGE so both
// selector styles page at the same granularity (ETP-4975).
const SERVER_SEARCH_PAGE = 50;

/** Builds the query params for a server-search request: base `selectorContext`, the
 * dependsOn filter (when configured), `q` only once the typed term is long enough to be
 * worth sending — mirrors SearchInput's `triggerServerSearch` (EntityForm.jsx) — and explicit
 * `limit`/`offset` for pagination (ETP-4975). Extracted so the fetch call site itself stays a
 * simple `fetch(...)` chain. */
function buildServerSearchParams({ selectorContext, parentKey, parentValue, filterKey, query, offset, limit }) {
  const params = { ...selectorContext };
  if (parentKey && parentValue && filterKey) params[filterKey] = parentValue;
  if (query && query.trim().length >= 2) params.q = query.trim();
  params.limit = limit;
  params.offset = offset;
  return params;
}

/** Fetches and maps one page of selector options from the server for the server-search mode.
 * Shared by the debounced typing flow, the initial on-focus/on-open load, and the
 * scroll-triggered "load more" (ETP-4600 Phase 2a; pagination added ETP-4975). Returns
 * `hasMore` (inferred the same way as SelectorInput.jsx: a short page means the server is
 * exhausted) alongside the mapped `items` so the caller can decide whether to keep paginating. */
function fetchServerOptions({ selectorUrl, selectorContext, token, parentKey, parentValue, filterKey, query, offset = 0, limit = SERVER_SEARCH_PAGE }) {
  const params = buildServerSearchParams({ selectorContext, parentKey, parentValue, filterKey, query, offset, limit });
  return fetch(buildUrlWithParams(selectorUrl, params), {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      const items = (data?.items ?? []).map(i => ({ id: i.id, name: i.label || i.name || i.id, ...i }));
      return { items, hasMore: items.length >= limit };
    });
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

/** Contents of the portaled options panel: empty-choice, create action, loading, list, no-results,
 * and (serverSearch mode only) a "loading more" footer while a scroll-triggered next page fetches
 * (ETP-4975) — mirrors SelectorInput.jsx's `{hasMore && selectorUrl && (...)}` footer. */
function SearchSelectOptionsPanel({
  field, ui, query, showEmptyOption, emptyOptionLabel, onSelectEmpty,
  createLabel, onCreateRequest, onCreate, loading, filteredOptions, onSelect,
  activeIndex, onHoverOption, serverSearch, hasMore,
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
      {serverSearch && !loading && hasMore && filteredOptions.length > 0 && (
        <div className="py-1 text-center text-xs text-muted-foreground select-none pointer-events-none">
          {ui('loading')}
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
  // Optional flat override for the idle-state placeholder text (e.g. a plain "Select..."),
  // replacing the default "Search {resolvedLabel}..." composition. Every existing caller
  // omits this, so behavior is unchanged unless a caller opts in.
  placeholderOverride,
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
  // serverSearch mode only: the server's current result page (all pages loaded so far,
  // concatenated). `null` means "not loaded yet" (distinct from `[]` = "loaded, no matches")
  // so the on-focus initial load only fires once per reset (ETP-4600 Phase 2a).
  const [serverOptions, setServerOptions] = useState(null);
  // serverSearch mode only: whether another page might exist beyond the loaded ones — drives
  // the "loading" footer and gates scroll-triggered fetches (ETP-4975, mirrors SelectorInput.jsx).
  const [hasMore, setHasMore] = useState(true);
  // serverSearch mode only: true while a scroll-triggered NEXT page is fetching — kept separate
  // from `loading` (which is reserved for offset-0 fetches: initial load / new search) so
  // paginating never blanks the already-loaded options behind a "loading" placeholder.
  const [loadingMore, setLoadingMore] = useState(false);

  // Tracks whether the user is actively typing to prevent external syncs from fighting input
  const isEditingRef = useRef(false);
  // Prevents re-fetching on focus if the current parent value's options are already loaded
  const loadedForRef = useRef(null);
  // Debounce timer for serverSearch mode's typing-triggered fetch.
  const debounceRef = useRef(null);
  // serverSearch mode only: mirrors `hasMore`/next-page offset in refs so the scroll handler
  // (which fires outside React's render cycle) always reads the latest value synchronously,
  // exactly like SelectorInput.jsx's hasMoreRef/offsetRef.
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);
  // Guards against a scroll-triggered fetch overlapping another already in flight.
  const fetchInFlightRef = useRef(false);
  // serverSearch mode only: tags every fetch with the search "generation" it belongs to
  // (ETP-4975 BUG-2). Incremented each time a NEW search starts (offset===0 — typed or via
  // focus/open); a scroll-triggered "load more" (offset>0) keeps whatever generation was
  // current when it was launched. `triggerServerSearch` compares the captured generation against
  // the current one before applying a resolved fetch's result, so a stale in-flight request from
  // an already-superseded search can never overwrite/append onto a newer one's results.
  const searchGenerationRef = useRef(0);
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

  // Clears the visible search text. Cheap and synchronous-ish — safe to call from the
  // close/blur path (see the input's onBlur below).
  //
  // IMPORTANT: this does NOT touch `serverOptions` anymore. It used to also null out the
  // cached server page here, but every call site that mattered for that was on the
  // CLOSE/BLUR path (the input's onBlur fires this from inside a 200ms setTimeout). That
  // deferred write landed *after* the user had already moved on — e.g. toggled another
  // field and hit Save — and raced the save (ETP-4600 regression: an asset's `depreciate`
  // flag reverted to `false` on save because a state update scheduled at blur time fired
  // ~200ms later, after the user had already left the selector). `serverOptions`
  // invalidation now happens at OPEN time instead (see the input's onFocus below), which is
  // always synchronous with a real user gesture and never fires after the fact.
  const resetSearchState = useCallback(() => {
    setQuery('');
  }, []);

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

  // serverSearch mode only: fetches one page. Called with offset 0 for the debounced
  // typing-triggered search AND the initial page load on first focus/open (both REPLACE the
  // list — a new query/open always starts from page 0); called with offset > 0 from the
  // scroll listener below to APPEND the next page (ETP-4975, mirrors SelectorInput.jsx's
  // fetchPage). Cleared on unmount so no stale timer fires a setState after the component
  // is gone (the debounce timer; this function itself has no timer of its own).
  const triggerServerSearch = useCallback((searchQuery, offset = 0) => {
    if (!serverSearch || !selectorUrl || !token) return;
    if (offset > 0 && (!hasMoreRef.current || fetchInFlightRef.current)) return;
    // ETP-4975 BUG-2 fix: offset===0 always starts a NEW search generation (typed, or via
    // focus/open); offset>0 (scroll-triggered "load more") is tagged with whatever generation
    // was already current when it fired — it never starts one of its own. When the fetch
    // resolves, only apply it if that captured generation is still the current one; otherwise a
    // newer search has already superseded it and the stale result is discarded silently instead
    // of overwriting/appending onto the newer search's state (serverOptions/offsetRef/hasMoreRef).
    if (offset === 0) searchGenerationRef.current += 1;
    const requestGeneration = searchGenerationRef.current;
    fetchInFlightRef.current = true;
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    fetchServerOptions({
      selectorUrl, selectorContext, token, parentKey, parentValue, filterKey,
      query: searchQuery, offset, limit: SERVER_SEARCH_PAGE,
    })
      .then(({ items, hasMore: more }) => {
        if (searchGenerationRef.current !== requestGeneration) return;
        setServerOptions(prev => (offset === 0 ? items : [...(prev ?? []), ...items]));
        offsetRef.current = offset + items.length;
        hasMoreRef.current = more;
        setHasMore(more);
      })
      .catch(() => {
        if (searchGenerationRef.current !== requestGeneration) return;
        if (offset === 0) setServerOptions([]);
        hasMoreRef.current = false;
        setHasMore(false);
      })
      .finally(() => {
        fetchInFlightRef.current = false;
        if (offset === 0) setLoading(false); else setLoadingMore(false);
      });
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
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
    if (parentKey && !parentValue && valueRef.current) onChangeRef.current('', '');
  }, [serverSearch, parentKey, parentValue]);

  // Options shown in the dropdown:
  // - serverSearch mode: the server's own (paginated, concatenated) result pages ARE the
  //   filtered list — no local re-filtering (the server already applied `q`) and no local
  //   truncation (pagination — see triggerServerSearch/the scroll listener below — is what
  //   grows this list beyond the first page, ETP-4975).
  // - fetch-once mode (default): narrow the pre-fetched list by the typed query locally.
  const filteredOptions = useMemo(() => {
    if (serverSearch) return serverOptions ?? [];
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
      parentKey, parentValue, value, emptyOptionLabel, placeholderOverride, required: field.required,
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
    // The chip <button> unmounts and the <input> mounts once hasSelection flips to
    // false — without moving focus onto it, clicking away never fires onBlur, so the
    // dropdown reopened above never auto-closes (bug: stayed open forever after clear).
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
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
    const shouldAnchorRight = shouldAnchorDropdownRight(rootRef.current, dropdownRef.current);
    setAnchorRight((prev) => (prev === shouldAnchorRight ? prev : shouldAnchorRight));
  }, [showDropdown, dropdownStyle, filteredOptions, query]);

  // Reset to the default left anchor on close so the next open always re-measures fresh
  // instead of possibly flashing a stale right-anchored panel from a previous field.
  useEffect(() => {
    if (!showDropdown) setAnchorRight(false);
  }, [showDropdown]);

  // State-dependent classes computed separately (rather than nested inline) so the
  // className stays a single flat template literal below. Only two states matter
  // for hover: disabled (no hover affordance) vs. enabled (always gets the same
  // full-field hover, whether or not a value is selected as a chip) — an empty
  // enabled field must highlight on hover just like a populated one.
  let stateClasses;
  if (isDisabled) {
    stateClasses = ' bg-muted text-text-disabled cursor-not-allowed';
  } else {
    stateClasses = ' bg-card hover:bg-[hsl(var(--muted))]';
  }

  return (
    /*
      Single wrapper acts as the visual field box AND the popup anchor — same
      structure as SearchInput so the chip + chevron-right pattern is consistent
      across all FK pickers (Contacto, Tarifa, Dirección, etc.).
    */
    <div
      ref={rootRef}
      className={`group relative flex ${FIELD_HEIGHT} w-full min-w-0 items-center rounded-lg border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] pl-2 pr-2 gap-1 focus-within:ring-2 focus-within:ring-primary${stateClasses}`}
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
              // A new typed term is a NEW search, not "load more of the old one" — reset
              // pagination to page 0 up front (ETP-4975) so a scroll event firing during the
              // 300ms debounce window can't append a stale page under the new query.
              offsetRef.current = 0;
              hasMoreRef.current = true;
              setHasMore(true);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                triggerServerSearch(newQuery, 0);
              }, 300);
            }
          }}
          onFocus={() => {
            setOpen(true);
            if (serverSearch) {
              // Always invalidate the cached page and fetch a fresh one on OPEN —
              // guarantees an unfiltered, up-to-date list every time the user opens the
              // selector (ETP-4600), regardless of how they got here (chip click, chevron
              // toggle, or a plain focus/tab). This replaced a blur-time (close path)
              // invalidation that used to fire ~200ms after the user left the field via a
              // setTimeout — see the resetSearchState comment above for why that raced
              // saves. One fetch per real focus event: not a loop, since focus only fires
              // once per open gesture.
              setServerOptions(null);
              offsetRef.current = 0;
              hasMoreRef.current = true;
              setHasMore(true);
              triggerServerSearch(query, 0);
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
      {loading || loadingMore ? (
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
          onScroll={(e) => {
            // serverSearch-only infinite scroll (ETP-4975): this outer `overflow-auto` div IS
            // the real scrollable container for the options list (there's no separate
            // Radix/cmdk viewport in this component, unlike SelectorInput.jsx's SelectContent),
            // so the scroll listener attaches directly here via onScroll instead of a
            // querySelector'd child. Same 100px-from-bottom threshold as SelectorInput.jsx.
            if (!serverSearch) return;
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop - clientHeight < 100) {
              triggerServerSearch(query, offsetRef.current);
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
            serverSearch={serverSearch}
            hasMore={hasMore}
            data-testid={"SearchSelectOptionsPanel__" + field.id} />
        </div>,
        document.body,
      )}
    </div>
  );
}
