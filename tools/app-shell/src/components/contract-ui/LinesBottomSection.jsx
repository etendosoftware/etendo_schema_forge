import { useUI } from '@/i18n';
import { resolveTotalDiscountPct } from '@/lib/documentTotals';
import { formatCurrency } from '@/lib/formatCurrency.js';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';

// `DocumentTotalsPanel`/`BalanceFooterPanel` call their `formatAmount` prop as
// (value, currency) — keep that signature here and delegate to the shared
// formatCurrency(currencyCode, value) util, whose argument order is reversed.
function fmt(val, curr) {
  return formatCurrency(curr, val);
}

/**
 * Shared bottom-section layout for documents using the inline-editable lines
 * layout (Sales Quotation, Sales Invoice, Sales Order, etc.). Renders the
 * standardized 2-column footer:
 *
 *   - Left:  Docs (window-specific `RelatedDocuments` component, passed in via
 *            `relatedDocuments` prop) + optional Notes textarea.
 *   - Right: `DocumentTotalsPanel` with the shared 520px fixed width and a
 *            soft `minHeight: 200` floor so the panel keeps a stable visual
 *            rhythm but is free to grow with its content. The previous rigid
 *            pixel-height clamp acted as a floor on the whole bottom section
 *            and crushed the lines table on viewports near 1366×768.
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
  onNotesSave,
  docsRefreshSignal,
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
                  docsRefreshSignal={docsRefreshSignal}
                  data-testid="RelatedDocumentsComponent__751847" />
              </div>
            </div>
          )}

          {notesField && (
            <div
              className={`flex items-start gap-3 px-3 ${RelatedDocumentsComponent ? 'mt-3 border-t border-border-subtle pt-3' : ''}`}
            >
              <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-24 pt-1.5" style={{ letterSpacing: '0.04em' }}>
                {ui('notes')}
              </span>
              <div className="flex-1" data-testid="notes-textarea">
                {notesFocused ? (
                  <textarea
                    value={data?.[notesField] || ''}
                    onChange={(e) => onFieldChange?.(notesField, e.target.value)}
                    onBlur={() => { onNotesSave?.(data?.[notesField]); setNotesFocused?.(false); }}
                    placeholder={ui('addNoteHint')}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded border border-border-control bg-card px-2.5 py-1.5 text-xs placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                ) : (
                  <div
                    tabIndex={0}
                    role="textbox"
                    onClick={() => setNotesFocused?.(true)}
                    onFocus={() => setNotesFocused?.(true)}
                    className="w-full min-h-[1.5rem] cursor-text rounded border border-transparent px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:border-border-subtle"
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
            <div className="mt-3 border-t border-border-structural px-3 pt-3">
              <NotesExtraComponent
                data={data}
                recordId={recordId}
                token={token}
                apiBaseUrl={apiBaseUrl}
                api={api}
                data-testid="NotesExtraComponent__751847" />
            </div>
          )}
        </div>

        {showTotals && (
          <>
            <div className="border-l border-border-structural" />

            {/* Right column: Totals — fixed 520px wide, with a soft
                minHeight: 200 floor so the panel keeps a stable visual rhythm
                but is free to grow with its content (e.g. when the discount
                row expands). The previous rigid pixel-height clamp acted as a
                floor on the whole bottom section and crushed the lines table
                on viewports near 1366×768. */}
            <div className="w-[520px] shrink-0 p-2 flex flex-col justify-start" style={{ minHeight: 200 }}>
              <DocumentTotalsPanel
                lines={lines ?? []}
                pendingLine={pendingLine ?? null}
                editingLine={editingLine ?? null}
                lineConfig={lineConfig}
                formatAmount={fmt}
                currency={currency}
                readOnly={isReadOnly}
                totalDiscountPct={resolveTotalDiscountPct(data, lines, totalDiscountPct, totalsField)}
                onTotalDiscountChange={onTotalDiscountChange}
                data-testid="DocumentTotalsPanel__751847" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
