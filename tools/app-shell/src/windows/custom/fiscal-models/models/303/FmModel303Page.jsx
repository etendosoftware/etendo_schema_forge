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
import { PresentModal, FileGenModal303, ConfigDrawer, CompareDrawer } from '../../FmOverlays.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { formatAmount, formatPeriod, computeBoxes303, generate303File } from '../../fiscalModelsUtils.js';

const STEPPER_INDEX = {
  draft: 0, ready: 1,
  submitted: 2, submitted_ext: 2, submitted_ack: 2,
  skipped: -1,
};

function toBoxArray(src) {
  if (Array.isArray(src)) return src;
  if (src && typeof src === 'object') return Object.entries(src).map(([n, v]) => ({ num: Number(n), value: v }));
  return [];
}

function applyOverrides(boxes, overrides) {
  if (!Object.keys(overrides).length) return toBoxArray(boxes);
  const arr = toBoxArray(boxes);
  const result = arr.filter(b => !(b.num in overrides));
  Object.entries(overrides).forEach(([num, val]) => {
    if (val != null) result.push({ num: Number(num), value: val });
  });
  return result;
}

function removeBox108FromLive(prev) {
  if (prev == null) return prev;
  return recomputeDerivedBoxes(toBoxArray(prev).filter(b => b.num !== 108));
}

function applyBoxChange(prev, boxNum, value, fallbackBoxes) {
  const base = prev != null ? toBoxArray(prev) : toBoxArray(fallbackBoxes);
  const filtered = base.filter(b => b.num !== boxNum);
  const updated = value != null ? [...filtered, { num: boxNum, value }] : filtered;
  return recomputeDerivedBoxes(updated);
}

function parseBoxInput(rawValue) {
  const numVal = parseFloat(String(rawValue ?? '').replace(',', '.'));
  return isNaN(numVal) ? null : numVal;
}

function applyComputeResult(res, manualOverrides, setLiveBoxes, setLiveSummary, setLiveSources) {
  if (!res) return;
  setLiveBoxes(recomputeDerivedBoxes(applyOverrides(res.boxes, manualOverrides)));
  setLiveSummary(res.summary);
  if (res.sources) setLiveSources(res.sources);
}

function fetchOrgIdent(token, apiBaseUrl, setOrgIdent) {
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
}

function applyGenerateError(result, t, setGenError) {
  if (result.error === 'iban_required') {
    setGenError(t('fm.gen303.error.iban_required') ?? 'Se necesita el IBAN para generar el fichero. Selecciona tipo C o N, o introduce el IBAN.');
  } else {
    const msg = result.serverMessage
      || t('fm.gen303.error.generic')
      || 'Error al generar el fichero. Por favor, inténtelo de nuevo.';
    setGenError(msg);
    console.error('generate303File failed:', result.error, result.serverMessage);
  }
}

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
    <div style={{ background: 'hsl(var(--card))', flex: 1, overflow: 'auto', padding: '0' }}>
      <div style={{
        display: 'flex',
        background: 'hsl(var(--card))',
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
                background: activeSection === s.id ? 'hsl(var(--muted))' : 'transparent',
                color: 'hsl(var(--foreground))',
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
        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', background: 'hsl(var(--card))' }}
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
              style={{ color: 'hsl(var(--foreground))' }}
              data-testid="ArrowLeftRight__4f6c0d" />
            {t('fm.action.compare') ?? 'Comparar'}
          </button>
          <button className="fm-status-select__item fm-status-select__item--14" role="menuitem" onClick={() => { onConfig(); setOpen(false); }}>
            <Settings
              size={14}
              strokeWidth={1.75}
              style={{ color: 'hsl(var(--foreground))' }}
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
              style={{ color: fileBlocked ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}
              data-testid="Download__4f6c0d" />
            {t('fm.action.gen303') ?? 'Generar fichero 303'}
          </button>
        </div>
      )}
    </div>
  );
}

function getBoxValue(liveBoxes, num) {
  const e = toBoxArray(liveBoxes).find(b => b.num === num);
  return e ? (e.value ?? 0) : null;
}

function buildIncidentVariants(blocking, warning, t) {
  let tone = null;
  if (blocking > 0) tone = 'danger';
  else if (warning > 0) tone = 'warn';

  let iconColor = 'hsl(var(--text-disabled))';
  if (blocking > 0) iconColor = 'hsl(var(--destructive))';
  else if (warning > 0) iconColor = 'var(--status-warning-fg)';

  let badge = null;
  if (blocking > 0) badge = t('fm.incidents.severity.block') ?? 'Bloqueante';
  else if (warning > 0) badge = t('fm.incidents.severity.warn') ?? 'Advertencia';

  return { tone, iconColor, badge };
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
      setLiveBoxes(removeBox108FromLive);
    }
  };
  const [liveBoxes,      setLiveBoxes]      = useState(decl._precomputed?.boxes   ?? null);
  const [manualOverrides, setManualOverrides] = useState({});

  function handleBoxChange(boxNum, rawValue) {
    const value = parseBoxInput(rawValue);
    setManualOverrides(prev => ({ ...prev, [boxNum]: value }));
    setLiveSummary(null);
    const fallback = decl._precomputed?.boxes ?? decl.boxes;
    setLiveBoxes(prev => applyBoxChange(prev, boxNum, value, fallback));
  }

  const [liveSummary, setLiveSummary] = useState(decl._precomputed?.summary ?? null);
  const [liveSources, setLiveSources] = useState(decl._precomputed?.sources ?? null);
  const [computing,   setComputing]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState(null);

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computeBoxes303(decl, { token, apiBaseUrl });
      applyComputeResult(res, manualOverrides, setLiveBoxes, setLiveSummary, setLiveSources);
    } finally {
      setComputing(false);
    }
  }

  async function handleGenerate({ filename } = {}) {
    setGenError(null);
    setGenerating(true);
    const result = await generate303File(decl, { token, apiBaseUrl, identChecks, manualOverrides, filename });
    setGenerating(false);
    if (!result.ok) applyGenerateError(result, t, setGenError);
  }

  useEffect(() => { fetchOrgIdent(token, apiBaseUrl, setOrgIdent); }, [token, apiBaseUrl]);

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
  // Derive KPI card values from liveBoxes so manual overrides (box 42, 43, etc.)
  // are reflected in the accrued/deductible/result cards without a full recalculate.
  const kpi27 = getBoxValue(liveBoxes, 27);
  const kpi45 = getBoxValue(liveBoxes, 45);
  const kpi46 = getBoxValue(liveBoxes, 46);
  const liveBoxSummary = (kpi27 !== null || kpi45 !== null || kpi46 !== null)
    ? { accrued: kpi27, deductible: kpi45, result: kpi46 }
    : null;
  const summary = liveSummary ?? liveBoxSummary ?? decl.summary ?? {};
  const resultKind = decl.result?.kind ?? null;

  // Derive result sublabel from kind
  const resultSubLabel = resultKind ? (t(`fm.result.${resultKind}`) ?? resultKind) : (t('fm.m303.summary.result_sub') ?? 'Resultado');


  const { tone: incidentBadgeTone, iconColor: incidentIconColor, badge: incidentBadge } =
    buildIncidentVariants(blocking, warning, t);

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
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fm-model-badge fm-model-badge--303">303</span>
          <span style={{ fontWeight: 600, fontSize: 20, color: 'hsl(var(--foreground))' }}>
            Modelo 303 - {periodLabel}
          </span>
          <MoreVertical
            size={14}
            strokeWidth={1.75}
            style={{ color: 'hsl(var(--text-disabled))', cursor: 'pointer' }}
            data-testid="MoreVertical__4f6c0d" />
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', marginTop: 1 }}>
          Tesorería / Modelo 303 - {periodLabel}
        </div>
      </div>
      {/* ── Action bar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px 10px',
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <button
          className="fm-btn"
          onClick={onBack}
          style={{ borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', fontSize: 14, color: 'hsl(var(--foreground))' }}
        >
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${status}`) ?? status}
        </span>

        <div style={{ flex: 1 }} />

        <MoreOptionsMenu
          onCompare={() => setShowCompare(true)}
          onConfig={() => setShowConfig(true)}
          onGenerate={() => { setGenError(null); setShowFilegen(true); }}
          generating={generating}
          fileBlocked={fileBlocked}
          t={t}
          data-testid="MoreOptionsMenu__4f6c0d" />

        <button
          className="fm-btn"
          onClick={handleCompute}
          disabled={computing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', border: '1px solid hsl(var(--border-control))' }}
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
        background: 'hsl(var(--card))',
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
          badgeBg={blocking > 0 ? 'var(--status-destructive-bg)' : 'var(--status-warning-bg)'}
          badgeColor={blocking > 0 ? 'hsl(var(--destructive))' : 'var(--status-warning-fg)'}
          data-testid="KpiWidget__4f6c0d" />

        {/* IVA Devengado */}
        <KpiWidget
          icon={<TrendingUp size={20} strokeWidth={1.75} data-testid="TrendingUp__4f6c0d" />}
          iconColor="hsl(var(--foreground))"
          label={t('fm.m303.summary.accrued') ?? 'IVA Devengado'}
          value={formatAmount(summary.accrued ?? 0)}
          badge={t('fm.m303.summary.accrued_sub') ?? 'De ventas'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          data-testid="KpiWidget__4f6c0d" />

        {/* IVA Deducible */}
        <KpiWidget
          icon={<TrendingDown size={20} strokeWidth={1.75} data-testid="TrendingDown__4f6c0d" />}
          iconColor="hsl(var(--foreground))"
          label={t('fm.m303.summary.deductible') ?? 'IVA Deducible'}
          value={formatAmount(summary.deductible ?? 0)}
          badge={t('fm.m303.summary.deductible_sub') ?? 'De compras'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          data-testid="KpiWidget__4f6c0d" />

        {/* Resultado */}
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__4f6c0d" />}
          iconColor="hsl(var(--foreground))"
          label={t('fm.m303.summary.result') ?? 'Resultado'}
          value={formatAmount(summary.result ?? 0)}
          badge={resultSubLabel}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          data-testid="KpiWidget__4f6c0d" />
      </div>
      {/* ── Inline generate error ────────────────────────────────── */}
      {genError && (
        <div style={{
          margin: '4px 20px 0',
          padding: '8px 14px',
          background: 'var(--status-destructive-bg)',
          border: '1px solid hsl(var(--destructive) / 0.3)',
          borderRadius: 8,
          fontSize: 13,
          color: 'hsl(var(--destructive))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <OctagonAlert size={14} data-testid="OctagonAlert__gen_error" />
          {genError}
        </div>
      )}
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
              onGenerate={() => { setGenError(null); setShowFilegen(true); }}
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
        <FileGenModal303
          decl={decl}
          onConfirm={handleGenerate}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal303__4f6c0d" />
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
