import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLocaleSwitch, useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { DocumentPickerModal } from '@/components/contract-ui/DocumentPickerModal.jsx';
import { RecordLink } from '@/components/contract-ui/RecordLink.jsx';
import { resolveColumnLink } from '@/components/contract-ui/fkNavigation.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import {
  DUE_ITEMS_PAGE_SIZE,
  FIRST_PAGE,
  dueItemsErrorMessage,
  fetchDueItemsPage,
  syncDueItems,
} from './remittanceDueItemsApi.js';

const SEARCH_DEBOUNCE_MS = 300;

// The invoice behind a due opens in its own window, picked by the invoice's sales flag — the same
// `link` declaration the lines' Factura column uses (decisions.json invoiceDocumentNo.link).
const INVOICE_LINK = {
  idField: 'invoiceId',
  window: { field: 'salesTransaction', values: { true: 'sales-invoice', false: 'purchase-invoice' } },
};

const DUE_STATUS = {
  OVERDUE: { key: 'remittanceDueStatusOverdue', className: 'text-destructive' },
  DUE_TODAY: { key: 'remittanceDueStatusDueToday', className: 'text-[hsl(var(--status-warning-fg))]' },
  PENDING: { key: 'remittanceDueStatusPending', className: 'text-muted-foreground' },
};

const isIncluded = (row) => row?.alreadyInRemittance === true;
const rowId = (row) => row.id;
const initialAmount = (row) => (isIncluded(row) ? row.lineAmount : row.outstandingAmount);
const AMOUNT = {
  labelKey: 'remittanceColToRemit',
  getMax: (row) => row.outstandingAmount,
  getReset: (row) => row.outstandingAmount,
  getCurrency: (row) => row.currency,
};

// The invoice number only, with its ↗ link (user decision: no document type line under it).
function DocumentCell({ row, close }) {
  const to = resolveColumnLink(INVOICE_LINK, row);
  return to
    ? <RecordLink to={to} onNavigate={close} data-testid={`remittance-due-item-link-${row.id}`}>{row.documentNo}</RecordLink>
    : <span className="block truncate">{row.documentNo}</span>;
}

function DueDateCell({ row, locale, ui }) {
  const status = DUE_STATUS[row.dueStatus];
  return (
    <div className="flex flex-col">
      <span>{formatCalendarDate(row.dueDate, locale)}</span>
      {status && <span className={`text-xs ${status.className}`} data-testid={`remittance-due-status-${row.id}`}>{ui(status.key)}</span>}
    </div>
  );
}

function buildColumns(ui, locale) {
  return [
    { key: 'document', labelKey: 'invoice', render: (row, { close }) => <DocumentCell row={row} close={close} data-testid="DocumentCell__remittance" /> },
    { key: 'invoiceDate', labelKey: 'remittanceColInvoiceDate', width: 104, render: (row) => formatCalendarDate(row.invoiceDate, locale) },
    { key: 'dueDate', labelKey: 'remittanceColDueDate', width: 112, render: (row) => <DueDateCell row={row} locale={locale} ui={ui} data-testid="DueDateCell__remittance" /> },
    { key: 'businessPartner', labelKey: 'remittanceColPartner', render: (row) => <span className="block truncate">{row.businessPartner}</span> },
    { key: 'grandTotalAmount', labelKey: 'remittanceColTotal', width: 112, align: 'right', render: (row) => formatCurrency(row.currency, row.grandTotalAmount) },
    { key: 'outstandingAmount', labelKey: 'remittanceColOutstanding', width: 112, align: 'right', render: (row) => formatCurrency(row.currency, row.outstandingAmount) },
  ];
}

/**
 * ETP-6148 — «Seleccionar desde factura», round 3: the generic DocumentPickerModal over the
 * remittance's due items (one row per installment), Holded's «Añade los documentos».
 *
 * The server owns the list (search and paging through the `availableDueItems` action). Dues
 * already in this remittance come back flagged `alreadyInRemittance` and open checked with their
 * current line amount; the others start at their outstanding. Each picked due carries an «A
 * remesar» amount, capped at its outstanding. Confirming sends the difference in ONE
 * `syncDueItems` call (new and changed dues in `items`, unchecked included dues in `remove`),
 * toasts what changed and hands control back through `onSuccess` so the caller refreshes.
 */
export default function SelectDueItemsModal({ remittanceId, apiBaseUrl, subtitle, onClose, onSuccess }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);
  const rowsRef = useRef([]);

  const load = useCallback(async (query, pageIndex) => {
    const requestId = ++requestRef.current;
    const first = pageIndex === FIRST_PAGE;
    if (first) setLoading(true); else setLoadingMore(true);
    try {
      const { items, total } = await fetchDueItemsPage(apiFetch, remittanceId, {
        search: query, page: pageIndex, pageSize: DUE_ITEMS_PAGE_SIZE,
      });
      // A newer search superseded this response: drop it.
      if (requestId !== requestRef.current) return;
      const next = first ? items : [...rowsRef.current, ...items];
      rowsRef.current = next;
      setRows(next);
      setHasMore(total == null ? items.length === DUE_ITEMS_PAGE_SIZE : next.length < total);
      setPage(pageIndex);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      toast.error(dueItemsErrorMessage(err.body, ui, 'remittanceDueItemsLoadError'));
      if (first) { rowsRef.current = []; setRows([]); }
      setHasMore(false);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [apiFetch, remittanceId, ui]);

  // First page on open, then again (debounced) whenever the search text changes.
  useEffect(() => {
    const timer = setTimeout(() => load(search, FIRST_PAGE), search ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const handleReachBottom = () => {
    if (loading || loadingMore || !hasMore) return;
    load(search, page + 1);
  };

  const handleConfirm = async ({ add, update, remove }) => {
    const items = [...add, ...update].map(({ id, amount }) => ({ id, amount: Number(amount) }));
    try {
      const result = await syncDueItems(apiFetch, remittanceId, { items, remove });
      toast.success(ui('remittanceDueItemsSynced', result));
      onSuccess?.(result);
    } catch (err) {
      toast.error(dueItemsErrorMessage(err.body, ui, 'remittanceDueItemsSyncError'));
    }
  };

  return (
    <DocumentPickerModal
      titleKey="remittanceSelectDueItemsTitle"
      subtitle={subtitle}
      searchPlaceholderKey="remittanceSearchDueItems"
      emptyKey="remittanceNoDueItems"
      noticeTitleKey="remittanceDueItemsNoticeTitle"
      noticeBodyKey="remittanceDueItemsNoticeBody"
      confirmKey="remittanceDueItemsConfirm"
      footerKey="remittanceDueItemsFooter"
      rows={rows}
      loading={loading}
      loadingMore={loadingMore}
      search={search}
      onSearchChange={setSearch}
      onReachBottom={handleReachBottom}
      getRowId={rowId}
      isCommitted={isIncluded}
      getInitialAmount={initialAmount}
      columns={buildColumns(ui, locale)}
      amount={AMOUNT}
      currency={rows.find((row) => row?.currency)?.currency}
      onConfirm={handleConfirm}
      onClose={onClose}
      data-testid="DocumentPickerModal__remittance" />
  );
}
