import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { useUI, useLabel, useLocaleSwitch } from '@/i18n';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';

/* eslint-disable react/prop-types */

// Direction glyph as a lookup rather than a nested ternary (Sonar javascript:S3358). The
// inline `isActive ? (dir === 'asc' ? '▲' : '▼') : ''` this replaces was carried over verbatim
// from ListView's own markup during the extraction.
const SORT_ARROW = { asc: '▲', desc: '▼' };

/**
 * The toolbar "Ordenar por" control: a toggle button plus a popover listing every sortable
 * column, with the active one marked by its direction arrow and a "clear" row once the sort
 * has moved off the list's own default.
 *
 * Extracted from `ListView`'s idle bar, where it was inline JSX, so a window that REPLACES
 * that bar can still offer it. `financial-account` is the case that forced the extraction: it
 * sets `hideListBar: true` and draws its own toolbar, which silently took this control away —
 * clickable column headers were the only sort affordance left. Copying the markup into the slot
 * would have forked the behaviour, so it lives here and both render the same component.
 *
 * Owns only its open/closed state; the sort state itself stays with whoever owns the list.
 *
 * @param {Array<{key: string, column?: string, label?: string, sortable?: boolean}>} columns
 *   the grid's columns. Anything with `sortable === false` is filtered out, matching
 *   `DataTable`'s own opt-out convention.
 * @param {string|null} sortColumn active sort key
 * @param {'asc'|'desc'} sortDirection active direction
 * @param {(key: string) => void} onSelect picks a column (or flips direction when it is
 *   already the active one) — deliberately NOT the header's none→asc→desc→default cycle, since
 *   a menu entry that could silently clear the sort reads as a no-op
 * @param {() => void} onClear returns to the list's declared default
 * @param {boolean} isDefaultSort whether the sort is still at that default; drives both the
 *   button's active styling and whether the clear row shows at all
 * @param {React.ComponentType} [SortIconComponent] icon override, for hosts that theme it
 * @param {string} [iconButtonHover] hover classes, so the button matches its host toolbar
 */
export function ListSortPopover({
  columns = [],
  sortColumn,
  sortDirection,
  onSelect,
  onClear,
  isDefaultSort = true,
  SortIconComponent,
  iconButtonHover = 'hover:text-foreground',
}) {
  const ui = useUI();
  const t = useLabel();
  const { locale } = useLocaleSwitch();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const sortable = columns.filter((col) => col.sortable !== false);
  const SortEl = SortIconComponent || ArrowUpDown;

  const select = (key) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        data-testid="list-sort-toggle"
        aria-label={ui('sortBy')}
        title={ui('sortBy')}
        onClick={() => setOpen((v) => !v)}
        className={[
          'h-9 w-9 flex items-center justify-center rounded-lg border transition-colors',
          isDefaultSort
            ? `border-border text-muted-foreground ${iconButtonHover}`
            : 'border-primary/40 bg-primary/10 text-primary',
        ].join(' ')}
      >
        <SortEl className="h-4 w-4" data-testid="SortEl__ls0p" />
      </button>
      {open && sortable.length > 0 && (
        <div
          data-testid="list-sort-popover"
          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg py-1"
        >
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground tracking-wide">
            {ui('sortBy')}
          </div>
          {sortable.map((col) => {
            // The SAME resolver the header uses, so a menu entry never disagrees with the
            // column it sorts. The inline version this replaced started at the AD dictionary
            // and never looked at `col.labels`, so a window that resolves its headers from a
            // declared `gridLabelKey` (financial-account) would have listed the raw English
            // contract labels here — "Name", "Type" — beside Spanish headers.
            const colLabel = resolveColumnLabel(col, locale, t);
            const isActive = sortColumn === col.key;
            return (
              <button
                key={col.key}
                type="button"
                data-testid={`list-sort-option-${col.key}`}
                onClick={() => select(col.key)}
                className={[
                  'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/5 text-foreground font-medium'
                    : 'text-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                <span className="w-4 text-center text-xs">
                  {isActive ? SORT_ARROW[sortDirection] : ''}
                </span>
                <span className="flex-1 text-left">{colLabel}</span>
              </button>
            );
          })}
          {!isDefaultSort && onClear && (
            <>
              <div className="border-t border-border/50 my-1" />
              <button
                type="button"
                data-testid="list-sort-clear"
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="w-4" />
                <span className="flex-1 text-left">{ui('clearSort')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
