import RelatedDocuments from './RelatedDocuments';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}

/**
 * InvoiceBottomPanel — two-column bottom block for Invoice detail.
 *
 * Left:  DOCS chips + NOTES text field (secondary background)
 * Right: Subtotal / Tax / Total
 *
 * Payment status is shown in the topbar (InvoiceTopbarExtra).
 */
export default function InvoiceBottomPanel({
  recordId, data, token, apiBaseUrl, api, summary,
  notesField, onFieldChange, notesFocused, setNotesFocused,
}) {
  const currency = data?.['currency$_identifier'] || '';
  const subtotalField = summary?.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('summed') || f.key.toLowerCase().includes('totallines') || f.key.toLowerCase().includes('lineamount')));
  const totalField = summary?.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('grand') || (f.key.toLowerCase().includes('total') && !f.key.toLowerCase().includes('line'))));
  const subtotal = subtotalField ? data?.[subtotalField.key] : null;
  const total = totalField ? data?.[totalField.key] : null;
  const taxes = (subtotal != null && total != null) ? total - subtotal : null;

  return (
    <div className="mt-4 border-t border-border/50 flex" style={{ borderTopWidth: '0.5px' }}>
      {/* ── Left column: Docs + Notes ── */}
      <div className="flex-1 min-w-0 py-4 px-1 bg-muted/30 rounded-bl-lg">
        {/* DOCS */}
        <div className="flex items-start gap-3 px-3 pb-3">
          <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-14 pt-0.5" style={{ letterSpacing: '0.04em' }}>
            Docs
          </span>
          <div className="flex-1">
            <RelatedDocuments
              recordId={recordId}
              data={data}
              token={token}
              apiBaseUrl={apiBaseUrl}
              api={api}
              layout="chips"
            />
          </div>
        </div>

        {/* NOTES */}
        {notesField && (
          <div className="flex items-start gap-3 px-3 mt-3 pt-3 border-t border-border/40" style={{ borderTopWidth: '0.5px' }}>
            <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-14 pt-1.5" style={{ letterSpacing: '0.04em' }}>
              Notes
            </span>
            <div className="flex-1">
              {notesFocused ? (
                <textarea
                  value={data?.[notesField] || ''}
                  onChange={(e) => onFieldChange?.(notesField, e.target.value)}
                  onBlur={() => setNotesFocused?.(false)}
                  placeholder="Add a note..."
                  rows={2}
                  autoFocus
                  className="w-full text-sm bg-white border border-border/40 rounded px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                  style={{ borderWidth: '0.5px' }}
                />
              ) : (
                <div
                  tabIndex={0}
                  role="textbox"
                  onClick={() => setNotesFocused?.(true)}
                  onFocus={() => setNotesFocused?.(true)}
                  className="w-full text-sm px-2.5 py-1.5 cursor-text min-h-[1.5rem] text-foreground/80 border border-transparent rounded hover:border-border/30 transition-colors"
                >
                  {data?.[notesField] || <span className="text-muted-foreground/40">Add a note...</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Vertical separator ── */}
      <div className="border-l border-border/50" style={{ borderLeftWidth: '0.5px' }} />

      {/* ── Right column: Totals only ── */}
      <div className="w-[280px] shrink-0 py-4 px-4">
        <div className="text-sm space-y-0.5">
          {subtotal != null && (
            <div className="flex justify-between py-1 px-1">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{fmt(subtotal, currency)}</span>
            </div>
          )}
          {taxes != null && taxes !== 0 && (
            <div className="flex justify-between py-1 px-1">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{fmt(taxes, currency)}</span>
            </div>
          )}
          {total != null && (
            <div className="flex justify-between py-1.5 px-1 border-t border-border/40 font-semibold text-base" style={{ borderTopWidth: '0.5px' }}>
              <span>Total</span>
              <span className="tabular-nums">{fmt(total, currency)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
