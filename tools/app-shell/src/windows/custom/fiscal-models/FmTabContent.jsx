import React, { useState } from 'react';
import {
  TriangleAlert, OctagonAlert, CircleCheck, ChevronRight,
  Download, FileText,
} from 'lucide-react';
import { Banner, EmptyState } from './FmCommon.jsx';
import { formatAmount } from './fiscalModelsUtils.js';

function buildBoxIncidentMap(incidents) {
  const map = {};
  for (const inc of incidents) {
    const m = inc.origin?.match(/Casilla\s+(\d+)/i);
    if (!m) continue;
    const key = String(parseInt(m[1], 10)).padStart(2, '0');
    if (!map[key]) map[key] = [];
    map[key].push(inc);
  }
  return map;
}

export function SourcesTab({ decl, t }) {
  const [onlyIncidents, setOnlyIncidents] = useState(false);
  const sources = decl.sources ?? [];
  const boxIncidentMap = buildBoxIncidentMap(decl.incidents?.items ?? []);

  function rowIncidents(source) {
    return (source.boxes ?? '').split(',').flatMap(b => boxIncidentMap[b.trim()] ?? []);
  }

  const incidentRowCount = sources.filter(r => rowIncidents(r).length > 0).length;
  const visible = onlyIncidents ? sources.filter(r => rowIncidents(r).length > 0) : sources;

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
  }

  function fmtBoxes(str) {
    if (!str) return '—';
    return str.split(',').map(b => b.trim().padStart(2, '0')).join(', ');
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0', display: 'flex', flexDirection: 'column' }}>
      {incidentRowCount > 0 && (
        <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className={`fm-toolbar__pill${onlyIncidents ? ' fm-toolbar__pill--active-dark' : ''}`}
            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setOnlyIncidents(v => !v)}
          >
            <TriangleAlert size={11} strokeWidth={2} data-testid="TriangleAlert__931756" />
            {t('fm.sources.filter.incidents') ?? 'Con incidencias'}
            <span className="fm-toolbar__count-badge">{incidentRowCount}</span>
          </button>
        </div>
      )}
      {sources.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#121217' }}>
            {t('fm.sources.empty') ?? 'Sin facturas'}
          </span>
        </div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-dtable fm-dtable--plain">
            <thead>
              <tr>
                <th>{t('fm.sources.col.date')}</th>
                <th>{t('fm.sources.col.ref')}</th>
                <th>{t('fm.sources.col.type')}</th>
                <th>{t('fm.sources.col.party')}</th>
                <th>{t('fm.sources.col.regime')}</th>
                <th className="num">{t('fm.sources.col.base')}</th>
                <th className="num">{t('fm.sources.col.vat')}</th>
                <th className="num">{t('fm.sources.col.total')}</th>
                <th>{t('fm.sources.col.boxes')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', color:'#9ca3af', padding:'24px 0', fontSize:13 }}>{t('fm.incidents.empty') ?? 'Sin incidencias'}</td></tr>
              )}
              {visible.map((r) => {
                const incs = rowIncidents(r);
                const hasBlock = incs.some(inc => inc.severity === 'block');
                const hasWarn  = incs.length > 0 && !hasBlock;
                const tooltip  = incs.map(inc => inc.message).join(' · ');
                let rowClass = '';
                if (hasBlock)     rowClass = 'fm-dtable__row--block';
                else if (hasWarn) rowClass = 'fm-dtable__row--warn';
                return (
                  <tr key={r.ref} className={rowClass}>
                    <td className="strong">{fmtDate(r.date)}</td>
                    <td>{r.ref}</td>
                    <td>{r.type}</td>
                    <td>{r.party}</td>
                    <td><span className="fm-regime-pill">{r.regime || '—'}</span></td>
                    <td className="num strong">{formatAmount(r.base)}</td>
                    <td className="num">{r.vat != null ? formatAmount(r.vat) : '—'}</td>
                    <td className="num strong">{formatAmount(r.total)}</td>
                    <td>
                      {fmtBoxes(r.boxes)}
                      {incs.length > 0 && (
                        <span
                          className={`fm-sources__inc-flag fm-sources__inc-flag--${hasBlock ? 'block' : 'warn'}`}
                          title={tooltip}
                        >
                          {hasBlock
                            ? <OctagonAlert size={12} strokeWidth={2} data-testid="OctagonAlert__931756" />
                            : <TriangleAlert size={12} strokeWidth={2} data-testid="TriangleAlert__931756" />
                          }
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function IncidentsTab({ decl, blocking, warning, t, onGoToSources }) {
  const incidents = decl.incidents?.items ?? [];

  if (blocking === 0 && warning === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#121217' }}>
          {t('fm.incidents.empty') ?? 'Sin incidencias'}
        </span>
      </div>
    );
  }

  const sorted = [...incidents].sort((a, b) =>
    (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1)
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', marginTop: '-8px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 24px', marginBottom: 0,
        background: '#FFF9EB', borderTop: '1px solid #FFE7AD',
        fontSize: 14,
      }}>
        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:'50%', background:'#FFC233', fontSize:11, fontWeight:700, color:'#fff', fontStyle:'normal', flexShrink:0 }}>i</span>
        <span style={{ flex: 1, color: '#8A6100' }}>{t('fm.incidents.block_sub') ?? 'Resuélvelas antes de generar el fichero'}</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#828FA3', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {sorted.length > 0 ? (
        <div className="fm-table-wrap">
          <table className="fm-dtable fm-dtable--plain">
            <thead>
              <tr>
                <th>{t('fm.incidents.col.severity')}</th>
                <th>{t('fm.incidents.col.origin')}</th>
                <th>{t('fm.incidents.col.message')}</th>
                <th>{t('fm.incidents.col.suggestion')}</th>
                <th>{t('fm.incidents.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((inc) => (
                <tr key={`${inc.origin ?? ''}-${inc.message}`}>
                  <td>
                    {inc.severity === 'block'
                      ? <span style={{ fontSize: 12, fontWeight: 400, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '2px 6px' }}>{t('fm.incidents.severity.block')}</span>
                      : <span style={{ fontSize: 12, fontWeight: 400, color: '#8A6100', background: '#FFF9EB', borderRadius: 4, padding: '2px 6px' }}>{t('fm.incidents.severity.warn')}</span>
                    }
                  </td>
                  <td>{inc.origin ?? '—'}</td>
                  <td><strong>{inc.message}</strong></td>
                  <td>{inc.suggestion ?? '—'}</td>
                  <td>
                    {inc.origin?.match(/Casilla\s+\d+/i) && onGoToSources && (
                      <button
                        onClick={() => onGoToSources()}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, color: '#121217', display: 'inline-flex', alignItems: 'center', gap: 2, textDecoration: 'underline' }}
                      >
                        {t('fm.sources.title')} <ChevronRight size={13} strokeWidth={2} data-testid="ChevronRight__931756" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<CircleCheck size={28} strokeWidth={1.5} data-testid="CircleCheck__931756" />}
          title={t('fm.incidents.empty')}
          sub={t('fm.incidents.empty_sub')}
          data-testid="EmptyState__931756" />
      )}
    </div>
  );
}

// genLabel: text for the generate button — pass model-specific label from parent
export function FilesTab({ decl, t, onGenerate, fileBlocked, genLabel }) {
  const file = decl.file ?? null;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {file ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #d1fae5', borderRadius: 8, background: '#f0fdf4' }}>
            <CircleCheck
              size={20}
              strokeWidth={1.75}
              style={{ color: '#16a34a', flexShrink: 0 }}
              data-testid="CircleCheck__931756" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {file.size} · {file.generatedAt}
              </div>
            </div>
            <button className="fm-btn" onClick={() => {}}>
              <Download
                size={13}
                strokeWidth={1.75}
                style={{ display:'inline',verticalAlign:'middle',marginRight:4 }}
                data-testid="Download__931756" />
              {t('fm.action.download')}
            </button>
          </div>
          <Banner
            tone="info"
            title={t('fm.files.next_step')}
            sub={t('fm.files.next_step_sub')}
            data-testid="Banner__931756" />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#121217' }}>
            {t('fm.files.empty') ?? 'Sin fichero generado'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 400, color: '#3F3F50' }}>
            {t('fm.files.empty_sub') ?? 'Genera el fichero de declaración para subir a la sede AEAT'}
          </span>
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ marginTop: 8, borderRadius: 20, padding: '8px 20px' }}
            onClick={onGenerate}
          >
            <FileText size={14} strokeWidth={1.75} data-testid="FileText__931756" />
            {genLabel ?? t('fm.action.generate_file') ?? 'Generar fichero'}
          </button>
        </div>
      )}
    </div>
  );
}

export function HistoryTab({ decl, t }) {
  const history = decl.history ?? [];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {history.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#121217' }}>
            {t('fm.list.empty') ?? 'No se encontraron declaraciones'}
          </span>
        </div>
      ) : (
        <div className="fm-timeline">
          {history.map((e) => (
            <div key={`${e.at}-${e.text}`} className="fm-timeline__event">
              <div className="fm-timeline__dot">{e.icon ?? '○'}</div>
              <div className="fm-timeline__body">
                <div className="fm-timeline__text">{e.text}</div>
                <div className="fm-timeline__meta">{e.at} · {e.who}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
