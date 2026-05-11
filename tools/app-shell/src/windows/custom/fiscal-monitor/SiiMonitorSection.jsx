import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import { StatusPill, NumFactura, Pager, RowActionBtn } from './FmPrimitives.jsx';
import {
  SII_SPEC,
  SII_EMITIDAS_ENTITY,
  SII_RECIBIDAS_ENTITY,
  SII_EMITIDAS_ANT_ENTITY,
  SII_RECIBIDAS_ANT_ENTITY,
} from './useFiscalMonitor.js';

const SUBTAB_ENTITIES = {
  issued:          SII_EMITIDAS_ENTITY,
  received:        SII_RECIBIDAS_ENTITY,
  issuedPrevious:  SII_EMITIDAS_ANT_ENTITY,
  receivedPrevious:SII_RECIBIDAS_ANT_ENTITY,
};

const INVOICE_FK_FIELD = 'aeatsiiInvoice';
const PAGE_SIZE = 20;

const UploadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

async function fetchSubtab(base, entity, parentId, page, token) {
  const params = new URLSearchParams({
    parentId,
    _startRow: String((page - 1) * PAGE_SIZE),
    _endRow:   String(page * PAGE_SIZE),
  });
  const res = await fetch(`${base}/${SII_SPEC}/${encodeURIComponent(entity)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

export default function SiiMonitorSection({ orgId, token, apiBaseUrl, parentId, initialTab = 'issued', mockRows, onTabChange }) {
  const ui = useUI();
  const [tab, setTab]       = useState('issued');
  const [period, setPeriod] = useState('current');

  function changeTab(newTab, newPeriod) {
    setTab(newTab);
    setPeriod(newPeriod);
    const combined = newPeriod === 'previous' ? `${newTab}-previous` : newTab;
    onTabChange?.(combined);
  }
  const [page, setPage]     = useState(1);
  const [rows, setRows]     = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (initialTab.includes('previous')) {
      setTab(initialTab.startsWith('received') ? 'received' : 'issued');
      setPeriod('previous');
    } else {
      setTab(initialTab === 'received' ? 'received' : 'issued');
      setPeriod('current');
    }
  }, [initialTab]);

  let entityKey;
  if (tab === 'issued') {
    entityKey = period === 'current' ? 'issued' : 'issuedPrevious';
  } else {
    entityKey = period === 'current' ? 'received' : 'receivedPrevious';
  }

  useEffect(() => {
    if (mockRows) {
      const currentKey = period === 'previous' ? `${tab}-previous` : tab;
      const filtered = mockRows.filter(r => !r._siiTab || r._siiTab === currentKey);
      setRows(filtered);
      setTotalRows(filtered.length);
      setLoading(false);
      setError(null);
      return;
    }
    if (!parentId) return;
    setLoading(true);
    setError(null);
    const base = neoBase(apiBaseUrl);
    fetchSubtab(base, SUBTAB_ENTITIES[entityKey], parentId, page, token)
      .then(({ data, totalRows }) => { setRows(data); setTotalRows(totalRows); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [parentId, entityKey, page, token, apiBaseUrl, mockRows]);

  useEffect(() => { setPage(1); }, [tab, period]);

  const partyHeader = tab === 'issued' ? ui('fiscalMonitor.sii.party.cliente') : ui('fiscalMonitor.sii.party.proveedor');

  return (
    <section className="fm-section">
      <div className="fm-section-head">
        <div className="title">
          <span className="badge-system">SII</span>
          {ui('fiscalMonitor.sii.title')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="fm-action-btn">{ui('fiscalMonitor.export')}</button>
        </div>
      </div>

      <div className="fm-tablecard">
        <div className="fm-tabs">
          <button
            className={`tab${tab === 'issued' ? ' active' : ''}`}
            onClick={() => changeTab('issued', period)}
          >
            <UploadIcon /> {ui('fiscalMonitor.sii.tab.issued')}
          </button>
          <button
            className={`tab${tab === 'received' ? ' active' : ''}`}
            onClick={() => changeTab('received', period)}
          >
            <DownloadIcon /> {ui('fiscalMonitor.sii.tab.received')}
          </button>
          <div className="spacer" />
          <div className="fm-segmented">
            <button
              className={`seg${period === 'current' ? ' active' : ''}`}
              onClick={() => changeTab(tab, 'current')}
            >
              {ui('fiscalMonitor.sii.period.current')}
            </button>
            <button
              className={`seg${period === 'previous' ? ' active' : ''}`}
              onClick={() => changeTab(tab, 'previous')}
            >
              {ui('fiscalMonitor.sii.period.previous')}
            </button>
          </div>
        </div>

        <div className="fm-subtoolbar">
          <span className="meta">{ui('fiscalMonitor.sii.lastSync')}</span>
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
                  <th>{partyHeader}</th>
                  <th>{ui('fiscalMonitor.col.type')}</th>
                  <th className="num">{ui('fiscalMonitor.col.total')}</th>
                  <th>{ui('fiscalMonitor.col.status')}</th>
                  <th>{ui('fiscalMonitor.col.csv')}</th>
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
                    <td className="strong">{row.invoiceDate ?? '—'}</td>
                    <td className="num-factura">
                      <NumFactura n={row.documentNo ?? row[INVOICE_FK_FIELD] ?? '—'} />
                    </td>
                    <td className="strong">{row.businessPartner ?? '—'}</td>
                    <td>{row.aeatsiiClaveTipo ?? row.aeatsiiClaveTipoFc ?? '—'}</td>
                    <td className="num strong">{row.grandTotalAmount ?? '—'}</td>
                    <td>
                      <StatusPill estado={row.aeatsiiEstado} />
                      {row.aeatsiiErrorMsg && (
                        <div style={{ fontSize: 11, color: 'var(--fm-danger-fg)', marginTop: 3 }}>
                          {row.aeatsiiErrorCode ? `[${row.aeatsiiErrorCode}] ` : ''}{row.aeatsiiErrorMsg}
                        </div>
                      )}
                    </td>
                    <td className="mono">{row.cdigoCSV ?? '—'}</td>
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
