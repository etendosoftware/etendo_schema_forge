import { useState, useEffect } from 'react';

function getSelectedErrorType(rows) {
  if (!rows.length) return null;
  if (rows.every(r => r.verifactuSendingStatus === 'IN')) return 'IN';
  if (rows.every(r => r.verifactuSendingStatus === 'AE')) return 'AE';
  return 'mixed';
}
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusPill, NumFactura, ScrollSentinel, isErrorStatus, PAGE_SIZE, ExportIcon, useFmSelection, buildCsvAndDownload, fetchCsvAndDownload } from './FmPrimitives.jsx';
import {
  VF_SPEC,
  VF_ACEPTADAS_ENTITY,
  VF_PARCIAL_ENTITY,
  VF_RECHAZADAS_ENTITY,
  VF_INVALIDAS_ENTITY,
} from './useFiscalMonitor.js';

const FILTER_CORRECT  = 'correct';
const FILTER_PROBLEMS = 'problems';

const INVOICE_FK_FIELD = 'invoice';

const VF_CORRECT_EXPORT_COLS = [
  { label: 'Invoice No.',    get: r => r['invoice$documentNo'] ?? r['invoice$_identifier']?.split(/\s[–-]\s/)[0]?.trim() ?? r.invoice ?? '' },
  { label: 'Operation Type', get: r => r['typeOperation$_identifier'] ?? r.typeOperation ?? '' },
  { label: 'CSV',            get: r => r.cSV ?? '' },
  { label: 'Status',         get: r => mapVfStatus(r.verifactuSendingStatus ?? '') },
  { label: 'Error Code',     get: r => r.codeError ?? '' },
  { label: 'Error Reason',   get: r => r.errorReason ?? '' },
];

// Map raw DB status codes → StatusPill-compatible keys
const VF_STATUS_MAP = {
  AC: 'accepted',
  AE: 'partiallyAccepted',
  ER: 'rejected',
  IN: 'invalid',
};
const mapVfStatus = (raw) => VF_STATUS_MAP[raw] ?? raw;

// Extract human-readable invoice number from a row.
// NEO includes $documentNo / $_identifier companion fields for FK columns.
function parseInvoiceNo(row) {
  return (
    row['invoice$documentNo'] ??
    row['invoice$_identifier']?.split(/\s[–-]\s/)[0]?.trim() ??
    row[INVOICE_FK_FIELD] ??
    '—'
  );
}

// Extract human-readable operation type label (falls back to raw code).
function parseTypeLabel(row) {
  return row['typeOperation$_identifier'] ?? row.typeOperation ?? '—';
}

async function fetchCorrect(apiFetch, orgId, page) {
  const params = new URLSearchParams({
    _org:      orgId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  const res = await apiFetch(`/${VF_SPEC}/${encodeURIComponent(VF_ACEPTADAS_ENTITY)}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

async function fetchProblems(apiFetch, orgId) {
  const base = { _org: orgId };
  const [partial, rejected, invalid] = await Promise.all([
    apiFetch(`/${VF_SPEC}/${encodeURIComponent(VF_PARCIAL_ENTITY)}?${new URLSearchParams(base)}`).then(r => r.json()),
    apiFetch(`/${VF_SPEC}/${encodeURIComponent(VF_RECHAZADAS_ENTITY)}?${new URLSearchParams(base)}`).then(r => r.json()),
    apiFetch(`/${VF_SPEC}/${encodeURIComponent(VF_INVALIDAS_ENTITY)}?${new URLSearchParams(base)}`).then(r => r.json()),
  ]);
  const data  = [
    ...(partial?.response?.data  ?? []),
    ...(rejected?.response?.data ?? []),
    ...(invalid?.response?.data  ?? []),
  ];
  const totalRows =
    (partial?.response?.totalRows  ?? 0) +
    (rejected?.response?.totalRows ?? 0) +
    (invalid?.response?.totalRows  ?? 0);
  return { data, totalRows };
}

export default function VerifactuMonitorSection({
  orgId, apiBaseUrl, initialTab = 'correct', mockRows, onTabChange,
  refreshKey = 0, onInvoiceOpen, onBpClick, onVfErrorClick, onVfResolveClick,
  kpis,
  noWrap,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [activeTab, setActiveTab] = useState(FILTER_CORRECT);
  const [page, setPage]           = useState(1);
  const [rows, setRows]           = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const { selectedIds, setSelectedIds, allSelected, someSelected, handleToggleAll, handleToggleRow } = useFmSelection(rows);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // Accept legacy 'accepted' key for backward compat
    setActiveTab(initialTab === 'accepted' ? FILTER_CORRECT : (initialTab ?? FILTER_CORRECT));
  }, [initialTab]);

  useEffect(() => {
    if (mockRows) {
      const filtered = activeTab === FILTER_PROBLEMS
        ? mockRows.filter(r => mapVfStatus(r.verifactuSendingStatus) !== 'accepted')
        : mockRows.filter(r => mapVfStatus(r.verifactuSendingStatus) === 'accepted');
      setRows(filtered);
      setTotalRows(filtered.length);
      setLoading(false);
      setError(null);
      return;
    }
    if (!orgId) return;
    setLoading(true);
    setError(null);
    const fetcher = activeTab === FILTER_PROBLEMS
      ? fetchProblems(apiFetch, orgId)
      : fetchCorrect(apiFetch, orgId, page);
    fetcher
      .then(({ data, totalRows }) => {
        // Problems tab loads all at once; correct tab accumulates on scroll
        setRows(prev => (activeTab === FILTER_PROBLEMS || page === 1) ? data : [...prev, ...data]);
        setTotalRows(totalRows);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId, activeTab, page, apiFetch, mockRows, refreshKey]);

  // Reset to first page, rows and selection when tab changes
  useEffect(() => { setPage(1); setRows([]); setSelectedIds(new Set()); }, [activeTab, setSelectedIds]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      if (activeTab === FILTER_CORRECT) {
        await fetchCsvAndDownload(
          apiFetch,
          `/${VF_SPEC}/${encodeURIComponent(VF_ACEPTADAS_ENTITY)}`,
          { _org: orgId },
          'verifactu_correct',
          VF_CORRECT_EXPORT_COLS,
        );
      } else {
        // Problems tab loads all rows at once (no pagination) — client-side export is complete
        buildCsvAndDownload('verifactu_problems', [
          { label: 'Invoice No.',    get: r => parseInvoiceNo(r) },
          { label: 'Operation Type', get: r => parseTypeLabel(r) },
          { label: 'CSV',            get: r => r.cSV ?? '' },
          { label: 'Status',         get: r => mapVfStatus(r.verifactuSendingStatus ?? '') },
          { label: 'Error Code',     get: r => r.codeError ?? '' },
          { label: 'Error Reason',   get: r => r.errorReason ?? '' },
        ], rows);
      }
    } finally {
      setExporting(false);
    }
  }

  const selectedErrorRows = rows.filter(r =>
    selectedIds.has(r.id) && isErrorStatus(mapVfStatus(r.verifactuSendingStatus))
  );
  const selectedErrorType = getSelectedErrorType(selectedErrorRows);
  const canResolve = selectedErrorRows.length > 0 && selectedErrorType !== 'mixed';

  const vfKpis         = kpis?.verifactu ?? {};
  const countCorrect   = vfKpis.accepted ?? 0;
  const countProblems  = (vfKpis.partiallyAccepted ?? 0) + (vfKpis.rejected ?? 0) + (vfKpis.invalid ?? 0);

  const pills = [
    { key: FILTER_CORRECT,  labelKey: 'fiscalMonitor.verifactu.pill.correct',   count: countCorrect },
    { key: FILTER_PROBLEMS, labelKey: 'fiscalMonitor.verifactu.pill.problems',  count: countProblems },
  ];

  const inner = (
    <>
      <div className="fm-filter-bar">
        <div className="fm-filter-pills" data-testid="fm-tabs">
          {pills.map(({ key, labelKey, count }) => (
            <button
              key={key}
              className={`fm-filter-pill${activeTab === key ? ' active' : ''}`}
              onClick={() => { setActiveTab(key); onTabChange?.(key); }}
            >
              {ui(labelKey)}
              {count > 0 && <span className="pill-count">{count}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="fm-export-btn" onClick={handleExport} disabled={loading || exporting}>
            <ExportIcon data-testid="ExportIcon__8c1785" /> {ui('fiscalMonitor.export')}
          </button>
          {selectedErrorRows.length > 0 && (
            <button
              className="fm-export-btn fm-export-btn--primary"
              onClick={() => onVfResolveClick?.(selectedErrorRows)}
              disabled={!canResolve}
              title={!canResolve ? ui('vfSolveError.mixedTypes') : undefined}
            >
              {ui('vfSolveError.resolveBtn')}{selectedErrorRows.length > 1 ? ` (${selectedErrorRows.length})` : ''}
            </button>
          )}
        </div>
      </div>

      {loading && page === 1 && (
        <div className="fm-table-loading">
          {[1,2,3,4,5].map(i => <div key={i} className="fm-skeleton" style={{ height: 36, borderRadius: 4 }} />)}
        </div>
      )}
      {error && (
        <div style={{ padding: '20px 16px', color: 'var(--fm-danger-fg)', fontSize: 13 }}>{error}</div>
      )}
      {!loading && !error && (
        <>
          <table className="fm-table" data-testid="fm-data-table">
            <thead>
              <tr>
                <th><Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleToggleAll}
                  data-testid="Checkbox__8c1785" /></th>
                <th>{ui('fiscalMonitor.col.invoiceNumber')}</th>
                <th>{ui('fiscalMonitor.col.operationType')}</th>
                <th>{ui('fiscalMonitor.col.csv')}</th>
                <th>{ui('fiscalMonitor.col.status')}</th>
                <th>{ui('fiscalMonitor.col.errorReason')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--fm-fg-3)' }}> {/* 6 cols: checkbox + 5 data */}
                    {ui('fiscalMonitor.empty')}
                  </td>
                </tr>
              ) : rows.map((row, i) => {
                const invoiceNo    = parseInvoiceNo(row);
                const typeLabel    = parseTypeLabel(row);
                const mappedStatus = mapVfStatus(row.verifactuSendingStatus ?? activeTab);
                return (
                  <tr key={row.id ?? i}>
                    <td><Checkbox
                      checked={selectedIds.has(row.id)}
                      onChange={() => handleToggleRow(row.id)}
                      data-testid="Checkbox__8c1785" /></td>
                    <td className="num-factura">
                      <NumFactura
                        n={invoiceNo}
                        onOpen={() => onInvoiceOpen?.(row[INVOICE_FK_FIELD], 'sales-invoice')}
                        data-testid="NumFactura__8c1785" />
                    </td>
                    <td>{typeLabel}</td>
                    <td className="mono">{row.cSV ?? '—'}</td>
                    <td>
                      <StatusPill
                        estado={mappedStatus}
                        onClick={isErrorStatus(mappedStatus)
                          ? () => onVfErrorClick?.(row)
                          : undefined}
                        data-testid="StatusPill__8c1785" />
                    </td>
                    <td style={{ color: row.errorReason ? 'var(--fm-danger-fg)' : 'var(--fm-fg-3)', fontSize: 12, maxWidth: 280 }}>
                      {row.codeError ? `[${row.codeError}] ` : ''}{row.errorReason ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ScrollSentinel
            hasMore={rows.length < totalRows}
            loading={loading}
            onVisible={() => setPage(p => p + 1)}
            data-testid="ScrollSentinel__8c1785" />
        </>
      )}
    </>
  );

  if (noWrap) return inner;

  return (
    <section className="fm-section">
      <div className="fm-tablecard" data-testid="verifactu-tablecard">{inner}</div>
    </section>
  );
}
