import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightToLine } from 'lucide-react';
import { useUI } from '@/i18n';

// Circle size (px) and the offset (px) of its top edge from the top of the side panel column: 8 px of column
// padding + 8 px of the tab row padding put the tabs at 16 px, the button sits 8 px below that.
const SIZE = 24;
const TOP_OFFSET = 24;

const BUTTON_CLASS = 'absolute z-20 inline-flex items-center justify-center rounded-full bg-card border border-border-control text-muted-foreground transition-colors hover:text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

// The side panel column (rendered by the shared DetailView, so not ours to mark) scrolls (overflow-y-auto), which
// would clip a control that straddles its left border. So the button is portalled into the column's parent (the row
// that holds the form and the panel), made the positioning context, and placed on the divider (the column's
// `border-l`) from the column's own offsets.
export const SIDEBAR_PANEL_ID = 'product-sidebar-panel';

let warnedFallback = false;

// The scroll column is the closest ancestor with BOTH `border-l` (the divider) and `overflow-y-auto`; a bare
// `border-l` is not enough (the lines panel of DetailView has one too). If the classes are ever renamed we fall back
// to the direct parent and say so once in dev, instead of silently mispositioning the button.
function findColumn(sentinel) {
  if (!sentinel) return null;
  const column = sentinel.closest('.border-l.overflow-y-auto');
  if (column) return column;
  if (import.meta.env.DEV && !warnedFallback) {
    warnedFallback = true;
    console.warn('ProductSidebarDividerToggle: scroll column (.border-l.overflow-y-auto) not found, falling back to the parent element');
  }
  return sentinel.parentElement;
}

function useDividerPlacement(collapsed) {
  const sentinelRef = useRef(null);
  const [placement, setPlacement] = useState(null);
  // The row whose inline `position` WE set; restored on cleanup so DetailView's node is left as we found it.
  const patchedRow = useRef(null);

  const measure = useCallback(() => {
    const column = findColumn(sentinelRef.current);
    const row = column?.parentElement;
    if (!row) return;
    if (!row.style.position && globalThis.getComputedStyle(row).position === 'static') {
      row.style.position = 'relative';
      patchedRow.current = row;
    }
    setPlacement((prev) => {
      const next = { row, left: column.offsetLeft + 0.5 - SIZE / 2, top: column.offsetTop + TOP_OFFSET };
      const same = prev && prev.row === row && prev.left === next.left && prev.top === next.top;
      return same ? prev : next;
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    const column = findColumn(sentinelRef.current);
    const observer = typeof ResizeObserver === 'undefined' || !column ? null : new ResizeObserver(measure);
    if (observer) {
      observer.observe(column);
      if (column.parentElement) observer.observe(column.parentElement);
    }
    return () => {
      observer?.disconnect();
      if (patchedRow.current) {
        patchedRow.current.style.position = '';
        patchedRow.current = null;
      }
    };
  }, [collapsed, measure]);

  return { sentinelRef, placement };
}

// Single collapse/expand control of the product side panel, centred on the divider between the form and the
// panel. Same button in both states: the arrow rotates 180 degrees when the panel is collapsed.
export default function ProductSidebarDividerToggle({ collapsed, onToggle }) {
  const ui = useUI();
  const { sentinelRef, placement } = useDividerPlacement(collapsed);
  // One accessible signal: a stable name + aria-expanded. The tooltip alone states the action for sighted users.
  const tooltip = ui(collapsed ? 'showPanel' : 'hidePanel');

  return (
    <>
      <span ref={sentinelRef} hidden aria-hidden="true" data-testid="ProductSidebarDividerAnchor" />
      {placement && createPortal(
        <button
          type="button"
          onClick={onToggle}
          title={tooltip}
          aria-label={ui('productSidebarPanelToggleLabel')}
          aria-controls={SIDEBAR_PANEL_ID}
          aria-expanded={!collapsed}
          data-collapsed={collapsed ? 'true' : 'false'}
          className={BUTTON_CLASS}
          style={{ width: SIZE, height: SIZE, left: placement.left, top: placement.top }}
          data-testid={collapsed ? 'ProductSidebarOpenButton' : 'ProductSidebarCollapseButton'}
        >
          <ArrowRightToLine
            size={14}
            aria-hidden="true"
            className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
            data-testid="ArrowRightToLine__d1v7e2"
          />
        </button>,
        placement.row,
      )}
    </>
  );
}
