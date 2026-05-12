import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useLabel, useLocaleSwitch, useUI } from '@/i18n';
import { formatAmount } from '@/lib/formatAmount.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { SelectorInput } from './SelectorInput.jsx';
import ProductSearchDrawer from './ProductSearchDrawer.jsx';
import { columnFlex } from '@/lib/linesColumnWidth.js';

// Figma tokens — extracted from /home/agustin/Desktop/newlines.css.
const TOKENS = {
  rowHeight: 41,
  cellPaddingX: 12,
  separator: '#E8EAEF',
  textPrimary: '#121217',
  headerFontSize: 12,
  headerFontWeight: 600,
  cellFontSize: 14,
  cellFontWeight: 400,
};

const NUMERIC_TYPES = new Set(['number', 'amount', 'integer', 'percent', 'decimal', 'price', 'quantity']);
// Inline-edit covers all column types that the line table renders today. Selector/search
// FK columns (e.g., product, tax) use the shared `SelectorInput` (the same Radix dropdown
// the add-row flow uses), so the inline experience matches the form-mode UX.
const EDITABLE_TYPES = new Set([
  'string', 'text', 'number', 'integer', 'amount', 'percent', 'date', 'selector', 'search',
  'enum', 'select',
]);

function isCellEditable(col) {
  if (!col) return false;
  if (col.computed || col.derivation) return false;
  if (col.readOnly === true) return false;
  return EDITABLE_TYPES.has(col.type);
}

/**
 * Inline trigger for lookup/popup fields (e.g., product). Mirrors `LookupFormField` from
 * `EntityForm.jsx` but rendered compactly inside a row cell — clicking the button opens
 * the same `ProductSearchDrawer` modal the side-panel form used.
 */
function LookupTrigger({ field, displayLabel, selectorUrl, selectorContext, token, onCommit }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid={`field-${field.key}`}
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 h-7 rounded-md border border-input bg-white px-2 text-sm text-left hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {displayLabel
          ? <span className="flex-1 truncate text-foreground">{displayLabel}</span>
          : <span className="flex-1 truncate text-muted-foreground">{field.label || ui('search')}</span>}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          const id = item?.id ?? '';
          const label = item?.label || item?.name || item?._identifier || '';
          // Forward the full selector item — it carries `_aux` (product_PSTD, _PLIM,
          // _UOM, _CURR) and top-level fields (standardPrice, isTaxIncluded, currency)
          // that the callout endpoint needs to compute the price. Without these, NEO
          // returns listPrice=0 because the lookup runs from server-side defaults.
          onCommit(id, { identifier: label, selectedItem: item });
          setOpen(false);
        }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={field.label || ''}
      />
    </>
  );
}

/**
 * Read-mode cell rendering. Mirrors the subset of DataTable.renderCellValue used by
 * line tables (string, number, amount, percent, date, selector). Unsupported types
 * fall back to the resolved identifier string.
 */
const TRUTHY_BOOLEAN_VALUES = new Set([true, 'Y', 'true']);
const FALSY_BOOLEAN_VALUES = new Set([false, 'N', 'false']);

function renderBooleanCell(value, ui) {
  if (TRUTHY_BOOLEAN_VALUES.has(value)) {
    return <span className="text-emerald-600">{ui?.('yes') ?? 'Yes'}</span>;
  }
  if (FALSY_BOOLEAN_VALUES.has(value)) {
    return <span className="text-slate-400">{ui?.('no') ?? 'No'}</span>;
  }
  return <span className="text-slate-300">—</span>;
}

function renderDateCell(raw, locale) {
  if (!raw) return <span className="text-slate-300">—</span>;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return <span>{String(raw)}</span>;
  return <span>{parsed.toLocaleDateString(locale)}</span>;
}

function ReadCell({ row, col, locale, t, ui }) {
  if (typeof col.render === 'function') {
    return col.render(row, {});
  }
  if (col.type === 'amount') {
    return <span className="tabular-nums">{formatAmount(row[col.key], row['currency$_identifier'])}</span>;
  }
  if (col.type === 'percent') {
    const val = Number(row[col.key]);
    return <span className="tabular-nums">{Number.isFinite(val) ? `${val}%` : '—'}</span>;
  }
  if (col.type === 'boolean') {
    return renderBooleanCell(row[col.key], ui);
  }
  if (col.type === 'date') {
    return renderDateCell(row[col.key], locale);
  }
  const display = resolveIdentifier(row, col.key);
  if (typeof display === 'string' && display.length > 60) {
    return <span className="block max-w-[260px] truncate" title={display}>{display}</span>;
  }
  return <span>{display ?? ''}</span>;
}

/**
 * Edit-mode cell. Returns null for non-editable types so the caller falls back to read mode.
 */
function EditCell({ col, row, value, displayLabel, onCommit, onCancel, autoFocus, entity, token, apiBaseUrl, selectorContext }) {
  const inputRef = useRef(null);
  useEffect(() => {
    // Only steal focus on initial mount when nothing else is focused. Cells re-mount
    // whenever a callout updates their value (the key prop is `row.id:col.key:value`),
    // and we don't want those re-mounts to yank focus away from a cell the user is
    // actively typing into.
    if (autoFocus && inputRef.current
        && (document.activeElement === document.body || document.activeElement === null)) {
      inputRef.current.focus?.();
      inputRef.current.select?.();
    }
  }, [autoFocus]);

  if (!isCellEditable(col)) return null;

  // Selector / search: reuse the shared dropdown for short catalogs and the full
  // ProductSearchDrawer modal for fields flagged as lookup/popup (e.g., product). The
  // selector URL is derived from the entity + DB column, mirroring DataTable's pattern.
  if (col.type === 'selector' || col.type === 'search') {
    const selectorUrl = apiBaseUrl && col.column
      ? `${apiBaseUrl}/${entity}/selectors/${col.column}`
      : null;
    if (!selectorUrl) {
      return <span className="text-muted-foreground/60 text-xs">—</span>;
    }
    if (col.lookup || col.popup) {
      return (
        <LookupTrigger
          field={col}
          displayLabel={displayLabel}
          selectorUrl={selectorUrl}
          selectorContext={selectorContext}
          token={token}
          onCommit={onCommit}
        />
      );
    }
    return (
      <div className="w-full" data-testid={`field-${col.key}`}>
        <SelectorInput
          entityName={entity}
          field={col}
          value={value ?? ''}
          displayValue={displayLabel || ''}
          onChange={(id, label) => onCommit(id, { identifier: label || '' })}
          catalogs={null}
          resolvedLabel={col.label}
          selectorUrl={selectorUrl}
          selectorContext={selectorContext}
          token={token}
          compact
        />
      </div>
    );
  }

  // Enum / list field — native <select> populated from the column's enumLabels
  // map. Mirrors the inline-add-row UX (DataTable line ~730) so editing an
  // existing row uses the same control as creating one.
  if (col.type === 'enum' || col.type === 'select') {
    const labels = col.enumLabels || {};
    const options = Object.entries(labels);
    return (
      <select
        ref={inputRef}
        data-testid={`field-${col.key}`}
        defaultValue={value ?? ''}
        onChange={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel?.();
          }
        }}
        className="w-full h-7 text-sm rounded-md border border-input bg-white px-2 focus:ring-2 focus:ring-primary focus:outline-none"
      >
        {!col.required && <option value="">—</option>}
        {options.map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    );
  }

  const isNumeric = NUMERIC_TYPES.has(col.type);
  const inputType = col.type === 'date' ? 'date' : 'text';
  // Numeric fields use type="text" + inputMode to avoid the browser's spinner
  // arrows on type="number" while still surfacing the numeric keyboard on mobile.
  const numericProps = isNumeric
    ? { inputMode: col.type === 'integer' ? 'numeric' : 'decimal' }
    : {};

  // Currency-style columns show two decimals on edit so "23" displays as "23.00",
  // matching the read-mode rendering. Integer/quantity/percent stay raw.
  const TWO_DECIMAL_TYPES = new Set(['amount', 'price']);
  const formatForEdit = (raw) => {
    if (raw == null || raw === '') return '';
    if (!TWO_DECIMAL_TYPES.has(col.type)) return raw;
    const n = typeof raw === 'string' ? parseFloat(raw) : raw;
    return Number.isFinite(n) ? n.toFixed(2) : raw;
  };

  return (
    <Input
      ref={inputRef}
      data-testid={`field-${col.key}`}
      type={inputType}
      defaultValue={formatForEdit(value)}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel?.();
        }
      }}
      className={`h-7 px-2 text-sm border-input${isNumeric ? ' text-right tabular-nums' : ''}`}
      {...numericProps}
    />
  );
}

/**
 * Inline-editable lines table. Replaces the classic `<DataTable>` block inside the Lines
 * tab when `window.linesLayout === "inlineEditable"`. Renders the Figma layout:
 *  - Header strip + 40px rows.
 *  - Row hover reveals action icons (pencil + trash) on the right, replacing the last
 *    (amount) column.
 *  - Pencil toggles single-row edit mode. Autosave on blur. Trash deletes the row.
 *
 * Save flow: every blurred field PATCHes the row diff via `onUpdateRow(row, fieldKey,
 * value, extras)`. The parent's "Guardar" button can call `flushPendingEdits()` through
 * the imperative ref to commit any pending in-flight edit before the global save runs.
 *
 * Scope: this component owns ONLY the table block. Add-line button, related-documents,
 * notes panel and the totals panel stay in DetailView.jsx as-is.
 */
const InlineLinesPanel = forwardRef(function InlineLinesPanel({
  columns,
  data,
  entity,
  token,
  apiBaseUrl,
  selectedRowId,
  selectorContext,
  isDocumentReadOnly = false,
  onSelectionChange,
  onUpdateRow,
  onDeleteRow,
  // Optional: when provided, the pencil action calls this instead of toggling
  // the inline edit mode — used by tabs whose rows open a popup modal for
  // editing (e.g. Dirección with `customAddModal`).
  onEditRow,
  // Optional: when provided, clicking anywhere on the row body fires this.
  // Pairs with `onEditRow` for modal-style flows.
  onRowClick,
}, ref) {
  const ui = useUI();
  const t = useLabel();
  // resolveColumnLabel + toLocaleDateString expect the locale STRING
  // (es_ES / en_US) — `useLocale()` would return the dictionary object due
  // to a backward-compat shim, hence `useLocaleSwitch` here.
  const { locale } = useLocaleSwitch();

  const [editingRowId, setEditingRowId] = useState(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const panelRef = useRef(null);

  // Close edit mode when the user clicks outside the editing row. Defers the state
  // update to the next tick so any focused input fires its onBlur first — that triggers
  // the autosave PATCH for the cell the user was typing into. Clicks inside floating
  // overlays (selector dropdowns, ProductSearchDrawer modal, confirm dialogs) are
  // ignored so picking from a popover doesn't accidentally close the row.
  useEffect(() => {
    if (!editingRowId) return undefined;
    const handler = (e) => {
      const editingRowEl = panelRef.current?.querySelector(`[data-testid="line-row-${editingRowId}"]`);
      if (!editingRowEl) return;
      if (editingRowEl.contains(e.target)) return;
      const portalSelectors = [
        '[data-radix-popper-content-wrapper]',
        '[role="dialog"]',
        '[role="menu"]',
        '[role="listbox"]',
      ];
      for (const sel of portalSelectors) {
        if (e.target.closest?.(sel)) return;
      }
      setTimeout(() => setEditingRowId(null), 0);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingRowId]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [pendingDelete, setPendingDelete] = useState(null);

  // Active in-flight edit. Holds the latest pending field commit so a global "Save"
  // can flush it via the imperative ref before the document save runs.
  const pendingEditRef = useRef(null);

  // Visible columns: respect col.hidden flag if set (mirrors DataTable behavior).
  const visibleColumns = useMemo(
    () => (columns || []).filter(c => !c.hidden),
    [columns]
  );
  // The last "amount" column is the one that disappears on hover to make room
  // for the action strip — its 160px width matches the strip so the swap is
  // invisible. This only applies to monetary tables (sales-quotation, etc.).
  // For tabs without an amount column (Cuenta Bancaria, Persona) we instead
  // ALWAYS reserve the 160px slot, so values don't reflow when hovering.
  const trailingColumn = useMemo(() => {
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      if (visibleColumns[i].type === 'amount') return visibleColumns[i];
    }
    return null;
  }, [visibleColumns]);
  const reserveActionSlot = trailingColumn == null;
  // Action strip must be the same width as the trailing column it replaces on hover.
  const actionStripFlex = trailingColumn
    ? columnFlex(trailingColumn, visibleColumns.indexOf(trailingColumn))
    : '0 0 160px';

  const selectableRows = useMemo(() => data || [], [data]);

  // Prune deleted IDs from the selection Set — keeps the master checkbox in sync
  // when rows are removed (single-row trash, external mutations, etc.).
  useEffect(() => {
    setSelectedRows(prev => {
      if (prev.size === 0) return prev;
      const validIds = new Set(selectableRows.map(r => r.id));
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed) return prev;
      onSelectionChange?.(selectableRows.filter(r => next.has(r.id)));
      return next;
    });
  }, [selectableRows, onSelectionChange]);

  const toggleRow = useCallback((row, checked) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(row.id); else next.delete(row.id);
      onSelectionChange?.(selectableRows.filter(r => next.has(r.id)));
      return next;
    });
  }, [onSelectionChange, selectableRows]);

  const toggleAll = useCallback((checked) => {
    if (checked) {
      const next = new Set(selectableRows.map(r => r.id));
      setSelectedRows(next);
      onSelectionChange?.(selectableRows);
    } else {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    }
  }, [onSelectionChange, selectableRows]);

  const allSelected = selectableRows.length > 0 && selectedRows.size === selectableRows.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  // --- Save / autosave plumbing -------------------------------------------------

  const commitField = useCallback(async (row, col, value, extras = {}) => {
    if (isDocumentReadOnly) return;
    const original = row[col.key];
    // Skip if unchanged (string compare for safety against type drift).
    if (String(original ?? '') === String(value ?? '')) return;
    pendingEditRef.current = { rowId: row.id, key: col.key };
    try {
      await onUpdateRow?.(row, col.key, value, {
        column: col.column,
        // For selectors, the FK label travels alongside the id so DetailView can refresh
        // the local row identifier without a full re-fetch.
        identifier: extras.identifier,
        // For lookup/popup pickers, the full selector item carries the auxiliary values
        // the callout needs (e.g. product_PSTD, product_PLIM). DetailView merges them
        // into the row snapshot before firing the callout.
        selectedItem: extras.selectedItem,
      });
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      pendingEditRef.current = null;
    }
  }, [isDocumentReadOnly, onUpdateRow, ui]);

  // Imperative API for parent's global "Guardar". Closing the row implicitly blurs
  // the focused input (if any), which triggers its onBlur autosave. Awaiting any
  // in-flight PATCH happens through the natural focus chain — we don't track them
  // here because each commit awaits its own onUpdateRow.
  useImperativeHandle(ref, () => ({
    flushPendingEdits: () => {
      if (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      setEditingRowId(null);
      return Promise.resolve();
    },
    closeEditing: () => setEditingRowId(null),
    clearSelection: () => {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    },
  }), [onSelectionChange]);

  // --- Action handlers ---------------------------------------------------------

  const handleEditClick = useCallback((row) => {
    if (isDocumentReadOnly) return;
    if (onEditRow) {
      onEditRow(row);
      return;
    }
    setEditingRowId(prev => (prev === row.id ? null : row.id));
  }, [isDocumentReadOnly, onEditRow]);

  const handleDeleteClick = useCallback(async (row) => {
    if (isDocumentReadOnly) return;
    if (pendingDelete === row.id) return;
    setPendingDelete(row.id);
    try {
      await onDeleteRow?.(row);
      if (editingRowId === row.id) setEditingRowId(null);
    } finally {
      setPendingDelete(null);
    }
  }, [editingRowId, isDocumentReadOnly, onDeleteRow, pendingDelete]);

  // --- Render -----------------------------------------------------------------

  const headerStyle = {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: TOKENS.headerFontSize,
    fontWeight: TOKENS.headerFontWeight,
    color: TOKENS.textPrimary,
  };
  const cellStyle = {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: TOKENS.cellFontSize,
    fontWeight: TOKENS.cellFontWeight,
    color: TOKENS.textPrimary,
  };

  return (
    <div ref={panelRef} className="w-full" data-testid="inline-lines-panel">
      {/* Header strip — sticky at the top of the scroll container so column
          labels stay visible while rows scroll. The white background and z-10
          keep it opaque above the scrolled content. */}
      <div
        className="flex items-stretch border-b sticky top-0 z-10 bg-white"
        style={{ borderColor: TOKENS.separator, height: TOKENS.rowHeight, ...headerStyle }}
      >
        <div className="flex items-center justify-center px-2" style={{ width: 40 }}>
          <Checkbox
            aria-label={ui('selectAll')}
            checked={allSelected}
            indeterminate={someSelected}
            onChange={() => toggleAll(!allSelected)}
            disabled={isDocumentReadOnly}
          />
        </div>
        {visibleColumns.map((col, idx) => (
          <div
            key={col.key}
            className="flex items-center"
            style={{
              padding: `0 ${TOKENS.cellPaddingX}px`,
              flex: columnFlex(col, idx),
              justifyContent: 'flex-start',
              textAlign: 'left',
            }}
          >
            {resolveColumnLabel(col, locale, t)}
          </div>
        ))}
        {/* Reserve the same 160 px slot the action strip will occupy so the
            header columns align with the body rows even when hovering. */}
        {reserveActionSlot && (
          <div style={{ flex: '0 0 160px' }} aria-hidden="true" />
        )}
        {/* Right spacer — mirrors the Figma right margin without adding padding
            to the root (which would clip the row border-b lines). */}
        <div style={{ width: 48, flexShrink: 0 }} aria-hidden="true" />
      </div>

      {/* Body rows */}
      {selectableRows.map((row) => {
        const isEditing = editingRowId === row.id;
        const isHovered = hoveredRowId === row.id;
        const isSelected = selectedRows.has(row.id);
        const isHighlighted = selectedRowId === row.id;
        const isDeleting = pendingDelete === row.id;
        const showActions = (isHovered || isEditing) && !isDocumentReadOnly;

        return (
          <div
            key={row.id}
            data-testid={`line-row-${row.id}`}
            className={[
              // `hover:relative hover:z-10` lifts the row above its neighbors so the
              // shadow can spill onto the rows below without being clipped by them.
              'group/row flex items-stretch border-b bg-white transition-shadow',
              'hover:relative hover:z-20 hover:shadow-[0_4px_12px_rgba(18,18,23,0.08)]',
              isHighlighted ? 'bg-muted/40' : '',
              isEditing ? 'shadow-[0_4px_12px_rgba(18,18,23,0.08)] relative z-20' : '',
              onRowClick ? 'cursor-pointer' : '',
            ].join(' ')}
            style={{ borderColor: TOKENS.separator, minHeight: TOKENS.rowHeight, ...cellStyle }}
            onMouseEnter={() => setHoveredRowId(row.id)}
            onMouseLeave={() => setHoveredRowId(prev => (prev === row.id ? null : prev))}
            onClick={onRowClick ? (e) => {
              // Don't fire when the click was on the checkbox / hover actions —
              // those have their own handlers and stopping propagation there
              // keeps the row body click semantic (open detail).
              if (e.target.closest('[data-testid="line-actions"]') || e.target.closest('button') || e.target.closest('input')) return;
              onRowClick(row);
            } : undefined}
          >
            {/* Selection checkbox */}
            <div className="flex items-center justify-center px-2" style={{ width: 40 }}>
              <Checkbox
                aria-label={ui('selectRow') ?? 'Select row'}
                checked={isSelected}
                onChange={() => toggleRow(row, !isSelected)}
                disabled={isDocumentReadOnly}
              />
            </div>

            {/* Cells */}
            {visibleColumns.map((col, idx) => {
              const isTrailing = col === trailingColumn;
              // The trailing column is hidden when the action strip is showing,
              // so the icons can take its space. Other amount columns stay visible.
              if (isTrailing && showActions) return null;

              const isNumeric = NUMERIC_TYPES.has(col.type);
              const editable = isEditing && isCellEditable(col);
              // When a cell is in edit mode, the input/trigger has its own px-2 (8px)
              // + 1px border = 9px of internal padding. Reducing the cell's outer
              // padding to 3px compensates: the input's CONTENT lands exactly where
              // read-mode text lands (cell_left + 12px), so values don't visually
              // jump when toggling between view and edit modes.
              const baseStyle = {
                padding: editable ? '0 3px' : `0 ${TOKENS.cellPaddingX}px`,
                flex: columnFlex(col, idx),
                justifyContent: isNumeric ? 'flex-end' : 'flex-start',
                textAlign: isNumeric ? 'right' : 'left',
              };

              return (
                <div
                  key={col.key}
                  className="flex items-center"
                  style={baseStyle}
                  data-cell-key={col.key}
                >
                  {editable ? (
                    <EditCell
                      // Re-key on the underlying value so the uncontrolled <Input> re-hydrates
                      // its defaultValue whenever a callout updates this field externally
                      // (e.g., listPrice changes after the user picks a different product).
                      // The user's currently-focused cell never has its value mutated mid-typing,
                      // so this does not interrupt their input.
                      key={`${row.id}:${col.key}:${row[col.key] ?? ''}`}
                      col={col}
                      row={row}
                      value={row[col.key]}
                      displayLabel={resolveIdentifier(row, col.key)}
                      autoFocus={idx === 0 || (idx === 1 && !isCellEditable(visibleColumns[0]))}
                      entity={entity}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                      selectorContext={selectorContext}
                      onCommit={(val, extras) => commitField(row, col, val, extras)}
                      onCancel={() => setEditingRowId(null)}
                    />
                  ) : (
                    <ReadCell row={row} col={col} locale={locale} t={t} ui={ui} />
                  )}
                </div>
              );
            })}

            {/* Hover / edit action strip. When `reserveActionSlot` is true
                (no amount column), the slot is rendered in every row so cells
                don't reflow on hover — only the icons inside fade in. */}
            {(showActions || reserveActionSlot) && (
              <div
                className="flex items-center justify-end gap-2 pr-1"
                style={{ flex: actionStripFlex }}
                data-testid="line-actions"
              >
                {showActions && (
                  <>
                    <button
                      type="button"
                      aria-label={ui('editLineTooltip') ?? 'Edit line'}
                      title={ui('editLineTooltip') ?? 'Edit line'}
                      onClick={() => handleEditClick(row)}
                      className={[
                        'p-1 rounded-full hover:bg-muted',
                        isEditing ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={ui('deleteRowTooltip') ?? 'Delete'}
                      title={ui('deleteRowTooltip') ?? 'Delete'}
                      onClick={() => handleDeleteClick(row)}
                      disabled={isDeleting}
                      className="p-1 rounded-full text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
            <div style={{ width: 48, flexShrink: 0 }} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
});

export default InlineLinesPanel;
