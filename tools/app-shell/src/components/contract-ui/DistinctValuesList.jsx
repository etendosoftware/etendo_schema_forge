import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { useUI } from '@etendosoftware/app-shell-core';

// committed-selection-ok: a list-filter dropdown, not a field picker. It already marks the active
// filter (aria-selected from activeCode), but does not walk to it or centre it when that value is
// past the first page — a known gap, out of ETP-5948 scope (field pickers).

/**
 * Shared dropdown list used by filters that pick one value out of the set of
 * distinct values for a field (status selector, advanced-filter value picker).
 *
 * Renders:
 *   - A search input wired to `distinct.search` / `distinct.setSearch`.
 *   - An optional "all / any" row (when `allLabel` is non-null) that calls
 *     `onSelect(null)` — callers treat null as "clear this filter".
 *   - One row per merged code; active row gets a check mark.
 *   - An IntersectionObserver sentinel that invokes `distinct.loadMore()` as
 *     the user scrolls near the bottom, so the dropdown behaves like an
 *     infinite list instead of a single large page.
 *
 * Merge policy between in-memory codes and backend pagination lives in the
 * parent; this component just renders what it's given.
 */
// useDistinctValues debounces `search` internally (DEFAULT_DEBOUNCE_MS = 250 in
// both the app-shell and app-shell-core copies) and does not expose the
// debounced value. We mirror it locally, plus a margin so our "settled" flag
// flips only after the hook has started its fetch (loading=true). Keep in sync
// with the hook default.
const HOOK_DEBOUNCE_MS = 250;
const SETTLE_MARGIN_MS = 50;

// One option row (also used for the "all" row). Full menu width, 32px high, no
// radius or gaps. Hover and selected share the same tint; only the selected row
// shows the check, absolutely positioned at the right edge. Figma draws the glyph
// (~9x6.5px, 1.5px stroke) inside a 24px box 12px from the edge: a 14px lucide icon
// centred at the same point, with strokeWidth scaled (1.5px * 24/14) to keep the weight.
function OptionRow({ id, selected, active, onClick, onPointerMove, children }) {
  const ref = useRef(null);
  // Keep the keyboard-active option visible inside the scrollable list.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  return (
    <div
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      onPointerMove={onPointerMove}
      className={`relative flex h-8 w-full cursor-pointer items-center rounded-none px-2 py-1 text-left text-sm leading-6 font-normal text-[#121217] transition-colors hover:bg-[rgba(18,18,23,0.05)] ${selected ? 'bg-[rgba(18,18,23,0.05)]' : ''} ${active ? 'bg-[rgba(18,18,23,0.05)] ring-2 ring-inset ring-focus-ring' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate px-2">{children}</span>
      {selected && (
        <Check
          className="absolute right-[17px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121217]"
          strokeWidth={2.5}
          aria-hidden="true"
          data-testid="Check__55c679" />
      )}
    </div>
  );
}

/**
 * `renderOption(code, label)` is opt-in: when omitted every option is plain text. The status
 * filter passes it to show each state as the same tag the table uses; "allLabel" is never
 * routed through it.
 */
export function DistinctValuesList({
  activeCode,
  allLabel,
  codes,
  labelFor,
  renderOption,
  distinct,
  onSelect,
  searchPlaceholder,
}) {
  const ui = useUI();
  const sentinelRef = useRef(null);
  const listId = useId();
  const optionId = (i) => `${listId}-opt-${i}`;

  // The search state lives in the caller's hook, which outlives this component
  // (the popover unmounts it on close). Clear it on unmount so reopening the
  // menu starts from an empty search box and the full list.
  const setSearchRef = useRef(distinct.setSearch);
  setSearchRef.current = distinct.setSearch;
  useEffect(() => () => setSearchRef.current?.(''), []);

  // "No results" only when the user actually searched, the debounced query has
  // settled and the backend fetch is done — never while loading, and never for
  // an empty (search-less) list such as a window with no records.
  const trimmedSearch = (distinct.search || '').trim();
  const hasSearch = trimmedSearch !== '';
  const [settledSearch, setSettledSearch] = useState(trimmedSearch);
  useEffect(() => {
    const t = setTimeout(() => setSettledSearch(trimmedSearch), HOOK_DEBOUNCE_MS + SETTLE_MARGIN_MS);
    return () => clearTimeout(t);
  }, [trimmedSearch]);
  const searchPending = trimmedSearch !== settledSearch;
  const noResults = hasSearch && !searchPending && !distinct.loading && codes.length === 0;

  // Keyboard navigation (ARIA combobox + listbox, virtual focus): DOM focus stays in the
  // search input; `activeIndex` marks the highlighted option (-1 = none). Index 0 is the
  // "all" row when it is rendered. It resets to none whenever the search text or the
  // option set changes, so it can never point past the end of the list.
  const showAll = !!allLabel && !noResults;
  const options = [...(showAll ? [null] : []), ...codes];
  const optionCount = options.length;
  const [activeIndex, setActiveIndex] = useState(-1);
  const codesKey = codes.join('\u0001');
  useEffect(() => { setActiveIndex(-1); }, [distinct.search, codesKey, showAll]);
  const activeOptionId = activeIndex >= 0 && activeIndex < optionCount ? optionId(activeIndex) : undefined;

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (optionCount === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // From "none", ArrowDown lands on the first option and ArrowUp on the last.
      const fromNone = step === 1 ? 0 : optionCount - 1;
      setActiveIndex((i) => (i < 0 ? fromNone : Math.min(optionCount - 1, Math.max(0, i + step))));
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < optionCount) {
      e.preventDefault();
      onSelect(options[activeIndex]);
    }
  };

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !distinct.hasMore || distinct.loadingMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) distinct.loadMore();
    }, { root: node.parentElement, rootMargin: '32px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [distinct.hasMore, distinct.loadingMore, distinct.loadMore, distinct.values.length]);

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex h-8 items-center px-2">
        {/* Figma: 24px box (+4px left padding) whose glyph is ~16.5px, so a 20px lucide icon centred in it. */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center box-content pl-1">
          <Search className="h-5 w-5 text-[#828FA3]" aria-hidden="true" data-testid="Search__55c679" />
        </span>
        <input
          type="text"
          value={distinct.search}
          onChange={(e) => distinct.setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent pl-2 pr-4 text-sm leading-6 font-normal shadow-none outline-none ring-0 placeholder:text-[#6C6C89] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        />
      </div>
      <div className="h-px w-full shrink-0 bg-[#E8EAEF]" data-testid="distinct-values-separator" />
      <div className="max-h-72 overflow-auto">
        <div id={listId} role="listbox" aria-label={searchPlaceholder}>
          {showAll && (
            <OptionRow
              id={optionId(0)}
              selected={!activeCode}
              active={activeIndex === 0}
              onPointerMove={() => setActiveIndex(-1)}
              onClick={() => onSelect(null)}
              data-testid="OptionRow__55c679">
              {allLabel}
            </OptionRow>
          )}
          {codes.map((code, i) => {
            const idx = i + (showAll ? 1 : 0);
            return (
              <OptionRow
                key={code}
                id={optionId(idx)}
                selected={activeCode === code}
                active={activeIndex === idx}
                onPointerMove={() => setActiveIndex(-1)}
                onClick={() => onSelect(code)}
                data-testid="OptionRow__55c679">
                {renderOption ? renderOption(code, labelFor(code)) : labelFor(code)}
              </OptionRow>
            );
          })}
        </div>
        {distinct.loading && codes.length === 0 && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__55c679" />
          </div>
        )}
        {noResults && (
          <div
            className="px-3 py-3 text-sm text-muted-foreground text-center"
            data-testid="distinct-values-no-results">
            {ui('noResults')}
          </div>
        )}
        {distinct.hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-2">
            {distinct.loadingMore && (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                data-testid="Loader2__55c679" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DistinctValuesList;
