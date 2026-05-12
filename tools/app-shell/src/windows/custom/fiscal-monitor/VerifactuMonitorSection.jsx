import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { StatusPill, NumFactura, Pager, RowActionBtn, isErrorStatus } from './FmPrimitives.jsx';
import {
  VF_SPEC,
  VF_ACEPTADAS_ENTITY,
  VF_PARCIAL_ENTITY,
  VF_RECHAZADAS_ENTITY,
  VF_INVALIDAS_ENTITY,
} from './useFiscalMonitor.js';

const STATUS_ENTITIES = {
  accepted:          VF_ACEPTADAS_ENTITY,
  partiallyAccepted: VF_PARCIAL_ENTITY,
  rejected:          VF_RECHAZADAS_ENTITY,
  invalid:           VF_INVALIDAS_ENTITY,
};

const INVOICE_FK_FIELD = 'invoice';

function fmtDate(raw) {
  if (!raw) return '—';
  const parts = String(raw).split(/[-/]/);
  if (parts.length !== 3) return raw;
  const [a, b, c] = parts.map(p => p.trim());
  return a.length === 4 ? `${c}/${b}/${a}` : `${a}/${b}/${c}`;
}
const PAGE_SIZE = 20;

const STATUS_TABS = [
  { id: 'accepted',          dot: 'success', labelKey: 'fiscalMonitor.verifactu.tab.accepted' },
  { id: 'partiallyAccepted', dot: 'warn',    labelKey: 'fiscalMonitor.verifactu.tab.partiallyAccepted' },
  { id: 'rejected',          dot: 'danger',  labelKey: 'fiscalMonitor.verifactu.tab.rejected' },
  { id: 'invalid',           dot: 'danger',  labelKey: 'fiscalMonitor.verifactu.tab.invalid' },
];

async function fetchStatusTab(base, entity, orgId, page, token) {
  const params = new URLSearchParams({
    organization: orgId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  const res = await fetch(`${base}/${VF_SPEC}/${encodeURIComponent(entity)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

export default function VerifactuMonitorSection({ orgId, token, apiBaseUrl, initialTab = 'accepted', mockRows, onTabChange, refreshKey = 0, onInvoiceOpen, onBpClick }) {
  const ui = useUI();
  const [activeTab, setActiveTab] = useState('accepted');
  const [page, setPage]     = useState(1);
  const [rows, setRows]     = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  useEffect(() => {
    if (mockRows) {
      const filtered = mockRows.filter(r => r.verifactuSendingStatus === activeTab);
      setRows(filtered);
      setTotalRows(filtered.length);
      setLoading(false);
      setError(null);
      return;
    }
    if (!orgId) return;
    setLoading(true);
    setError(null);
    const base = neoBase(apiBaseUrl);
    fetchStatusTab(base, STATUS_ENTITIES[activeTab] ?? VF_ACEPTADAS_ENTITY, orgId, page, token)
      .then(({ data, totalRows }) => { setRows(data); setTotalRows(totalRows); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId, activeTab, page, token, apiBaseUrl, mockRows, refreshKey]);

  useEffect(() => { setPage(1); }, [activeTab]);

  return (
    <section className="fm-section">
      <div className="fm-section-head">
        <div className="title">
          <span className="badge-system verifactu">Verifactu</span>
          {ui('fiscalMonitor.verifactu.title')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="fm-action-btn">{ui('fiscalMonitor.export')}</button>
        </div>
      </div>

      <div className="fm-tablecard">
        <div className="fm-tabs">
          {STATUS_TABS.map(({ id, dot, labelKey }) => (
            <button
              key={id}
              className={`tab${activeTab === id ? ' active' : ''}`}
              onClick={() => { setActiveTab(id); onTabChange?.(id); }}
            >
              <span className={`dotcolor ${dot}`} /> {ui(labelKey)}
            </button>
          ))}
        </div>

        <div className="fm-subtoolbar">
          <span className="meta">{ui('fiscalMonitor.verifactu.chainMeta')}</span>
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
                  <th>{ui('fiscalMonitor.col.issuerNIF')}</th>
                  <th>{ui('fiscalMonitor.col.type')}</th>
                  <th>{ui('fiscalMonitor.col.csv')}</th>
                  <th>{ui('fiscalMonitor.col.status')}</th>
                  <th>{ui('fiscalMonitor.col.errorReason')}</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--fm-fg-3)' }}>
                      {ui('fiscalMonitor.empty')}
                    </td>
                  </tr>
                ) : rows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    <td><input type="checkbox" /></td>
                    <td className="strong">{fmtDate(row.invoiceDate)}</td>
                    <td className="num-factura">
                      <NumFactura
                        n={row[INVOICE_FK_FIELD] ?? '—'}
                        onOpen={() => onInvoiceOpen?.(row[INVOICE_FK_FIELD], 'sales-invoice')}
                      />
                    </td>
                    <td className="mono">{row.issuerTaxID ?? '—'}</td>
                    <td>{row.typeOperation ?? '—'}</td>
                    <td className="mono">{row.cSV ?? '—'}</td>
                    <td>
                      <StatusPill
                        estado={row.verifactuSendingStatus ?? activeTab}
                        onClick={isErrorStatus(row.verifactuSendingStatus ?? activeTab) && row.businessPartner
                          ? () => onBpClick?.(row.businessPartner)
                          : undefined}
                      />
                    </td>
                    <td style={{ maxWidth: 280, color: row.errorReason ? 'var(--fm-danger-fg)' : 'var(--fm-fg-3)', fontSize: 12 }}>
                      {row.codeError ? `[${row.codeError}] ` : ''}{row.errorReason ?? '—'}
                    </td>
                    <td>
                      <RowActionBtn title={ui('fiscalMonitor.openInvoice')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager total={totalRows} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>
    </section>
  );
}
