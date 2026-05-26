import React, { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import {
  ArrowLeft, Settings2, Download, FileText, Lock, Play,
  OctagonAlert, TriangleAlert, CircleCheck, ChevronRight, GitCompare, FolderOpen,
  Calculator, Loader2,
} from 'lucide-react';
import {
  StatusPillMenu, ResultPill, SummaryCard, Tabs, Banner, SectionCard, EmptyState,
  NumberedStepper,
} from '../../FmCommon.jsx';
import FmBoxes303 from './FmBoxes303.jsx';
import { PresentModal, FileGenModal, ConfigDrawer, CompareDrawer } from '../../FmOverlays.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { formatAmount, formatPeriod, computeBoxes303, generate303File } from '../../fiscalModelsUtils.js';

const STEPPER_INDEX = {
  borrador: 0, listo: 1,
  presentado: 2, presentadoOtra: 2, presentadoAcuse: 2,
  omitido: -1,
};

// ── Tab content components ────────────────────────────────────────

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

function SourcesTab({ decl, t }) {
  const [onlyIncidents, setOnlyIncidents] = useState(false);
  const sources = decl.sources ?? [];
  const boxIncidentMap = buildBoxIncidentMap(decl.incidents?.items ?? []);

  function rowIncidents(source) {
    return (source.boxes ?? '').split(',').flatMap(b => boxIncidentMap[b.trim()] ?? []);
  }

  const incidentRowCount = sources.filter(r => rowIncidents(r).length > 0).length;
  const visible = onlyIncidents ? sources.filter(r => rowIncidents(r).length > 0) : sources;

  const filterBtn = incidentRowCount > 0 && (
    <button
      className={`fm-toolbar__pill${onlyIncidents ? ' fm-toolbar__pill--active-dark' : ''}`}
      style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onClick={() => setOnlyIncidents(v => !v)}
    >
      <TriangleAlert size={11} strokeWidth={2} />
      {t('fm.sources.filter.incidents') ?? 'Con incidencias'}
      <span className="fm-toolbar__count-badge">{incidentRowCount}</span>
    </button>
  );

  return (
    <SectionCard
      title={t('fm.sources.title')}
      sub={t('fm.sources.sub')}
      right={filterBtn}
      flush
    >
      {sources.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} strokeWidth={1.5} />}
          title={t('fm.list.empty')}
          sub={t('fm.sources.sub')}
        />
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-dtable">
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
                    <td className="strong">{r.date}</td>
                    <td className="mono">{r.ref}</td>
                    <td>{r.type}</td>
                    <td>{r.party}</td>
                    <td style={{ color: '#6b7280' }}>{r.regime || '—'}</td>
                    <td className="num strong">{formatAmount(r.base)}</td>
                    <td className="num">{r.vat != null ? formatAmount(r.vat) : '—'}</td>
                    <td className="num strong">{formatAmount(r.total)}</td>
                    <td className="mono" style={{ color: '#9ca3af', fontSize: 11 }}>
                      {r.boxes || '—'}
                      {incs.length > 0 && (
                        <span
                          className={`fm-sources__inc-flag fm-sources__inc-flag--${hasBlock ? 'block' : 'warn'}`}
                          title={tooltip}
                        >
                          {hasBlock
                            ? <OctagonAlert size={12} strokeWidth={2} />
                            : <TriangleAlert size={12} strokeWidth={2} />
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
    </SectionCard>
  );
}

function FilesTab({ decl, t, onGenerate, fileBlocked }) {
  const file = decl.file ?? null;
  return (
    <SectionCard title={t('fm.files.title')} flush>
      {file ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #d1fae5', borderRadius: 8, background: '#f0fdf4' }}>
            <CircleCheck size={20} strokeWidth={1.75} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {file.size} · {file.generatedAt}
              </div>
            </div>
            <button className="fm-btn" onClick={() => {}}><Download size={13} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginRight:4 }} />{t('fm.action.download')}</button>
          </div>
          <Banner
            tone="info"
            title={t('fm.files.next_step')}
            sub={t('fm.files.next_step_sub')}
          />
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen size={28} strokeWidth={1.5} />}
          title={t('fm.files.empty')}
          sub={t('fm.files.empty_sub')}
          cta={
            <button
              className={`fm-btn${fileBlocked ? ' fm-btn--danger' : ' fm-btn--primary'}`}
              onClick={onGenerate}
            >
              {fileBlocked
                ? <Lock size={13} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginRight:4 }} />
                : <FileText size={13} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginRight:4 }} />
              }
              {t('fm.action.gen303')}
            </button>
          }
        />
      )}
    </SectionCard>
  );
}

function HistoryTab({ decl, t }) {
  const history = decl.history ?? [];
  return (
    <SectionCard title={t('fm.history.title')} flush>
      {history.length === 0 ? (
        <EmptyState icon="🕐" title={t('fm.list.empty')} />
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
    </SectionCard>
  );
}

function IncidentsTab({ decl, blocking, warning, t, onGoToSources }) {
  const incidents = decl.incidents?.items ?? [];

  if (blocking === 0 && warning === 0) {
    return (
      <SectionCard title={t('fm.incidents.tab_title')} flush>
        <EmptyState
          icon={<CircleCheck size={28} strokeWidth={1.5} />}
          title={t('fm.incidents.empty')}
          sub={t('fm.incidents.empty_sub')}
        />
      </SectionCard>
    );
  }

  const total = blocking + warning;
  const sorted = [...incidents].sort((a, b) =>
    (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1)
  );

  return (
    <SectionCard
      title={`${total} ${t('fm.incidents.tab_title').toLowerCase()}`}
      sub={t('fm.incidents.block_sub')}
      flush
    >
      {sorted.length > 0 ? (
        <div className="fm-table-wrap">
          <table className="fm-dtable">
            <thead>
              <tr>
                <th>{t('fm.incidents.col.severity')}</th>
                <th>{t('fm.incidents.col.origin')}</th>
                <th>{t('fm.incidents.col.message')}</th>
                <th>{t('fm.incidents.col.suggestion')}</th>
                <th style={{ textAlign: 'right' }}>{t('fm.incidents.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((inc) => (
                <tr key={`${inc.origin ?? ''}-${inc.message}`}>
                  <td>
                    {inc.severity === 'block'
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '2px 6px' }}><OctagonAlert size={11} strokeWidth={2} /> {t('fm.incidents.severity.block')}</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#d97706', background: '#fef3c7', borderRadius: 4, padding: '2px 6px' }}><TriangleAlert size={11} strokeWidth={2} /> {t('fm.incidents.severity.warn')}</span>
                    }
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 11 }}>{inc.origin ?? '—'}</td>
                  <td className="strong">{inc.message}</td>
                  <td style={{ color: '#6b7280' }}>{inc.suggestion ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {inc.origin?.match(/Casilla\s+\d+/i) && onGoToSources && (
                      <button className="fm-btn" onClick={() => onGoToSources()}>
                        {t('fm.sources.title')} <ChevronRight size={13} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle' }} />
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
          icon={<CircleCheck size={28} strokeWidth={1.5} />}
          title={t('fm.incidents.empty')}
          sub={t('fm.incidents.empty_sub')}
        />
      )}
    </SectionCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function FmModel303Page({ decl, onBack, onStatusChange, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;
  const [status, setStatus] = useState(decl.status);
  const [activeTab, setActiveTab] = useState('boxes');
  const [boxPage, setBoxPage] = useState(0);
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [orgIdent, setOrgIdent] = useState({ nif: '', nombre: '' });
  const [identChecks, setIdentChecks] = useState(decl.identification ?? {});
  const handleIdentChange = (id, value) => setIdentChecks(prev => ({ ...prev, [id]: value }));
  const [liveBoxes,   setLiveBoxes]   = useState(decl._precomputed?.boxes   ?? null);
  const [liveSummary, setLiveSummary] = useState(decl._precomputed?.summary ?? null);
  const [liveSources, setLiveSources] = useState(decl._precomputed?.sources ?? null);
  const [computing,   setComputing]   = useState(false);
  const [generating,  setGenerating]  = useState(false);

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computeBoxes303(decl, { token, apiBaseUrl });
      if (res) {
        setLiveBoxes(res.boxes);
        setLiveSummary(res.summary);
        if (res.sources) setLiveSources(res.sources);
      }
    } finally {
      setComputing(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    const result = liveSummary?.result ?? decl.summary?.result ?? 0;
    let kind = decl.result?.kind;
    if (!kind) {
      if (result > 0) kind = 'ingresar';
      else if (result < 0) kind = 'compensar';
      else kind = 'informativa';
    }
    const declForGenerate = { ...decl, result: { ...decl.result, kind } };
    const ok = await generate303File(declForGenerate, { token, apiBaseUrl });
    setGenerating(false);
    if (!ok) {
      console.error('generate303File failed for', decl.year, decl.period);
    }
  }

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    fetch(`${neoBase(apiBaseUrl)}/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const org = data?.organization;
        if (!org) return;
        setOrgIdent({ nif: org.taxId ?? '', nombre: org.name ?? '' });
      })
      .catch(() => {});
  }, [token, apiBaseUrl]);

  const stepperSteps = [
    t('fm.stepper.draft'),
    t('fm.stepper.ready'),
    t('fm.stepper.presented'),
  ];

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    onStatusChange?.(decl.id, newStatus);
  }

  function handlePresent({ status: newStatus }) {
    handleStatusChange(newStatus);
  }

  const blocking = decl.incidents?.blocking ?? 0;
  const warning = decl.incidents?.warning ?? 0;
  const incidentCount = blocking + warning;
  const isSubmitted = ['presentado', 'presentadoOtra', 'presentadoAcuse'].includes(status);
  const fileBlocked = blocking > 0;
  const summary = liveSummary ?? decl.summary ?? {};
  const resultKind = decl.result?.kind ?? null;
  const prev = summary.prev ?? null;

  function pctDelta(current, previous) {
    if (previous == null || previous === 0 || current == null) return null;
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    return { dir: pct >= 0 ? 'up' : 'down', text: `${Math.abs(pct).toFixed(1)}%` };
  }

  let incidentBadgeTone = null;
  if (blocking > 0) incidentBadgeTone = 'danger';
  else if (warning > 0) incidentBadgeTone = 'warn';

  const tabs = [
    { id: 'boxes',     label: t('fm.tab.boxes') },
    { id: 'sources',   label: t('fm.tab.sources') },
    { id: 'incidents', label: t('fm.tab.incidents'),
      badge: incidentCount > 0 ? incidentCount : null,
      badgeTone: incidentBadgeTone,
    },
    { id: 'files',     label: t('fm.tab.files'),
      badge: decl.file ? 1 : null,
    },
    { id: 'history',   label: t('fm.tab.history') },
  ];

  return (
    <div className="fm-page fm-page--freeflow">

      {/* ── Header (349-style) ──────────────────────────────────── */}
      <div className="fm-349-header">
        <div className="fm-349-header__back">
          <button className="fm-349-header__back-btn" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={1.75} /> {t('fm.action.back')}
          </button>
        </div>
        <div className="fm-349-header__main">
          <div>
            <div className="fm-349-header__title-row">
              <span className="fm-model-badge fm-model-badge--303">303</span>
              <span className="fm-349-header__title">
                Modelo 303 · {decl.year} / {formatPeriod(decl.period)}
              </span>
              <StatusPillMenu status={status} onStatusChange={handleStatusChange} />
            </div>
            <div className="fm-349-header__subtitle">
              {t('fm.m303.subtitle')}
              {' · '}
              {decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}
              {decl.nif ? ` · NIF: ${decl.nif}` : ''}
            </div>
          </div>
          <div className="fm-349-header__actions">
            <button
              className="fm-349-header__btn"
              onClick={handleCompute}
              disabled={computing}
              title={t('fm.action.compute') ?? 'Calcular desde contabilidad'}
            >
              {computing
                ? <Loader2 size={14} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} />
                : <Calculator size={14} strokeWidth={1.75} />
              }
              {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.compute') ?? 'Calcular')}
            </button>
            <button className="fm-349-header__btn" onClick={() => setShowCompare(true)}>
              <GitCompare size={14} strokeWidth={1.75} /> {t('fm.action.compare')}
            </button>
            <button className="fm-349-header__btn" onClick={() => setShowConfig(true)}>
              <Settings2 size={14} strokeWidth={1.75} /> {t('fm.config.title')}
            </button>
            {!isSubmitted && (
              <button
                className={`fm-349-header__btn${fileBlocked ? ' fm-303-header__btn--locked' : ''}`}
                onClick={() => setShowFilegen(true)}
                disabled={generating}
                title={fileBlocked ? t('fm.incidents.block_sub') : ''}
                style={fileBlocked ? { color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' } : {}}
              >
                {fileBlocked ? <Lock size={14} strokeWidth={1.75} /> : <Download size={14} strokeWidth={1.75} />} {t('fm.action.gen303')}
              </button>
            )}
            <button
              className="fm-349-header__btn fm-349-header__btn--primary"
              onClick={() => setShowPresent(true)}
            >
              <Play size={13} strokeWidth={1.75} fill="currentColor" /> {isSubmitted ? t('fm.action.change_status') : t('fm.action.submit')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Numbered Stepper ────────────────────────────────────── */}
      <NumberedStepper steps={stepperSteps} current={STEPPER_INDEX[status] ?? 0} />

      {/* Incident banners */}
      {blocking > 0 && (
        <Banner
          tone="danger"
          icon={<OctagonAlert size={18} strokeWidth={1.75} />}
          title={`${blocking} ${t('fm.incidents.banner')}`}
          sub={t('fm.incidents.block_sub')}
          actions={
            <button className="fm-btn" onClick={() => setActiveTab('incidents')}>
              {t('fm.action.go_to')} <ChevronRight size={13} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle' }} />
            </button>
          }
        />
      )}
      {warning > 0 && blocking === 0 && (
        <Banner
          tone="warn"
          icon={<TriangleAlert size={18} strokeWidth={1.75} />}
          title={`${warning} ${t('fm.incidents.banner_warn')}`}
          actions={
            <button className="fm-btn" onClick={() => setActiveTab('incidents')}>
              {t('fm.tab.incidents')} <ChevronRight size={13} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle' }} />
            </button>
          }
        />
      )}

      {/* Summary cards row — always visible */}
      <div className="fm-summary-row">
        <SummaryCard
          eyebrow={t('fm.m303.summary.accrued')}
          value={formatAmount(summary.accrued ?? 0)}
          sub={t('fm.m303.summary.accrued_sub')}
          delta={pctDelta(summary.accrued, prev?.accrued)}
        />
        <SummaryCard
          eyebrow={t('fm.m303.summary.deductible')}
          value={formatAmount(summary.deductible ?? 0)}
          sub={t('fm.m303.summary.deductible_sub')}
          delta={pctDelta(summary.deductible, prev?.deductible)}
        />
        <SummaryCard
          accent
          eyebrow={t('fm.m303.summary.result')}
          value={formatAmount(summary.result ?? 0)}
          delta={pctDelta(summary.result, prev?.result)}
          right={resultKind ? (
            <ResultPill
              kind={resultKind}
              label={t(`fm.result.${resultKind}`)}
            />
          ) : null}
          sub={t('fm.m303.summary.result_sub')}
        />
        {summary.previousCompensation != null && (
          <SummaryCard
            eyebrow={t('fm.m303.summary.previous')}
            value={formatAmount(summary.previousCompensation)}
            sub={t('fm.m303.summary.previous_sub')}
            valueColor="#2563eb"
          />
        )}
      </div>

      <div className="fm-tabs-sticky">
        <Tabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />
      </div>

      <div className="fm-page__body">
        {activeTab === 'boxes' && (() => {
          const BOX_PAGES = [
            { titleKey: 'fm.page.identificacion',  sections: ['identificacion'] },
            { titleKey: 'fm.page.liquidacion',    sections: ['iva_devengado', 'iva_deducible', 'resultado'] },
            { titleKey: 'fm.page.info_adicional', sections: ['info_adicional'] },
            { titleKey: 'fm.page.resultado_final',sections: ['resultado_final'] },
          ];
          const page = BOX_PAGES[boxPage];
          return (
            <SectionCard title={t(page.titleKey)}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
                {BOX_PAGES.map((p, idx) => (
                  <button
                    key={p.titleKey}
                    onClick={() => setBoxPage(idx)}
                    style={{
                      fontSize: 12, padding: '4px 14px', borderRadius: 6, border: '1px solid',
                      cursor: 'pointer', fontWeight: boxPage === idx ? 600 : 400,
                      background: boxPage === idx ? '#1e40af' : '#f9fafb',
                      color: boxPage === idx ? '#fff' : '#374151',
                      borderColor: boxPage === idx ? '#1e40af' : '#d1d5db',
                    }}
                  >
                    {t(p.titleKey)}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>
                  {boxPage + 1} / {BOX_PAGES.length}
                </span>
              </div>
              <FmBoxes303
                boxes={liveBoxes ?? decl.boxes ?? null}
                year={decl.year}
                period={decl.period}
                sectionIds={page.sections}
                identification={{ ...orgIdent, ...identChecks }}
                onIdentChange={handleIdentChange}
              />
            </SectionCard>
          );
        })()}
        {activeTab === 'sources' && (
          <SourcesTab decl={{ ...decl, sources: liveSources ?? decl.sources }} t={t} />
        )}
        {activeTab === 'incidents' && (
          <IncidentsTab decl={decl} blocking={blocking} warning={warning} t={t}
            onGoToSources={() => setActiveTab('sources')} />
        )}
        {activeTab === 'files' && (
          <FilesTab
            decl={decl}
            t={t}
            fileBlocked={fileBlocked}
            onGenerate={() => setShowFilegen(true)}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab decl={decl} t={t} />
        )}
      </div>

      {showPresent && (
        <PresentModal decl={decl} onConfirm={handlePresent} onClose={() => setShowPresent(false)} />
      )}
      {showFilegen && (
        <FileGenModal decl={decl} onConfirm={handleGenerate} onClose={() => setShowFilegen(false)} />
      )}
      {showConfig && <ConfigDrawer onClose={() => setShowConfig(false)} token={token} apiBaseUrl={apiBaseUrl} />}
      {showCompare && <CompareDrawer decl={decl} onClose={() => setShowCompare(false)} />}
    </div>
  );
}
