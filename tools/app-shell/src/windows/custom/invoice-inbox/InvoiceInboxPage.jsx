import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMenuLabel, useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { Button } from '@/components/ui/button';
import { DEFAULT_FILTER, isProcessingRow, STATUS, workCount } from './invoiceInboxFilters.js';
import { fetchRowsByIdChunked } from './invoiceInboxApi.js';
import { selectionWarnings, validateInboxSelection } from './invoiceInboxUploadPolicy.js';
import { useInvoiceInboxList } from './useInvoiceInboxList.js';
import { ITEM_REJECTED, ITEM_UNCONFIRMED, useInvoiceInboxUpload } from './useInvoiceInboxUpload.js';
import { useInvoiceInboxUploadResult, useUploadLogKey } from './useInvoiceInboxUploadResult.js';
import { discardToast, useInvoiceInboxDiscard } from './useInvoiceInboxDiscard.js';
import { useProcessingRowsPoll } from './useProcessingRowsPoll.js';
import { useInboxFileDrop } from './useInboxFileDrop.js';
import InvoiceInboxDropZone, { InvoiceInboxFileInput } from './InvoiceInboxDropZone.jsx';
import InvoiceInboxDragOverlay from './InvoiceInboxDragOverlay.jsx';
import InvoiceInboxUploadTray from './InvoiceInboxUploadTray.jsx';
import InvoiceInboxUploadResult from './InvoiceInboxUploadResult.jsx';
import InvoiceInboxToolbar from './InvoiceInboxToolbar.jsx';
import InvoiceInboxTable from './InvoiceInboxTable.jsx';
import InvoiceInboxSelectionBar from './InvoiceInboxSelectionBar.jsx';
import InvoiceInboxDiscardDialog from './InvoiceInboxDiscardDialog.jsx';

/** Menu key of the window (`menu.json` label), also the favorites name. */
export const INVOICE_INBOX_MENU_LABEL = 'Invoice Inbox';
/** The `menu.json` group the item lives in (Compras), first level of the breadcrumb. */
const PARENT_MENU_GROUP = 'Purchases';
const FAVORITE_KEY = 'invoice-inbox';
/** Accepted uploads arrive in bursts: one list refresh for the burst, not one per file. */
const REFRESH_AFTER_UPLOAD_MS = 500;

/** TopBar title, breadcrumb, the "needs work" counter next to the title, and favorites. */
function useInboxPageMeta(counts) {
  const tMenu = useMenuLabel();
  const { toggleFavorite, isFavorite } = useFavorites();
  const title = tMenu(INVOICE_INBOX_MENU_LABEL);
  // "Compras / Bandeja de facturas", like the other Purchases windows.
  const breadcrumb = `${tMenu(PARENT_MENU_GROUP)} / ${title}`;
  const favorite = isFavorite(FAVORITE_KEY);
  const recordCount = workCount(counts) ?? undefined;
  useSetPageMeta({
    title,
    breadcrumb,
    recordCount,
    onAddToFavorites: () => toggleFavorite(FAVORITE_KEY, INVOICE_INBOX_MENU_LABEL),
    isFavorite: favorite,
  }, [favorite, recordCount]);
}

/**
 * Re-reads the PROCESSING rows on screen until the background reader finishes them, and the
 * documents of "Resultado de tus cargas" still being read. ONE poller for both: the result panel
 * does not poll, it receives the same answer (`mergeRows`), as the list does (`replaceRows`).
 * Reads in chunks of 50 ids (URL length).
 */
function useInboxPolling(apiFetch, list, resetKey, uploadResult) {
  const pendingKey = uploadResult.summary.pendingIds.join(',');
  const ids = useMemo(() => {
    const processing = list.rows.filter(isProcessingRow).map((row) => row.id);
    const pending = pendingKey ? pendingKey.split(',') : [];
    return [...new Set([...processing, ...pending])];
  }, [list.rows, pendingKey]);
  const { replaceRows, reloadCounts } = list;
  const { mergeRows } = uploadResult;
  const poll = useCallback(async (requested) => {
    const fresh = await fetchRowsByIdChunked(apiFetch, requested);
    replaceRows(fresh);
    mergeRows(requested, fresh);
    const changed = fresh.length < requested.length || fresh.some((row) => row.status !== STATUS.PROCESSING);
    if (changed) reloadCounts();
    return changed;
  }, [apiFetch, replaceRows, reloadCounts, mergeRows]);
  useProcessingRowsPoll({ ids, poll, resetKey });
}

/**
 * Upload lines to show: all while sending; once delivery is over, only the ones the result panel
 * cannot show (refused, and unconfirmed, whose document id never arrived).
 */
function visibleTrayItems(upload) {
  if (!upload.finished) return upload.items;
  return upload.items.filter((item) => item.status === ITEM_REJECTED || item.status === ITEM_UNCONFIRMED);
}

/** Validates a selection, warns about what is refused and queues the rest. */
function useInboxFileIntake(enqueue, ui) {
  return useCallback((files) => {
    const result = validateInboxSelection(files);
    for (const warning of selectionWarnings(result)) {
      toast.error(ui(warning.key, warning.params));
    }
    if (result.accepted.length) enqueue(result.accepted);
  }, [enqueue, ui]);
}

/** Shows the outcome of a discard batch. `reasonText` is already translated (a network error). */
function showDiscardToast(result, ui) {
  if (!result.total) return;
  const { tone, key, params, reason } = discardToast(result);
  const reasonParam = reason ? { reason: reason.reasonText ?? ui(reason.reasonKey) } : {};
  // `tone` is a sonner method name: success, warning or error.
  toast[tone](ui(key, { ...params, ...reasonParam }));
}

/**
 * The discard flow: which rows the confirmation is open for (the selection, or one row from its
 * hover trash), the batch, its toast, then `onDone` (clear the selection, reload list + counters).
 * The dialog stays open while the batch runs; an answer after leaving the page does nothing.
 */
function useInboxDiscardFlow({ apiFetch, ui, mountedRef, onDone }) {
  const { discard, running } = useInvoiceInboxDiscard(apiFetch);
  const [targets, setTargets] = useState(null);
  const close = useCallback(() => setTargets(null), []);
  const confirm = useCallback(async () => {
    const result = await discard(targets ?? []);
    if (!result || !mountedRef.current) return;
    showDiscardToast(result, ui);
    setTargets(null);
    onDone();
  }, [discard, targets, ui, mountedRef, onDone]);
  return { targets, open: setTargets, close, confirm, running };
}

function emptyStateFor({ loadError, filterKey, counts, ui, onRetry }) {
  if (loadError) {
    return {
      title: ui('invoiceInboxLoadError'),
      action: <Button type="button" variant="outline" onClick={onRetry} data-testid="invoice-inbox-retry">{ui('retry')}</Button>,
      testId: 'invoice-inbox-load-error',
    };
  }
  if (filterKey === DEFAULT_FILTER && counts?.all === 0 && counts?.discarded === 0) {
    return { title: ui('invoiceInboxFirstUseTitle'), description: ui('invoiceInboxFirstUseHint'), testId: 'invoice-inbox-empty' };
  }
  return { title: ui('invoiceInboxEmptyTitle'), description: ui('invoiceInboxEmptyHint'), testId: 'invoice-inbox-empty' };
}

/**
 * ETP-6049 — Invoice Inbox ("Bandeja de facturas"): upload supplier invoices (drop or pick, one
 * request per file) and follow them in a list filtered by status, with counters. Rows still being
 * read show placeholders and refresh themselves. Discard works from the batch bar and from each
 * row's hover trash, through one confirmation dialog. Opening a document (ETP-6050) and Confirm
 * (ETP-6051) are not part of this story: a row click does nothing, the row's edit and kebab are
 * inert and the bar's Confirm is disabled.
 *
 * Guide: docs/generated-custom-windows/invoice-inbox.md.
 */
export default function InvoiceInboxPage({ apiBaseUrl }) {
  const ui = useUI();
  // apiBaseUrl points to the spec (`/sws/neo/invoice-inbox`): list `/header`, upload `/upload`.
  const apiFetch = useApiFetch(apiBaseUrl);
  const [filterKey, setFilterKey] = useState(DEFAULT_FILTER);
  const logKey = useUploadLogKey();
  const uploadResult = useInvoiceInboxUploadResult(apiFetch, logKey);
  const list = useInvoiceInboxList(apiFetch, filterKey);
  const [pollResetKey, setPollResetKey] = useState(0);
  useInboxPageMeta(list.counts);

  // ── Selection (owned by DataTable; mirrored here, cleared on a filter change) ──
  const [selectedRows, setSelectedRows] = useState([]);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  const clearSelection = useCallback(() => {
    setSelectedRows([]);
    setClearSelectionTrigger((n) => n + 1);
  }, []);
  const onSelectionChange = useCallback((selected) => setSelectedRows(selected), []);
  const changeFilter = useCallback((key) => {
    setFilterKey(key);
    clearSelection();
    // New tab, new PROCESSING rows: restart the polling backoff and its give-up clock.
    setPollResetKey((n) => n + 1);
  }, [clearSelection]);

  const { reload } = list;
  const { retry: reloadUploadResult } = uploadResult;
  const refresh = useCallback(() => {
    reload();
    reloadUploadResult();
    setPollResetKey((n) => n + 1);
  }, [reload, reloadUploadResult]);

  // ── Upload ──
  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(refreshTimerRef.current);
    };
  }, []);
  // An upload answered after leaving the page must not re-arm the refresh.
  const onAccepted = useCallback(() => {
    if (!mountedRef.current) return;
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refresh, REFRESH_AFTER_UPLOAD_MS);
  }, [refresh]);
  // `reasonText` is already translated (a network error); only `reasonKey` goes through ui().
  const onStopped = useCallback(
    ({ reasonKey, reasonText }) => toast.error(reasonText ?? ui(reasonKey)),
    [ui],
  );
  const upload = useInvoiceInboxUpload(apiFetch, { onAccepted, onStopped, logKey });
  useInboxPolling(apiFetch, list, pollResetKey, uploadResult);
  const handleFiles = useInboxFileIntake(upload.enqueue, ui);
  const fileInputRef = useRef(null);
  const openPicker = useCallback(() => fileInputRef.current?.click(), []);
  const { dragging, dropProps } = useInboxFileDrop(handleFiles);

  // ── Discard (batch bar and row trash) ──
  const afterDiscard = useCallback(() => {
    clearSelection();
    refresh();
  }, [clearSelection, refresh]);
  const discardFlow = useInboxDiscardFlow({ apiFetch, ui, mountedRef, onDone: afterDiscard });
  const openDiscard = discardFlow.open;
  const discardSelected = useCallback(() => openDiscard(selectedRows), [openDiscard, selectedRows]);
  const discardRow = useCallback((row) => openDiscard([row]), [openDiscard]);

  const emptyState = emptyStateFor({ loadError: list.loadError, filterKey, counts: list.counts, ui, onRetry: refresh });

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-card"
      {...dropProps}
      data-testid="invoice-inbox-page"
    >
      <InvoiceInboxFileInput
        ref={fileInputRef}
        onFiles={handleFiles}
        data-testid="InvoiceInboxFileInput__3ab259" />
      <div className="flex flex-col gap-2 p-2">
        <InvoiceInboxDropZone onPick={openPicker} data-testid="InvoiceInboxDropZone__3ab259" />
        <InvoiceInboxUploadTray
          items={visibleTrayItems(upload)}
          done={upload.done}
          total={upload.total}
          finished={upload.finished}
          pending={upload.pending}
          onClose={upload.clear}
          data-testid="InvoiceInboxUploadTray__3ab259" />
        {/* The result panel replaces the tray once delivery is over. */}
        {upload.pending === 0 && (
          <InvoiceInboxUploadResult
            result={uploadResult}
            data-testid="InvoiceInboxUploadResult__3ab259" />
        )}
        <InvoiceInboxToolbar
          filterKey={filterKey}
          onFilterChange={changeFilter}
          counts={list.counts}
          onRefresh={refresh}
          onPick={openPicker}
          data-testid="InvoiceInboxToolbar__3ab259" />
      </div>
      {list.loading && list.loaded ? <ListProgressBar testId="invoice-inbox-progress-bar" data-testid="ListProgressBar__3ab259" /> : null}
      <div className="min-w-0 flex-1 overflow-auto px-2 pb-24" data-testid="invoice-inbox-table-scroll">
        <InvoiceInboxTable
          rows={list.rows}
          loading={list.loading && !list.loaded}
          emptyState={emptyState}
          ui={ui}
          onSelectionChange={onSelectionChange}
          clearSelectionTrigger={clearSelectionTrigger}
          onDiscardRow={discardRow}
          data-testid="InvoiceInboxTable__3ab259" />
        {list.hasMore && (
          <div className="flex justify-center py-4">
            <Button
              type="button"
              variant="outline"
              disabled={list.loading}
              onClick={list.loadMore}
              data-testid="invoice-inbox-load-more"
            >
              {ui('invoiceInboxLoadMore')}
            </Button>
          </div>
        )}
      </div>
      <InvoiceInboxSelectionBar
        count={selectedRows.length}
        onClear={clearSelection}
        onDiscard={discardSelected}
        discarding={discardFlow.running}
        data-testid="InvoiceInboxSelectionBar__3ab259" />
      <InvoiceInboxDiscardDialog
        open={discardFlow.targets !== null}
        count={discardFlow.targets?.length ?? 0}
        running={discardFlow.running}
        onConfirm={discardFlow.confirm}
        onClose={discardFlow.close}
        data-testid="InvoiceInboxDiscardDialog__3ab259" />
      <InvoiceInboxDragOverlay visible={dragging} data-testid="InvoiceInboxDragOverlay__3ab259" />
    </div>
  );
}
