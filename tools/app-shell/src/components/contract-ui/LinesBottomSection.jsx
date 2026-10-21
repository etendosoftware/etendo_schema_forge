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

// Totals column width. 520px whenever the footer has room (the left column keeps
// at least LEFT_MIN_PX); only when the footer area itself is narrow (e.g. a window
// with a 320px side panel) it gives space back to Docs/Notes, down to a 320px floor.
// `%` resolves against the footer row, so this follows the real available width,
// not the viewport (ETP-5756).
//
// Invariant: Totals must give space back BEFORE the Docs/Notes rows wrap. LEFT_MIN_PX
// is the left-column width at which a row (label + content) still fits unwrapped,
// derived from the real box math: left column p-2 (16) + divider border-l (1) +
// row px-3 (24) + label w-24 (96) + gap-x-3 (12) + FOOTER_CONTENT_MIN_PX (320) = 469.
const TOTALS_FULL_PX = 520;
const TOTALS_MIN_PX = 320;
const FOOTER_CONTENT_MIN_PX = 320;
const LEFT_MIN_PX = 16 + 1 + 24 + 96 + 12 + FOOTER_CONTENT_MIN_PX;
export const TOTALS_COLUMN_WIDTH = `min(${TOTALS_FULL_PX}px, max(${TOTALS_MIN_PX}px, calc(100% - ${LEFT_MIN_PX}px)))`;

// Content beside a footer label: takes the remaining row, but drops under its
// label (flex-wrap on the row) instead of being squeezed below 20rem (320px).
const FOOTER_CONTENT_CLASS = 'flex-1 min-w-[20rem]';

/**
 * Shared bottom-section layout for documents using the inline-editable lines
 * layout (Sales Quotation, Sales Invoice, Sales Order, etc.). Renders the
 * standardized 2-column footer:
 *
 *   - Left:  Docs (window-specific `RelatedDocuments` component, passed in via
 *            `relatedDocuments` prop) + optional Notes textarea.
 *   - Right: `DocumentTotalsPanel` with the shared 520px width (shrinks to 320px
 *            only when the footer area is narrow, see TOTALS_COLUMN_WIDTH) and a
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
  isDocumentReadOnly,
  // ETP-5205: DetailView's `windowReadOnly` (static decisions.json api.window.readOnly OR
  // the runtime Solo-Lectura tier), used ONLY for the Notes field below. Notes are
  // documented to stay editable even on a completed document and even on a brand-new
  // record — unlike `isReadOnly` below (documentStatus !== 'DR' || isDocumentReadOnly),
  // which is the correct, unchanged rule for the total-discount field: that one IS meant
  // to lock once the document leaves Draft.
  windowReadOnly,
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
  const isReadOnly = data?.documentStatus !== 'DR' || isDocumentReadOnly;

  // ETP-4777 — the backend-persisted header total (maintained by the
  // C_ORDERLINE_TRG2/C_INVOICELINE_TRG2 triggers, same value the Grid's
  // "Imp. Total" column and the printed document read) is the authoritative
  // source. DocumentTotalsPanel prefers this over its own recompute whenever
  // no line is actively pending/being edited. Only the two raw header fields
  // are passed down — DocumentTotalsPanel itself works out whether
  // summedLineAmount is already net-of-discount (it compares against a
  // fresh recompute from the current lines; documentStatus is NOT a
  // reliable signal here — verified live that an invoice created from an
  // already-discounted order has its discount line materialised immediately,
  // while still Draft). See DocumentTotalsPanel.jsx for the full rationale.
  const resolvedTotalDiscountPct = resolveTotalDiscountPct(data, lines, totalDiscountPct, totalsField);
  const persistedNetSubtotal = data?.summedLineAmount ?? data?.totalLines ?? null;
  const persistedTotals = data?.grandTotalAmount != null
    ? { grandTotal: data.grandTotalAmount, netSubtotal: persistedNetSubtotal }
    : null;

  return (
    <div className="flex flex-col">
      <div className="flex">
        {/* Left column: Docs + Notes — flex-1 absorbs whatever the Resumen
            column doesn't claim, so Docs+Notes stays wide on most screens. */}
        <div className="flex-1 min-w-0 p-2">
          {RelatedDocumentsComponent && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-3" data-testid="lines-bottom-docs-row">
              <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-24" style={{ letterSpacing: '0.04em' }}>
                {ui('docs')}
              </span>
              <div className={FOOTER_CONTENT_CLASS}>
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
              data-testid="lines-bottom-notes-row"
              className={`flex flex-wrap items-start gap-x-3 gap-y-1 px-3 ${RelatedDocumentsComponent ? 'mt-3 border-t border-border-subtle pt-3' : ''}`}
            >
              <span className="text-[11px] font-medium text-foreground uppercase shrink-0 w-24 pt-1.5" style={{ letterSpacing: '0.04em' }}>
                {ui('notes')}
              </span>
              <div className={FOOTER_CONTENT_CLASS} data-testid="notes-textarea">
                {notesFocused && !windowReadOnly ? (
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
                    onClick={() => !windowReadOnly && setNotesFocused?.(true)}
                    onFocus={() => !windowReadOnly && setNotesFocused?.(true)}
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
            <div className="mt-3 border-t border-border px-3 pt-3">
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
            <div className="border-l border-border" />

            {/* Right column: Totals — fixed 520px wide, with a soft
                minHeight: 200 floor so the panel keeps a stable visual rhythm
                but is free to grow with its content (e.g. when the discount
                row expands). The previous rigid pixel-height clamp acted as a
                floor on the whole bottom section and crushed the lines table
                on viewports near 1366×768. */}
            <div
              className="shrink-0 p-2 flex flex-col justify-start"
              style={{ width: TOTALS_COLUMN_WIDTH, minHeight: 200 }}
              data-testid="lines-bottom-totals-column">
              <DocumentTotalsPanel
                lines={lines ?? []}
                pendingLine={pendingLine ?? null}
                editingLine={editingLine ?? null}
                lineConfig={lineConfig}
                formatAmount={fmt}
                currency={currency}
                readOnly={isReadOnly}
                totalDiscountPct={resolvedTotalDiscountPct}
                onTotalDiscountChange={onTotalDiscountChange}
                persistedTotals={persistedTotals}
                data-testid="DocumentTotalsPanel__751847" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
