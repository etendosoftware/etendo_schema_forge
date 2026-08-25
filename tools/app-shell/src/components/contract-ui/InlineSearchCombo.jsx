import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { shouldAnchorDropdownRight } from '@/lib/dropdownAnchor.js';
import { useUI } from '@/i18n';
import { SelectorChip } from './SelectorChip.jsx';

/**
 * Compact inline combobox for search-type FK fields in rapid line entry.
 * Text input with filtered dropdown — lightweight alternative to full SearchInput.
 * Used by both DataTable's InlineAddRow and InlineLinesPanel's edit cells.
 */
export function InlineSearchCombo({ field, value, options, onChange, onKeyDown, placeholder, inputRef, selectorUrl, selectorContext, token, displayLabel, excludeId = null, clearOnType = true }) {
  const ui = useUI();
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
  // ETP-4600: mirrors CreatableSearchSelect's horizontal anchor flip — when the panel's real
  // content (measured after mount) would overflow the right viewport edge and there's more
  // room on the left, anchor the panel's right edge to the trigger so it grows leftward
  // instead of truncating/scrolling.
  const [anchorRight, setAnchorRight] = useState(false);
  // Keyboard-nav highlight over `filtered` (ETP-4600 Gap A parity, ported from
  // CreatableSearchSelect). -1 = nothing highlighted (mouse-only interaction so far).
  const [activeIndex, setActiveIndex] = useState(-1);
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
    onChange(opt.id, opt.name || opt.label || opt._identifier || '', opt);
    setOpen(false);
    setQuery('');
    setServerResults(null);
  };

  // Chip body click → re-enter edit mode, mirroring CreatableSearchSelect's handleChipClick:
  // open the combo with an empty search box (full option list) and move real DOM focus onto
  // the input so the user can type immediately.
  const handleChipClick = () => {
    setOpen(true);
    setQuery('');
    setServerResults(null);
    fetchServerResults('');
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
    setOpen(true);
    fetchServerResults('');
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

  // Keep the highlighted option scrolled into view (mirrors CreatableSearchSelect).
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = dropdownRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

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
          // ETP-4600: opening on a cell that already has a committed value must show an EMPTY
          // search box + the full option list (matching CreatableSearchSelect's header behavior),
          // never the previously-committed label pre-filtered down to one match.
          setQuery('');
          setServerResults(null);
          fetchServerResults('');
        }}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          // Discard the typed search term on close-without-selecting so a reopen never shows a
          // stale filter; the committed `value` (and its label via resolvedLabel) is untouched.
          setQuery('');
        }, 150)}
        onKeyDown={(e) => {
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
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                return;
              case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((i) => Math.max(i - 1, 0));
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
                // Deliberate divergence from CreatableSearchSelect (which requires
                // activeIndex >= 0): falls back to filtered[0] so the fast "type + Enter"
                // grid entry flow keeps working when no arrow key was pressed at all.
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
        placeholder={placeholder}
        className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 pr-6 focus:ring-2 focus:ring-primary focus:outline-none"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
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
            fetchServerResults('');
          } else {
            setQuery('');
          }
          setOpen(nextOpen);
        }}
        aria-label={`Toggle ${placeholder} options`}
      >
        <ChevronDown className="h-4 w-4" data-testid={"ChevronDown__" + field.id} />
      </button>
      {open && filtered.length > 0 && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          id={`inline-options-${field.key}`}
          role="listbox"
          data-testid={`inline-add-options-${field.key}`}
          className="bg-card border rounded-md shadow-lg overflow-auto"
          style={dropdownStyle}
          data-open-up={openUp ? 'true' : 'false'}
          data-inline-add-portal="true"
          // Same fix as CreatableSearchSelect's identical panel (and LookupPicker.jsx) — see
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
        >
          {/* min-w-full w-max: sizes this inner wrapper to the widest option's natural content
              width (at least the panel's own width). Rows below are `w-full block` — 100% of
              THIS wrapper, not the outer portaled panel — so the hover background spans the
              full width even when the panel scrolls horizontally. Must stay `block` (not
              inline-block): a width:100% inline-block child under the panel's width:max-content
              shrink-to-fit sizing inflates the panel to ~2x its content width in Chrome — see
              CreatableSearchSelect's identical comment for the full root cause. */}
          <div className="min-w-full w-max">
            {filtered.map((opt, index) => (
              <button
                key={opt.id}
                id={`${field.key}-inline-option-${opt.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-option-index={index}
                data-testid={`inline-add-option-${field.key}-${opt.id}`}
                className={`w-full block text-left px-2 py-1.5 text-sm hover:bg-status-info cursor-pointer whitespace-nowrap${index === activeIndex ? ' bg-status-info' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {opt.name || opt.label || opt._identifier || opt.id}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default InlineSearchCombo;
