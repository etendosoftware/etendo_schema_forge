import { useState, useMemo } from 'react';
import { useUI } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Modal for choosing the invoice(s) a rectificative invoice corrects.
 *
 * <p>Extracted from {@code windows/custom/sales-invoice/ReversedInvoicesPanel.jsx}, where it was
 * the single-select picker of the "Rectificaciones" tab, so the return-document flow (ETP-5381)
 * can present the exact same list instead of growing a second, subtly different one. Same layout,
 * same search, same empty/overflow copy — the only addition is `multiple`.
 *
 * <p><b>Single vs multiple.</b> With `multiple` off it behaves as before: clicking a row calls
 * `onSelect(id, label)` and closes. With `multiple` on, rows carry a checkbox, the selection is
 * held as a local draft and only reaches the caller through `onApply(ids)` — so Cancel genuinely
 * discards rather than silently committing every click.
 *
 * <p>Rows are read defensively because the two callers load them from different endpoints: the
 * tab reads the NEO header entity (`businessPartner$_identifier`, sometimes only `_identifier`),
 * while the return flow reads the `rectifiableInvoices` action (`businessPartner`, plus a
 * `suggested` flag for the invoices detected from the return document's own chain).
 *
 * <p><b>Infinite scroll, not truncation.</b> The list renders `pageSize` rows (20) and appends
 * another `pageSize` each time the user scrolls to the bottom — no pager, no page buttons. It
 * previously capped at 5 and printed a "+N more — refine the search" hint, which left every invoice
 * past the fifth reachable only by guessing a search term.
 *
 * @param zIndex stacking level — defaults to the app's modal tier (50). Pass 60 when opening this
 *     on top of another modal, which is the return-document case; the walkthrough overlay owns 70
 *     and must stay above (ETP-5108).
 * @param pageSize rows per batch — the initial render and the size of each scroll-triggered append.
 */
export default function InvoicePickerModal({
  invoices = [],
  loading = false,
  currentId,
  multiple = false,
  selectedIds = [],
  onSelect,
  onApply,
  onClose,
  title,
  zIndex = 50,
  idPrefix = 'invoice-picker',
  pageSize = 20,
  search: controlledSearch,
  onSearchChange,
  onReachBottom,
  loadingMore = false,
}) {
  const ui = useUI();
  const [localSearch, setLocalSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [draft, setDraft] = useState(selectedIds);

  // Two modes, and the difference is WHERE the set lives.
  //
  // Controlled (`onSearchChange` given): the caller pages and searches against the server and hands
  // us one batch at a time. We must NOT filter locally — the rows we hold are a window onto a
  // larger set, so a local filter would hide rows the server already matched and, worse, report
  // "no matches" for an invoice sitting in a batch nobody fetched.
  //
  // Uncontrolled: the caller handed us the whole set, so searching and growing the rendered slice
  // are both ours to do. This is the transitional mode for the Rectificaciones tab.
  const serverDriven = typeof onSearchChange === 'function';
  const search = serverDriven ? (controlledSearch ?? '') : localSearch;

  const toggleDraft = (id) =>
    setDraft(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const label = (inv) => inv.documentNo || inv._identifier || inv.id;
  // `businessPartner$_identifier` FIRST, and not the other way round: rows coming from the NEO
  // header entity carry the raw id in `businessPartner` and the display name in the `$_identifier`
  // twin, so reading `businessPartner` first renders a UUID at the user. Rows from the
  // rectifiableInvoices action have no `$_identifier` and put the name in `businessPartner`, which
  // is why both are read at all.
  const partner = (inv) => inv['businessPartner$_identifier'] || inv.businessPartner || '';
  const amount = (inv) => inv.grandTotalAmount ?? inv.grandTotalAmt;

  // ETP-5381: infinite scroll, not truncation. This used to `slice(0, maxVisible)` at 5 and print a
  // "+N more — refine the search" hint, which made every invoice past the fifth reachable ONLY by
  // guessing a search term. Now the list grows by `pageSize` each time the user reaches the bottom.
  //
  // `visibleCount` is clamped against the row count on render rather than tracked precisely: the
  // set shrinks under us whenever the search narrows, and a stale count would ask for rows that no
  // longer exist. Slicing past the end is harmless, so the clamp only matters for `hasMore`.
  const { pageRows, moreLocally } = useMemo(() => {
    let visible = invoices.filter(inv => inv.id !== currentId);
    const q = search.trim().toLowerCase();
    if (q && !serverDriven) {
      visible = visible.filter(inv => `${label(inv)} ${partner(inv)}`.toLowerCase().includes(q));
    } else if (!q && multiple) {
      // No query: lead with the invoices the backend detected from the return document's chain.
      visible = [...visible].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
    }
    if (serverDriven) {
      return { pageRows: visible, moreLocally: false };
    }
    return {
      pageRows: visible.slice(0, visibleCount),
      moreLocally: visible.length > visibleCount,
    };
  }, [invoices, search, currentId, multiple, visibleCount, serverDriven]);

  // Reaching the bottom means "give me more": the next network batch when the caller owns the set,
  // or the next rendered slice when we do. The 60px margin fires it a row early so the rows are
  // there by the time the user arrives rather than after a visible stall.
  const onListScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight >= 60) return;
    if (serverDriven) {
      onReachBottom?.();
    } else if (moreLocally) {
      setVisibleCount(c => c + pageSize);
    }
  };

  const fmtDate = (d) => formatCalendarDate(d, 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Through the canonical helper, never a hand-rolled toLocaleString: CLAUDE.md makes that
  // mandatory, and the inline picker this replaced did render the symbol. Carrying the old
  // hand-rolled version over would have silently dropped it from the return flow, and pinned the
  // separators to es-ES instead of the instance's configured ones. formatCurrency degrades to the
  // plain number when the code is missing or invalid, which is what the header rows need.
  const currencyCode = (inv) => inv.currency || inv['currency$_identifier'];
  const fmtAmt = (inv) => formatCurrency(currencyCode(inv), amount(inv));

  const activate = (inv) => {
    if (multiple) {
      toggleDraft(inv.id);
      return;
    }
    onSelect(inv.id, label(inv));
    onClose();
  };

  const invoiceRow = (inv) => {
    const checked = multiple && draft.includes(inv.id);
    return (
      <div
        key={inv.id}
        role="button"
        tabIndex={0}
        data-testid={`${idPrefix}-option-${inv.id}`}
        data-selected={checked ? 'true' : 'false'}
        onClick={() => activate(inv)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(inv); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer',
          borderBottom: '0.5px solid hsl(var(--border) / 0.3)',
          // The same neutral grey the row already uses on hover, not the informational blue: the
          // black tick is what signals selection, so tinting the row as well read as a status
          // ("this invoice is special") rather than as "you picked this one".
          background: checked ? 'hsl(var(--muted))' : 'transparent',
        }}
        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'hsl(var(--muted))'; }}
        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
      >
        {multiple && (
          // The shared Checkbox, not a hand-drawn box: it carries the design system's own
          // `primary` tokens, so the tick reads black like every other checkbox in the app.
          //
          // stopPropagation + its own onChange is the codebase's established answer to a checkbox
          // inside a clickable row (DataTable, ListModalWindow, ImportLinesModal,
          // AssignTemplateRolesControl — the last citing ETP-5067). Without it the box fires TWICE
          // at the row, once for the label and once for the click the browser forwards to the
          // hidden input, so the row's toggle ran both times and the click netted to nothing.
          // pointer-events-none also fixes that, but jsdom does not implement pointer-events, so
          // the real-user path would only be provable in Playwright — this way it is unit-testable.
          <Checkbox
            checked={checked}
            onClick={e => e.stopPropagation()}
            onChange={() => toggleDraft(inv.id)}
            className="shrink-0"
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{label(inv)}</span>
            <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{fmtDate(inv.invoiceDate)}</span>
            {inv.suggested && (
              <span
                data-testid={`${idPrefix}-suggested-${inv.id}`}
                style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 999, background: 'var(--status-info-bg)', color: 'var(--status-info-fg)', whiteSpace: 'nowrap' }}
              >
                {ui('rectifyLinkedBadge')}
              </span>
            )}
          </div>
          {partner(inv) && (
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {partner(inv)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(inv)}</span>
      </div>
    );
  };

  let listBody;
  if (loading) {
    listBody = <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('loading')}</p>;
  } else if (pageRows.length === 0) {
    listBody = <p data-testid={`${idPrefix}-no-matches`} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('rectNoInvoices')}</p>;
  } else {
    listBody = pageRows.map(invoiceRow);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`${idPrefix}-picker-modal`}
      className="fixed inset-0 flex items-center justify-center bg-foreground/30"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 580, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border))' }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '2px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title || ui('rectPickerTitle')}</span>
          <button type="button" onClick={onClose} aria-label={ui('cancel')} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>
        <div style={{ padding: '10px 16px 0' }}>
          <input
            type="text" value={search}
            // Collapse back to the first slice on every keystroke: after scrolling deep into a wide
            // list, a narrower search would otherwise keep rendering every row it had already grown
            // to, so the "load more" behaviour would never be exercised again. In server-driven
            // mode the caller resets its own window, so we only forward the text.
            onChange={e => {
              if (serverDriven) { onSearchChange(e.target.value); return; }
              setLocalSearch(e.target.value);
              setVisibleCount(pageSize);
            }}
            placeholder={ui('rectSearchInvoice')} autoFocus
            data-testid={`${idPrefix}-search`}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '7px 10px', border: '0.5px solid hsl(var(--border))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))' }}
          />
        </div>
        <div
          data-testid={`${idPrefix}-list`}
          onScroll={onListScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
        >
          {listBody}
          {loadingMore && (
            // Without this the list simply stops at the last row while the next batch is in
            // flight, which reads as "that is all there is" rather than "more is coming".
            <p
              data-testid={`${idPrefix}-loading-more`}
              style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '10px 0', textAlign: 'center' }}
            >
              {ui('loading')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: multiple ? 'space-between' : 'flex-end', alignItems: 'center', gap: 8, background: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border))', padding: '10px 16px' }}>
          {multiple && (
            <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
              {ui('rectifySelectedCount', { count: draft.length })}
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>{ui('cancel')}</button>
            {multiple && (
              <button
                type="button"
                onClick={() => onApply(draft)}
                data-testid={`${idPrefix}-apply`}
                // Same hover as every other primary action in the app (DashboardGreeting,
                // AccountsToolbar, InlineCreateModal): foreground → accent-highlight.
                className="bg-[hsl(var(--foreground))] text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))]"
                style={{ fontSize: 13, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer' }}
              >
                {ui('confirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
