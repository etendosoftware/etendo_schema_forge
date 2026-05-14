import React, { useState, useCallback } from 'react';
import { useUI } from '@/i18n';
import { KpiCard, StatusPillMenu, EmptyState } from './FmCommon.jsx';
import { formatPeriod, formatAmount } from './fiscalModelsUtils.js';

const MOCK_DECLARATIONS = [
  { id:'303-2026-T1', model:'303', year:2026, period:'T1', type:'ord', status:'borrador', result:{kind:'ingresar',amount:12179.75}, incidents:{blocking:2,warning:3}, current:true },
  { id:'303-2025-T4', model:'303', year:2025, period:'T4', type:'ord', status:'presentadoAcuse', result:{kind:'compensar',amount:2100}, incidents:{blocking:0,warning:0} },
  { id:'303-2025-T3', model:'303', year:2025, period:'T3', type:'com', status:'presentadoAcuse', result:{kind:'ingresar',amount:415.20}, incidents:{blocking:0,warning:0} },
  { id:'303-2025-T2', model:'303', year:2025, period:'T2', type:'ord', status:'presentadoOtra', result:{kind:'ingresar',amount:8924.10}, incidents:{blocking:0,warning:0} },
  { id:'349-2026-03', model:'349', year:2026, period:'03', type:'ord', status:'pendiente', result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:1} },
  { id:'349-2026-02', model:'349', year:2026, period:'02', type:'ord', status:'presentadoAcuse', result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0} },
];

function buildKpis(declarations, t) {
  const pending = declarations.filter(d => d.status === 'pendiente' || d.status === 'borrador').length;
  const blocking = declarations.reduce((n, d) => n + (d.incidents?.blocking ?? 0), 0);
  const current = declarations.find(d => d.current);
  const currentResult = current ? formatAmount(current.result?.amount) : '—';
  return [
    { icon: '📋', value: String(declarations.length), label: t('fm.kpi.total') },
    { icon: '⏳', value: String(pending), label: t('fm.kpi.pending') },
    { icon: '🚫', value: String(blocking), label: t('fm.kpi.blocking') },
    { icon: '💰', value: currentResult, label: t('fm.kpi.current_result') },
  ];
}

export default function FmListPage({ declarations: propDecls, onSelect, onStatusChange }) {
  const ui = useUI();
  const t = (k) => ui.t(k);
  const [decls, setDecls] = useState(propDecls ?? MOCK_DECLARATIONS);
  const [filter, setFilter] = useState('all');

  const handleStatusChange = useCallback((id, newStatus) => {
    setDecls(ds => ds.map(d => d.id === id ? { ...d, status: newStatus } : d));
    onStatusChange?.(id, newStatus);
  }, [onStatusChange]);

  const filtered = filter === 'all' ? decls : decls.filter(d => d.model === filter);
  const kpis = buildKpis(decls, t);

  return (
    <div className="fm-page">
      <div className="fm-kpi-strip">
        {kpis.map(k => <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} />)}
      </div>

      <div style={{ padding: '6px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        {['all', '303', '349'].map(f => (
          <button key={f}
            style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, border: '1px solid', cursor: 'pointer',
              borderColor: filter === f ? '#3b82f6' : '#e5e7eb',
              background: filter === f ? '#eff6ff' : '#fff',
              color: filter === f ? '#1d4ed8' : '#374151',
              fontWeight: filter === f ? 600 : 400 }}
            onClick={() => setFilter(f)}>
            {f === 'all' ? t('fm.filter.all') : `Modelo ${f}`}
          </button>
        ))}
      </div>

      <div className="fm-table-wrap">
        {filtered.length === 0
          ? <EmptyState />
          : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th>{t('fm.col.model')}</th>
                  <th>{t('fm.col.year')}</th>
                  <th>{t('fm.col.period')}</th>
                  <th>{t('fm.col.type')}</th>
                  <th>{t('fm.col.result')}</th>
                  <th>{t('fm.col.incidents')}</th>
                  <th>{t('fm.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(decl => (
                  <tr
                    key={decl.id}
                    className={decl.current ? 'fm-table__row--current' : ''}
                    onClick={() => onSelect?.(decl)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 600 }}>{decl.model}</td>
                    <td>{decl.year}</td>
                    <td>{formatPeriod(decl.period)}</td>
                    <td>{decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}</td>
                    <td style={{ textAlign: 'right' }}>
                      {decl.result?.kind === 'informativa'
                        ? <span style={{ color: '#6b7280', fontSize: 10 }}>{t('fm.result.informativa')}</span>
                        : formatAmount(decl.result?.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(decl.incidents?.blocking ?? 0) > 0 && (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ {decl.incidents.blocking}</span>
                      )}
                      {(decl.incidents?.warning ?? 0) > 0 && (
                        <span style={{ color: '#d97706', marginLeft: 4 }}>◆ {decl.incidents.warning}</span>
                      )}
                      {!decl.incidents?.blocking && !decl.incidents?.warning && (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <StatusPillMenu
                        status={decl.status}
                        onStatusChange={(s) => handleStatusChange(decl.id, s)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
