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
 * @param zIndex stacking level — defaults to the app's modal tier (50). Pass 60 when opening this
 *     on top of another modal, which is the return-document case; the walkthrough overlay owns 70
 *     and must stay above (ETP-5108).
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
  maxVisible = 5,
}) {
  const ui = useUI();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(selectedIds);

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

  const { filtered, hiddenCount } = useMemo(() => {
    let visible = invoices.filter(inv => inv.id !== currentId);
    const q = search.trim().toLowerCase();
    if (q) {
      visible = visible.filter(inv => `${label(inv)} ${partner(inv)}`.toLowerCase().includes(q));
    } else if (multiple) {
      // No query: lead with the invoices the backend detected from the return document's chain.
      visible = [...visible].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
    }
    return {
      filtered: visible.slice(0, maxVisible),
      hiddenCount: Math.max(0, visible.length - maxVisible),
    };
  }, [invoices, search, currentId, multiple, maxVisible]);

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
          background: checked ? 'var(--status-info-bg)' : 'transparent',
        }}
        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'hsl(var(--muted))'; }}
        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
      >
        {multiple && (
          // The shared Checkbox, not a hand-drawn box: it carries the design system's own
          // `primary` tokens, so the tick reads black like every other checkbox in the app
          // instead of the informational blue this used to paint.
          //
          // pointer-events-none is what makes clicking the box itself work. Checkbox is a <label>
          // wrapping a hidden <input>, so a click on it fires TWICE at the row — once for the
          // label, once for the click the browser forwards to the input — and the row's toggle ran
          // both times, selecting and immediately deselecting. Letting the click fall through to
          // the row keeps exactly one handler for the whole row, box included.
          // The no-op onChange is required, not decorative: Checkbox forwards it to a controlled
          // <input checked>, and React warns without it.
          <Checkbox checked={checked} onChange={() => {}} className="shrink-0 pointer-events-none" />
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
                {ui('rectifySuggestedBadge')}
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
  } else if (filtered.length === 0) {
    listBody = <p data-testid={`${idPrefix}-no-matches`} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('rectNoInvoices')}</p>;
  } else {
    listBody = filtered.map(invoiceRow);
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
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={ui('rectSearchInvoice')} autoFocus
            data-testid={`${idPrefix}-search`}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '7px 10px', border: '0.5px solid hsl(var(--border))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {listBody}
          {hiddenCount > 0 && (
            <p data-testid={`${idPrefix}-more-hidden`} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '8px 16px 4px', textAlign: 'center' }}>
              +{hiddenCount} {ui('rectMoreInvoicesHint')}
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
