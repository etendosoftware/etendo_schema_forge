import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';

/**
 * EnumSearchSelect — lightweight searchable dropdown for a STATIC enum option list
 * where each option carries a distinct `code` (a stable AEAT/AD_Ref_List value, e.g.
 * "01") and a human `description` (e.g. "Operación de régimen general"), rendered as
 * two visually separate pieces per row instead of one concatenated string.
 *
 * This is a narrower sibling of `CreatableSearchSelect` — it has none of that
 * component's FK/server-search/inline-create/dependsOn machinery, since a static enum
 * never needs any of it. Built for `TaxSifModal.jsx` (ETP-4888 point 5 design polish),
 * whose fields are always 0–2 fixed AEAT catalogs (never FK selectors), but kept
 * generic (`contract-ui`, no tax-specific knowledge) so any other static
 * code+description enum can reuse it.
 *
 * @param {object}   props
 * @param {Array<{value: string, code?: string, description?: string, label?: string}>} props.options
 *   Option list. `code`/`description` render as two pieces; when either is missing,
 *   falls back to `label` (or the raw `value`) as a single piece.
 * @param {string}   [props.value]        Currently selected option's `value`.
 * @param {Function} props.onChange       `(value: string) => void`
 * @param {string}   [props.placeholder]  Search input placeholder.
 * @param {Function} props.ui             `useUI()` translator, for the empty-state and
 *                                        option-count copy.
 * @param {string}   [props.id]           Forwarded to the search input for label `htmlFor`.
 * @param {string}   [props.testId]       Base test id; option rows append `-<value>`.
 */
export function EnumSearchSelect({ options, value, onChange, placeholder, ui, id, testId = 'enum-search-select' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Selected value renders as a static "chip" row; clicking it re-enters search mode —
  // mirrors CreatableSearchSelect's own chip/edit toggle so FK and static-enum pickers
  // share the same interaction shape.
  const [editingIntent, setEditingIntent] = useState(false);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find(o => String(o.value) === String(value)) ?? null,
    [options, value],
  );
  const showChip = Boolean(selected) && !editingIntent;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => {
      const code = String(o.code ?? o.value ?? '').toLowerCase();
      const description = String(o.description ?? o.label ?? '').toLowerCase();
      return code.includes(q) || description.includes(q);
    });
  }, [options, query]);

  const closeAndMaybeRestoreChip = () => {
    setOpen(false);
    if (selected) setEditingIntent(false);
  };

  const handleSelect = (opt) => {
    setQuery('');
    setOpen(false);
    setEditingIntent(false);
    onChange(opt.value);
  };

  const handleChipClick = () => {
    setEditingIntent(true);
    setQuery('');
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="relative" data-testid={testId}>
      <div className="group relative flex items-center gap-2 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 shadow-[0px_1px_2px_hsl(var(--foreground)_/_0.05)] focus-within:ring-2 focus-within:ring-primary">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" data-testid={`${testId}-search-icon`} />
        {showChip ? (
          <button
            type="button"
            id={id}
            onClick={handleChipClick}
            className={`flex-1 min-w-0 ${FIELD_HEIGHT} truncate text-left text-sm`}
            data-testid={`${testId}-chip`}
          >
            <span className="font-medium text-foreground">{selected.code ?? selected.value}</span>
            <span className="text-muted-foreground"> — {selected.description ?? selected.label}</span>
          </button>
        ) : (
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            className={`flex-1 min-w-0 ${FIELD_HEIGHT} border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground`}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeAndMaybeRestoreChip(); } }}
            onBlur={() => { setTimeout(closeAndMaybeRestoreChip, 150); }}
            data-testid={`${testId}-input`}
          />
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[60] overflow-hidden rounded-lg border border-[hsl(var(--border-control))] bg-card shadow-lg"
          data-testid={`${testId}-panel`}
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              // `noResultsFor` is a PREFIX ("No results for" / "Sin resultados para"), never a
              // standalone sentence — rendered alone it reads as a dangling fragment. Append the
              // query the same way CreatableSearchSelect does, and fall back to the complete
              // `noResults` sentence when the panel is empty with no query typed (empty option list).
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {query.trim() ? <>{ui('noResultsFor')} &ldquo;{query}&rdquo;</> : ui('noResults')}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  // onMouseDown + preventDefault fires before the input's onBlur, so the
                  // click registers as a selection instead of being swallowed by the blur
                  // closing the panel first — same pattern as CreatableSearchSelect.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt)}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    String(opt.value) === String(value) ? 'bg-accent/60' : '',
                  ].join(' ')}
                  data-testid={`${testId}-option-${opt.value}`}
                >
                  <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{opt.code ?? opt.value}</span>
                  <span className="truncate">{opt.description ?? opt.label}</span>
                </button>
              ))
            )}
          </div>
          {filtered.length > 0 && (
            <div
              className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground"
              data-testid={`${testId}-count`}
            >
              {ui('taxSif.modal.optionCount', { shown: filtered.length, total: options.length })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnumSearchSelect;
