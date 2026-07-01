import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  deriveEntityEndpoint,
  useClickOutside,
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
    () => deriveEntityEndpoint({ entitySpec: column?.entitySpec, apiBaseUrl }),
    [column, apiBaseUrl],
  );

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useClickOutside(wrapRef, open, () => setOpen(false));

  const { items, loading } = useEntitySearch({
    open,
    endpoint,
    token,
    query,
    filter: column?.filter,
    limit: SEARCH_LIMIT,
  });

  const chipLabel = value?.label || ui(column.emptyOptionLabel || 'ocrLinesTaxDefault');
  const chipDim = value ? '' : 'italic text-gray-500';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setQuery(value?.label || '');
          setOpen(true);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm hover:border-gray-400"
      >
        <span className={`truncate text-left ${chipDim}`}>{chipLabel}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-gray-500"
          data-testid="ChevronDown__65a761" />
      </button>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-2 rounded-md border border-gray-900 bg-white px-2 py-1.5">
        <Search size={12} className="shrink-0 text-gray-400" data-testid="Search__65a761" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ui(column.searchPlaceholder || 'ocrLinesTaxSearch')}
          className="flex-1 text-sm text-gray-900 placeholder-gray-500 outline-none"
        />
        {loading && <Loader2
          size={12}
          className="animate-spin text-gray-400"
          data-testid="Loader2__65a761" />}
      </div>
      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="block w-full truncate border-b border-gray-100 px-3 py-2 text-left text-xs italic text-gray-600 hover:bg-gray-50"
        >
          {ui(column.clearLabel || 'ocrLinesTaxClear')}
        </button>
        {!loading && items.length === 0 && query.trim() && (
          <div className="px-3 py-2 text-xs text-gray-500">{ui(column.noMatchesLabel || 'ocrLinesTaxNoMatches')}</div>
        )}
        {items.map((item) => {
          const label = item.name || item._identifier || item.id;
          const selected = value?.id === item.id;
          const itemCls = selected
            ? 'bg-blue-50 font-medium text-blue-700'
            : 'text-gray-800';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange({ id: item.id, label });
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${itemCls}`}
            >
              <span className="w-4 shrink-0">{selected ? <Check size={14} data-testid="Check__65a761" /> : null}</span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
