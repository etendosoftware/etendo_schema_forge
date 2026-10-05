import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';

/**
 * Where "Open document" goes for each document-type code (ETP-5591). Page-local on purpose:
 * it is this window's knowledge, not a generic rule. It needs the CODE, not the table:
 * `C_Invoice` and `M_InOut` each back several windows.
 *
 * Every target's record id is the posting table's primary key, which is the row's
 * `documentId`, so the standard record route `/{spec}/{id}` opens it.
 *
 * Transactions (`T`) have no window of their own; they open their financial account, whose
 * id the backend adds to those rows. Any other code (or a row without one) gets no
 * "Open document" action, never a broken link.
 */
const OPEN_DOCUMENT_SPECS = {
  SI: 'sales-invoice',
  PI: 'purchase-invoice',
  GS: 'goods-shipment',
  GR: 'goods-receipt',
  RMR: 'return-material-receipt',
  RVS: 'return-to-vendor-shipment',
  INV: 'physical-inventory',
  M: 'goods-movements',
  MI: 'matched-purchase-invoices',
  IC: 'internal-consumption',
  GLJ: 'simple-g-l-journal',
  A: 'amortization',
};

/** The in-app path that opens a row's source document, or `null` when there is none. */
export function openDocumentPath(row) {
  if (row.documentTypeCode === 'T') {
    return row.financialAccountId
      ? `/financial-account/${encodeURIComponent(row.financialAccountId)}`
      : null;
  }
  const spec = OPEN_DOCUMENT_SPECS[row.documentTypeCode];
  return spec && row.documentId ? `/${spec}/${encodeURIComponent(row.documentId)}` : null;
}

/**
 * The row's hover actions: "Open document" and "Contabilizar", as text links inside
 * DataTable's shared quick-actions cell.
 *
 * Clicks stop propagating so they never reach the row itself. The pill uses the same
 * hover-reveal chrome as the canonical `RowQuickActions` (hidden until the row is hovered or
 * a link is focused); a custom `render` gets none of it from DataTable for free.
 */
export function NotPostedRowActions({ row, posting, disabled, onPost, onOpen }) {
  const ui = useUI();
  const path = openDocumentPath(row);
  const stop = (handler) => (event) => {
    event.stopPropagation();
    handler();
  };

  return (
    <div
      className="absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center gap-1 px-3 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
      data-testid={`npd-row-actions-${row.documentId}`}>
      {path && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="text-foreground"
          onClick={stop(() => onOpen(path))}
          data-testid={`npd-open-row-${row.documentId}`}>
          {ui('openDocument')}
        </Button>
      )}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="text-foreground"
        disabled={posting || disabled}
        aria-busy={posting || undefined}
        onClick={stop(() => onPost(row))}
        data-testid={`npd-post-row-${row.documentId}`}>
        {ui('post')}
      </Button>
    </div>
  );
}
