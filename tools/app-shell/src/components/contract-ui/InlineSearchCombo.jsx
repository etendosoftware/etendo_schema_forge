import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';

/**
 * Compact inline combobox for search-type FK fields in rapid line entry.
 * Text input with filtered dropdown — lightweight alternative to full SearchInput.
 * Used by both DataTable's InlineAddRow and InlineLinesPanel's edit cells.
 */
export function InlineSearchCombo({ field, value, options, onChange, onKeyDown, placeholder, inputRef, selectorUrl, selectorContext, token, displayLabel, excludeId = null, clearOnType = true }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [serverResults, setServerResults] = useState(null);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  const displayLabelRef = useRef(displayLabel);
  displayLabelRef.current = displayLabel;
  const displayValue = options.find(o => o.id === value);

  // Server-side search with debounce
  const fetchTimer = useRef(null);
  const fetchServerResults = useCallback((q) => {
    if (!selectorUrl || !token) { setServerResults(null); return; }
    clearTimeout(fetchTimer.current);
    const trimmed = (q || '').trim();
    const queryParams = trimmed ? { ...selectorContext, q: trimmed } : { ...selectorContext };
    fetchTimer.current = setTimeout(() => {
      fetch(buildUrlWithParams(selectorUrl, queryParams), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.items) setServerResults(data.items.map(it => ({ id: it.id, name: it.label || it.name, ...it })));
        })
        .catch(() => {});
    }, 300);
  }, [selectorUrl, selectorContext, token]);

  const filtered = useMemo(() => {
    let base;
    let limit;
    if (serverResults) {
      base = serverResults;
      limit = 20;
    } else if (!query) {
      base = options;
      limit = 15;
    } else {
      const q = query.toLowerCase();
      base = options.filter(o => {
        const name = o.name || o.label || o._identifier || '';
        return name.toLowerCase().includes(q);
      });
      limit = 15;
    }
    // Drop the excluded value (e.g. the document currency) from both the local
    // catalog and any server-side results so it can never be chosen here.
    if (excludeId != null) base = base.filter(o => o.id !== excludeId);
    return base.slice(0, limit);
  }, [query, options, serverResults, excludeId]);

  const handleSelect = (opt) => {
    setQuery(opt.name || opt.label || opt._identifier || '');
    onChange(opt.id, opt.name || opt.label || opt._identifier || '', opt);
    setOpen(false);
    setServerResults(null);
  };

  // Sync display when value is set externally.
  // If the value is found in static options, use that label.
  // Otherwise fall back to displayLabel (e.g. locator/warehouse name set by auto-fill).
  useEffect(() => {
    if (displayValue) {
      setQuery(displayValue.name || displayValue.label || displayValue._identifier || '');
    } else if (displayLabelRef.current) {
      setQuery(displayLabelRef.current);
    }
  }, [value]);

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
    const style = shouldOpenUp
      ? {
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + 4,
          maxHeight,
          zIndex: 1000,
        }
      : {
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          top: rect.bottom + 4,
          maxHeight,
          zIndex: 1000,
        };
    setDropdownStyle(style);
  }, []);

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
    <div ref={rootRef} className="relative w-full">
      <input
        data-testid={`inline-add-field-${field.key}`}
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setServerResults(null);
          fetchServerResults(e.target.value);
          // Clear the committed ID while typing so the parent knows no option is selected yet.
          // Disabled (clearOnType=false) in auto-save contexts like InlineLinesPanel to avoid
          // PATCHing null into NOT NULL columns before the user finishes selecting.
          if (clearOnType && value) onChange('', '');
        }}
        onFocus={() => {
          updateDropdownDirection();
          setOpen(true);
          fetchServerResults(query);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          // Let Enter/Escape propagate to the row handler only if dropdown is closed
          if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            handleSelect(filtered[0]);
            return;
          }
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        className="w-full h-8 text-sm rounded-md border border-input bg-white px-2 pr-6 focus:ring-2 focus:ring-primary focus:outline-none"
      />
      <button
        type="button"
        data-testid={`inline-add-field-${field.key}-toggle`}
        className="absolute right-1 top-1.5 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen) {
            updateDropdownDirection();
          }
          setOpen(nextOpen);
          if (nextOpen) {
            fetchServerResults(query);
          }
        }}
        aria-label={`Toggle ${placeholder} options`}
      >
        <ChevronDown className="h-4 w-4" data-testid={"ChevronDown__" + field.id} />
      </button>
      {open && filtered.length > 0 && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          data-testid={`inline-add-options-${field.key}`}
          className="bg-white border rounded-md shadow-lg overflow-auto"
          style={dropdownStyle}
          data-open-up={openUp ? 'true' : 'false'}
          data-inline-add-portal="true"
        >
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              data-testid={`inline-add-option-${field.key}-${opt.id}`}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 cursor-pointer whitespace-nowrap"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
            >
              {opt.name || opt.label || opt._identifier || opt.id}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default InlineSearchCombo;
