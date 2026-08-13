import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusPill, NumFactura, ScrollSentinel, isErrorStatus, isPendingStatus, fmtDate, PAGE_SIZE, ExportIcon, useFmSelection, fetchCsvAndDownload } from './FmPrimitives.jsx';
import { TBAI_SPEC, TBAI_ENTITY } from './useFiscalMonitor.js';

const STATUS_FIELD = 'estado';

const FILTER_ALL      = 'all';
const FILTER_SENT     = 'sent';
const FILTER_REJECTED = 'rejected';

const TBAI_EXPORT_COLS = [
  { label: 'Date',        get: r => { const inv = parseIdentifier(r); return r.invoiceDate ?? inv.date ?? ''; } },
  { label: 'Invoice No.', get: r => parseIdentifier(r).docNo },
  { label: 'Description', get: r => r['invoice$description'] ?? r.descripcion ?? '' },
  { label: 'Signature',   get: r => r.estado === 'Recibido' ? 'Yes' : 'No' },
  { label: 'Status',      get: r => r.estado ?? '' },
];

function parseIdentifier(row) {
  const raw = row['invoice$_identifier'] ?? row.invoiceIdentifier ?? null;
  if (!raw) return { docNo: row.invoice ?? '—', date: '—' };
  const parts = raw.split(/ [–-] /);
  return { docNo: parts[0]?.trim() || raw, date: parts[1]?.trim() || '—' };
}

async function fetchTbaiList(apiFetch, orgId, page, filterKey) {
  const params = new URLSearchParams({
    organization: orgId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  if (filterKey === FILTER_SENT) {
    params.set('criteria', JSON.stringify([{ fieldName: STATUS_FIELD, operator: 'equals', value: 'Recibido' }]));
  } else if (filterKey === FILTER_REJECTED) {
    params.set('criteria', JSON.stringify([{ fieldName: STATUS_FIELD, operator: 'inSet', value: ['Rechazado', 'Error'] }]));
  }
  const res = await apiFetch(`/${TBAI_SPEC}/${encodeURIComponent(TBAI_ENTITY)}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
function mapInitialFilter(initialFilter) {
  if (initialFilter === 'Recibido') return FILTER_SENT;
  if (initialFilter === 'Rechazado' || initialFilter === 'Error') return FILTER_REJECTED;
  return FILTER_ALL;
}

export default function TbaiMonitorSection({
  orgId, apiBaseUrl, initialFilter = 'all', mockRows, onFilterChange,
  refreshKey = 0, onInvoiceOpen, onBpClick, onErrorClick,
  kpis,
  noWrap,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [filter, setFilter]       = useState(FILTER_ALL);
  const [page, setPage]           = useState(1);
  const [rows, setRows]           = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const { selectedIds, setSelectedIds, allSelected, someSelected, handleToggleAll, handleToggleRow } = useFmSelection(rows);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setFilter(mapInitialFilter(initialFilter)); }, [initialFilter]);

  useEffect(() => {
    if (mockRows) {
      let filtered;
      if (filter === FILTER_SENT) {
        filtered = mockRows.filter(r => r.estado === 'Recibido');
      } else if (filter === FILTER_REJECTED) {
        filtered = mockRows.filter(r => r.estado === 'Rechazado' || r.estado === 'Error');
      } else {
        filtered = mockRows;
      }
      setRows(filtered);
      setTotalRows(filtered.length);
      setLoading(false);
      setError(null);
      return;
    }
    if (!orgId) return;
    setLoading(true);
    setError(null);
    fetchTbaiList(apiFetch, orgId, page, filter)
      .then(({ data, totalRows }) => {
        setRows(prev => page === 1 ? data : [...prev, ...data]);
        setTotalRows(totalRows);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId, filter, page, apiFetch, mockRows, refreshKey]);

  // Reset to first page, rows and selection when filter changes
  useEffect(() => { setPage(1); setRows([]); setSelectedIds(new Set()); }, [filter, setSelectedIds]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = { organization: orgId };
      if (filter === FILTER_SENT) {
        params.criteria = JSON.stringify([{ fieldName: 'estado', operator: 'equals', value: 'Recibido' }]);
      } else if (filter === FILTER_REJECTED) {
        params.criteria = JSON.stringify([{ fieldName: 'estado', operator: 'inSet', value: ['Rechazado', 'Error'] }]);
      }
      await fetchCsvAndDownload(
        apiFetch,
        `/${TBAI_SPEC}/${encodeURIComponent(TBAI_ENTITY)}`,
        params,
        `tbai_${filter}`,
        TBAI_EXPORT_COLS,
      );
    } finally {
      setExporting(false);
    }
  }

  const tbaiKpis      = kpis?.tbai ?? {};
  const countAll      = tbaiKpis.total    ?? 0;
  const countSent     = tbaiKpis.received ?? 0;
  const countRejected = (tbaiKpis.rejected ?? 0) + (tbaiKpis.error ?? 0);

  const pills = [
    // "Todas" only in standalone mode (not inside SII+TBAI combined view)
    ...(!noWrap ? [{ key: FILTER_ALL, labelKey: 'fiscalMonitor.tbai.tab.all', count: countAll }] : []),
    { key: FILTER_SENT,     labelKey: 'fiscalMonitor.tbai.pill.sent',       count: countSent },
    { key: FILTER_REJECTED, labelKey: 'fiscalMonitor.tbai.pill.rejected',   count: countRejected },
  ];

  const inner = (
    <>
      <div className="fm-filter-bar">
        <div className="fm-filter-pills">
          {pills.map(({ key, labelKey, count }) => (
            <button
              key={key}
              className={`fm-filter-pill${filter === key ? ' active' : ''}`}
              onClick={() => { setFilter(key); onFilterChange?.(key); }}
            >
              {ui(labelKey)}
              {count > 0 && <span className="pill-count">{count}</span>}
            </button>
          ))}
        </div>
        <button className="fm-export-btn" onClick={handleExport} disabled={loading || exporting}>
          <ExportIcon data-testid="ExportIcon__dd7710" /> {ui('fiscalMonitor.export')}
        </button>
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
                  data-testid="Checkbox__dd7710" /></th>
                <th className="sortable sorted">{ui('fiscalMonitor.col.date')}</th>
                <th>{ui('fiscalMonitor.col.invoiceNumber')}</th>
                <th>{ui('fiscalMonitor.col.description')}</th>
                <th>{ui('fiscalMonitor.col.signature')}</th>
                <th>{ui('fiscalMonitor.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--fm-fg-3)' }}>
                    {ui('fiscalMonitor.empty')}
                  </td>
                </tr>
              ) : rows.map((row, i) => {
                const inv = parseIdentifier(row);
                const isSigned = row.estado === 'Recibido';
                let pillClick;
                if (isErrorStatus(row.estado)) {
                  // Always clickable on error — even if businessPartner is null
                  pillClick = onErrorClick
                    ? () => onErrorClick(row.businessPartner ?? null, null, row.estado)
                    : () => onBpClick?.(row.businessPartner);
                } else if (isPendingStatus(row.estado) && row.invoice) {
                  pillClick = () => onInvoiceOpen?.(row.invoice, 'sales-invoice');
                }
                return (
                  <tr key={row.id ?? i}>
                    <td><Checkbox
                      checked={selectedIds.has(row.id)}
                      onChange={() => handleToggleRow(row.id)}
                      data-testid="Checkbox__dd7710" /></td>
                    <td>{fmtDate(row.invoiceDate ?? inv.date)}</td>
                    <td className="num-factura">
                      <NumFactura
                        n={inv.docNo}
                        onOpen={() => onInvoiceOpen?.(row.invoice, 'sales-invoice')}
                        data-testid="NumFactura__dd7710" />
                    </td>
                    <td>{row['invoice$description'] ?? row.descripcion ?? '—'}</td>
                    <td>
                      {isSigned ? (
                        <span style={{ color: 'var(--fm-success-fg)', display: 'inline-flex', alignItems: 'center' }}>
                          <CheckIcon data-testid="CheckIcon__dd7710" />
                        </span>
                      ) : (
                        <span style={{ color: 'var(--fm-fg-4)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <StatusPill
                        estado={row.estado}
                        onClick={pillClick}
                        title={isPendingStatus(row.estado) ? ui('fiscalMonitor.openInvoice') : undefined}
                        data-testid="StatusPill__dd7710" />
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
            data-testid="ScrollSentinel__dd7710" />
        </>
      )}
    </>
  );

  if (noWrap) return inner;

  return (
    <section className="fm-section">
      <div className="fm-tablecard" data-testid="tbai-tablecard">{inner}</div>
    </section>
  );
}
