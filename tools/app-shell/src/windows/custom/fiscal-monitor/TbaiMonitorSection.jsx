import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { StatusPill, NumFactura, Pager, RowActionBtn, isErrorStatus } from './FmPrimitives.jsx';
import { TBAI_SPEC, TBAI_ENTITY } from './useFiscalMonitor.js';

const STATUS_FIELD = 'estado';
const PAGE_SIZE    = 20;

const STATUS_TAB_KEYS = [
  { key: 'all',       dot: null,      labelKey: 'fiscalMonitor.tbai.tab.all' },
  { key: 'Recibido',  dot: 'success', labelKey: 'fiscalMonitor.tbai.tab.Recibido' },
  { key: 'Rechazado', dot: 'danger',  labelKey: 'fiscalMonitor.tbai.tab.Rechazado' },
  { key: 'Error',     dot: 'danger',  labelKey: 'fiscalMonitor.tbai.tab.Error' },
  { key: 'Pendiente', dot: 'pending', labelKey: 'fiscalMonitor.tbai.tab.Pendiente' },
];

function fmtDate(raw) {
  if (!raw) return '—';
  const parts = String(raw).split(/[-/]/);
  if (parts.length !== 3) return raw;
  const [a, b, c] = parts.map(p => p.trim());
  return a.length === 4 ? `${c}/${b}/${a}` : `${a}/${b}/${c}`;
}

// Etendo identifier format: "documentNo – date – amount"
// Parse into the individual parts we need for display.
function parseIdentifier(row) {
  const raw = row['invoice$_identifier'] ?? row.invoiceIdentifier ?? null;
  if (!raw) return { docNo: row.invoice ?? '—', date: '—' };
  const parts = raw.split(/ [–-] /);
  return {
    docNo: parts[0]?.trim() || raw,
    date:  parts[1]?.trim() || '—',
  };
}

async function fetchTbaiList(base, orgId, token, page, statusFilter) {
  const params = new URLSearchParams({
    organization: orgId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  if (statusFilter && statusFilter !== 'all') {
    params.set('criteria', JSON.stringify([{ fieldName: STATUS_FIELD, operator: 'equals', value: statusFilter }]));
  }
  const res = await fetch(`${base}/${TBAI_SPEC}/${encodeURIComponent(TBAI_ENTITY)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export default function TbaiMonitorSection({ orgId, token, apiBaseUrl, initialFilter = 'all', mockRows, onFilterChange, refreshKey = 0, onInvoiceOpen, onBpClick }) {
  const ui = useUI();
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage]       = useState(1);
  const [rows, setRows]       = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => { setStatusFilter(initialFilter); }, [initialFilter]);

  useEffect(() => {
    if (mockRows) {
      const filtered = statusFilter === 'all'
        ? mockRows
        : mockRows.filter(r => r.estado === statusFilter);
      setRows(filtered);
      setTotalRows(filtered.length);
      setLoading(false);
      setError(null);
      return;
    }
    if (!orgId) return;
    setLoading(true);
    setError(null);
    fetchTbaiList(neoBase(apiBaseUrl), orgId, token, page, statusFilter)
      .then(({ data, totalRows }) => { setRows(data); setTotalRows(totalRows); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId, statusFilter, page, token, apiBaseUrl, mockRows, refreshKey]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  return (
    <section className="fm-section">
      <div className="fm-section-head">
        <div className="title">
          <span className="badge-system tbai">TicketBAI</span>
          {ui('fiscalMonitor.tbai.title')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="fm-action-btn">{ui('fiscalMonitor.export')}</button>
        </div>
      </div>

      <div className="fm-tablecard">
        <div className="fm-tabs">
          {STATUS_TAB_KEYS.map(({ key, dot, labelKey }) => (
            <button
              key={key}
              className={`tab${statusFilter === key ? ' active' : ''}`}
              onClick={() => { setStatusFilter(key); onFilterChange?.(key); }}
            >
              {dot && <span className={`dotcolor ${dot}`} />}
              {ui(labelKey)}
            </button>
          ))}
        </div>

        <div className="fm-subtoolbar">
          <span className="meta">{ui('fiscalMonitor.tbai.queueMeta')}</span>
        </div>

        {loading && (
          <div className="fm-table-loading">
            {[1,2,3,4,5].map(i => <div key={i} className="fm-skeleton" style={{ height: 36, borderRadius: 4 }} />)}
          </div>
        )}
        {error && (
          <div style={{ padding: '20px 16px', color: 'var(--fm-danger-fg)', fontSize: 13 }}>{error}</div>
        )}
        {!loading && !error && (
          <>
            <table className="fm-table">
              <thead>
                <tr>
                  <th><input type="checkbox" /></th>
                  <th className="sortable sorted">{ui('fiscalMonitor.col.date')}</th>
                  <th>{ui('fiscalMonitor.col.invoiceNumber')}</th>
                  <th>{ui('fiscalMonitor.col.description')}</th>
                  <th>{ui('fiscalMonitor.col.signature')}</th>
                  <th>{ui('fiscalMonitor.col.status')}</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--fm-fg-3)' }}>
                      {ui('fiscalMonitor.empty')}
                    </td>
                  </tr>
                ) : rows.map((row, i) => {
                  const inv = parseIdentifier(row);
                  return (
                    <tr key={row.id ?? i}>
                      <td><input type="checkbox" /></td>
                      <td className="strong">{fmtDate(row.invoiceDate ?? inv.date)}</td>
                      <td className="num-factura">
                        <NumFactura
                          n={inv.docNo}
                          onOpen={() => onInvoiceOpen?.(row.invoice, 'sales-invoice')}
                        />
                      </td>
                      <td>{row['invoice$description'] ?? row.descripcion ?? '—'}</td>
                      <td>
                        {row.estado === 'Recibido' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fm-success-fg)', fontWeight: 500, fontSize: 12 }}>
                            <CheckIcon /> OK
                          </span>
                        ) : (
                          <span style={{ color: 'var(--fm-fg-4)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <StatusPill
                          estado={row.estado}
                          onClick={isErrorStatus(row.estado) && row.businessPartner
                            ? () => onBpClick?.(row.businessPartner)
                            : undefined}
                        />
                      </td>
                      <td>
                        <RowActionBtn title={ui('fiscalMonitor.openInvoice')} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={totalRows} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>
    </section>
  );
}
