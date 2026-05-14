import React, { useState, useCallback } from 'react';
import { useUI } from '@/i18n';
import { KpiCard, StatusPillMenu, EmptyState } from './FmCommon.jsx';
import { ConfigDrawer, NewDeclModal } from './FmOverlays.jsx';
import FmCatalogPage from './FmCatalogPage.jsx';
import { formatPeriod, formatAmount } from './fiscalModelsUtils.js';

const MOCK_DECLARATIONS = [
  { id:'303-2026-T1', model:'303', year:2026, period:'T1', type:'ord', status:'borrador', result:{kind:'ingresar',amount:12179.75}, incidents:{blocking:2,warning:3}, current:true },
  { id:'303-2025-T4', model:'303', year:2025, period:'T4', type:'ord', status:'presentadoAcuse', result:{kind:'compensar',amount:2100}, incidents:{blocking:0,warning:0} },
  { id:'303-2025-T3', model:'303', year:2025, period:'T3', type:'com', status:'presentadoAcuse', result:{kind:'ingresar',amount:415.20}, incidents:{blocking:0,warning:0} },
  { id:'303-2025-T2', model:'303', year:2025, period:'T2', type:'ord', status:'presentadoOtra', result:{kind:'ingresar',amount:8924.10}, incidents:{blocking:0,warning:0} },
  { id:'349-2026-03', model:'349', year:2026, period:'03', type:'ord', status:'pendiente', result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:1} },
  { id:'349-2026-02', model:'349', year:2026, period:'02', type:'ord', status:'presentadoAcuse', result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0} },
];

const DEFAULT_ACTIVE_MODELS = { '303': true, '349': true };

function buildKpis(declarations, t) {
  const pending = declarations.filter(d => d.status === 'pendiente' || d.status === 'borrador').length;
  const blocking = declarations.reduce((n, d) => n + (d.incidents?.blocking ?? 0), 0);
  const current = declarations.find(d => d.current);
  const currentResult = current ? formatAmount(current.result?.amount) : '—';
  return [
    { icon: '📋', value: String(declarations.length), label: t('fm.kpi.total') },
    { icon: '⏳', value: String(pending),              label: t('fm.kpi.pending') },
    { icon: '🚫', value: String(blocking),             label: t('fm.kpi.blocking') },
    { icon: '💰', value: currentResult,                label: t('fm.kpi.current_result') },
  ];
}

export default function FmListPage({ declarations: propDecls, onSelect, onStatusChange }) {
  const ui = useUI();
  const t = ui;
  const [decls, setDecls]             = useState(propDecls ?? MOCK_DECLARATIONS);
  const [modelFilter, setModelFilter] = useState('all');
  const [yearFilter, setYearFilter]   = useState('all');
  const [activeModels, setActiveModels] = useState(DEFAULT_ACTIVE_MODELS);

  // overlay state
  const [showCatalog, setShowCatalog]   = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [showNewDecl, setShowNewDecl]   = useState(false);

  const handleStatusChange = useCallback((id, newStatus) => {
    setDecls(ds => ds.map(d => d.id === id ? { ...d, status: newStatus } : d));
    onStatusChange?.(id, newStatus);
  }, [onStatusChange]);

  const handleNewDecl = useCallback(({ model, year, period, status }) => {
    const id = `${model}-${year}-${period}`;
    setDecls(ds => [{ id, model, year, period, type: 'ord', status, result: { kind: 'informativa', amount: 0 }, incidents: { blocking: 0, warning: 0 } }, ...ds]);
  }, []);

  const years = ['all', ...Array.from(new Set(decls.map(d => String(d.year)))).sort((a, b) => b - a)];

  const filtered = decls.filter(d => {
    if (modelFilter !== 'all' && d.model !== modelFilter) return false;
    if (yearFilter !== 'all' && String(d.year) !== yearFilter) return false;
    return true;
  });

  const kpis = buildKpis(decls, t);
  const activeCount = Object.values(activeModels).filter(Boolean).length;

  if (showCatalog) {
    return (
      <FmCatalogPage
        activeModels={activeModels}
        onBack={() => setShowCatalog(false)}
        onSave={(newActive) => { setActiveModels(newActive); setShowCatalog(false); }}
      />
    );
  }

  return (
    <div className="fm-page">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Year pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {years.map(y => (
            <button key={y}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer',
                borderColor: yearFilter === y ? '#111827' : '#e5e7eb',
                background: yearFilter === y ? '#111827' : '#fff',
                color: yearFilter === y ? '#fff' : '#374151',
                fontWeight: yearFilter === y ? 600 : 400 }}
              onClick={() => setYearFilter(y)}>
              {y === 'all' ? t('fm.filter.all') : y}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: '#e5e7eb', margin: '0 4px' }} />

        {/* Model pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', '303', '349'].map(f => (
            <button key={f}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer',
                borderColor: modelFilter === f ? '#3b82f6' : '#e5e7eb',
                background: modelFilter === f ? '#eff6ff' : '#fff',
                color: modelFilter === f ? '#1d4ed8' : '#374151',
                fontWeight: modelFilter === f ? 600 : 400 }}
              onClick={() => setModelFilter(f)}>
              {f === 'all' ? t('fm.filter.all') : `${t('fm.filter.model_prefix')} ${f}`}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Catalog button */}
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: '#374151', fontWeight: 500 }}
          onClick={() => setShowCatalog(true)}
        >
          <span style={{ fontSize: 13 }}>◫</span>
          {t('fm.catalog.title')}
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#111827', color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {activeCount}
          </span>
          {activeCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
        </button>

        {/* Config button */}
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: '#374151', fontWeight: 500 }}
          onClick={() => setShowConfig(true)}
        >
          <span style={{ fontSize: 13 }}>⚙</span>
          {t('fm.config.title')}
        </button>

        {/* New declaration */}
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#111827', color: '#fff', fontWeight: 600 }}
          onClick={() => setShowNewDecl(true)}
        >
          + {t('fm.action.create')}
        </button>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="fm-kpi-strip">
        {kpis.map(k => <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} />)}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
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

      {/* ── Overlays ─────────────────────────────────────────────── */}
      {showConfig  && <ConfigDrawer onClose={() => setShowConfig(false)} />}
      {showNewDecl && <NewDeclModal onConfirm={handleNewDecl} onClose={() => setShowNewDecl(false)} />}
    </div>
  );
}
