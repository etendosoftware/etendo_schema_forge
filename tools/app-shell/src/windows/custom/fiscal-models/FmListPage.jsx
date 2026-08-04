import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useUI } from '@/i18n';
import {
  LayoutGrid, Settings, ArrowUpDown,
  ChevronDown, MoreVertical, Calendar, Clock, TriangleAlert, OctagonAlert, ArrowUpRight, Search, Play, Check,
} from 'lucide-react';
import { EmptyState, KpiWidget } from './FmCommon.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfigDrawer, NewDeclModal } from './FmOverlays.jsx';
import FmCatalogPage from './FmCatalogPage.jsx';
import { formatAmount, STATUS_COLOR, computeUpcomingDeadlines, checkModified303, checkModified349, compute349Operators } from './fiscalModelsUtils.js';
import useFiscalAutoCompute from './useFiscalAutoCompute.js';

// Real-mode only: throws on fetch failure instead of falling back to mock data.
async function computeBoxes303Real(decl, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) throw new Error('missing credentials');
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const params = new URLSearchParams({ year: decl.year, period: decl.period });
  const res = await fetch(`${base}/fiscal303/boxes?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`boxes fetch failed: ${res.status}`);
  return await res.json();
}

async function computeOperators349Real(decl, { token, apiBaseUrl } = {}) {
  return compute349Operators(decl, { token, apiBaseUrl });
}

// Generic filter dropdown — handles year, model and status filters
function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const active = value !== 'all';
  const selectedLabel = active ? (options.find(o => o.value === value)?.label ?? value) : label;
  return (
    <div className="fm-filter-select" ref={ref} style={{ position: 'relative' }}>
      <button
        className={`fm-toolbar__pill${active ? ' fm-toolbar__pill--active-dark' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel}
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          style={{ opacity: .6 }}
          data-testid="ChevronDown__cb728e" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 200 }}>
          {/* "Todos" row */}
          <button
            className="fm-status-select__item"
            style={{ justifyContent: 'space-between' }}
            role="option" aria-selected={value === 'all'}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: value === 'all' ? 500 : 400 }}>{label}</span>
            {value === 'all' && <Check
              size={14}
              strokeWidth={2}
              style={{ color: 'hsl(var(--foreground))', flexShrink: 0 }}
              data-testid="Check__cb728e" />}
          </button>
          <div style={{ height: 1, background: 'hsl(var(--border-subtle))', margin: '2px 8px' }} />
          {options.map(opt => {
            let optLabel;
            if (opt.badge) {
              optLabel = <span className={`fm-model-badge fm-model-badge--${opt.value}`}>{opt.badge}</span>;
            } else if (opt.statusStyle) {
              optLabel = <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 400, ...opt.statusStyle }}>{opt.label}</span>;
            } else {
              optLabel = <span style={{ fontSize: 14, color: 'hsl(var(--foreground))' }}>{opt.label}</span>;
            }
            return (
              <button
                key={opt.value}
                className="fm-status-select__item"
                style={{ justifyContent: 'space-between' }}
                role="option" aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {optLabel}
                {value === opt.value && <Check
                  size={14}
                  strokeWidth={2}
                  style={{ color: 'hsl(var(--foreground))', flexShrink: 0 }}
                  data-testid="Check__cb728e" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Row-level kebab menu — Demo, Configuración
function RowKebab({ onDemo, onConfig, t }) {
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
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="Más opciones"
      >
        <MoreVertical size={16} strokeWidth={1.75} data-testid="MoreVertical__cb728e" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="menu" style={{ right: 0, left: 'auto', minWidth: 220 }}>
          <button className="fm-status-select__item" role="menuitem" onClick={(e) => { e.stopPropagation(); onDemo(); setOpen(false); }}>
            <Play
              size={14}
              strokeWidth={1.75}
              style={{ color: 'hsl(var(--foreground))' }}
              data-testid="Play__cb728e" />
            Demo
          </button>
          <button className="fm-status-select__item" role="menuitem" onClick={(e) => { e.stopPropagation(); onConfig(); setOpen(false); }}>
            <Settings
              size={14}
              strokeWidth={1.75}
              style={{ color: 'hsl(var(--foreground))' }}
              data-testid="Settings__cb728e" />
            {t('fm.config.title') ?? 'Configuración'}
          </button>
        </div>
      )}
    </div>
  );
}

const STATUS_PLAIN_LABEL = {
  submitted_ack: 'Presentado con acuse',
  submitted_ext: 'Presentado en otra plataforma',
};

const STATUS_GREEN = new Set(['ready', 'submitted', 'submitted_ext', 'submitted_ack']);

const STATUS_DROPDOWN_STYLE = {
  ready:         { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  submitted:     { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  submitted_ext: { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  submitted_ack: { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  pending:       { background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
  draft:         { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
  skipped:       { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
};

// Fixed status filter options (consolidated)
const STATUS_FILTER_OPTIONS = [
  { value: 'presentado', label: 'Presentado', statusStyle: { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' } },
  { value: 'pendiente',  label: 'Pendiente',  statusStyle: { background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' } },
  { value: 'borrador',   label: 'Borrador',   statusStyle: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' } },
  { value: 'omitido',    label: 'Omitido',    statusStyle: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' } },
];

const STATUS_FILTER_RAW = {
  presentado: new Set(['ready', 'submitted', 'submitted_ext', 'submitted_ack']),
  pendiente:  new Set(['pending']),
  borrador:   new Set(['draft']),
  omitido:    new Set(['skipped']),
};

function StatusText({ status, t }) {
  const label = STATUS_PLAIN_LABEL[status] ?? (t(`fm.status.${status}`) ?? status);
  const isGreen = STATUS_GREEN.has(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 6,
      fontSize: 12, fontWeight: 400, lineHeight: '16px',
      background: isGreen ? 'var(--status-success-bg)' : 'hsl(var(--muted))',
      color: isGreen ? 'var(--status-success-fg)' : 'hsl(var(--muted-foreground))',
    }}>
      {label}
    </span>
  );
}

const RESULT_BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 6,
  fontSize: 12, fontWeight: 400, lineHeight: '16px',
  background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
};

// Result as plain text — used in the list table
function ResultText({ isComputing, error, result, t }) {
  if (isComputing) return <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>…</span>;
  if (error) return <span style={RESULT_BADGE_STYLE}>{t('fm.status.error') ?? 'Error de cálculo'}</span>;
  if (!result?.kind) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  if (result.kind === 'N') return <span style={RESULT_BADGE_STYLE}>{t('fm.result.N') ?? 'Sin resultado'}</span>;
  if (result.kind === 'info') {
    return result.amount > 0
      ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'hsl(var(--foreground))' }}>{formatAmount(result.amount)}</span>
      : <span style={RESULT_BADGE_STYLE}>{t('fm.result.info') ?? 'Informativa'}</span>;
  }
  const label = t(`fm.result.${result.kind}`) ?? result.kind;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={RESULT_BADGE_STYLE}>{label}</span>
      {result.amount != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
          {formatAmount(result.amount)}
        </span>
      )}
    </div>
  );
}

// KPI cards row — compact horizontal layout
function KpiCardsRow({ decls, t }) {
  const upcomingCount = useMemo(() => computeUpcomingDeadlines(decls).length, [decls]);
  const pendingCount  = useMemo(() => decls.filter(d => d.status === 'pending' || d.status === 'draft').length, [decls]);
  const incidentCount = useMemo(() => decls.filter(d => (d.incidents?.blocking ?? 0) + (d.incidents?.warning ?? 0) > 0).length, [decls]);

  return (
    <div style={{ display: 'flex', gap: 12, padding: '0 16px 8px', background: 'hsl(var(--card))', flexShrink: 0 }}>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<Calendar size={20} strokeWidth={1.75} data-testid="Calendar__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label="Por vencer"
          badge="Esta semana"
          badgeBg="var(--status-warning-bg)"
          badgeColor="var(--status-warning-fg)"
          value={upcomingCount}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<Clock size={20} strokeWidth={1.75} data-testid="Clock__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label={t('fm.kpi.pending') ?? 'Pendientes'}
          badge="Sin presentar"
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          value={pendingCount}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label="Incidencias"
          badge="Requiere revisión"
          badgeBg="var(--status-destructive-bg)"
          badgeColor="hsl(var(--destructive))"
          value={incidentCount}
          data-testid="KpiWidget__cb728e" />
      </div>
    </div>
  );
}

const DEFAULT_ACTIVE = { '303': true, '349': true };

const DEMO_DECLARATIONS = [
  {
    id: 'demo-303-2026-T2', model: '303', year: 2026, period: 'T2',
    type: 'ord', status: 'draft', nif: 'B12345678',
    result: { kind: 'C', amount: 35479.08 },
    incidents: { blocking: 0, warning: 1, items: [] },
    summary: { accrued: 1309.98, deductible: 36789.06, result: -35479.08 },
    boxes: { 7: 6162.60, 9: 1294.15, 27: 1309.98, 28: 175186, 29: 36789.06, 45: 36789.06, 46: -35479.08 },
    file: null, sources: [], history: [],
    updatedAt: '2026-06-01',
  },
  {
    id: 'demo-303-2026-T1', model: '303', year: 2026, period: 'T1',
    type: 'ord', status: 'ready', nif: 'B12345678',
    result: { kind: 'C', amount: 2816.31 },
    incidents: { blocking: 0, warning: 0, items: [] },
    summary: { accrued: 682.08, deductible: 3498.39, result: -2816.31 },
    boxes: { 7: 3248, 9: 682.08, 27: 682.08, 28: 16659, 29: 3498.39, 45: 3498.39, 46: -2816.31 },
    file: '303_B12345678_2026_T1.303', sources: [], history: [],
    updatedAt: '2026-04-20',
  },
  {
    id: 'demo-303-2025-T4', model: '303', year: 2025, period: 'T4',
    type: 'ord', status: 'submitted_ack', nif: 'B12345678',
    result: { kind: 'I', amount: 12179.75 },
    incidents: { blocking: 0, warning: 0, items: [] },
    summary: { accrued: 45230.80, deductible: 33051.05, result: 12179.75 },
    boxes: { 7: 215385, 9: 45230.85, 27: 45230.80, 28: 157386, 29: 33051.05, 45: 33051.05, 46: 12179.75 },
    file: '303_B12345678_2025_T4.303', sources: [], history: [],
    updatedAt: '2026-01-20',
  },
  {
    id: 'demo-349-2026-T2', model: '349', year: 2026, period: 'T2',
    type: 'ord', status: 'draft', nif: 'B12345678',
    result: { kind: 'N', amount: 0 },
    incidents: { blocking: 0, warning: 0, items: [] },
    updatedAt: '2026-06-01',
  },
  {
    id: 'demo-349-2026-T1', model: '349', year: 2026, period: 'T1',
    type: 'ord', status: 'submitted_ack', nif: 'B12345678',
    result: { kind: 'N', amount: 0 },
    incidents: { blocking: 0, warning: 0, items: [] },
    file: '349_B12345678_2026_T1.txt',
    updatedAt: '2026-04-20',
  },
];

function normDecl(d) {
  return {
    ...d,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('es-ES') : '—',
    result: d.result ?? null,
    incidents: d.incidents ?? { blocking: 0, warning: 0 },
  };
}

// ── Sub-components ───────────────────────────────────────────────
function ModelBadge({ model }) {
  return <span className={`fm-model-badge fm-model-badge--${model}`}>{model}</span>;
}

function FileCell({ file, fileExternal }) {
  if (!file && !fileExternal) return <span style={{ color: 'hsl(var(--text-disabled))' }}>—</span>;
  if (fileExternal) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'hsl(var(--primary))', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', fontSize: 12 }}>
        <ArrowUpRight size={12} strokeWidth={2} data-testid="ArrowUpRight__cb728e" />Externa
              </span>
    );
  }
  return <span className="fm-file">{file}</span>;
}

function IncidentsCell({ blocking, warning, t }) {
  if (!blocking && !warning) return <span style={{ color: 'hsl(var(--foreground))', fontSize: 14 }}>{t('fm.incidents.none') ?? 'Sin incidencias'}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {blocking > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))',
        }}>
          <OctagonAlert size={12} strokeWidth={1.75} data-testid="OctagonAlert__cb728e" /> {blocking}
        </span>
      )}
      {warning > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)',
        }}>
          <TriangleAlert size={12} strokeWidth={1.75} data-testid="TriangleAlert__cb728e" /> {warning}
        </span>
      )}
    </span>
  );
}

const resultBadge = (text) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 6,
    fontSize: 12, fontWeight: 400, lineHeight: '16px',
    background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
  }}>{text}</span>
);

function ResultCell({ isComputing, error, result, t }) {
  if (isComputing) return <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>…</span>;
  if (error) {
    return resultBadge(t('fm.status.error') ?? 'Error');
  }
  if (!result?.kind) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  if (result.kind === 'N') return resultBadge(t('fm.result.N') ?? 'Sin resultado');
  if (result.kind === 'info') {
    return result.amount > 0
      ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'hsl(var(--foreground))' }}>{formatAmount(result.amount)}</span>
      : resultBadge(t('fm.result.info') ?? 'Informativa');
  }
  const label = t(`fm.result.${result.kind}`) ?? result.kind;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      {resultBadge(label)}
      {result.amount != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
          {formatAmount(result.amount)}
        </span>
      )}
    </div>
  );
}

function getResultKind(r) {
  if (r > 0) return 'I';
  if (r < 0) return 'C';
  return 'N';
}

// ── Main component ───────────────────────────────────────────────
export default function FmListPage({ declarations: propDecls, onSelect, onStatusChange, onComputeUpdate, token, apiBaseUrl }) {
  const ui = useUI();
  const t  = ui;

  const [decls, setDecls] = useState(propDecls ?? []);

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    fetch(`${base}/fiscal303/declarations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setDecls((Array.isArray(data) ? data : (data?.data ?? [])).map(normDecl)))
      .catch(() => {});
  }, [token, apiBaseUrl]);

  const draftDecls303 = useMemo(
    () => decls.filter(d => d.model === '303' && d.status === 'draft'),
    [decls]
  );

  const draftDecls349 = useMemo(
    () => decls.filter(d => d.model === '349' && d.status === 'draft'),
    [decls]
  );

  const { computedMap } = useFiscalAutoCompute(draftDecls303, {
    computeFn:       computeBoxes303Real,
    checkModifiedFn: checkModified303,
    token,
    apiBaseUrl,
    pollIntervalMs:  180_000,
    enabled:         Boolean(token && apiBaseUrl),
  });

  const { computedMap: computedMap349 } = useFiscalAutoCompute(draftDecls349, {
    computeFn:       computeOperators349Real,
    checkModifiedFn: checkModified349,
    token,
    apiBaseUrl,
    pollIntervalMs:  180_000,
    enabled:         Boolean(token && apiBaseUrl),
  });

  useEffect(() => {
    if (onComputeUpdate && Object.keys(computedMap349).length > 0) {
      onComputeUpdate(computedMap349);
    }
  }, [computedMap349, onComputeUpdate]);

  const [modelFilter, setModelFilter]   = useState('all');
  const [yearFilter,  setYearFilter]    = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeModels, setActiveModels] = useState(DEFAULT_ACTIVE);
  const [showCatalog,  setShowCatalog]  = useState(false);
  const [showConfig,   setShowConfig]   = useState(false);
  const [showNewDecl,  setShowNewDecl]  = useState(false);
  const [selected,     setSelected]     = useState(new Set());

  const handleStatusChange = useCallback((id, newStatus) => {
    if (token && apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      fetch(`${base}/fiscal303/declarations?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
        .then(r => {
          if (!r.ok) throw new Error(r.status);
          setDecls(ds =>
            ds.map(d => d.id === id
              ? { ...d, status: newStatus, updatedAt: new Date().toLocaleDateString('es-ES') }
              : d)
          );
          onStatusChange?.(id, newStatus);
        })
        .catch(() => {});
    }
  }, [onStatusChange, token, apiBaseUrl]);

  const handleNewDecl = useCallback(({ model, year, period, status }) => {
    if (token && apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      fetch(`${base}/fiscal303/declarations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, year: parseInt(year, 10), period, status }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(created => setDecls(ds => [normDecl(created?.data ?? created), ...ds]))
        .catch(() => {});
    }
  }, [token, apiBaseUrl]);

  const yearOptions = useMemo(
    () => Array.from(new Set(decls.map(d => String(d.year)))).sort((a, b) => b - a)
      .map(y => ({ value: y, label: y })),
    [decls]
  );

  const statusOptions = STATUS_FILTER_OPTIONS;

  const modelOptions = [
    { value: '303', label: 'Modelo 303', badge: '303' },
    { value: '349', label: 'Modelo 349', badge: '349' },
  ];

  const modelYearFiltered = decls.filter(d =>
    (modelFilter === 'all' || d.model === modelFilter) &&
    (yearFilter  === 'all' || String(d.year) === yearFilter)
  );

  const filtered = modelYearFiltered.filter(d =>
    statusFilter === 'all' || (STATUS_FILTER_RAW[statusFilter]?.has(d.status) ?? false)
  );

  const activeCount = Object.values(activeModels).filter(Boolean).length;

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every(d => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(d => d.id)));

  return (
    <div className="fm-page">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{ padding: '10px 20px', background: 'hsl(var(--card))', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {t('fm.list.title') ?? 'Declaraciones'}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 8px', borderRadius: 8,
            background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border-control))',
            fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 400, lineHeight: '16px',
          }}>{decls.length}</span>
          <button style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 2, width: 24, height: 24,
            background: 'hsl(var(--muted))', borderRadius: 8, border: 'none', cursor: 'pointer',
          }}>
            <MoreVertical
              size={16}
              strokeWidth={1.75}
              style={{ color: 'hsl(var(--muted-foreground))' }}
              data-testid="MoreVertical__cb728e" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
          Tesorería / {t('fm.list.title') ?? 'Declaraciones'}
        </div>
      </div>
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="fm-toolbar">
        <FilterDropdown
          label="Todos los años"
          value={yearFilter}
          options={yearOptions}
          onChange={setYearFilter}
          data-testid="FilterDropdown__cb728e" />
        <FilterDropdown
          label="Todos los modelos"
          value={modelFilter}
          options={modelOptions}
          onChange={setModelFilter}
          data-testid="FilterDropdown__cb728e" />
        <FilterDropdown
          label="Todos los estados"
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
          data-testid="FilterDropdown__cb728e" />

        <div className="fm-toolbar__space" />

        <button className="fm-section-header__icon-btn" title={t('fm.action.filter')} aria-label={t('fm.action.filter')}>
          <Search size={16} strokeWidth={1.75} data-testid="Search__cb728e" />
        </button>
        <button className="fm-section-header__icon-btn" title={t('fm.action.sort')} aria-label={t('fm.action.sort')}>
          <ArrowUpDown size={16} strokeWidth={1.75} data-testid="ArrowUpDown__cb728e" />
        </button>
        <RowKebab
          onDemo={() => setDecls(DEMO_DECLARATIONS.map(normDecl))}
          onConfig={() => setShowConfig(true)}
          t={t}
          data-testid="RowKebab__cb728e" />

        <button
          className="fm-toolbar__btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}
          onClick={() => setShowCatalog(true)}
        >
          <LayoutGrid size={14} strokeWidth={1.75} data-testid="LayoutGrid__cb728e" />
          {t('fm.catalog.title') ?? 'Catálogo de modelos'} ({activeCount})
        </button>

        {activeCount > 0 && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowNewDecl(true)}
          >
            + Nueva declaración
          </button>
        )}
      </div>
      {/* ── KPI cards row ─────────────────────────────────────── */}
      <KpiCardsRow decls={modelYearFiltered} t={t} data-testid="KpiCardsRow__cb728e" />
      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="fm-table-wrap">
        {activeCount === 0
          ? (
            <EmptyState
              title={t('fm.list.empty_no_active_models') ?? 'No tienen modelos activos, configure desde el Catálogo de modelos.'}
              cta={(
                <button className="fm-toolbar__btn" onClick={() => setShowCatalog(true)}>
                  <LayoutGrid size={14} strokeWidth={1.75} data-testid="LayoutGrid__cb728e" />
                  {t('fm.list.empty_no_active_models_cta') ?? 'Ir al catálogo de modelos'}
                </button>
              )}
              data-testid="EmptyState__cb728e" />
          )
          : filtered.length === 0
            ? <EmptyState data-testid="EmptyState__cb728e" />
            : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={allSelected}
                      onChange={toggleAll}
                      onClick={e => e.stopPropagation()}
                      data-testid="Checkbox__cb728e" />
                  </th>
                  <th>{t('fm.col.model')}</th>
                  <th>{t('fm.col.period')}</th>
                  <th>{t('fm.col.type')}</th>
                  <th style={{ minWidth: 180 }}>{t('fm.col.status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('fm.col.result')}</th>
                  <th>{t('fm.col.incidents')}</th>
                  <th>{t('fm.col.file')}</th>
                  <th>{t('fm.col.updated_at') ?? 'Última actualización'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(decl => {
                  const computed = decl.model === '349' ? computedMap349[decl.id] : computedMap[decl.id];
                  const hasStoredResult = !!decl.result?.kind;
                  const isComputingThis = ['303', '349'].includes(decl.model)
                    && decl.status === 'draft' && !computed && !hasStoredResult;
                  const computeError = (computed?.error && !hasStoredResult) ? computed.error : null;

                  let displayResult = decl.result;
                  if (computed?.summary && !computed.error) {
                    if (decl.model === '349') {
                      const total = ['totalE','totalS','totalA','totalI']
                        .reduce((s, k) => s + (parseFloat(computed.summary[k]) || 0), 0);
                      displayResult = { kind: 'info', amount: total };
                    } else {
                      const r = computed.summary.result;
                      const kind = getResultKind(r);
                      displayResult = { kind, amount: Math.abs(r) };
                    }
                  }

                  return (
                    <tr
                      key={decl.id}
                      className={decl.current ? 'fm-table__row--current' : ''}
                      onClick={() => onSelect?.({ ...decl, _precomputed: computed })}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(decl.id)}
                          onChange={() => toggleSelect(decl.id)}
                          onClick={e => e.stopPropagation()}
                          data-testid="Checkbox__cb728e" />
                      </td>
                      <td>
                        <ModelBadge model={decl.model} data-testid="ModelBadge__cb728e" />
                        <span className="fm-model-year" style={{ marginLeft: 6, fontWeight: 600 }}>{decl.year}</span>
                      </td>
                      <td><span className="fm-period">{decl.period}</span></td>
                      <td>{decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}</td>
                      <td>
                        <StatusText status={decl.status} t={t} data-testid="StatusText__cb728e" />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <ResultText
                          isComputing={isComputingThis}
                          error={computeError}
                          result={displayResult}
                          t={t}
                          data-testid="ResultText__cb728e" />
                      </td>
                      <td>
                        <IncidentsCell
                          blocking={decl.incidents?.blocking ?? 0}
                          warning={decl.incidents?.warning ?? 0}
                          t={t}
                          data-testid="IncidentsCell__cb728e" />
                      </td>
                      <td><FileCell
                        file={decl.file}
                        fileExternal={decl.fileExternal}
                        data-testid="FileCell__cb728e" /></td>
                      <td><span className="fm-date">{decl.updatedAt ?? '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
      {/* ── Overlays ─────────────────────────────────────────────── */}
      {showConfig  && <ConfigDrawer
        onClose={() => setShowConfig(false)}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="ConfigDrawer__cb728e" />}
      {showNewDecl && <NewDeclModal
        onConfirm={handleNewDecl}
        onClose={() => setShowNewDecl(false)}
        activeModels={activeModels}
        data-testid="NewDeclModal__cb728e" />}
      {/* ── Catalog drawer (slides from right) ───────────────────── */}
      {showCatalog && (
        <>
          <div className="fm-catalog-overlay" onClick={() => setShowCatalog(false)} />
          <div className="fm-catalog-drawer">
            <FmCatalogPage
              activeModels={activeModels}
              onBack={() => setShowCatalog(false)}
              onSave={(newActive) => { setActiveModels(newActive); setShowCatalog(false); }}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="FmCatalogPage__cb728e" />
          </div>
        </>
      )}
    </div>
  );
}
