import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FileCheck, Link2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { DistinctValuesFilter } from '@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx';
import { DataTable } from '@/components/contract-ui';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { RefreshButton } from '@/components/contract-ui/RefreshButton.jsx';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { useClientSort } from '@/hooks/useClientSort';
import { showBulkActionToast } from '@/hooks/useBulkActionToast';

// ETP-5022: this page carried its own buildHeaders copy; header policy now has one home.
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCopyPageLink } from '@/hooks/useCopyLinkAction.js';
import {
  translateBackendError,
  extractBackendMessageKeys,
  extractBackendMessageParams,
} from '@/lib/backendErrors.js';
import { AccessDeniedMessage } from '@/components/access/ProcessAccessGuard.jsx';
import {
  STATUS_DEFS,
  ERROR_TOKENS,
  ALL_ERRORS_TOKEN,
  hasAllErrors,
  applyStatusSelection,
  statusDefForKey,
  statusDefForToken,
  defaultFilters,
  isDefaultFilters,
  parseFilters,
  serializeFilters,
  buildRowsQuery,
} from './notPostedDocumentsFilters';
import { NotPostedRowActions } from './NotPostedRowActions';

/**
 * ETP-5075 — document-type codes whose Etendo GO window was renamed, mapped to our own
 * i18n key so the filter and the rows read the same name the user sees in the menu.
 *
 * The backend (`NotPostedDocumentsHandler#refListDocumentTypes`) labels each option from
 * core's own `AD_REF_LIST_TRL` translation, which is shared with Etendo Classic — `MI`
 * translates to "Facturas cuadradas" there, while this window ships as "Relación
 * albarán-factura". Overriding here keeps the fix in the presentation layer: no core AD
 * data is touched, so Classic is unaffected, and the strings stay in the locale files
 * where every other user-visible string lives (`docs/i18n-guide.md`).
 *
 * Same pattern `windows/custom/calendar/PeriodsExpandablePanel.jsx` already uses for
 * document *categories* (its `MXI: 'calendarDocCategoryMatchInvoice'` entry).
 *
 * Add an entry only when a GO window's name genuinely diverges from core's translation —
 * anything absent here keeps the backend's label untouched.
 */
const DOC_TYPE_LABEL_KEYS = {
  MI: 'docTypeMatchedInvoices',
};

/**
 * A document-type code's display name: our deliberate rename first, then the backend's
 * translated filter-option label. ETP-5591: rows carry the same code (`documentTypeCode`), so
 * the filter and the rows resolve names through this one function. A row whose code is
 * missing keeps the datasource's raw label, as before.
 */
function docTypeLabel(code, ui, documentTypeLabels) {
  const key = DOC_TYPE_LABEL_KEYS[code];
  if (key) return ui(key);
  return documentTypeLabels.get(code) ?? null;
}

function rowDocTypeLabel(row, ui, documentTypeLabels) {
  return (row.documentTypeCode && docTypeLabel(row.documentTypeCode, ui, documentTypeLabels))
    || row.documentType;
}

// Same chrome as ListView's own link button, which these toolbar icons sit next to.
const ICON_BUTTON_CLASS = 'h-10 w-10 flex items-center justify-center rounded-lg border border-border text-[#828FA3] hover:text-foreground transition-colors';

export default function NotPostedDocumentsPage({ token, apiBaseUrl }) {
  const ui = useUI();
  const navigate = useNavigate();
  // apiBaseUrl already points to the spec (e.g. .../swebsf/not-posted-documents)
  const apiFetch = useApiFetch(apiBaseUrl);

  // ── Filter options (fetched once) ────────────────────────────────────────────
  const [documentTypeOptions, setDocumentTypeOptions] = useState([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const documentTypeLabels = useMemo(
    () => new Map(documentTypeOptions.map((o) => [o.value, o.label])),
    [documentTypeOptions],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch('/header?_mode=filter-options', { token, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setDocumentTypeOptions(j.documentTypes ?? []);
        setOptionsLoaded(true);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [apiFetch, token]);

  // ── Filters: kept in the URL (Share copies it; Back restores it) ─────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-parse only when the query changes
  const parsedFilters = useMemo(() => parseFilters(searchParams), [searchKey]);
  // A document type the tenant does not offer (a stale or hand-edited link) is dropped once the
  // options are known; before that it is kept, so a valid link is never cleared while loading.
  const filters = useMemo(
    () => (optionsLoaded && parsedFilters.document && !documentTypeLabels.has(parsedFilters.document)
      ? { ...parsedFilters, document: null }
      : parsedFilters),
    [parsedFilters, optionsLoaded, documentTypeLabels],
  );
  const filtersAreDefault = isDefaultFilters(filters);
  const rowsQuery = useMemo(() => buildRowsQuery(filters), [filters]);

  const updateFilters = useCallback((patch) => {
    setSearchParams(serializeFilters({ ...filters, ...patch }), { replace: true });
  }, [filters, setSearchParams]);
  const resetFilters = useCallback(() => {
    setSearchParams(serializeFilters(defaultFilters()), { replace: true });
  }, [setSearchParams]);

  // Keep the URL canonical: unknown statuses, a malformed date or a dropped document type are
  // rewritten away, so the toolbar, the request and what "Share" copies always agree (ETP-5591 QA).
  useEffect(() => {
    const canonical = serializeFilters(filters).toString();
    if (canonical !== searchKey) setSearchParams(canonical, { replace: true });
  }, [filters, searchKey, setSearchParams]);

  // ── Document rows ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // ETP-5485 (BUG-2) — the backend answered 403: this role cannot use the page at all. The
  // route guard (`index.jsx`) normally stops such a role before mounting; this covers the
  // cases it can't see (access map unreachable, a grant revoked mid-session).
  const [accessDenied, setAccessDenied] = useState(false);
  const fetchAbortRef = useRef(null);

  const fetchRows = useCallback(async (query) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`/header?${query}`, { token, signal: ctrl.signal });
      const json = await res.json().catch(() => null);
      if (fetchAbortRef.current !== ctrl) return;
      if (!res.ok) {
        if (res.status === 403) {
          setAccessDenied(true);
          return;
        }
        // Keep only the raw backend message here; `loadErrorText()` translates it at render
        // time (never the raw text nor the HTTP status text — i18n policy).
        setLoadError({ rawMessage: json?.message ?? null });
        setRows([]);
        return;
      }
      setRows(json?.rows ?? []);
    } catch (e) {
      if (e.name !== 'AbortError' && fetchAbortRef.current === ctrl) {
        setLoadError({ rawMessage: null });
        setRows([]);
      }
    } finally {
      if (fetchAbortRef.current === ctrl) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [apiFetch, token]);

  // Reads the query through a ref: a post that finishes after the user changed the filters must
  // reload what the toolbar shows now, not the filters captured when the post started (ETP-5591 QA).
  const rowsQueryRef = useRef(rowsQuery);
  rowsQueryRef.current = rowsQuery;
  const reload = useCallback(() => fetchRows(rowsQueryRef.current), [fetchRows]);

  // Abort an in-flight rows request when the page unmounts.
  useEffect(() => () => fetchAbortRef.current?.abort(), []);

  // ── Selection (owned by DataTable; we mirror it and send it resets) ──────────
  const [selectedRows, setSelectedRows] = useState([]);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  const [deselect, setDeselect] = useState({ trigger: 0, ids: [] });
  const clearSelection = useCallback(() => {
    setSelectedRows([]);
    setClearSelectionTrigger((n) => n + 1);
  }, []);

  // No "Buscar" button: every filter change refetches right away (ETP-5591). The previous
  // request is aborted inside `fetchRows`, so quick clicks never race.
  useEffect(() => {
    fetchRows(rowsQuery);
    clearSelection();
  }, [fetchRows, rowsQuery, clearSelection]);

  // Display fields precomputed on each row, so sorting orders what the user sees (the
  // translated type and status), not the raw label or key. `id` is what DataTable keys
  // selection and test ids on.
  const displayRows = useMemo(() => rows.map((row) => {
    const statusDef = statusDefForKey(row.accountingStatus);
    return {
      ...row,
      id: row.documentId,
      documentTypeLabel: rowDocTypeLabel(row, ui, documentTypeLabels),
      accountingStatusLabel: statusDef ? ui(statusDef.labelKey) : '',
      statusVariant: statusDef?.variant ?? null,
    };
  }), [rows, ui, documentTypeLabels]);

  const {
    sorted, sortKey, sortDirection, toggleSort, selectSort, clearSort, isDefaultSort,
  } = useClientSort(displayRows);

  const columns = useMemo(() => [
    {
      key: 'documentTypeLabel',
      label: ui('documentType'),
      type: 'string',
      render: (row) => <span className="font-semibold text-foreground">{row.documentTypeLabel}</span>,
    },
    {
      key: 'accountingStatusLabel',
      label: ui('statusLabel'),
      type: 'string',
      render: (row) => (row.statusVariant
        ? (
          <span data-testid={`npd-status-${row.documentId}`}>
            <Tag variant={row.statusVariant} label={row.accountingStatusLabel} data-testid="Tag__npdrow" />
          </span>
        )
        : null),
    },
    { key: 'description', label: ui('description'), type: 'string' },
    // `dot: false` — the date cell's due-date dot (red when past) means nothing for an
    // accounting date.
    { key: 'accountingDate', label: ui('accountingDate'), type: 'date', dot: false },
    { key: 'organization', label: ui('organization'), type: 'string' },
  ], [ui]);

  // ── Posting ───────────────────────────────────────────────────────────────────
  const [posting, setPosting] = useState(() => new Set());
  const [bulkPosting, setBulkPosting] = useState(false);

  async function postRow(row) {
    if (!row.tableId) {
      toast.error(ui('postingFailed'));
      return;
    }
    setPosting((p) => new Set(p).add(row.documentId));
    try {
      const res = await apiFetch(
        `/header/${encodeURIComponent(row.documentId)}/action/post`,
        {
          method: 'POST',
          token,
          // ETP-5424 — posting runs the accounting engine synchronously; opt out of the
          // default timeout so a slow post is not reported as failed while it commits.
          timeout: 0,
          body: JSON.stringify({ tableId: row.tableId, recordId: row.documentId }),
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success === true) {
        toast.success(`${row.description ?? row.documentId} — ${ui('documentPosted')}`);
        setDeselect((d) => ({ trigger: d.trigger + 1, ids: [row.documentId] }));
        setSelectedRows((sel) => sel.filter((r) => r.id !== row.documentId));
        reload();
      } else {
        // Only a real backend message is translated; the HTTP status text ("Forbidden") and a
        // 403 body never reach the user (ETP-5485 review M1).
        const rawMessage = res.status === 403 ? null : json?.message;
        // ETP-5175 — the identity lets the Invalid-Account failure render in the UI locale, the
        // same sentence the document windows show.
        toast.error(rawMessage
          ? translateBackendError(rawMessage, ui, {
            messageKeys: extractBackendMessageKeys(json),
            messageParams: extractBackendMessageParams(json),
          })
          : ui('postingFailed'));
      }
    } catch {
      toast.error(ui('postingFailed'));
    } finally {
      setPosting((p) => { const n = new Set(p); n.delete(row.documentId); return n; });
    }
  }

  async function postSelected() {
    const postable = selectedRows.filter((r) => r.tableId);
    // A row without a table cannot be posted. It is never sent, so the outcome toast counts it
    // as omitted (ETP-5209's bucket for rows not sent to the API) rather than dropping it silently.
    const omitted = selectedRows.filter((r) => !r.tableId);
    if (!postable.length) {
      toast.error(ui('postingFailed'));
      return;
    }
    setBulkPosting(true);
    try {
      const res = await apiFetch(
        '/header/0/action/bulk-post',
        {
          method: 'POST',
          token,
          // ETP-5424 — bulk post: same opt-out as the single post above.
          timeout: 0,
          body: JSON.stringify({
            rows: postable.map((r) => ({ tableId: r.tableId, recordId: r.documentId, label: r.description })),
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        toast.error(ui('postingFailed'));
        return;
      }
      // Same outcome toast every other list's bulk "Contabilizar" shows. A single failed row
      // surfaces its real backend error; more than one gets the generic count summary.
      const failed = (json.results ?? [])
        .filter((r) => r.success !== true)
        .map((r) => ({
          message: r.message,
          messageKeys: extractBackendMessageKeys(r),
          messageParams: extractBackendMessageParams(r),
        }));
      showBulkActionToast(ui, { ok: json.ok ?? 0, omitted, failed });
      clearSelection();
      reload();
    } catch {
      toast.error(ui('postingFailed'));
    } finally {
      setBulkPosting(false);
    }
  }

  // ── Share: the page URL already carries the filters ──────────────────────────
  // Same hook as ListView's toolbar Share (ETP-5593).
  const copyPageLink = useCopyPageLink();

  useSetPageMeta({
    title: ui('notPostedDocuments'),
    breadcrumb: `${ui('finance')} / ${ui('notPostedDocuments')}`,
    // No count on the access-denied screen — a "0 registros" there reads as "no data".
    recordCount: accessDenied ? undefined : rows.length,
  }, [rows.length, accessDenied]);

  // ETP-5485 (BUG-2) — a known backend message translates; anything else shows the generic
  // translated load error, so no raw backend/HTTP text ever reaches the user.
  function loadErrorText() {
    const rawMessage = loadError?.rawMessage;
    const translated = rawMessage ? translateBackendError(rawMessage, ui) : null;
    return translated && translated !== rawMessage ? translated : ui('documentsLoadError');
  }

  // ── Filter controls ───────────────────────────────────────────────────────────
  const documentCodes = useMemo(
    () => documentTypeOptions
      .map((o) => o.value)
      .sort((a, b) => (docTypeLabel(a, ui, documentTypeLabels) ?? a)
        .localeCompare(docTypeLabel(b, ui, documentTypeLabels) ?? b)),
    [documentTypeOptions, documentTypeLabels, ui],
  );
  // "Todos los errores" sits first, before the individual statuses. It is a shortcut, not a
  // status: ticked exactly when every error status is, and never written to the URL.
  const statusCodes = useMemo(() => [ALL_ERRORS_TOKEN, ...STATUS_DEFS.map((def) => def.token)], []);
  const allErrorsSelected = hasAllErrors(filters.statuses);
  const statusValue = allErrorsSelected ? [ALL_ERRORS_TOKEN, ...filters.statuses] : filters.statuses;
  const statusLabel = useCallback(
    (token) => (token === ALL_ERRORS_TOKEN ? ui('allErrors') : ui(statusDefForToken(token).labelKey)),
    [ui],
  );
  const statusTriggerLabel = () => (allErrorsSelected && filters.statuses.length === ERROR_TOKENS.length
    ? ui('allErrors')
    : ui('statusesCount', { count: filters.statuses.length }));

  function emptyState() {
    if (loadError) return { title: loadErrorText(), testId: 'npd-load-error' };
    if (!filtersAreDefault) {
      return {
        title: ui('notPostedEmptyFilteredTitle'),
        description: ui('notPostedEmptyFilteredDescription'),
        action: (
          <Button type="button" onClick={resetFilters} data-testid="npd-empty-reset-filters">
            {ui('resetFilters')}
          </Button>
        ),
        testId: 'npd-empty-filtered',
      };
    }
    return { title: ui('notPostedEmptyNoneTitle'), testId: 'npd-empty-none' };
  }

  if (accessDenied) return <AccessDeniedMessage data-testid="AccessDeniedMessage__b28bb1" />;

  return (
    <div
      className="flex-1 flex flex-col bg-card rounded-tl-2xl overflow-hidden min-h-0"
      data-testid="npd-page">
      <div className="flex flex-wrap items-center gap-2 p-2" data-testid="npd-toolbar">
        <DistinctValuesFilter
          value={filters.document}
          onChange={(code) => updateFilters({ document: code })}
          codes={documentCodes}
          labelFor={(code) => docTypeLabel(code, ui, documentTypeLabels) ?? code}
          allLabel={ui('allDocuments')}
          heading={ui('documentType')}
          searchPlaceholder={ui('searchValues')}
          triggerTestId="npd-filter-document-type"
          data-testid="DistinctValuesFilter__npddoc" />
        <DistinctValuesFilter
          multiple
          value={statusValue}
          onChange={(next) => updateFilters({ statuses: applyStatusSelection(filters.statuses, next) })}
          codes={statusCodes}
          labelFor={statusLabel}
          renderLabel={(token) => (token === ALL_ERRORS_TOKEN
            ? statusLabel(token) // plain text, same weight as the "Todos los estados" row
            : (
              <Tag
                variant={statusDefForToken(token).variant}
                label={statusLabel(token)}
                data-testid="Tag__npdstatus" />
            ))}
          allLabel={ui('allStatuses')}
          multipleLabel={statusTriggerLabel}
          heading={ui('statusLabel')}
          searchable={false}
          searchPlaceholder={ui('searchValues')}
          triggerTestId="npd-filter-accounting-status"
          data-testid="DistinctValuesFilter__npdstatus" />
        {/* DateRangePopover takes no test id of its own; the wrapper carries it. */}
        <span className="inline-flex" data-testid="npd-filter-date-range">
          <DateRangePopover
            value={filters.date}
            onChange={(date) => updateFilters({ date })}
            placeholder={ui('dateRangeAnyTime')}
            data-testid="DateRangePopover__npd" />
        </span>
        {!filtersAreDefault && (
          <Button type="button" variant="outline" onClick={resetFilters} className="h-10 px-3 rounded-lg bg-card text-sm leading-6 font-medium text-[#121217]" data-testid="npd-reset-filters">
            {ui('resetFilters')}
          </Button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={copyPageLink}
          title={ui('copyLink')}
          aria-label={ui('copyLink')}
          className={ICON_BUTTON_CLASS}
          data-testid="npd-share">
          <Link2 className="h-5 w-5" data-testid="Link2__npd" />
        </button>
        <ListSortPopover
          columns={columns}
          sortColumn={sortKey}
          sortDirection={sortDirection}
          onSelect={selectSort}
          onClear={clearSort}
          isDefaultSort={isDefaultSort}
          data-testid="ListSortPopover__npd" />
        <RefreshButton onRefresh={reload} label={ui('refresh')} data-testid="RefreshButton__npd" />
      </div>
      {/* Refetches keep the current rows on screen under a progress bar; only the very first
          load shows the table's own skeleton. */}
      {loading && loaded ? (
        <ListProgressBar testId="npd-progress-bar" data-testid="ListProgressBar__npd" />
      ) : null}
      {/* Same scroll box AccountsHeaderTable gives its DataTable: the table owns both axes, so
          the sticky hover-actions cell stays pinned to the right edge. */}
      <div className="flex-1 min-w-0 overflow-auto" data-testid="npd-table-scroll">
        <DataTable
          columns={columns}
          data={sorted}
          loading={loading && !loaded}
          showFooterTotals={false}
          selectable
          onSelectionChange={setSelectedRows}
          clearSelectionTrigger={clearSelectionTrigger}
          deselectTrigger={deselect.trigger}
          deselectRowIds={deselect.ids}
          sortColumn={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          emptyState={emptyState()}
          rowQuickActions={{
            enabled: true,
            // Fits both Spanish links ("Abrir documento" + "Contabilizar" ≈ 241px) so the pill
            // never spills over the Organización column.
            reservedWidthPx: 260,
            render: (row) => (
              <NotPostedRowActions
                row={row}
                posting={posting.has(row.documentId)}
                disabled={bulkPosting}
                onPost={postRow}
                onOpen={(path) => navigate(path)}
                data-testid="NotPostedRowActions__npd" />
            ),
          }}
          data-testid="npd-table" />
      </div>
      <SelectionToolbar
        visible={selectedRows.length > 0}
        onClose={clearSelection}
        closeTitle={ui('close')}
        data-testid="npd-selection-toolbar">
        <span role="status" className="text-sm font-medium" data-testid="npd-selection-count">
          {ui('selected', { count: selectedRows.length })}
        </span>
        <button
          type="button"
          disabled={bulkPosting}
          onClick={postSelected}
          className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: 'hsl(var(--floating-toolbar-fg))' }}
          data-testid="npd-post-selected">
          <FileCheck className="h-3.5 w-3.5" data-testid="FileCheck__npd" />
          {ui('post')}
        </button>
      </SelectionToolbar>
    </div>
  );
}
