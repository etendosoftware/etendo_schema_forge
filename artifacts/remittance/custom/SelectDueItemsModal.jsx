import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import InvoicePickerModal from '@/components/contract-ui/InvoicePickerModal.jsx';
import {
  DUE_ITEMS_PAGE_SIZE,
  FIRST_PAGE,
  dueItemsErrorMessage,
  fetchDueItemsPage,
  selectDueItems,
} from './remittanceDueItemsApi.js';

const SEARCH_DEBOUNCE_MS = 300;

const isAlreadyInRemittance = (row) => row?.alreadyInRemittance === true;
const dueDateOf = (row) => row?.dueDate;
const outstandingOf = (row) => row?.outstandingAmount;

/**
 * ETP-6148 — «Seleccionar desde factura»: picks the invoice due items (one row per installment)
 * to add to a remittance as lines. The server owns the set (search and paging through the
 * `availableDueItems` action); rows already in this remittance arrive with
 * `alreadyInRemittance: true` and show checked and disabled. Confirming calls `selectDueItems`,
 * toasts the count and hands control back through `onSuccess` so the caller refreshes the lines
 * and the header.
 *
 * Reuses the shared `InvoicePickerModal` (multi-select, server-driven search, infinite scroll)
 * through its row accessors instead of a second picker.
 */
export default function SelectDueItemsModal({ remittanceId, apiBaseUrl, onClose, onSuccess }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const handleApply = async (ids) => {
    if (submitting) return;
    if (!ids.length) {
      onClose?.();
      return;
    }
    setSubmitting(true);
    try {
      const { created } = await selectDueItems(apiFetch, remittanceId, ids);
      toast.success(ui('remittanceDueItemsAdded', { count: created }));
      onSuccess?.(created);
    } catch (err) {
      toast.error(dueItemsErrorMessage(err.body, ui, 'remittanceDueItemsAddError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <InvoicePickerModal
      invoices={rows}
      loading={loading}
      multiple
      selectAll
      onApply={handleApply}
      onClose={onClose}
      search={search}
      onSearchChange={setSearch}
      onReachBottom={handleReachBottom}
      loadingMore={loadingMore}
      getRowDate={dueDateOf}
      getRowAmount={outstandingOf}
      isRowLocked={isAlreadyInRemittance}
      idPrefix="remittance-due-items"
      titleKey="remittanceSelectDueItemsTitle"
      searchPlaceholderKey="remittanceSearchDueItems"
      emptyKey="remittanceNoDueItems"
      selectedCountKey="remittanceDueItemsSelectedCount"
      applyKey="remittanceAddDueItems"
      data-testid="InvoicePickerModal__remittance" />
  );
}
