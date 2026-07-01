import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '@/i18n';
import {
  Settings, Download,
  OctagonAlert, TriangleAlert, CircleCheck, ArrowLeftRight,
  Calculator, Loader2, MoreVertical, TrendingUp, TrendingDown, Clock,
  ClipboardCheck, ReceiptText, Folder,
} from 'lucide-react';
import { Tabs, KpiWidget } from '../../FmCommon.jsx';
import { SourcesTab, IncidentsTab, FilesTab, HistoryTab } from '../../FmTabContent.jsx';
import FmBoxes303 from './FmBoxes303.jsx';
import { PresentModal, FileGenModal, ConfigDrawer, CompareDrawer } from '../../FmOverlays.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { formatAmount, formatPeriod, computeBoxes303, generate303File } from '../../fiscalModelsUtils.js';

const STEPPER_INDEX = {
  draft: 0, ready: 1,
  submitted: 2, submitted_ext: 2, submitted_ack: 2,
  skipped: -1,
};

// ── Tab content components ────────────────────────────────────────

// Casillas tab — left sidebar nav + content area
const CASILLAS_SECTIONS = [
  { id: 'identificacion',  titleKey: 'fm.page.identificacion',  sections: ['identificacion', 'datos_bancarios'] },
  { id: 'liquidacion',     titleKey: 'fm.page.liquidacion',     sections: ['iva_devengado', 'iva_deducible', 'resultado'] },
  { id: 'info_adicional',  titleKey: 'fm.page.info_adicional',  sections: ['info_adicional'] },
  { id: 'resultado_final', titleKey: 'fm.page.resultado_final', sections: ['resultado_final', 'sin_actividad', 'rectificativa'] },
];

function CasillasTab({ decl, orgIdent, identChecks, onIdentChange, liveBoxes, onBoxChange, t }) {
  const [activeSection, setActiveSection] = useState('identificacion');
  const section = CASILLAS_SECTIONS.find(s => s.id === activeSection) ?? CASILLAS_SECTIONS[0];

  return (
    <div style={{ background: '#fff', flex: 1, overflow: 'auto', padding: '0' }}>
      <div style={{
        display: 'flex',
        background: '#fff',
        overflow: 'auto',
        minWidth: 'fit-content',
      }}>
        {/* Left sidebar nav — no separator, same white card */}
        <div style={{
          width: 200, flexShrink: 0,
          padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {CASILLAS_SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '8px 12px', fontSize: 14, textAlign: 'left', border: 'none', width: '100%',
                background: activeSection === s.id ? '#E8EAED' : 'transparent',
                color: '#121217',
                fontWeight: activeSection === s.id ? 500 : 400,
                cursor: 'pointer',
                borderRadius: 8,
                transition: 'background .1s',
              }}
            >
              {t(s.titleKey)}
            </button>
          ))}
        </div>
        {/* Content area — no border, flows directly after sidebar */}
        <div style={{ flex: 1, padding: '6px 24px', overflow: 'auto' }}>
          <FmBoxes303
            boxes={liveBoxes ?? decl.boxes ?? null}
            year={decl.year}
            period={decl.period}
            sectionIds={section.sections}
            identification={{ ...orgIdent, ...identChecks }}
            onIdentChange={onIdentChange}
            onBoxChange={onBoxChange}
            data-testid="FmBoxes303__4f6c0d" />
        </div>
      </div>
    </div>
  );
}

// ── More options kebab menu ──────────────────────────────────────
function MoreOptionsMenu({ onCompare, onConfig, onGenerate, generating, fileBlocked, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="fm-section-header__icon-btn"
        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #D1D4DB', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', background: '#fff' }}
        onClick={() => setOpen(o => !o)}
        aria-label="Más opciones"
      >
        <MoreVertical size={15} strokeWidth={1.75} data-testid="MoreVertical__4f6c0d" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="menu" style={{ right: 0, left: 'auto', minWidth: 220 }}>
          <button className="fm-status-select__item fm-status-select__item--14" role="menuitem" onClick={() => { onCompare(); setOpen(false); }}>
            <ArrowLeftRight
              size={14}
              strokeWidth={1.75}
              style={{ color: '#121217' }}
              data-testid="ArrowLeftRight__4f6c0d" />
            {t('fm.action.compare') ?? 'Comparar'}
          </button>
          <button className="fm-status-select__item fm-status-select__item--14" role="menuitem" onClick={() => { onConfig(); setOpen(false); }}>
            <Settings
              size={14}
              strokeWidth={1.75}
              style={{ color: '#121217' }}
              data-testid="Settings__4f6c0d" />
            {t('fm.config.title') ?? 'Configuración'}
          </button>
          <button
            className="fm-status-select__item fm-status-select__item--14"
            role="menuitem"
            onClick={() => { onGenerate(); setOpen(false); }}
            disabled={generating}
          >
            <Download
              size={14}
              strokeWidth={1.75}
              style={{ color: fileBlocked ? '#dc2626' : '#121217' }}
              data-testid="Download__4f6c0d" />
            {t('fm.action.gen303') ?? 'Generar fichero 303'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function FmModel303Page({ decl, onBack, onStatusChange, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;
  const [status, setStatus] = useState(decl.status);
  const [activeTab, setActiveTab] = useState('boxes');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [orgIdent, setOrgIdent] = useState({ nif: '', nombre: '' });
  const [identChecks, setIdentChecks] = useState(decl.identification ?? {});
  const handleIdentChange = (id, value) => {
    setIdentChecks(prev => ({ ...prev, [id]: value }));
    if (id === 'motivo_rectificacion' && value !== 'D') {
      setManualOverrides(prev => { const n = { ...prev }; delete n[108]; return n; });
      setLiveBoxes(prev => {
        if (prev == null) return prev;
        const arr = toBoxArray(prev).filter(b => b.num !== 108);
        return recomputeDerivedBoxes(arr);
      });
    }
  };
  const [liveBoxes,      setLiveBoxes]      = useState(decl._precomputed?.boxes   ?? null);
  const [manualOverrides, setManualOverrides] = useState({});

  const toBoxArray = (src) => {
    if (Array.isArray(src)) return src;
    if (src && typeof src === 'object') return Object.entries(src).map(([n, v]) => ({ num: Number(n), value: v }));
    return [];
  };

  function applyOverrides(boxes, overrides) {
    if (!Object.keys(overrides).length) return boxes;
    const arr = toBoxArray(boxes);
    const result = arr.filter(b => !(b.num in overrides));
    Object.entries(overrides).forEach(([num, val]) => {
      if (val != null) result.push({ num: Number(num), value: val });
    });
    return result;
  }

  // Recompute all derived resultado_final boxes from the current merged box array.
  // Formulas follow the official AEAT 303 labels:
  //   45 = 29+31+33+35+37+39+41+42+43+44
  //   46 = 27 − 45
  //   64 = 46 + 58 + 76   (suma resultados)
  //   66 = 64 × 65 / 100  (atribuible Estado)
  //   69 = 66 + 77 − 78 + 68 + 108
  //   71 = 69 − 70 + 109
  function recomputeDerivedBoxes(boxArr) {
    const r2 = v => Math.round(v * 100) / 100;
    const get = num => { const e = boxArr.find(b => b.num === num); return e != null ? (e.value ?? 0) : 0; };
    const box65entry = boxArr.find(b => b.num === 65);
    const box65 = box65entry != null ? (box65entry.value ?? 100) : 100;
    const box45 = r2([29,31,33,35,37,39,41,42,43,44].reduce((s, n) => s + get(n), 0));
    const box46 = r2(get(27) - box45);
    const box64 = r2(box46 + get(58) + get(76));
    const box66 = r2(box64 * box65 / 100);
    const box69 = r2(box66 + get(77) - get(78) + get(68) + get(108));
    const box71 = r2(box69 - get(70) + get(109) - get(112));
    const derived = { 45: box45, 46: box46, 64: box64, 66: box66, 69: box69, 71: box71 };
    return [
      ...boxArr.filter(b => !(b.num in derived)),
      ...Object.entries(derived).map(([num, value]) => ({ num: Number(num), value })),
    ];
  }

  function handleBoxChange(boxNum, rawValue) {
    const numVal = parseFloat(String(rawValue ?? '').replace(',', '.'));
    const value = isNaN(numVal) ? null : numVal;
    setManualOverrides(prev => ({ ...prev, [boxNum]: value }));
    setLiveBoxes(prev => {
      const base = prev != null ? toBoxArray(prev) : toBoxArray(decl._precomputed?.boxes ?? decl.boxes);
      const filtered = base.filter(b => b.num !== boxNum);
      const updated = value != null ? [...filtered, { num: boxNum, value }] : filtered;
      return recomputeDerivedBoxes(updated);
    });
  }

  const [liveSummary, setLiveSummary] = useState(decl._precomputed?.summary ?? null);
  const [liveSources, setLiveSources] = useState(decl._precomputed?.sources ?? null);
  const [computing,   setComputing]   = useState(false);
  const [generating,  setGenerating]  = useState(false);

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computeBoxes303(decl, { token, apiBaseUrl });
      if (res) {
        setLiveBoxes(recomputeDerivedBoxes(applyOverrides(res.boxes, manualOverrides)));
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
      if (result > 0) kind = 'I';
      else if (result < 0) kind = 'C';
      else kind = 'N';
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
  const isSubmitted = ['submitted', 'submitted_ext', 'submitted_ack'].includes(status);
  const fileBlocked = blocking > 0;
  const summary = liveSummary ?? decl.summary ?? {};
  const resultKind = decl.result?.kind ?? null;

  // Derive result sublabel from kind
  const resultSubLabel = resultKind ? (t(`fm.result.${resultKind}`) ?? resultKind) : (t('fm.m303.summary.result_sub') ?? 'Resultado');

  let incidentBadgeTone = null;
  if (blocking > 0) incidentBadgeTone = 'danger';
  else if (warning > 0) incidentBadgeTone = 'warn';

  let incidentIconColor = '#828FA3';
  if (blocking > 0) incidentIconColor = '#D50B3E';
  else if (warning > 0) incidentIconColor = '#8A6100';

  let incidentBadge = null;
  if (blocking > 0) incidentBadge = t('fm.incidents.severity.block') ?? 'Bloqueante';
  else if (warning > 0) incidentBadge = t('fm.incidents.severity.warn') ?? 'Advertencia';

  const tabs = [
    { id: 'boxes',     label: t('fm.tab.boxes') ?? 'Casillas',
      icon: <ClipboardCheck size={16} strokeWidth={1.75} data-testid="ClipboardCheck__4f6c0d" /> },
    { id: 'sources',   label: t('fm.tab.sources') ?? 'Facturas',
      badge: (liveSources ?? decl.sources)?.length ?? null,
      icon: <ReceiptText size={16} strokeWidth={1.75} data-testid="ReceiptText__4f6c0d" /> },
    { id: 'incidents', label: t('fm.tab.incidents') ?? 'Incidencias',
      badge: incidentCount > 0 ? incidentCount : null,
      badgeTone: incidentBadgeTone,
      icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__4f6c0d" /> },
    { id: 'files',     label: t('fm.tab.files') ?? 'Ficheros',
      badge: decl.file ? 1 : null,
      icon: <Folder size={16} strokeWidth={1.75} data-testid="Folder__4f6c0d" /> },
    { id: 'history',   label: t('fm.tab.history') ?? 'Historial',
      icon: <Clock size={16} strokeWidth={1.75} data-testid="Clock__4f6c0d" /> },
  ];

  const periodLabel = `${decl.year}/${formatPeriod(decl.period)}`;

  return (
    <div className="fm-page fm-page--freeflow">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fm-model-badge fm-model-badge--303">303</span>
          <span style={{ fontWeight: 600, fontSize: 20, color: '#121217' }}>
            Modelo 303 - {periodLabel}
          </span>
          <MoreVertical
            size={14}
            strokeWidth={1.75}
            style={{ color: '#9ca3af', cursor: 'pointer' }}
            data-testid="MoreVertical__4f6c0d" />
        </div>
        <div style={{ fontSize: 12, color: '#828FA3', marginTop: 1 }}>
          Tesorería / Modelo 303 - {periodLabel}
        </div>
      </div>
      {/* ── Action bar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px 10px',
        background: '#fff', flexShrink: 0,
      }}>
        <button
          className="fm-btn"
          onClick={onBack}
          style={{ borderRadius: 8, border: '1px solid #D1D4DB', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', fontSize: 14, color: '#121217' }}
        >
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: '#F5F7F9', color: '#3F3F50',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${status}`) ?? status}
        </span>

        <div style={{ flex: 1 }} />

        <MoreOptionsMenu
          onCompare={() => setShowCompare(true)}
          onConfig={() => setShowConfig(true)}
          onGenerate={() => setShowFilegen(true)}
          generating={generating}
          fileBlocked={fileBlocked}
          t={t}
          data-testid="MoreOptionsMenu__4f6c0d" />

        <button
          className="fm-btn"
          onClick={handleCompute}
          disabled={computing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', border: '1px solid #D1D4DB' }}
        >
          {computing
            ? <Loader2
            size={24}
            strokeWidth={1.75}
            style={{ animation: 'spin 1s linear infinite' }}
            data-testid="Loader2__4f6c0d" />
            : <Calculator size={24} strokeWidth={1.75} data-testid="Calculator__4f6c0d" />
          }
          {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.compute') ?? 'Calcular')}
        </button>

        {!isSubmitted && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowPresent(true)}
          >
            <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__4f6c0d" />
            {t('fm.action.submit') ?? "Marcar como 'Presentado'"}
          </button>
        )}
      </div>
      {/* ── KPI bar ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: 12, padding: '12px 16px',
        flexShrink: 0,
        background: '#fff',
      }}>
        {/* Incidencias */}
        <KpiWidget
          icon={blocking > 0
            ? <OctagonAlert size={20} strokeWidth={1.75} data-testid="OctagonAlert__4f6c0d" />
            : <TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__4f6c0d" />
          }
          iconColor={incidentIconColor}
          label={t('fm.tab.incidents') ?? 'Incidencias'}
          value={String(incidentCount)}
          badge={incidentBadge}
          badgeBg={blocking > 0 ? '#FEF0F4' : '#FFF9EB'}
          badgeColor={blocking > 0 ? '#D50B3E' : '#8A6100'}
          data-testid="KpiWidget__4f6c0d" />

        {/* IVA Devengado */}
        <KpiWidget
          icon={<TrendingUp size={20} strokeWidth={1.75} data-testid="TrendingUp__4f6c0d" />}
          iconColor="#121217"
          label={t('fm.m303.summary.accrued') ?? 'IVA Devengado'}
          value={formatAmount(summary.accrued ?? 0)}
          badge={t('fm.m303.summary.accrued_sub') ?? 'De ventas'}
          badgeBg="#F5F7F9"
          badgeColor="#3F3F50"
          data-testid="KpiWidget__4f6c0d" />

        {/* IVA Deducible */}
        <KpiWidget
          icon={<TrendingDown size={20} strokeWidth={1.75} data-testid="TrendingDown__4f6c0d" />}
          iconColor="#121217"
          label={t('fm.m303.summary.deductible') ?? 'IVA Deducible'}
          value={formatAmount(summary.deductible ?? 0)}
          badge={t('fm.m303.summary.deductible_sub') ?? 'De compras'}
          badgeBg="#F5F7F9"
          badgeColor="#3F3F50"
          data-testid="KpiWidget__4f6c0d" />

        {/* Resultado */}
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__4f6c0d" />}
          iconColor="#121217"
          label={t('fm.m303.summary.result') ?? 'Resultado'}
          value={formatAmount(summary.result ?? 0)}
          badge={resultSubLabel}
          badgeBg="#F5F7F9"
          badgeColor="#3F3F50"
          data-testid="KpiWidget__4f6c0d" />
      </div>
      {/* ── Tabs bar ─────────────────────────────────────────────── */}
      <div className="fm-tabs-sticky">
        <Tabs
          tabs={tabs}
          active={activeTab}
          onSelect={setActiveTab}
          data-testid="Tabs__4f6c0d" />
      </div>
      {/* ── Tab content ──────────────────────────────────────────── */}
      {activeTab === 'boxes' && (
        <CasillasTab
          decl={decl}
          orgIdent={orgIdent}
          identChecks={identChecks}
          onIdentChange={handleIdentChange}
          liveBoxes={liveBoxes}
          onBoxChange={handleBoxChange}
          t={t}
          data-testid="CasillasTab__4f6c0d" />
      )}
      {activeTab !== 'boxes' && (
        <div className="fm-page__body" style={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden', ...(activeTab === 'sources' || activeTab === 'incidents' ? { padding: 0 } : {}) }}>
          {activeTab === 'sources' && (
            <SourcesTab
              decl={{ ...decl, sources: liveSources ?? decl.sources }}
              t={t}
              data-testid="SourcesTab__4f6c0d" />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              decl={decl}
              blocking={blocking}
              warning={warning}
              t={t}
              onGoToSources={() => setActiveTab('sources')}
              data-testid="IncidentsTab__4f6c0d" />
          )}
          {activeTab === 'files' && (
            <FilesTab
              decl={decl}
              t={t}
              fileBlocked={fileBlocked}
              onGenerate={() => setShowFilegen(true)}
              genLabel={t('fm.action.gen303') ?? 'Generar fichero 303'}
              data-testid="FilesTab__4f6c0d" />
          )}
          {activeTab === 'history' && (
            <HistoryTab decl={decl} t={t} data-testid="HistoryTab__4f6c0d" />
          )}
        </div>
      )}
      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={handlePresent}
          onClose={() => setShowPresent(false)}
          data-testid="PresentModal__4f6c0d" />
      )}
      {showFilegen && (
        <FileGenModal
          decl={decl}
          onConfirm={handleGenerate}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal__4f6c0d" />
      )}
      {showConfig && <ConfigDrawer
        onClose={() => setShowConfig(false)}
        token={token}
        apiBaseUrl={apiBaseUrl}
        model="303"
        data-testid="ConfigDrawer__4f6c0d" />}
      {showCompare && <CompareDrawer
        decl={decl}
        onClose={() => setShowCompare(false)}
        data-testid="CompareDrawer__4f6c0d" />}
    </div>
  );
}
