import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { useUI } from '@/i18n';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import {
  deriveEntityEndpoint,
  useEntitySearch,
} from './entityLookup';

const SEARCH_LIMIT = 30;

export default function EntityCell({ column, value, token, apiBaseUrl, onChange }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const endpoint = useMemo(
    () => deriveEntityEndpoint({ entitySpec: column?.entitySpec, selector: column?.selector, apiBaseUrl }),
    [column, apiBaseUrl],
  );

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const { items, loading } = useEntitySearch({
    open,
    endpoint,
    token,
    query,
    params: column?.selectorParams,
    limit: SEARCH_LIMIT,
  });

  const chipLabel = value?.label || ui(column.emptyOptionLabel || 'ocrLinesTaxDefault');
  const chipDim = value?.label ? '' : 'italic text-muted-foreground';

  // Layout contract (ETP-5585): the cell never changes its own box. Closed and open share the
  // same border/padding, long labels truncate (full text in `title`), and the results list lives
  // in a Popover PORTAL, not as an `absolute` child of the modal's `overflow-auto` body — there it
  // grew the scroll area, added a vertical scrollbar and reflowed every column.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={wrapRef} className="min-w-0">
          {open ? (
            <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-foreground bg-card px-2 py-1.5 text-sm">
              <Search size={12} className="shrink-0 text-muted-foreground" data-testid="Search__65a761" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ui(column.searchPlaceholder || 'ocrLinesTaxSearch')}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder-gray-500 outline-none"
              />
              {loading && <Loader2
                size={12}
                className="shrink-0 animate-spin text-muted-foreground"
                data-testid="Loader2__65a761" />}
            </div>
          ) : (
            <button
              type="button"
              title={value?.label || undefined}
              onClick={() => {
                setQuery(value?.label || '');
                setOpen(true);
              }}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-subtle bg-card px-2 py-1.5 text-sm hover:border-border-control"
            >
              <span className={`min-w-0 flex-1 truncate text-left ${chipDim}`}>{chipLabel}</span>
              <ChevronDown
                size={14}
                className="shrink-0 text-muted-foreground"
                data-testid="ChevronDown__65a761" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="z-[60] max-h-[min(14rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-auto p-0"
        onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
        // The search input lives in the anchor, outside the content: do not read it as an outside click.
        onInteractOutside={(event) => {
          if (wrapRef.current?.contains(event.target)) event.preventDefault();
        }}
        data-testid="entity-cell-results"
      >
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="block w-full truncate border-b border-border-subtle px-3 py-2 text-left text-xs italic text-muted-foreground hover:bg-muted"
        >
          {ui(column.clearLabel || 'ocrLinesTaxClear')}
        </button>
        {!loading && items.length === 0 && query.trim() && (
          <div className="px-3 py-2 text-xs text-muted-foreground">{ui(column.noMatchesLabel || 'ocrLinesTaxNoMatches')}</div>
        )}
        {items.map((item) => {
          const label = item.name || item._identifier || item.id;
          const selected = value?.id === item.id;
          const itemCls = selected
            ? 'bg-status-info font-medium text-status-info-foreground'
            : 'text-foreground';
          return (
            <button
              key={item.id}
              type="button"
              title={label}
              onClick={() => {
                onChange({ id: item.id, label });
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${itemCls}`}
            >
              <span className="w-4 shrink-0">{selected ? <Check size={14} data-testid="Check__65a761" /> : null}</span>
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
