import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { shouldAnchorDropdownRight } from '@/lib/dropdownAnchor.js';
import { useUI } from '@/i18n';
import { SelectorChip } from './SelectorChip.jsx';
import {
  resolveSelectedIndex, prependCurrentSelection, nextActiveIndex, shouldKeepLocating, centerOptionInPanel,
} from './selectorSelection.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
// Page size for the server-side search's paginated fetches (initial load, search, and
// scroll-triggered "load more"). Matches SelectorInput.jsx's SELECTOR_PAGE and
// CreatableSearchSelect.jsx's SERVER_SEARCH_PAGE so all three selector styles page at the
// same granularity (ETP-4975).
const SERVER_SEARCH_PAGE = 50;
// ETP-5005 — debounce for a TYPED search only. Deliberately longer than the 300ms the other
// selectors use: a line cell's selector list is the slow one (it can take seconds), and at 300ms
// a word like "arrendamiento" fires a request per keystroke, each one racing the next. One
// second is long enough that a normal typing burst produces a single request.
//
// It applies to typing ONLY. Opening the combo (focus, chip click, chevron toggle, clear) fetches
// IMMEDIATELY — routing that through the same debounce would delay the first page by a further
// second and re-open the very "nothing happens when I click" hole `loadingFirstPage` exists to
// close.
const TYPED_SEARCH_DEBOUNCE_MS = 1000;
// ETP-5846 — page size for the ONE extra request that resolves the committed value when it is
// not on any loaded page (see `fetchCurrentSelection`). Deliberately much smaller than
// SERVER_SEARCH_PAGE: it is a lookup of a single known id, not a page of the browsable list, and
// it must not move `offsetRef`/`hasMoreRef` (see the effect on open). It is not 1 either — the
// backend's `q` is a substring match (`lower(display) LIKE :search`), so a label can legitimately
// match several rows and the exact id may be behind a look-alike; the response is filtered by id.
const CURRENT_SELECTION_SEARCH_LIMIT = 20;

// Kept exported from here: existing callers and tests import it from this module.
export { resolveSelectedIndex };

/**
 * Compact inline combobox for search-type FK fields in rapid line entry.
 * Text input with filtered dropdown — lightweight alternative to full SearchInput.
 * Used by both DataTable's InlineAddRow and InlineLinesPanel's edit cells.
 */
export function InlineSearchCombo({ field, value, options, onChange, onKeyDown, placeholder, inputRef, selectorUrl, selectorContext, token, displayLabel, excludeId = null, clearOnType = true }) {
  const ui = useUI();
  const apiFetch = useApiFetch();
  // `query` is PURE search text (ETP-4600 Gap B parity with CreatableSearchSelect) — it must
  // never be prefilled with the selected value's label. It always starts empty on open/focus so
  // the full option list shows, and is reset to '' on close so a stale term never leaks into the
  // next reopen. The COMMITTED value's label (shown when the cell is not being edited) comes from
  // `resolvedLabel` below, never from `query`.
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [serverResults, setServerResults] = useState(null);
  // ETP-5005 — whether the FIRST page of server results is still in flight. Distinct from
  // `hasMore` (which drives the "load more" footer and is only meaningful once at least one
  // page has landed): this covers the window between the user opening the combo and the first
  // response arriving, which on a slow selector can exceed 3 seconds. Without it the dropdown
  // panel is not rendered AT ALL during that window (the render gate below required
  // `filtered.length > 0`, and a line cell is always constructed with an empty local `options`
  // catalog), so the user got no feedback whatsoever and read the control as broken.
  const [loadingFirstPage, setLoadingFirstPage] = useState(false);
  // Whether another page might exist beyond the loaded ones — drives the "loading more"
  // footer and gates scroll-triggered fetches (ETP-4975, mirrors CreatableSearchSelect.jsx's
  // serverSearch mode and SelectorInput.jsx's hasMore).
  const [hasMore, setHasMore] = useState(true);
  // ETP-4600: mirrors CreatableSearchSelect's horizontal anchor flip — when the panel's real
  // content (measured after mount) would overflow the right viewport edge and there's more
  // room on the left, anchor the panel's right edge to the trigger so it grows leftward
  // instead of truncating/scrolling.
  const [anchorRight, setAnchorRight] = useState(false);
  // Keyboard-nav highlight over `filtered` (ETP-4600 Gap A parity, ported from
  // CreatableSearchSelect). -1 = nothing highlighted (mouse-only interaction so far).
  //
  // ETP-5846 — this is the KEYBOARD/HOVER focus only. It is deliberately NOT the current
  // selection: opening resets it to -1 (see the effect below), so it can never double as "the value
  // you already chose". That state is derived from `value` instead (`resolveSelectedIndex`).
  const [activeIndex, setActiveIndex] = useState(-1);
  // ETP-5846 — the committed value's row(s) when they are NOT on any loaded page (a catalog that
  // pages 50 at a time). Resolved once per open by `fetchCurrentSelection` and prepended to the
  // list so reopening a cell identifies what it holds. Cleared whenever `value` changes, when a new
  // search starts, and on close — a previous selection must never be shown as the current one.
  const [pinnedOptions, setPinnedOptions] = useState([]);
  // ETP-5903 — bumped every time a page fetch has fully settled. The walk that looks for the
  // committed value keys on it: `fetchInFlightRef` is cleared in the fetch's `finally`, AFTER the
  // page was applied, so an effect keyed on the rows alone runs in between, is turned away by the
  // in-flight guard, and never runs again — stalling the walk and, with it, the ETP-5846 pin. A
  // counter (not an in-flight boolean, whose true->false React may batch into "no change")
  // guarantees one more run after the guard is down.
  const [settledFetches, setSettledFetches] = useState(0);
  // ETP-5903 — the walk for the committed value ended (found, list exhausted, cap reached, or the
  // user took over). The ETP-5846 pin waits for it, so it only covers a value the walk could not
  // bring into view in its own place.
  const [locateDone, setLocateDone] = useState(false);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  // ETP-4600: `inputRef` is caller-supplied and OPTIONAL — DataTable only wires it up for the
  // first add-row cell (keyboard-nav auto-focus) and InlineLinesPanel's edit cells never pass
  // one at all. The chip's "click to re-enter edit mode" / "clear" focus-management needs a
  // real DOM node in every context, so keep an always-present local ref and mirror the node
  // onto the external one too (when given) so existing callers keep working unchanged.
  const localInputRef = useRef(null);
  const setInputRef = useCallback((node) => {
    localInputRef.current = node;
    if (inputRef) inputRef.current = node;
  }, [inputRef]);
  const displayValue = options.find(o => o.id === value);
  // Label shown when the combo is CLOSED (i.e. the cell is not actively being edited/searched).
  // Falls back to the caller-provided displayLabel (e.g. locator/warehouse name set by
  // auto-fill) when the value isn't present in the local `options` catalog yet.
  const resolvedLabel = displayValue?.name || displayValue?.label || displayValue?._identifier || displayLabel || '';
  const inputValue = open ? query : resolvedLabel;

  // ETP-4600: chip mode, parity with CreatableSearchSelect's header chip. When a value is
  // committed and the cell is not actively being edited, render a hover-revealed chip with a
  // clear (X) button instead of the plain read-only-looking input.
  const hasSelection = value != null && value !== '';
  const showChip = hasSelection && !open;
  // A NOT-NULL/required column (e.g. Sales Order line's "Impuesto") has no safe empty value to
  // PATCH — clearing it always round-trips through a generic backend validation toast the line
  // grid can't turn into a field-level message. Default to hiding the X for required fields so
  // the user is never handed a clear action that's guaranteed to fail; `field.clearable` (from
  // decisions.json) still wins when explicitly set, in either direction, for the rare column
  // where a required-looking field actually has a safe way to be cleared (e.g. server-side
  // default kicks in on save).
  const clearable = field.clearable != null ? field.clearable !== false : field.required !== true;

  // Server-side search with debounce
  const fetchTimer = useRef(null);
  // Mirrors CreatableSearchSelect.jsx's hasMoreRef/offsetRef — the scroll handler (which fires
  // outside React's render cycle) always reads the latest value synchronously (ETP-4975).
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);
  // Guards against a scroll-triggered fetch overlapping another already in flight.
  const fetchInFlightRef = useRef(false);
  // Tags every fetch with the search "generation" it belongs to (ETP-4975 BUG-2) — mirrors
  // CreatableSearchSelect.jsx's identical guard. Incremented each time a NEW search starts
  // (offset===0 — typed, or via focus/open/toggle); a scroll-triggered "load more" (offset>0)
  // keeps whatever generation was current when it was launched. `fetchServerResults` compares
  // the captured generation against the current one before applying a resolved fetch's result, so
  // a stale in-flight request from an already-superseded search can never overwrite/append onto a
  // newer one's results.
  const searchGenerationRef = useRef(0);
  // ETP-5846 — `{ id, generation }` of the current-selection resolution in flight, so a late
  // answer is discarded once the committed value (or the search) changed under it. Mirrors the
  // generation guard `fetchServerResults` applies to its own results.
  const pinRequestRef = useRef(null);
  // ETP-5846 — id whose resolution was already requested during this open. Every "load more" page
  // changes `serverResults` and re-runs the resolution effect; without this guard a value that is
  // on none of the loaded pages would be looked up again on every page. Cleared on open/close and
  // whenever `value` or the query changes (see the reset effect), so each open resolves at most once.
  const pinAttemptedRef = useRef(null);
  // ETP-5903 — the user typed or pressed a key during this open: the walk stops and the list is not
  // re-centred under them. Reset on every open.
  const interactedRef = useRef(false);
  // ETP-5903 — the committed option was already centred during this open.
  const centeredRef = useRef(false);

  // Resets pagination state before a fresh search (new typed query, or reopening with an
  // empty query) — mirrors the resets CreatableSearchSelect.jsx performs at each of its
  // equivalent call sites, so a scroll-triggered "load more" left over from the PREVIOUS
  // query/session can never append onto the new one (ETP-4975).
  const resetPagination = useCallback(() => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
  }, []);

  // Fetches one page of server-side results. `offset` 0 REPLACES `serverResults` (a new query
  // always starts from page 0); `offset > 0` is the scroll-triggered "load more" (APPENDS, never
  // debounced — mirrors CreatableSearchSelect.jsx's triggerServerSearch scroll path, ETP-4975).
  // Sends explicit `limit`/`offset` so the backend's own default page size never silently caps
  // the list.
  //
  // ETP-5005 — `immediate` splits the two offset-0 callers apart: OPENING the combo (focus, chip
  // click, chevron toggle, clear) fetches at once, while TYPING waits out
  // TYPED_SEARCH_DEBOUNCE_MS. They used to share one 300ms debounce, which made both wrong at
  // once: too slow to open, too eager while typing.
  const fetchServerResults = useCallback((q, offset = 0, { immediate = false } = {}) => {
    // ETP-4576 - no `!token` here: under the cookie scheme the client holds none.
    if (!selectorUrl) { setServerResults(null); setLoadingFirstPage(false); return; }
    if (offset > 0 && (!hasMoreRef.current || fetchInFlightRef.current)) return;
    clearTimeout(fetchTimer.current);
    // ETP-4975 BUG-2 fix: offset===0 always starts a NEW search generation (typed, or via
    // focus/open/toggle); offset>0 (scroll-triggered "load more") is tagged with whatever
    // generation was already current when it fired — it never starts one of its own. When the
    // fetch resolves, only apply it if that captured generation is still the current one;
    // otherwise a newer search has already superseded it and the stale result is discarded
    // silently instead of overwriting/appending onto the newer search's state
    // (serverResults/offsetRef/hasMoreRef).
    if (offset === 0) searchGenerationRef.current += 1;
    const requestGeneration = searchGenerationRef.current;
    // ETP-5005 — raise the loading flag HERE, not inside runFetch: offset===0 is debounced by
    // 300ms and the spinner has to appear on the click, not 300ms after it. A superseded search
    // never lowers it (see the generation guard in the finally below) — the newer one owns it.
    if (offset === 0) setLoadingFirstPage(true);
    const trimmed = (q || '').trim();
    const queryParams = trimmed ? { ...selectorContext, q: trimmed } : { ...selectorContext };
    queryParams.limit = SERVER_SEARCH_PAGE;
    queryParams.offset = offset;
    const runFetch = () => {
      fetchInFlightRef.current = true;
      apiFetch(buildUrlWithParams(selectorUrl, queryParams), { baseUrl: '' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.items) return;
          if (searchGenerationRef.current !== requestGeneration) return;
          const items = data.items.map(it => ({ id: it.id, name: it.label || it.name, ...it }));
          setServerResults(prev => (offset === 0 ? items : [...(prev ?? []), ...items]));
          offsetRef.current = offset + items.length;
          const more = items.length >= SERVER_SEARCH_PAGE;
          hasMoreRef.current = more;
          setHasMore(more);
        })
        .catch(() => {})
        .finally(() => {
          fetchInFlightRef.current = false;
          setSettledFetches(n => n + 1);
          // Only the CURRENT generation's first page may lower the flag. A stale request
          // resolving after a newer search started would otherwise hide the spinner while
          // that newer search is still in flight — the same reasoning as the result guard
          // above, applied to the loading state.
          if (offset === 0 && searchGenerationRef.current === requestGeneration) {
            setLoadingFirstPage(false);
          }
        });
    };
    // A "load more" (offset > 0) and an opening fetch both run now; only typing waits. The
    // clearTimeout above still applies to an immediate call, so opening the combo cancels any
    // typed search left pending from the previous session rather than letting it land late.
    if (offset === 0 && !immediate) {
      fetchTimer.current = setTimeout(runFetch, TYPED_SEARCH_DEBOUNCE_MS);
    } else {
      runFetch();
    }
  }, [selectorUrl, selectorContext, token, apiFetch]);

  // ETP-5846 — resolves the committed value's row when it is not on any loaded page, so
  // reopening a cell identifies what it holds without the user typing anything.
  //
  // The combo already knows the value's LABEL (`resolvedLabel`, from the caller's `$_identifier`,
  // the catalog or `displayLabel`), so it asks the SAME selector endpoint for that label, with the
  // SAME `selectorContext` — an id the caller's context forbids (a tax from the wrong `IsSOTrx`
  // direction, one filtered out by a validation rule) simply never comes back and nothing is
  // pinned. That is what keeps this from widening what the user may pick.
  //
  // It is a LOOKUP, not a page: `offsetRef`, `hasMoreRef`, `hasMore`, `fetchInFlightRef` and
  // `loadingFirstPage` are all left alone, so scroll-triggered paging and the first-page skeleton
  // behave exactly as they did before (the panel must not fall back to a skeleton over rows the
  // user can already act on). Results are filtered STRICTLY by id — `q` is a LIKE match, so a
  // label such as "IVA 4%" can also match "IVA 4% Recargo".
  const fetchCurrentSelection = useCallback(() => {
    const id = value == null ? '' : String(value);
    const label = (resolvedLabel || '').trim();
    if (!selectorUrl || !id || !label) return;
    if (pinAttemptedRef.current === id) return;
    pinAttemptedRef.current = id;
    const generation = searchGenerationRef.current;
    pinRequestRef.current = { id, generation };
    const queryParams = { ...selectorContext, q: label, limit: CURRENT_SELECTION_SEARCH_LIMIT, offset: 0 };
    apiFetch(buildUrlWithParams(selectorUrl, queryParams), { baseUrl: '' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const request = pinRequestRef.current;
        // Abandoned: the value changed, a new search started, or this answer is late.
        if (!request || request.id !== id || request.generation !== generation) return;
        if (searchGenerationRef.current !== generation) return;
        const items = (data?.items ?? [])
          .filter(it => String(it.id) === id)
          .map(it => ({ id: it.id, name: it.label || it.name, ...it }));
        setPinnedOptions(items);
      })
      .catch(() => {})
      .finally(() => {
        if (pinRequestRef.current?.id === id && pinRequestRef.current?.generation === generation) {
          pinRequestRef.current = null;
        }
      });
  }, [selectorUrl, selectorContext, value, resolvedLabel, apiFetch]);

  const filtered = useMemo(() => {
    let base;
    if (serverResults) {
      // Already paginated server-side (ETP-4975: fetchServerResults sends explicit
      // limit/offset and concatenates on scroll) — show the full accumulated list here,
      // no client-side slice on top of it.
      base = serverResults;
    } else if (!query) {
      // Local catalog fallback shown while the initial server page is still in flight (or
      // no selectorUrl/token is configured) — unrelated to server pagination, capped at 15.
      base = options.slice(0, 15);
    } else {
      const q = query.toLowerCase();
      base = options.filter(o => {
        const name = o.name || o.label || o._identifier || '';
        return name.toLowerCase().includes(q);
      }).slice(0, 15);
    }
    // Drop the excluded value (e.g. the document currency) from both the local
    // catalog and any server-side results so it can never be chosen here.
    if (excludeId != null) base = base.filter(o => o.id !== excludeId);
    // ETP-5846 — a resolved current-selection row is subject to the SAME exclusion as any other
    // option (an excluded value must never be offered back), and it is only prepended while the
    // committed id is genuinely absent from the loaded rows — which is re-evaluated on every page
    // append, so "load more" can never produce a duplicate.
    if (excludeId != null) return prependCurrentSelection(base, pinnedOptions.filter(o => o.id !== excludeId), value);
    return prependCurrentSelection(base, pinnedOptions, value);
  }, [query, options, serverResults, excludeId, pinnedOptions, value]);

  const handleSelect = (opt) => {
    onChange(opt.id, opt.name || opt.label || opt._identifier || '', opt);
    setOpen(false);
    setQuery('');
    setServerResults(null);
    setLoadingFirstPage(false);
    // ETP-5846 — the row resolved for the PREVIOUS value is stale the moment the value changes.
    setPinnedOptions([]);
    pinRequestRef.current = null;
  };

  // Chip body click → re-enter edit mode, mirroring CreatableSearchSelect's handleChipClick:
  // open the combo with an empty search box (full option list) and move real DOM focus onto
  // the input so the user can type immediately.
  const handleChipClick = () => {
    setOpen(true);
    setQuery('');
    setServerResults(null);
    resetPagination();
    fetchServerResults('', 0, { immediate: true });
    requestAnimationFrame(() => {
      localInputRef.current?.focus();
      localInputRef.current?.select();
    });
  };

  // Clear (X) click — per product decision, this commits the clear immediately (same
  // auto-save-on-commit path as any other line edit), then reopens the combo for an instant
  // re-search. Mirrors CreatableSearchSelect's handleClear, including the focus-after-clear
  // fix: the chip <button> unmounts and the <input> mounts once hasSelection flips to false —
  // without moving focus onto it, clicking away never fires onBlur, so the dropdown reopened
  // below would never auto-close (the exact bug fixed on the header selector).
  const handleClear = () => {
    onChange('', '');
    setQuery('');
    setServerResults(null);
    resetPagination();
    setOpen(true);
    fetchServerResults('', 0, { immediate: true });
    requestAnimationFrame(() => {
      localInputRef.current?.focus();
    });
  };

  const updateDropdownDirection = useCallback(() => {
    if (!rootRef.current || typeof window === 'undefined') {
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUp(spaceBelow < 220 && spaceAbove > spaceBelow);

    const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, (shouldOpenUp ? spaceAbove : spaceBelow) - 12);
    // Auto-width, non-truncating panel (ETP-4600, ported from CreatableSearchSelect): the
    // trigger cell stays a fixed width (rect.width) but the DROPDOWN grows to fit its longest
    // option instead of truncating it, clamped to the viewport so it never overflows an edge.
    const spaceRight = window.innerWidth - rect.left - 12;
    const spaceLeft = rect.right - 12;
    const maxWidth = anchorRight ? Math.max(rect.width, spaceLeft) : Math.max(rect.width, spaceRight);
    const horizontalAnchor = anchorRight
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left };
    const style = shouldOpenUp
      ? {
          position: 'fixed',
          ...horizontalAnchor,
          minWidth: rect.width,
          width: 'max-content',
          maxWidth,
          bottom: window.innerHeight - rect.top + 4,
          maxHeight,
          zIndex: 1000,
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
        };
    setDropdownStyle(style);
  }, [anchorRight]);

  useEffect(() => {
    if (!open) return;
    updateDropdownDirection();
    const onReflow = () => updateDropdownDirection();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updateDropdownDirection]);

  // ETP-4600: measure the panel's real content width once it's in the DOM and decide the
  // horizontal anchor — mirrors CreatableSearchSelect's identical effect. Measured off each
  // option button's own scrollWidth (content width, independent of the panel's current
  // maxWidth cap) rather than the panel itself, so this converges in at most one extra render.
  useLayoutEffect(() => {
    if (!open || !dropdownStyle || !rootRef.current || !dropdownRef.current) return;
    const shouldAnchorRight = shouldAnchorDropdownRight(rootRef.current, dropdownRef.current);
    setAnchorRight((prev) => (prev === shouldAnchorRight ? prev : shouldAnchorRight));
  }, [open, dropdownStyle, filtered]);

  // Reset to the default left anchor on close so the next open always re-measures fresh
  // instead of possibly flashing a stale right-anchored panel from a previous cell.
  useEffect(() => {
    if (!open) setAnchorRight(false);
  }, [open]);

  // Reset the keyboard highlight whenever the dropdown opens/closes or the search text
  // changes — a stale index from a previous open/query would highlight the wrong option.
  useEffect(() => {
    setActiveIndex(-1);
  }, [open, query]);

  // ETP-5846 — a resolved current-selection row belongs to ONE committed value, ONE search and ONE
  // open. Drop it when the value changes (including being cleared), when a new typed query starts,
  // and on open/close, so a previous selection can never keep being shown as the current one and
  // the next open re-resolves from scratch.
  useEffect(() => {
    setPinnedOptions([]);
    pinRequestRef.current = null;
    pinAttemptedRef.current = null;
    setLocateDone(false);
  }, [value, query, open]);

  // ETP-5903 — every open starts untouched and not yet centred.
  useEffect(() => {
    interactedRef.current = false;
    centeredRef.current = false;
  }, [open]);

  // ETP-5903 AC4 — a typed search shows its results from the top. Once the list has been centred on
  // the committed value, the panel would otherwise stay scrolled mid-list while the new results land.
  useEffect(() => {
    if (query.trim() !== '' && dropdownRef.current) dropdownRef.current.scrollTop = 0;
  }, [query]);

  // ETP-5903 — reopening with a committed value that is not on the loaded pages walks forward,
  // one page at a time, until the value shows up IN PLACE (with its neighbours around it), the list
  // ends, or LOCATE_SELECTION_MAX_PAGES is reached. Only then does the ETP-5846 pin get its turn
  // (`locateDone`). One step per settled page: `settledFetches` re-runs this once each fetch has
  // fully finished, so the in-flight guard in `fetchServerResults` can never swallow a step (a run
  // while a page is still in flight is a no-op there).
  useEffect(() => {
    if (!open || locateDone || !hasSelection) return;
    if (!selectorUrl || serverResults == null || query.trim() !== '') return;
    const keepGoing = shouldKeepLocating({
      found: resolveSelectedIndex(serverResults, value) !== -1 || (excludeId != null && value === excludeId),
      hasMore,
      loadedRows: serverResults.length,
      pageSize: SERVER_SEARCH_PAGE,
      interacted: interactedRef.current,
    });
    if (keepGoing) fetchServerResults('', offsetRef.current);
    else setLocateDone(true);
  }, [open, locateDone, hasSelection, selectorUrl, serverResults, query, settledFetches, value, excludeId, hasMore, fetchServerResults]);

  // ETP-5846 — when the combo OPENS with a committed value that is nowhere in what it can already
  // show, resolve its row. "Nowhere" covers BOTH catalogs, because the option list is fed by
  // whichever is available: the caller's static `options` (a preloaded catalog) and the pages
  // fetched from `selectorUrl`. Waiting for the first page to land before asking is what keeps the
  // resolution to ONE request per open: a value that IS on page 0 — the overwhelmingly common
  // case — needs no lookup at all, and one that is not gets resolved right after the list the user
  // is looking at has been established. The opening page fetch has its own generation, so a `q`
  // result arriving after the user started typing is discarded by the guard inside
  // `fetchCurrentSelection`.
  const currentValueIsShown = useMemo(
    () => resolveSelectedIndex(options, value) !== -1
      || (serverResults != null && resolveSelectedIndex(serverResults, value) !== -1),
    [options, serverResults, value]
  );
  useEffect(() => {
    // The lookup exists to make the OPENED dropdown identify what the cell holds. Every other
    // situation is deliberately out of its scope:
    //  - closed, or the value is already in the local catalog or a loaded page -> nothing to do;
    //  - no selector -> there is nothing to ask (the local catalog is the only catalog);
    //  - the opening page has not landed -> resolving against an empty list would fire on every
    //    open of a cell whose value is perfectly visible on page 0. `serverResults` stays null
    //    until that page resolves;
    //  - the user has typed -> a query is its own explicit search, its results are what the list
    //    shows, and the pin is cleared anyway (see the reset effect above).
    //  - ETP-5903: the walk for the value has not finished -> it may still find it in place.
    if (!open || currentValueIsShown || !locateDone) return;
    if (!selectorUrl || serverResults == null || query.trim() !== '') return;
    fetchCurrentSelection();
  }, [open, currentValueIsShown, locateDone, serverResults, selectorUrl, query, fetchCurrentSelection]);

  // Keep the highlighted option scrolled into view (mirrors CreatableSearchSelect).
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = dropdownRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  // ETP-5846 — "clearly identified" also means VISIBLE. ETP-5903 — and centred, with the options
  // around it in view: done ONCE per open, when the committed option first appears (on page 0 or
  // after the walk), and never after the user typed or pressed a key, so a page landing later can
  // never yank the list away from where they are. Focus and keyboard highlight are left alone.
  const selectedIndex = resolveSelectedIndex(filtered, value);
  useEffect(() => {
    if (!open || selectedIndex < 0 || centeredRef.current || interactedRef.current) return;
    if (query.trim() !== '') return;
    const panel = dropdownRef.current;
    const el = panel?.querySelector(`[data-option-index="${selectedIndex}"]`);
    if (!el) return;
    centerOptionInPanel(panel, el);
    centeredRef.current = true;
  }, [open, selectedIndex, query, dropdownStyle]);

  // ETP-5903 — arrows start from the committed option while no search is typed; with a query the
  // list is that search's results, from the top (AC4).
  const arrowStartIndex = query.trim() === '' ? selectedIndex : -1;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="group relative w-full">
      {showChip ? (
        <div className="w-full h-8 flex items-center rounded-md border border-input bg-card px-2 pr-6">
          <SelectorChip
            label={resolvedLabel}
            onClick={handleChipClick}
            onClear={handleClear}
            clearAriaLabel={ui('clear')}
            testId={`inline-add-field-${field.key}-chip`}
            clearable={clearable}
            data-testid={"SelectorChip__" + field.id} />
        </div>
      ) : (
      <input
        data-testid={`inline-add-field-${field.key}`}
        ref={setInputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          interactedRef.current = true;
          setQuery(e.target.value);
          setOpen(true);
          setServerResults(null);
          // A new typed term is a NEW search, not "load more of the old one" — reset
          // pagination to page 0 up front (ETP-4975), mirroring CreatableSearchSelect.jsx's
          // onChange handler.
          resetPagination();
          fetchServerResults(e.target.value);
          // Clear the committed ID while typing so the parent knows no option is selected yet.
          // Disabled (clearOnType=false) in auto-save contexts like InlineLinesPanel to avoid
          // PATCHing null into NOT NULL columns before the user finishes selecting.
          if (clearOnType && value) onChange('', '');
        }}
        onFocus={() => {
          updateDropdownDirection();
          // ETP-5005 — an ALREADY-OPEN combo must not restart its search. `handleChipClick` and
          // `handleClear` both open, fetch, and THEN move focus here (via requestAnimationFrame),
          // so without this guard every chip click issues two identical requests and throws the
          // first one's results away. It was masked while both paths were debounced — the second
          // call's clearTimeout cancelled the first before it ever left the browser — and became
          // visible the moment opening started fetching immediately.
          if (open) return;
          setOpen(true);
          // ETP-4600: opening on a cell that already has a committed value must show an EMPTY
          // search box + the full option list (matching CreatableSearchSelect's header behavior),
          // never the previously-committed label pre-filtered down to one match.
          setQuery('');
          setServerResults(null);
          resetPagination();
          fetchServerResults('', 0, { immediate: true });
        }}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          // Discard the typed search term on close-without-selecting so a reopen never shows a
          // stale filter; the committed `value` (and its label via resolvedLabel) is untouched.
          setQuery('');
        }, 150)}
        onKeyDown={(e) => {
          interactedRef.current = true;
          // ArrowUp/Down/Home/End/Enter are only intercepted while the dropdown panel is
          // actually rendered (ETP-4600 Gap A parity, ported from CreatableSearchSelect's
          // handleInputKeyDown). Escape, and every key while the combo is closed or has no
          // matches, keeps falling through to the row handler unchanged — arrows on a closed
          // combo do NOT open it here (unlike the header selector): in a grid cell they may
          // carry a competing row/cell-navigation meaning, so hijacking them is out of scope.
          const dropdownVisible = open && filtered.length > 0;
          if (dropdownVisible) {
            switch (e.key) {
              case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((i) => nextActiveIndex(i, arrowStartIndex, 1, filtered.length));
                return;
              case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((i) => nextActiveIndex(i, arrowStartIndex, -1, filtered.length));
                return;
              case 'Home':
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex(0);
                return;
              case 'End':
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex(filtered.length - 1);
                return;
              case 'Enter': {
                e.preventDefault();
                e.stopPropagation();
                // ETP-5846 — reopening a cell that ALREADY holds a value and pressing Enter with
                // nothing typed and nothing highlighted is not a choice, so it must not be turned
                // into one: it closes the panel and leaves `value` exactly as it was. Before this,
                // `activeIndex` was -1 (opening resets it) and the fallback below took filtered[0],
                // so confirming a reopen silently rewrote the user's own selection with whatever
                // sorted first — measured on the unmodified component: committed "iva21", Enter,
                // onChange("iva10").
                const hasCommittedValue = value != null && value !== '';
                if (activeIndex < 0 && hasCommittedValue && query.trim() === '') {
                  setOpen(false);
                  setQuery('');
                  return;
                }
                // Deliberate divergence from CreatableSearchSelect (which requires
                // activeIndex >= 0): falls back to filtered[0] so the fast "type + Enter"
                // grid entry flow keeps working when no arrow key was pressed at all — and,
                // with no committed value, the one-shot "just Enter the first option" flow.
                // Both remain reachable: typing is explicit intent (the user is picking among
                // matches) and so is any arrow/Home/End key.
                const opt = activeIndex >= 0 ? filtered[activeIndex] : filtered[0];
                if (opt) handleSelect(opt);
                return;
              }
              default:
                break;
            }
          }
          onKeyDown?.(e);
        }}
        // ETP-5005 — while the combo is open the search box is deliberately EMPTY (ETP-4600:
        // the full option list must show, not the committed label pre-filtering it down to one
        // match). That left the cell looking BLANK the instant the user clicked it, which reads
        // as "my value was cleared" even though `value` is untouched and nothing is PATCHed.
        // Showing the committed label as the placeholder keeps the current selection legible
        // during the search without reintroducing the filtering ETP-4600 removed.
        placeholder={open && resolvedLabel ? resolvedLabel : placeholder}
        className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 pr-6 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:outline-none"
        role="combobox"
        aria-expanded={open && (filtered.length > 0 || loadingFirstPage)}
        aria-controls={`inline-options-${field.key}`}
        aria-activedescendant={
          activeIndex >= 0 && filtered[activeIndex]
            ? `${field.key}-inline-option-${filtered[activeIndex].id}`
            : undefined
        }
      />
      )}
      <button
        type="button"
        data-testid={`inline-add-field-${field.key}-toggle`}
        className="absolute right-1 top-1.5 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen) {
            updateDropdownDirection();
            setQuery('');
            setServerResults(null);
            resetPagination();
            fetchServerResults('', 0, { immediate: true });
          } else {
            setQuery('');
          }
          setOpen(nextOpen);
        }}
        aria-label={`Toggle ${placeholder} options`}
      >
        <ChevronDown className="h-4 w-4" data-testid={"ChevronDown__" + field.id} />
      </button>
      {open && (filtered.length > 0 || loadingFirstPage) && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          id={`inline-options-${field.key}`}
          role="listbox"
          data-testid={`inline-add-options-${field.key}`}
          className="bg-card border rounded-md shadow-lg overflow-auto"
          style={dropdownStyle}
          data-open-up={openUp ? 'true' : 'false'}
          data-inline-add-portal="true"
          // Same fix as CreatableSearchSelect's identical panel — see
          // CreatableSearchSelect's onWheel comment for the full root cause (Radix Dialog's
          // react-remove-scroll blocks the native wheel-to-scroll translation for anything
          // portaled outside the dialog's own DOM subtree). Bypass it manually, but only when
          // e.defaultPrevented (native scroll was actually blocked) — outside a Dialog, native
          // scrolling works normally and adding deltaY on top of it would double-scroll.
          onWheel={(e) => {
            e.stopPropagation();
            if (e.defaultPrevented) {
              e.currentTarget.scrollTop += e.deltaY;
            }
          }}
          onScroll={(e) => {
            // Infinite scroll for server-side results (ETP-4975): this outer `overflow-auto`
            // div IS the real scrollable container for the options list. Guarded on
            // `serverResults` (not just `hasMore`) so a scroll over the LOCAL catalog fallback
            // (still loading the first server page, or no selectorUrl/token configured) never
            // fires a server fetch — same 100px-from-bottom threshold as SelectorInput.jsx and
            // CreatableSearchSelect.jsx.
            if (serverResults == null) return;
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop - clientHeight < 100) {
              fetchServerResults(query, offsetRef.current);
            }
          }}
        >
          {/* min-w-full w-max: sizes this inner wrapper to the widest option's natural content
              width (at least the panel's own width). Rows below are `w-full block` — 100% of
              THIS wrapper, not the outer portaled panel — so the hover background spans the
              full width even when the panel scrolls horizontally. Must stay `block` (not
              inline-block): a width:100% inline-block child under the panel's width:max-content
              shrink-to-fit sizing inflates the panel to ~2x its content width in Chrome — see
              CreatableSearchSelect's identical comment for the full root cause. */}
          <div className="min-w-full w-max">
            {/* ETP-5005 — first-page skeleton. Shown only while nothing is displayable yet, so
                it never replaces options the user can already act on: once the first page lands
                (or the local catalog has entries) the list below takes over. Three rows rather
                than a bare spinner so the panel keeps the height it is about to have and the
                options do not jump into place under the cursor. */}
            {filtered.length === 0 && loadingFirstPage && (
              <div
                className="px-2 py-1.5"
                role="status"
                aria-live="polite"
                data-testid={`inline-add-options-${field.key}-loading`}
              >
                <span className="sr-only">{ui('loading')}</span>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-4 my-1 rounded bg-muted animate-pulse"
                    style={{ width: `${140 - i * 24}px` }}
                  />
                ))}
              </div>
            )}
            {filtered.map((opt, index) => {
              // ETP-5846 — TWO INDEPENDENT per-row states, deliberately never derived from one
              // another:
              //  - `isSelected`: this row IS the committed value. It is what `aria-selected`
              //    reports, and what the bold label + check icon show. It does NOT move with the
              //    mouse or the keyboard.
              //  - `isHighlighted`: keyboard/hover focus (`data-highlighted` + the info
              //    background). `aria-activedescendant` on the input is its accessible
              //    counterpart; a screen reader must not read it as "this is your selection".
              // A row can be both (the user arrowed onto their own value), which is correct.
              const isSelected = index === selectedIndex;
              const isHighlighted = index === activeIndex;
              // The label span carries `whitespace-nowrap`, NOT `truncate`: the panel sizes itself to
              // `width: max-content` so it grows to fit its longest option instead of truncating it
              // (ETP-4600 Gap C), and `truncate`'s `overflow: hidden` would let the row's intrinsic
              // width collapse instead of growing with the content.
              return (
                <button
                  key={opt.id}
                  id={`${field.key}-inline-option-${opt.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  {...(isHighlighted ? { 'data-highlighted': 'true' } : {})}
                  data-option-index={index}
                  data-testid={`inline-add-option-${field.key}-${opt.id}`}
                  className={`w-full flex text-left px-2 py-1.5 text-sm hover:bg-status-info cursor-pointer whitespace-nowrap items-center gap-2${isHighlighted ? ' bg-status-info' : ''}${isSelected ? ' font-medium text-foreground' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {isSelected && (
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-primary"
                      data-testid={`inline-add-option-${field.key}-${opt.id}-selected-indicator`} />
                  )}
                  <span className="whitespace-nowrap">{opt.name || opt.label || opt._identifier || opt.id}</span>
                </button>
              );
            })}
            {/* "Loading more" footer while a scroll-triggered next page fetches. Gated on
                `serverResults != null` rather than a separate loading flag — that's also true
                exactly while the INITIAL page is still in flight (serverResults stays null
                until the first page resolves), so this never flashes during that load —
                mirrors SelectorInput.jsx's `{hasMore && selectorUrl && (...)}` /
                CreatableSearchSelect.jsx's `{serverSearch && !loading && hasMore && ...}` footer. */}
            {serverResults != null && hasMore && (
              <div className="py-1 text-center text-xs text-muted-foreground select-none pointer-events-none">
                {ui('loading')}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default InlineSearchCombo;
