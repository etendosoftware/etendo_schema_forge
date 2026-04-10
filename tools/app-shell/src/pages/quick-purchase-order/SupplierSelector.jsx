import { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import { Search, Truck, ChevronDown, X } from 'lucide-react';

export default function SupplierSelector({ selected, onSelect, suppliers = [], inputRef }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    (s.taxId || '').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {ui('qpoSupplier')}
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(''); }}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors"
      >
        <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-muted-foreground">
          {selected ? <span className="text-foreground">{selected.name}</span> : ui('qpoAllSuppliers')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
          <div className="relative p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui('qpoSearchSupplier')}
              className="w-full rounded-md border border-border bg-muted/30 pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-auto py-1">
            {/* "All suppliers" option */}
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-400 text-xs font-medium text-white">
                *
              </div>
              <span className="font-medium">{ui('qpoAllSuppliers')}</span>
            </button>
            {filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onSelect(s); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                  {s.name.charAt(0)}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  {s.taxId && <p className="text-xs text-muted-foreground truncate">{s.taxId}</p>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                {ui('qpoNoResults')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
