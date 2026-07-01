import { useState, useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { formatAmount } from '@/lib/formatAmount.js';
import { FileUp, FileDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusPill, NumFactura, ScrollSentinel, isErrorStatus, isPendingStatus, fmtDate, PAGE_SIZE, ExportIcon, useFmSelection, fetchCsvAndDownload } from './FmPrimitives.jsx';
import {
  SII_SPEC,
  SII_EMITIDAS_ENTITY,
  SII_RECIBIDAS_ENTITY,
  SII_EMITIDAS_ANT_ENTITY,
  SII_RECIBIDAS_ANT_ENTITY,
} from './useFiscalMonitor.js';

// Reference list: SII invoice type keys → display names (from AD_Ref_List)
const SII_TIPO_NAMES = {
  F1: 'Factura',
  F2: 'Factura simplificada',
  F4: 'Asiento resumen facturas simplificadas',
  R:  'Factura rectificativa',
  F5: 'Importaciones (DUA)',
  F6: 'Justificantes contables',
  LC: 'Aduanas - Liquidación complementaria',
};
const siiTipoLabel = (raw) => raw ? (SII_TIPO_NAMES[raw] ?? raw) : '—';

const SUBTAB_ENTITIES = {
  issued:           SII_EMITIDAS_ENTITY,
  received:         SII_RECIBIDAS_ENTITY,
  issuedPrevious:   SII_EMITIDAS_ANT_ENTITY,
  receivedPrevious: SII_RECIBIDAS_ANT_ENTITY,
};

const SII_EXPORT_COLS = [
  { label: 'Date',             get: r => r.invoiceDate ?? '' },
  { label: 'Invoice No.',      get: r => r.documentNo ?? '' },
  { label: 'Business Partner', get: r => r['businessPartner$_identifier'] ?? r.businessPartnerIdentifier ?? r.businessPartner ?? '' },
  { label: 'Type',             get: r => siiTipoLabel(r.aeatsiiClaveTipo ?? r.aeatsiiClaveTipoFc) },
  { label: 'Total',            get: r => r.grandTotalAmount ?? '' },
  { label: 'Currency',         get: r => r['currency$_identifier'] ?? '' },
  { label: 'Status',           get: r => r.aeatsiiEstado ?? '' },
  { label: 'CSV',              get: r => r.cdigoCSV ?? '' },
  { label: 'Error Code',       get: r => r.aeatsiiErrorCode ?? '' },
  { label: 'Error',            get: r => r.aeatsiiErrorMsg ?? '' },
];

// Entities that hold the CSV code (aeatsii_facturas table)
const SUBTAB_SII_DATA_ENTITIES = {
  issued:           'issuedInvoicesSiiData',
  received:         'receivedInvoicesSiiData',
  issuedPrevious:   'issuedInvoices(previousPeriod)SiiData',
  receivedPrevious: 'receivedInvoices(previousPeriod)SiiData',
};

const INVOICE_FK_FIELD = 'aeatsiiInvoice';

const ChevDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

function resolveTabState(initialTab) {
  if (initialTab.includes('previous')) {
    return { tab: initialTab.startsWith('received') ? 'received' : 'issued', period: 'previous' };
  }
  return { tab: initialTab === 'received' ? 'received' : 'issued', period: 'current' };
}

function resolveEntityKey(tab, period) {
  if (tab === 'issued') return period === 'current' ? 'issued' : 'issuedPrevious';
  return period === 'current' ? 'received' : 'receivedPrevious';
}

async function fetchSubtab(apiFetch, entityKey, parentId, orgId, page) {
  const entity        = SUBTAB_ENTITIES[entityKey];
  const siiDataEntity = SUBTAB_SII_DATA_ENTITIES[entityKey];

  const params = new URLSearchParams({
    parentId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  const siiDataParams = new URLSearchParams({ organization: orgId, _startRow: '0', _endRow: '9999' });

  const [res, siiRes] = await Promise.all([
    apiFetch(`/${SII_SPEC}/${encodeURIComponent(entity)}?${params}`),
    apiFetch(`/${SII_SPEC}/${encodeURIComponent(siiDataEntity)}?${siiDataParams}`),
  ]);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  // Build invoice → cdigoCSV lookup from the SiiData entity
  const csvMap = {};
  if (siiRes.ok) {
    const siiJson = await siiRes.json();
    for (const r of (siiJson?.response?.data ?? [])) {
      if (r.invoice) csvMap[r.invoice] = r.cdigoCSV ?? null;
    }
  }

  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0, csvMap };
}

function SiiTableContent({
  ui, tab, period, rows, loading, error, totalRows, page, onLoadMore,
  onInvoiceOpen, onBpClick, csvMap = {},
  selectedIds, onToggleAll, onToggleRow,
}) {
  const allSelected  = rows.length > 0 && rows.every(r => selectedIds.has(r.id));
  const someSelected = rows.some(r => selectedIds.has(r.id)) && !allSelected;

  const partyHeader = tab === 'issued'
    ? ui('fiscalMonitor.sii.party.cliente')
    : ui('fiscalMonitor.sii.party.proveedor');

  if (loading && page === 1) {
    return (
      <div className="fm-table-loading">
        {[1,2,3,4,5].map(i => <div key={i} className="fm-skeleton" style={{ height: 36, borderRadius: 4 }} />)}
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: '20px 16px', color: 'var(--fm-danger-fg)', fontSize: 13 }}>{error}</div>;
  }
  return (
    <>
      <table className="fm-table" data-testid="fm-data-table">
        <thead>
          <tr>
            <th><Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleAll}
              data-testid="Checkbox__be1aa5" /></th>
            <th className="sortable sorted">{ui('fiscalMonitor.col.date')}</th>
            <th>{ui('fiscalMonitor.col.invoiceNumber')}</th>
            <th>{partyHeader}</th>
            <th>{ui('fiscalMonitor.col.type')}</th>
            <th className="num">{ui('fiscalMonitor.col.total')}</th>
            <th>{ui('fiscalMonitor.col.status')}</th>
            <th>{ui('fiscalMonitor.col.csv')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--fm-fg-3)' }}>
                {ui('fiscalMonitor.empty')}
              </td>
            </tr>
          ) : rows.map((row, i) => {
            const specHint = tab === 'issued' ? 'sales-invoice' : 'purchase-invoice';
            // For issuedInvoices the row IS C_Invoice, so row.id is the invoice ID.
            // row.aeatsiiInvoice (em_aeatsii_invoice_id) is a self-ref FK — same value but may
            // be absent if the entity omits it; fall back to row.id.
            const invoiceId = row.id ?? row[INVOICE_FK_FIELD];
            let pillClick;
            if (isErrorStatus(row.aeatsiiEstado) && row.businessPartner) {
              pillClick = () => onBpClick?.(row.businessPartner, invoiceId, specHint);
            } else if (isPendingStatus(row.aeatsiiEstado) && row[INVOICE_FK_FIELD]) {
              pillClick = () => onInvoiceOpen?.(row[INVOICE_FK_FIELD], specHint);
            }
            return (
              <tr key={row.id ?? i}>
                <td><Checkbox
                  checked={selectedIds.has(row.id)}
                  onChange={() => onToggleRow(row.id)}
                  data-testid="Checkbox__be1aa5" /></td>
                <td>{fmtDate(row.invoiceDate)}</td>
                <td className="num-factura">
                  <NumFactura
                    n={row.documentNo ?? row[INVOICE_FK_FIELD] ?? '—'}
                    onOpen={() => onInvoiceOpen?.(invoiceId, specHint)}
                    data-testid="NumFactura__be1aa5" />
                </td>
                <td>
                  {row['businessPartner$_identifier'] ?? row.businessPartnerIdentifier ?? row.businessPartner ?? '—'}
                </td>
                <td>{siiTipoLabel(row.aeatsiiClaveTipo ?? row.aeatsiiClaveTipoFc)}</td>
                <td className="num">{formatAmount(row.grandTotalAmount, row['currency$_identifier'])}</td>
                <td>
                  <StatusPill
                    estado={row.aeatsiiEstado}
                    onClick={pillClick}
                    title={isPendingStatus(row.aeatsiiEstado) ? ui('fiscalMonitor.openInvoice') : undefined}
                    data-testid="StatusPill__be1aa5" />
                  {row.aeatsiiErrorMsg && (
                    <div className="fm-err-text">
                      {row.aeatsiiErrorCode ? `[${row.aeatsiiErrorCode}] ` : ''}{row.aeatsiiErrorMsg}
                    </div>
                  )}
                </td>
                <td className="mono">{row.cdigoCSV ?? csvMap[row.id] ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ScrollSentinel
        hasMore={rows.length < totalRows}
        loading={loading}
        onVisible={onLoadMore}
        data-testid="ScrollSentinel__be1aa5" />
    </>
  );
}

export default function SiiMonitorSection({
  orgId, apiBaseUrl, parentId,
  initialTab = 'issued', mockRows, onTabChange, refreshKey = 0,
  onInvoiceOpen, onBpClick,
  kpis,
  compact,   // true when rendered as sub-tab inside SII+TBAI combined view
  noWrap,    // true when parent provides fm-tablecard wrapper
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [tab, setTab]       = useState('issued');
  const [period, setPeriod] = useState('current');
  const [showPeriodDrop, setShowPeriodDrop] = useState(false);
  const dropRef = useRef(null);

  const [page, setPage]           = useState(1);
  const [rows, setRows]           = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [csvMap, setCsvMap]       = useState({});
  const { selectedIds, setSelectedIds, handleToggleAll, handleToggleRow } = useFmSelection(rows);
  const [exporting, setExporting] = useState(false);

  function changeTab(newTab, newPeriod) {
    setTab(newTab);
    setPeriod(newPeriod);
    setShowPeriodDrop(false);
    const combined = newPeriod === 'previous' ? `${newTab}-previous` : newTab;
    onTabChange?.(combined);
  }

  useEffect(() => {
    const { tab: t, period: p } = resolveTabState(initialTab);
    setTab(t);
    setPeriod(p);
  }, [initialTab]);

  // Close period dropdown on outside click
  useEffect(() => {
    if (!showPeriodDrop) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowPeriodDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPeriodDrop]);

  const entityKey = resolveEntityKey(tab, period);

  useEffect(() => {
    if (mockRows) {
      const currentKey = period === 'previous' ? `${tab}-previous` : tab;
      const filtered = mockRows.filter(r => !r._siiTab || r._siiTab === currentKey);
      // Build csvMap from mock data (cdigoCSV is already on the row)
      const map = {};
      filtered.forEach(r => { if (r.id) map[r.id] = r.cdigoCSV ?? null; });
      setRows(filtered);
      setTotalRows(filtered.length);
      setCsvMap(map);
      setLoading(false);
      setError(null);
      return;
    }
    if (!parentId) {
      setLoading(false);
      setRows([]);
      setTotalRows(0);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSubtab(apiFetch, entityKey, parentId, orgId, page)
      .then(({ data, totalRows, csvMap: newCsvMap }) => {
        setRows(prev => page === 1 ? data : [...prev, ...data]);
        setTotalRows(totalRows);
        setCsvMap(prev => page === 1 ? newCsvMap : { ...prev, ...newCsvMap });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [parentId, orgId, entityKey, page, apiFetch, mockRows, refreshKey]);

  // Reset to first page, rows and selection when tab/period changes
  useEffect(() => { setPage(1); setRows([]); setCsvMap({}); setSelectedIds(new Set()); }, [tab, period, setSelectedIds]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await fetchCsvAndDownload(
        apiFetch,
        `/${SII_SPEC}/${encodeURIComponent(SUBTAB_ENTITIES[entityKey])}`,
        { parentId },
        `sii_${tab}_${period}`,
        SII_EXPORT_COLS,
      );
    } finally {
      setExporting(false);
    }
  }

  const siiKpis        = kpis?.sii ?? {};
  const issuedTotal    = (siiKpis.issued ?? 0) + (siiKpis.issuedPrevious ?? 0);
  const receivedTotal  = (siiKpis.received ?? 0) + (siiKpis.receivedPrevious ?? 0);
  const currentCount   = tab === 'issued' ? (siiKpis.issued ?? 0) : (siiKpis.received ?? 0);
  const previousCount  = tab === 'issued' ? (siiKpis.issuedPrevious ?? 0) : (siiKpis.receivedPrevious ?? 0);

  const periodLabel = period === 'current'
    ? `${ui('fiscalMonitor.sii.period.current')} (${currentCount})`
    : `${ui('fiscalMonitor.sii.period.previous')} (${previousCount})`;

  const inner = (
    <>
      {/* Invoice type tabs — only in standard (non-compact) mode */}
      {!compact && (
        <div className="fm-tabs" data-testid="fm-tabs">
          <button
            className={`tab${tab === 'issued' ? ' active' : ''}`}
            onClick={() => changeTab('issued', period)}
          >
            <FileUp size={14} strokeWidth={2} data-testid="FileUp__be1aa5" />
            {ui('fiscalMonitor.sii.tab.issued')}
            {issuedTotal > 0 && <span className="tab-count">{issuedTotal}</span>}
          </button>
          <button
            className={`tab${tab === 'received' ? ' active' : ''}`}
            onClick={() => changeTab('received', period)}
          >
            <FileDown size={14} strokeWidth={2} data-testid="FileDown__be1aa5" />
            {ui('fiscalMonitor.sii.tab.received')}
            {receivedTotal > 0 && <span className="tab-count">{receivedTotal}</span>}
          </button>
          <div className="spacer" />
        </div>
      )}

      {/* Filter bar */}
      <div className="fm-filter-bar">
        {compact ? (
          // Compact: segmented control (invoice type) + period dropdown immediately adjacent
          (<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="fm-filter-pills">
              <button
                className={`fm-filter-pill${tab === 'issued' ? ' active' : ''}`}
                onClick={() => changeTab('issued', period)}
              >
                <FileUp size={14} strokeWidth={2} data-testid="FileUp__be1aa5" />
                {ui('fiscalMonitor.sii.tab.issued')}
                {issuedTotal > 0 && <span className="pill-count">{issuedTotal}</span>}
              </button>
              <button
                className={`fm-filter-pill${tab === 'received' ? ' active' : ''}`}
                onClick={() => changeTab('received', period)}
              >
                <FileDown size={14} strokeWidth={2} data-testid="FileDown__be1aa5" />
                {ui('fiscalMonitor.sii.tab.received')}
                {receivedTotal > 0 && <span className="pill-count">{receivedTotal}</span>}
              </button>
            </div>
            <div className="fm-period-dropdown" ref={dropRef}>
              <button className="fm-period-btn" onClick={() => setShowPeriodDrop(d => !d)}>
                {periodLabel} <ChevDownIcon data-testid="ChevDownIcon__be1aa5" />
              </button>
              {showPeriodDrop && (
                <div className="fm-period-menu">
                  <button onClick={() => changeTab(tab, 'current')}>
                    {ui('fiscalMonitor.sii.period.current')} ({currentCount})
                  </button>
                  <button onClick={() => changeTab(tab, 'previous')}>
                    {ui('fiscalMonitor.sii.period.previous')} ({previousCount})
                  </button>
                </div>
              )}
            </div>
          </div>)
        ) : (
          // Standard: period pills in segmented control
          (<div className="fm-filter-pills" data-testid="fm-period-toggle">
            <button
              className={`fm-filter-pill${period === 'current' ? ' active' : ''}`}
              onClick={() => changeTab(tab, 'current')}
            >
              {ui('fiscalMonitor.sii.period.current')}
              {currentCount > 0 && <span className="pill-count">{currentCount}</span>}
            </button>
            <button
              className={`fm-filter-pill${period === 'previous' ? ' active' : ''}`}
              onClick={() => changeTab(tab, 'previous')}
            >
              {ui('fiscalMonitor.sii.period.previous')}
              {previousCount > 0 && <span className="pill-count">{previousCount}</span>}
            </button>
          </div>)
        )}
        <button className="fm-export-btn" onClick={handleExport} disabled={loading || exporting}>
          <ExportIcon data-testid="ExportIcon__be1aa5" /> {ui('fiscalMonitor.export')}
        </button>
      </div>

      <SiiTableContent
        ui={ui}
        tab={tab}
        period={period}
        rows={rows}
        loading={loading}
        error={error}
        totalRows={totalRows}
        page={page}
        onLoadMore={() => setPage(p => p + 1)}
        onInvoiceOpen={onInvoiceOpen}
        onBpClick={onBpClick}
        csvMap={csvMap}
        selectedIds={selectedIds}
        onToggleAll={handleToggleAll}
        onToggleRow={handleToggleRow}
        data-testid="SiiTableContent__be1aa5" />
    </>
  );

  if (noWrap) return inner;

  return (
    <section className="fm-section">
      <div className="fm-tablecard">{inner}</div>
    </section>
  );
}
