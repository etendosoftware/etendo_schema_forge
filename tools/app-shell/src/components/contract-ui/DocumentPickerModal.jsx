import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, SquareCheck, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { sameAmount, validateBoundedAmount } from '@/lib/boundedAmount.js';
import { ImportNotice } from './ImportLinesModal.jsx';
import { isOwnEscape, useDialogFocusTrap } from './ActionChoiceModal.jsx';
import { ResettableAmountInput, boundedAmountMessage } from './ResettableAmountInput.jsx';
import { committedIdSet } from './selectorSelection.js';

// Same frame as the «Importar desde pedido» popup (ImportLinesModal): fixed size, centred, only the
// list scrolls. Wider, because this one shows a table of documents rather than one line per
// document.
const DIALOG_WIDTH = 1040;
const DIALOG_HEIGHT = 680;
const NOTICE_HEIGHT = 92; // 12 px gap + the 80 px ImportNotice
const SCROLL_END_PX = 48;

const CONTROL = 'border-[hsl(var(--sf-border-input))] shadow-[var(--sf-shadow-xs)]';
const ICON = 'text-[hsl(var(--sf-icon-outline-secondary))]';
const PILL = 'inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2';
const AMOUNT_COLUMN_WIDTH = 168;

/**
 * The difference between the committed set (the rows applied when the modal opened, with their
 * amounts) and the current selection. Only rows that were LOADED take part: a committed row the
 * user never saw is neither kept nor removed here, so a paged, searchable list cannot drop it.
 *
 * @returns {{ add: {id, amount}[], update: {id, amount}[], remove: string[] }}
 */
export function diffSelection(committed, selected) {
  const add = [];
  const update = [];
  for (const [id, amount] of selected) {
    if (!committed.has(id)) add.push({ id, amount });
    else if (!sameAmount(committed.get(id), amount)) update.push({ id, amount });
  }
  const remove = [...committed.keys()].filter((id) => !selected.has(id));
  return { add, update, remove };
}

function isScrolledToEnd(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_END_PX;
}

/**
 * ETP-6148 — a GENERIC document picker: pick documents (or their dues) from a server-driven list
 * and say how much of each to take, in the frame of the «Importar desde pedido» popup (title and
 * subtitle, search, the select-all checkbox, the list, a notice, a footer status, Cancelar + the
 * primary). Unlike that popup there is no per-line sub-selection: one row is one pick.
 *
 * The caller owns the data and the columns; this component owns the selection and the amounts.
 * - `columns`: `{ key, labelKey, align?: 'left'|'right', width?, render(row, { close }) }`, drawn
 *   left to right; `render` gets `close` so a link can leave the modal.
 * - `amount`: the editable last column, `{ labelKey, getMax(row), getReset(row), getCurrency(row) }`.
 *   Each selected row carries an amount, validated like the line grid's in-place cell
 *   (ResettableAmountInput / validateBoundedAmount); it starts at `getInitialAmount(row)`.
 * - Committed rows (`isCommitted(row)`, e.g. dues already in the remittance) open checked
 *   (`aria-selected`, committedIdSet in selectorSelection.js); unchecking one marks it for removal.
 * - `onConfirm({ add, update, remove })` receives the difference with the committed set
 *   (diffSelection) and may be async; the modal stays open and disabled while it runs.
 *
 * The primary button is disabled while nothing changed, while any selected amount is invalid, and
 * while the confirm runs. The footer counts the selected rows and totals their amounts.
 *
 * Closing: ×, Cancelar, a click on the backdrop and Escape (only an Escape no inner control
 * consumed, `isOwnEscape`) call `onClose`. While the confirm runs the backdrop and Escape are
 * ignored, so the caller's write cannot be abandoned half-way. Tab stays inside the dialog
 * (`useDialogFocusTrap`, the shared helper of ActionChoiceModal / ConfirmResultModal).
 */
export function DocumentPickerModal({
  titleKey,
  subtitle,
  searchPlaceholderKey,
  emptyKey,
  noticeTitleKey,
  noticeBodyKey,
  confirmKey,
  footerKey,
  rows = [],
  loading = false,
  loadingMore = false,
  search = '',
  onSearchChange,
  onReachBottom,
  getRowId,
  isCommitted,
  getInitialAmount,
  columns,
  amount,
  currency,
  onConfirm,
  onClose,
}) {
  const ui = useUI();
  const listRef = useRef(null);
  const dialogRef = useRef(null);
  useDialogFocusTrap(dialogRef);
  const [selected, setSelected] = useState(() => new Map());
  const [committed, setCommitted] = useState(() => new Map());
  const [amounts, setAmounts] = useState(() => new Map());
  const [confirming, setConfirming] = useState(false);

  // Rows arrive page by page: the first time a row is seen, its committed state and its starting
  // amount are recorded (committed rows also enter the selection). Later pages never reset them.
  useEffect(() => {
    const unseen = rows.filter((row) => !amounts.has(String(getRowId(row))));
    if (unseen.length === 0) return;
    const committedIds = committedIdSet(unseen, isCommitted, getRowId);
    setAmounts((prev) => {
      const next = new Map(prev);
      for (const row of unseen) next.set(String(getRowId(row)), String(getInitialAmount(row) ?? ''));
      return next;
    });
    if (committedIds.size === 0) return;
    const initial = unseen.filter((row) => committedIds.has(String(getRowId(row))))
      .map((row) => [String(getRowId(row)), String(getInitialAmount(row) ?? '')]);
    setCommitted((prev) => new Map([...prev, ...initial]));
    setSelected((prev) => new Map([...prev, ...initial]));
  }, [rows, amounts, getRowId, isCommitted, getInitialAmount]);

  const rowById = useMemo(() => new Map(rows.map((row) => [String(getRowId(row)), row])), [rows, getRowId]);
  const invalidIds = useMemo(() => [...selected.keys()].filter((id) => {
    const row = rowById.get(id);
    return row && validateBoundedAmount(selected.get(id), amount.getMax(row)).error;
  }), [selected, rowById, amount]);
  const diff = useMemo(() => diffSelection(committed, selected), [committed, selected]);
  const changed = diff.add.length + diff.update.length + diff.remove.length > 0;
  const total = useMemo(() => [...selected.values()]
    .reduce((acc, value) => acc + (Number(validateBoundedAmount(value).value) || 0), 0), [selected]);
  const confirmDisabled = confirming || !changed || invalidIds.length > 0;

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(String(getRowId(row))));

  const toggle = (row) => {
    const id = String(getRowId(row));
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, amounts.get(id) ?? String(getInitialAmount(row) ?? ''));
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Map(prev);
        for (const row of rows) next.delete(String(getRowId(row)));
        return next;
      }
      const next = new Map(prev);
      for (const row of rows) {
        const id = String(getRowId(row));
        if (!next.has(id)) next.set(id, amounts.get(id) ?? String(getInitialAmount(row) ?? ''));
      }
      return next;
    });
  };

  const setAmount = (id, value) => {
    setAmounts((prev) => new Map(prev).set(id, value));
    setSelected((prev) => (prev.has(id) ? new Map(prev).set(id, value) : prev));
  };

  const handleScroll = () => {
    if (listRef.current && isScrolledToEnd(listRef.current) && !loading && !loadingMore) onReachBottom?.();
  };

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setConfirming(true);
    try {
      await onConfirm(diff);
    } finally {
      setConfirming(false);
    }
  };

  // The backdrop and Escape never interrupt a running confirm.
  const closeUnlessConfirming = () => {
    if (!confirming) onClose?.();
  };
  const handleKeyDown = (event) => {
    if (isOwnEscape(event, dialogRef.current)) {
      event.preventDefault();
      closeUnlessConfirming();
    }
  };

  const renderRow = (row) => {
    const id = String(getRowId(row));
    const isSelected = selected.has(id);
    const value = isSelected ? selected.get(id) : amounts.get(id);
    const max = amount.getMax(row);
    const rowCurrency = amount.getCurrency?.(row) ?? currency;
    const error = isSelected ? validateBoundedAmount(value, max).error : null;
    return (
      <div
        key={id}
        role="option"
        aria-selected={isSelected}
        onClick={() => toggle(row)}
        className={cn(
          'flex min-h-14 cursor-pointer items-center gap-3 border-b border-[hsl(var(--border-subtle))] px-3 py-2 text-sm hover:bg-muted/60',
          isSelected && 'bg-muted/40',
        )}
        data-testid={`document-picker-row-${id}`}
      >
        {/* The core Checkbox is a <label> around a hidden <input>: it takes `onChange` (there is no
            `onCheckedChange`). The click stops here so the row's own onClick does not toggle it a
            second time — the same wiring as InvoicePickerModal. */}
        <Checkbox
          checked={isSelected}
          onChange={() => toggle(row)}
          onClick={(e) => e.stopPropagation()}
          aria-label={ui('selectRow')}
          data-testid={`document-picker-check-${id}`} />
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn('min-w-0', col.align === 'right' ? 'text-right tabular-nums' : 'text-left')}
            style={col.width ? { flex: `0 0 ${col.width}px` } : { flex: '1 1 0' }}
            data-testid={`document-picker-cell-${col.key}`}
          >
            {col.render(row, { close: onClose })}
          </div>
        ))}
        <div
          style={{ flex: `0 0 ${AMOUNT_COLUMN_WIDTH}px` }}
          onClick={(e) => e.stopPropagation()}
          data-testid="document-picker-cell-amount"
        >
          {isSelected ? (
            <>
              <ResettableAmountInput
                value={value}
                resetValue={amount.getReset(row)}
                max={max}
                currency={rowCurrency}
                onChange={(clean) => setAmount(id, clean)}
                ariaLabel={ui(amount.labelKey)}
                data-testid={`document-picker-amount-${id}`} />
              {error && (
                <span className="mt-0.5 block truncate text-xs text-destructive" data-testid={`document-picker-amount-error-${id}`}>
                  {boundedAmountMessage(ui, error, max, rowCurrency)}
                </span>
              )}
            </>
          ) : (
            <span className="block text-right tabular-nums text-muted-foreground">{formatCurrency(rowCurrency, Number(value))}</span>
          )}
        </div>
      </div>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" data-testid="document-picker-loading">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__document-picker" />
          {ui('loading')}
        </div>
      );
    }
    if (rows.length === 0) {
      return <p className="p-6 text-center text-sm text-muted-foreground" data-testid="document-picker-empty">{ui(emptyKey)}</p>;
    }
    return (
      <>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-3 py-2 text-xs font-medium text-muted-foreground" data-testid="document-picker-header">
          <span className="w-4 shrink-0" aria-hidden="true" />
          {columns.map((col) => (
            <span
              key={col.key}
              className={cn('min-w-0 truncate', col.align === 'right' && 'text-right')}
              style={col.width ? { flex: `0 0 ${col.width}px` } : { flex: '1 1 0' }}
            >
              {ui(col.labelKey)}
            </span>
          ))}
          <span className="text-right" style={{ flex: `0 0 ${AMOUNT_COLUMN_WIDTH}px` }}>{ui(amount.labelKey)}</span>
        </div>
        {/* committed-selection: rows open checked from isCommitted (committedIdSet). */}
        <div role="listbox" aria-multiselectable="true" aria-label={ui(titleKey)} data-testid="document-picker-options">
          {rows.map(renderRow)}
        </div>
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground" data-testid="document-picker-loading-more">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" data-testid="Loader2__document-picker-more" />
            {ui('loadingMore')}
          </div>
        )}
      </>
    );
  };

  return createPortal(
    <div
      onClick={closeUnlessConfirming}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"
      data-testid="document-picker-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ui(titleKey)}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-card py-2 text-foreground shadow-[var(--sf-shadow-overlay)]"
        style={{ width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}
        data-testid="document-picker-modal"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={ui('close')}
          className={cn('absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted', ICON)}
          data-testid="document-picker-close"
        >
          <X size={20} aria-hidden="true" data-testid="X__document-picker" />
        </button>
        <header className="flex shrink-0 flex-col gap-0.5 py-3 pl-7 pr-12">
          <h2 className="font-['Plus_Jakarta_Sans',Inter,sans-serif] text-xl font-semibold leading-7 tracking-[-0.005em]">{ui(titleKey)}</h2>
          {subtitle && <p className="min-h-4 truncate text-xs leading-4" data-testid="document-picker-subtitle">{subtitle}</p>}
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-7 pb-3">
          <div className="flex h-10 shrink-0 items-center gap-3">
            <label className="relative flex h-10 min-w-0 flex-1 items-center">
              <Search size={20} aria-hidden="true" className={cn('pointer-events-none absolute left-2', ICON)} data-testid="Search__document-picker" />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={ui(searchPlaceholderKey)}
                aria-label={ui(searchPlaceholderKey)}
                className={cn('h-10 w-full rounded-lg border bg-card py-2 pl-9 pr-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-focus-ring', CONTROL)}
                data-testid="document-picker-search"
              />
            </label>
            <button
              type="button"
              onClick={toggleAll}
              disabled={loading || rows.length === 0}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium leading-6 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="document-picker-select-all"
            >
              <SquareCheck size={20} aria-hidden="true" className={ICON} data-testid="SquareCheck__document-picker" />
              {ui(allSelected ? 'deselectAll' : 'selectAll')}
            </button>
          </div>
          <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[hsl(var(--border-subtle))]" data-testid="document-picker-list">
            {renderList()}
          </div>
          {noticeTitleKey && (
            <div className="box-border shrink-0 pt-3" style={{ height: NOTICE_HEIGHT }} data-testid="document-picker-notice">
              <ImportNotice tone="neutral" title={ui(noticeTitleKey)} body={noticeBodyKey ? ui(noticeBodyKey) : undefined} data-testid="ImportNotice__document-picker" />
            </div>
          )}
        </div>
        <footer className="flex h-16 shrink-0 items-center justify-between gap-3 px-7 py-3">
          <span className="min-w-0 truncate text-sm leading-5 text-status-neutral-foreground" data-testid="document-picker-status">
            {ui(footerKey, { count: selected.size, total: formatCurrency(currency, total) })}
          </span>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className={cn(PILL, 'border bg-card hover:bg-muted', CONTROL)} data-testid="document-picker-cancel">
              {ui('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className={cn(PILL, 'bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40')}
              data-testid="document-picker-confirm"
            >
              {confirming && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__document-picker-confirm" />}
              {ui(confirmKey, { count: selected.size > 0 ? ` (${selected.size})` : '' })}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default DocumentPickerModal;
