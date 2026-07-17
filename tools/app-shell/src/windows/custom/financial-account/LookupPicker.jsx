import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm text-[#121217] placeholder:text-[#8a8aa3] shadow-[0_1px_2px_rgba(18,18,23,0.05)] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1';

const DROPDOWN_MAX_H = 224; // matches max-h-56

/**
 * Text input + dropdown list picker. The caller supplies a `useLookup` hook
 * that takes the query string and returns `{ results, loading }` (results are
 * `{ id, name }`). Selection is reported via `onSelect(item)` and clearing via
 * `onClear()`. Shared by NewMovementDialog and ManualStatementModal.
 *
 * The results list is portalled to `document.body` with fixed positioning so it
 * overflows any `overflow:hidden`/scrollable ancestor (the rounded lines table
 * and the scrollable modal body) and is shown in full. `pointerEvents:auto` is
 * forced because Radix Dialog disables pointer events outside the dialog — without
 * it the options would be visible but not clickable. It flips above the field when
 * there isn't room below.
 *
 * @param {{
 *   value: { id: string, name: string } | null,
 *   onSelect: (item: { id: string, name: string }) => void,
 *   onClear: () => void,
 *   placeholder?: string,
 *   useLookup: (query: string) => { results: Array<{id:string,name:string}>, loading: boolean },
 *   dataTestId?: string,
 *   className?: string,
 *   search?: boolean,   // render a leading magnifier icon (search selector look)
 * }} props
 */
export function LookupPicker({ value, onSelect, onClear, placeholder, useLookup, dataTestId, className, search }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const { results, loading } = useLookup(query);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value]);

  // Track the input position while open so the portalled list lines up and
  // follows the field on scroll/resize; flip it above when room below is tight.
  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const flipUp = below < DROPDOWN_MAX_H && r.top > below;
      setPos(flipUp
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
        : { left: r.left, width: r.width, top: r.bottom + 4 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, results.length, loading]);

  const showDropdown = open && pos && (results.length > 0 || loading);

  return (
    <div ref={wrapRef} className="relative">
      {search ? (
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8aa3]"
          data-testid="Search__12d6c3" />
      ) : null}
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        data-testid={dataTestId}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onClear(); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn(className ?? DEFAULT_INPUT_CLASS, search && 'pl-8')}
      />
      {showDropdown ? createPortal(
        <div
          data-lookup-dropdown=""
          // Radix Dialog locks page scroll (react-remove-scroll), which also
          // swallows wheel events on this body-portalled list. Scroll it
          // manually so the wheel works inside the dropdown.
          onWheel={(e) => {
            e.stopPropagation();
            e.currentTarget.scrollTop += e.deltaY;
          }}
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            zIndex: 9999,
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
          }}
          className="max-h-56 overflow-auto rounded-lg border border-[#D1D4DB] bg-white shadow-lg"
        >
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[#6c6c89]">…</div>
          ) : null}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(r); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm text-[#121217] hover:bg-[#F5F7F9]"
            >
              {r.name}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
