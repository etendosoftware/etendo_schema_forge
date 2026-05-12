import { useUI } from '@/i18n';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}

/**
 * Shared bottom-section layout for documents using the inline-editable lines
 * layout (Sales Quotation, Sales Invoice, Sales Order, etc.). Renders the
 * standardized 2-column footer:
 *
 *   - Left:  Docs (window-specific `RelatedDocuments` component, passed in via
 *            `relatedDocuments` prop) + optional Notes textarea.
 *   - Right: `DocumentTotalsPanel` with the shared 420px fixed width and
 *            241px fixed height (matches the expanded "Descuento total" state
 *            so toggling the discount doesn't resize the panel).
 *
 * Per-window wrappers (e.g., QuotationBottomPanel) import their custom
 * RelatedDocuments component and forward it to this component as the
 * `relatedDocuments` slot. All other props (recordId, data, token, etc.) are
 * forwarded by DetailView's bottomSection contract.
 */
export default function LinesBottomSection({
  recordId,
  data,
  token,
  apiBaseUrl,
  api,
  notesField,
  onFieldChange,
  notesFocused,
  setNotesFocused,
  lines,
  pendingLine,
  editingLine,
  lineConfig,
  totalDiscountPct,
  onTotalDiscountChange,
  relatedDocuments: RelatedDocumentsComponent,
  totalsField = 'etgoTotalDiscount',
  // Inventory / shipment-style windows (albaranes, recepciones, movimientos)
  // don't carry monetary totals — set `showTotals={false}` in the per-window
  // wrapper to hide the right column entirely and let Docs/Notas occupy the
  // full width.
  showTotals = true,
  // Optional component rendered inside the left column right below the Notes
  // block. Used by windows that need an extra panel attached to the
  // Docs/Notes group — e.g. Sales Invoice's SIF (fiscal) data tabs. Receives
  // `{ data, recordId, token, apiBaseUrl, api }` as props.
  notesExtra: NotesExtraComponent,
}) {
  const ui = useUI();
  const currency = data?.['currency$_identifier'] || '';
  const isReadOnly = data?.documentStatus !== 'DR';

  return (
    <div className="flex flex-col">
      <div className="flex">
        {/* Left column: Docs + Notes — flex-1 absorbs whatever the Resumen
            column doesn't claim, so Docs+Notes stays wide on most screens. */}
        <div className="flex-1 min-w-0 p-2">
          {RelatedDocumentsComponent && (
            <div className="flex items-center gap-3 px-3 pb-3">
              <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-24" style={{ letterSpacing: '0.04em' }}>
                {ui('docs')}
              </span>
              <div className="flex-1">
                <RelatedDocumentsComponent
                  recordId={recordId}
                  data={data}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                  api={api}
                  layout="chips"
                />
              </div>
            </div>
          )}

          {notesField && (
            <div
              className={`flex items-start gap-3 px-3 ${RelatedDocumentsComponent ? 'mt-3 pt-3 border-t border-border/40' : ''}`}
              style={RelatedDocumentsComponent ? { borderTopWidth: '0.5px' } : undefined}
            >
              <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-24 pt-1.5" style={{ letterSpacing: '0.04em' }}>
                {ui('notes')}
              </span>
              <div className="flex-1">
                {notesFocused ? (
                  <textarea
                    value={data?.[notesField] || ''}
                    onChange={(e) => onFieldChange?.(notesField, e.target.value)}
                    onBlur={() => setNotesFocused?.(false)}
                    placeholder={ui('addNoteHint')}
                    rows={2}
                    autoFocus
                    className="w-full text-xs bg-white border border-border/40 rounded px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                    style={{ borderWidth: '0.5px' }}
                  />
                ) : (
                  <div
                    tabIndex={0}
                    role="textbox"
                    onClick={() => setNotesFocused?.(true)}
                    onFocus={() => setNotesFocused?.(true)}
                    className="w-full text-xs px-2.5 py-1.5 cursor-text min-h-[1.5rem] text-foreground/80 border border-transparent rounded hover:border-border/30 transition-colors"
                  >
                    {data?.[notesField] || <span className="text-muted-foreground/40">{ui('addNoteHint')}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optional extra component under Notes — e.g. Sales Invoice's
              SifDataTabs. Rendered as a React component with standard
              data/recordId/token props. */}
          {NotesExtraComponent && (
            <div className="px-3 pt-3 mt-3 border-t border-border/40" style={{ borderTopWidth: '0.5px' }}>
              <NotesExtraComponent
                data={data}
                recordId={recordId}
                token={token}
                apiBaseUrl={apiBaseUrl}
                api={api}
              />
            </div>
          )}
        </div>

        {showTotals && (
          <>
            <div className="border-l border-border/50" style={{ borderLeftWidth: '0.5px' }} />

            {/* Right column: Totals — fixed 420px wide / 241px tall to keep the
                same footprint whether the "Descuento total" row is collapsed or
                expanded. */}
            <div className="w-[520px] shrink-0 p-2 flex flex-col justify-start" style={{ height: 241, minHeight: 241, maxHeight: 241 }}>
              <DocumentTotalsPanel
                lines={lines ?? []}
                pendingLine={pendingLine ?? null}
                editingLine={editingLine ?? null}
                lineConfig={lineConfig}
                formatAmount={fmt}
                currency={currency}
                readOnly={isReadOnly}
                totalDiscountPct={Number(data?.[totalsField] ?? totalDiscountPct ?? 0)}
                onTotalDiscountChange={onTotalDiscountChange}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
