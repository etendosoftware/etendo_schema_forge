import React, { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import {
  Download, CircleCheck, Search,
  RefreshCw, Globe, Eye, MoreVertical, ChevronDown, Users, FileEdit, Clock,
  TriangleAlert, Folder, ReceiptText, Calculator, PenLine, ShieldAlert, Info,
} from 'lucide-react';
import { KpiWidget, Tabs } from '../../FmCommon.jsx';
import { SourcesTab, IncidentsTab, FilesTab, HistoryTab } from '../../FmTabContent.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { PresentModal, FileGenModal } from '../../FmOverlays.jsx';
import { formatAmount, compute349Operators, generate349File } from '../../fiscalModelsUtils.js';
import { use349Pdf } from './use349Pdf.js';
import { DocumentPreview } from '../../../../../components/contract-ui/DocumentPreview.jsx';
import '../../fiscal-models.css';

// ── Constants ────────────────────────────────────────────────────
const STEPPER_INDEX = {
  pending:0, draft:1, ready:2,
  submitted:3, submitted_ext:3, submitted_ack:3,
  skipped:-1,
};

const KEY_IDS = ['E', 'S', 'A', 'I'];

const MOCK_OPERATORS = [
  { id:1, nif:'IT12345678901', name:'Bramini Vino S.r.l.',        key:'A', base:12450.00, vies:'valid',   origin:'4 facturas compra' },
  { id:2, nif:'FR40123456789', name:'Olives de Provence SARL',    key:'A', base:6800.00,  vies:'valid',   origin:'2 facturas compra' },
  { id:3, nif:'DE123456789',   name:'Bayern Technik GmbH',        key:'E', base:17600.00, vies:'valid',   origin:'3 facturas venta' },
  { id:4, nif:'PT501234567',   name:'Lusitana Serviços Lda',      key:'S', base:650.00,   vies:'pending', origin:'1 factura servicio' },
  { id:5, nif:'NL123456789B01',name:'Amsterdam Trading BV',       key:'I', base:1450.00,  vies:'valid',   origin:'2 facturas recibidas' },
  { id:7, nif:'PL1234567890',  name:'Kraków Components sp.z.o.o.',key:'A', base:3200.00,  vies:'valid',   origin:'1 factura compra' },
];

// ── Sub-components ───────────────────────────────────────────────
function KeyBadge({ k }) {
  return <span className={`fm-key fm-key--${k}`}>{k}</span>;
}

function ViesBadge({ status }) {
  const t = useUI();
  const map = { valid: ['✓', 'valid'], pending: ['○', 'pending'], invalid: ['×', 'invalid'] };
  const [icon, cls] = map[status] ?? map.pending;
  return <span className={`fm-vies fm-vies--${cls}`}>{icon} {t(`fm.m349.vies.${status ?? 'pending'}`)}</span>;
}

function TotalsCard({ operators, t }) {
  const totals = {};
  KEY_IDS.forEach(k => { totals[k] = operators.filter(o => o.key === k).reduce((s,o) => s + (parseFloat(o.base) || 0), 0); });
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="fm-349-totals">
      <div className="fm-349-totals__card">
        <div className="fm-349-totals__title">
          {t('fm.m349.totals.title')}
          <span
            className="fm-349-totals__info-wrap"
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
          >
            <Info
              size={12}
              strokeWidth={1.75}
              style={{ color: 'var(--fm-fg-3)', cursor: 'help' }}
              data-testid="Info__346dd5" />
            {showInfo && (
              <div className="fm-349-totals__tooltip">
                {t('fm.m349.totals.info') ?? 'Calculados a partir de los operadores. No editable. Modifica los operadores para ajustar los totales.'}
              </div>
            )}
          </span>
        </div>
        {KEY_IDS.map(k => (
          <div key={k} className="fm-349-total-row">
            <div className="fm-349-total-row__left">
              <KeyBadge k={k} data-testid="KeyBadge__346dd5" />
              <span className="fm-349-total-row__label">{t(`fm.m349.key.${k}`)}</span>
            </div>
            <span className={`fm-349-total-row__amount${totals[k] === 0 ? ' fm-349-total-row__amount--zero' : ''}`}>
              {formatAmount(totals[k])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Key filter dropdown
function KeyFilterDropdown({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allLabel = t('fm.m349.filter.all_keys') ?? 'Todas las claves';
  const selectedLabel = value === 'all'
    ? allLabel
    : `${value} — ${t('fm.m349.key.' + value) ?? value}`;

  const keyColors = { E: '#F0FAFF', S: '#FEECFB', A: '#FFF2EE', I: '#F4F1FD' };
  const keyFgColors = { E: '#0075AD', S: '#A5088C', A: '#B82E00', I: '#4316CA' };
  const keyBorderColors = { E: '#ADE4FF', S: '#FCC5F3', A: '#FFCDBD', I: '#C6B6F7' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="fm-toolbar__pill"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
      >
        {selectedLabel}
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          style={{ opacity: .6 }}
          data-testid="ChevronDown__346dd5" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 220 }}>
          <button
            className={`fm-status-select__item${value === 'all' ? ' fm-status-select__item--active' : ''}`}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span style={{ flex: 1 }}>{allLabel}</span>
            {value === 'all' && <span>✓</span>}
          </button>
          {KEY_IDS.map(k => (
            <button
              key={k}
              className={`fm-status-select__item${value === k ? ' fm-status-select__item--active' : ''}`}
              onClick={() => { onChange(k); setOpen(false); }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: keyColors[k], color: keyFgColors[k],
                border: `1px solid ${keyBorderColors[k]}`,
              }}>{k}</span>
              <span style={{ flex: 1 }}>{t(`fm.m349.key.${k}`)}</span>
              {value === k && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── More options kebab menu ──────────────────────────────────────
function MoreOptionsMenu349({ onVies, onPreviewPdf, onGenerate, pdfLoading, generating, t }) {
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
        className="fm-btn"
        style={{ padding: '8px 10px', borderRadius: 8 }}
        onClick={() => setOpen(o => !o)}
        aria-label="Más opciones"
      >
        <MoreVertical size={15} strokeWidth={1.75} data-testid="MoreVertical__346dd5" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="menu" style={{ right: 0, left: 'auto', minWidth: 220 }}>
          <button className="fm-status-select__item" role="menuitem" onClick={() => { onVies(); setOpen(false); }}>
            <Globe
              size={13}
              strokeWidth={1.75}
              style={{ color: '#6b7280' }}
              data-testid="Globe__346dd5" />
            VIES
          </button>
          <button className="fm-status-select__item" role="menuitem" onClick={() => { onPreviewPdf(); setOpen(false); }} disabled={pdfLoading}>
            <Eye
              size={13}
              strokeWidth={1.75}
              style={{ color: '#6b7280' }}
              data-testid="Eye__346dd5" />
            {t('fm.action.preview_pdf') ?? 'Vista previa PDF'}
          </button>
          <button className="fm-status-select__item" role="menuitem" onClick={() => { onGenerate(); setOpen(false); }} disabled={generating}>
            <Download
              size={13}
              strokeWidth={1.75}
              style={{ color: '#6b7280' }}
              data-testid="Download__346dd5" />
            {t('fm.action.generate_file') ?? 'Generar fichero'}
          </button>
        </div>
      )}
    </div>
  );
}


// ── Main ─────────────────────────────────────────────────────────
export default function FmModel349Page({ decl, onBack, onStatusChange, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;

  const [status,      setStatus]      = useState(decl.status);
  const [activeTab,   setActiveTab]   = useState('operators');
  const [keyFilter,   setKeyFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  const [liveOperators, setLiveOperators] = useState(decl._precomputed?.operators ?? null);
  const [liveInvoices,  setLiveInvoices]  = useState(decl._precomputed?.invoices  ?? null);
  const [viesBannerDismissed, setViesBannerDismissed] = useState(false);

  React.useEffect(() => {
    if (decl._precomputed?.operators) setLiveOperators(decl._precomputed.operators);
    if (decl._precomputed?.invoices)  setLiveInvoices(decl._precomputed.invoices);
  }, [decl._precomputed]);
  const [invoiceNifFilter, setInvoiceNifFilter] = useState(null);
  const [computing,    setComputing]    = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [showPdf,      setShowPdf]      = useState(false);
  const { pdfUrl, loading: pdfLoading, generatePdf, clearPdf } = use349Pdf();

  const operators = liveOperators ?? decl.operators ?? MOCK_OPERATORS;
  const stepIdx   = STEPPER_INDEX[status] ?? 0;

  const monthNum  = /^\d{2}$/.test(decl.period) ? parseInt(decl.period, 10) : null;
  const monthName = monthNum
    ? new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000, monthNum - 1, 1))
    : null;
  const periodLabel = monthName ? `${decl.year} / ${monthName}` : `${decl.year} ${decl.period}`;

  const blocking     = decl.incidents?.blocking ?? 0;
  const warning      = decl.incidents?.warning  ?? 0;
  const fileBlocked  = blocking > 0;
  const viesPending  = operators.filter(o => o.vies === 'pending').length;
  const totalBase    = operators.reduce((s,o) => s + (parseFloat(o.base) || 0), 0);
  const rectifications = decl.rectifications ?? 1;

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    onStatusChange?.(decl.id, newStatus);
  }

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await compute349Operators(decl, { token, apiBaseUrl });
      if (res?.operators) setLiveOperators(res.operators);
      if (res?.invoices)  setLiveInvoices(res.invoices);
    } finally {
      setComputing(false);
    }
  }

  async function handleGenerate({ phone, contact } = {}) {
    setGenerating(true);
    const ok = await generate349File(decl, { token, apiBaseUrl, phone, contact });
    setGenerating(false);
    if (!ok) console.error('generate349File failed for', decl.year, decl.period);
  }

  async function handlePreviewPdf() {
    const url = await generatePdf(decl, operators);
    if (url) setShowPdf(true);
  }

  const searchLower  = searchQuery.trim().toLowerCase();
  const filteredOps  = operators
    .filter(o => keyFilter === 'all' || o.key === keyFilter)
    .filter(o => !searchLower ||
      (o.name ?? '').toLowerCase().includes(searchLower) ||
      (o.nif  ?? '').toLowerCase().includes(searchLower)
    );
  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected  = filteredOps.length > 0 && filteredOps.every(o => selected.has(o.id));

  const originByNif = React.useMemo(() => {
    if (!liveInvoices) return {};
    const map = {};
    liveInvoices.forEach(inv => {
      const k = inv.nifIva;
      if (!map[k]) map[k] = { Compra: 0, Venta: 0 };
      map[k][inv.type] = (map[k][inv.type] ?? 0) + 1;
    });
    return map;
  }, [liveInvoices]);

  function formatOrigin(op) {
    if (op.origin) return op.origin;
    const counts = originByNif[op.nif];
    if (!counts) return null;
    const c = counts['Compra'] ?? 0;
    const v = counts['Venta']  ?? 0;
    if (c > 0 && v > 0) return `${c} compra, ${v} venta`;
    if (c > 0) return `${c} factura${c !== 1 ? 's' : ''} compra`;
    if (v > 0) return `${v} factura${v !== 1 ? 's' : ''} venta`;
    return null;
  }

  const declNif = decl.nif ?? '';

  const TABS = [
    { id:'operators', label: t('fm.m349.tab.operators'), badge: operators.length,        icon: <Users size={16} strokeWidth={1.75} data-testid="Users__346dd5" /> },
    { id:'rectif',    label: t('fm.m349.tab.rectif'),    badge: rectifications,          icon: <FileEdit size={16} strokeWidth={1.75} data-testid="FileEdit__346dd5" /> },
    { id:'invoices',  label: t('fm.m349.tab.invoices'),  badge: liveInvoices?.length ?? null, icon: <ReceiptText size={16} strokeWidth={1.75} data-testid="ReceiptText__346dd5" /> },
    { id:'incidents', label: t('fm.m349.tab.incidents'), badge: blocking || null,        icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__346dd5" /> },
    { id:'files',     label: t('fm.m349.tab.files'),     badge: null,                   icon: <Folder size={16} strokeWidth={1.75} data-testid="Folder__346dd5" /> },
    { id:'history',   label: t('fm.m349.tab.history'),   badge: null,                   icon: <Clock size={16} strokeWidth={1.75} data-testid="Clock__346dd5" /> },
  ];

  const isSubmitted = ['submitted', 'submitted_ext', 'submitted_ack'].includes(status);

  return (
    <div className="fm-page fm-page--freeflow">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="fm-model-badge fm-model-badge--349">349</span>
          <span style={{ fontWeight: 600, fontSize: 20, color: '#121217' }}>
            Modelo 349 - {periodLabel}
          </span>
          <div style={{ flex: 1 }} />
          <MoreVertical
            size={16}
            strokeWidth={1.75}
            style={{ color: '#9ca3af', cursor: 'pointer' }}
            data-testid="MoreVertical__346dd5" />
        </div>
        <div style={{ fontSize: 12, color: '#828FA3', marginTop: 2 }}>
          Tesorería / Declaraciones / Modelo 349 - {periodLabel}
        </div>
      </div>
      {/* ── Action bar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px 10px',
        background: '#fff', flexShrink: 0,
      }}>
        <button className="fm-btn" onClick={onBack}
          style={{ borderRadius: 8, border: '1px solid #D1D4DB', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', fontSize: 14, color: '#121217' }}>
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: '#F5F7F9', color: '#3F3F50',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${status}`) ?? status}
        </span>

        <div style={{ flex: 1 }} />

        <MoreOptionsMenu349
          onVies={() => {}}
          onPreviewPdf={handlePreviewPdf}
          onGenerate={() => setShowFilegen(true)}
          pdfLoading={pdfLoading}
          generating={generating}
          t={t}
          data-testid="MoreOptionsMenu349__346dd5" />

        <button
          className="fm-btn"
          onClick={handleCompute}
          disabled={computing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #D1D4DB', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', padding: '8px 12px', fontSize: 14 }}
        >
          <RefreshCw
            size={20}
            strokeWidth={1.75}
            style={computing ? { animation: 'spin 1s linear infinite' } : {}}
            data-testid="RefreshCw__346dd5" />
          {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.recalc') ?? 'Recalcular')}
        </button>

        {!isSubmitted && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowPresent(true)}
          >
            <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__346dd5" />
            {t('fm.action.present') ?? "Marcar como 'Presentado'"}
          </button>
        )}
      </div>
      {/* ── VIES banner ──────────────────────────────────────────── */}
      {viesPending > 0 && !viesBannerDismissed && (
        <div style={{ padding: '8px 20px', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 8, background: '#F0FAFF',
          }}>
            <Globe
              size={14}
              strokeWidth={1.75}
              style={{ color: '#0075AD', flexShrink: 0 }}
              data-testid="Globe__346dd5" />
            <span style={{ fontSize: 14, flex: 1 }}>
              <span style={{ color: '#0075AD', fontWeight: 500 }}>
                {t('fm.m349.banner.vies_title', { count: viesPending }) ?? `${viesPending} NIF-IVA con validación VIES pendiente`}
              </span>
              {' '}
              <span style={{ color: '#0075AD', fontWeight: 400 }}>
                {t('fm.m349.banner.vies_sub') ?? 'Validación VIES asíncrona — informativa, no bloqueante'}
              </span>
            </span>
            <button
              style={{ fontSize: 14, fontWeight: 500, color: '#0075AD', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap' }}
            >
              {t('fm.m349.banner.vies_action') ?? 'Validar VIES'}
            </button>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0075AD', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
              onClick={() => setViesBannerDismissed(true)}
              aria-label={t('fm.action.close') ?? 'Cerrar'}
            >×</button>
          </div>
        </div>
      )}
      {/* ── KPI bar ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: 12, padding: '0 8px',
        height: 84, flexShrink: 0,
      }}>
        <KpiWidget
          icon={<Users size={20} strokeWidth={1.75} data-testid="Users__346dd5" />}
          iconColor="#828FA3"
          label={t('fm.m349.kpi.operators') ?? 'Operadores'}
          value={String(operators.length)}
          badge={t('fm.m349.kpi.operators_desc') ?? 'Activos'}
          badgeBg="#F5F7F9"
          badgeColor="#828FA3"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__346dd5" />}
          iconColor="#828FA3"
          label={t('fm.m349.kpi.total_ops') ?? 'Total operaciones'}
          value={formatAmount(totalBase)}
          badge={t('fm.m349.kpi.total_ops_desc') ?? 'Base total'}
          badgeBg="#F5F7F9"
          badgeColor="#828FA3"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<PenLine size={20} strokeWidth={1.75} data-testid="PenLine__346dd5" />}
          iconColor="#828FA3"
          label={t('fm.m349.kpi.rectif') ?? 'Rectificaciones'}
          value={String(rectifications)}
          badge={t('fm.m349.kpi.rectif_desc') ?? 'Previos'}
          badgeBg="#FFF9EB"
          badgeColor="#8A6100"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<ShieldAlert size={20} strokeWidth={1.75} data-testid="ShieldAlert__346dd5" />}
          iconColor="#828FA3"
          label={t('fm.m349.kpi.vies_pending') ?? 'Pendientes VIES'}
          value={String(viesPending)}
          valueColor={viesPending > 0 ? '#D50B3E' : '#121217'}
          badge={t('fm.m349.kpi.vies_pending_desc') ?? 'Sin validar'}
          badgeBg={viesPending > 0 ? '#FEF0F4' : '#F5F7F9'}
          badgeColor={viesPending > 0 ? '#D50B3E' : '#828FA3'}
          data-testid="KpiWidget__346dd5" />
      </div>
      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="fm-tabs-sticky" style={{ padding: '0 8px' }}>
        <Tabs
          tabs={TABS}
          active={activeTab}
          onSelect={(id) => { setActiveTab(id); if (id !== 'invoices') setInvoiceNifFilter(null); }}
          data-testid="Tabs__346dd5" />
      </div>
      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="fm-page__body">

        {activeTab === 'operators' && (
          <div>
            {/* Filter + search + new operator row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, marginTop: 8, flexWrap: 'wrap' }}>
              <KeyFilterDropdown
                value={keyFilter}
                onChange={setKeyFilter}
                t={t}
                data-testid="KeyFilterDropdown__346dd5" />
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: `1px solid ${searchQuery ? '#6366f1' : '#E8E8ED'}`, borderRadius: 8, fontSize: 14, color: '#6C6C89', background: '#fff', minWidth: 240 }}>
                <Search
                  size={15}
                  strokeWidth={1.75}
                  style={{ flexShrink: 0, color: '#6C6C89' }}
                  data-testid="Search__346dd5" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('fm.m349.search_placeholder')}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#6C6C89', width: '100%' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6C6C89', padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
                )}
              </div>
              <button className="fm-toolbar__btn fm-toolbar__btn--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, padding: '8px 12px' }}>
                + {t('fm.m349.action.new_operator') ?? 'Nuevo operador'}
              </button>
            </div>

            {/* Full-width separator above NIF-IVA columns */}
            <div style={{ margin: '4px -20px 0', borderTop: '1px solid #E8EAEF' }} />

            {/* Layout: totals panel + table */}
            <div style={{ display: 'flex', gap: 0 }}>
              <TotalsCard operators={operators} t={t} data-testid="TotalsCard__346dd5" />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fm-table-wrap" style={{ flex: 'none' }}>
                  <table className="fm-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32, paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={allSelected}
                            onChange={() => setSelected(allSelected ? new Set() : new Set(filteredOps.map(o => o.id)))}
                            onClick={e => e.stopPropagation()}
                            data-testid="Checkbox__346dd5" />
                        </th>
                        <th>{t('fm.m349.col.nif_iva')}</th>
                        <th>{t('fm.m349.col.operator')}</th>
                        <th>{t('fm.m349.col.key')}</th>
                        <th style={{ textAlign: 'right' }}>{t('fm.m349.col.taxable_base')}</th>
                        <th>{t('fm.m349.col.vies')}</th>
                        <th>{t('fm.m349.col.origin')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOps.map(op => (
                        <tr key={op.id} className={selected.has(op.id) ? 'fm-table__row--selected' : ''}>
                          <td style={{ paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(op.id)}
                              onChange={() => toggleSelect(op.id)}
                              onClick={e => e.stopPropagation()}
                              data-testid="Checkbox__346dd5" />
                          </td>
                          <td>{op.nif}</td>
                          <td style={{ fontWeight: 600 }}>{op.name}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <KeyBadge k={op.key} data-testid="KeyBadge__346dd5" />
                              <span style={{ fontSize: 14, color: 'var(--fm-fg-1)' }}>{t(`fm.m349.key.${op.key}`)}</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(op.base)}</td>
                          <td><ViesBadge status={op.vies} data-testid="ViesBadge__346dd5" /></td>
                          <td>
                            {formatOrigin(op)
                              ? <button className="fm-origin-link" onClick={() => { setInvoiceNifFilter(op.nif); setActiveTab('invoices'); }}>{formatOrigin(op)}</button>
                              : <span style={{ color: 'var(--fm-fg-4)' }}>—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rectif' && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>
              {t('fm.m349.tab.rectif') ?? 'Rectificaciones'}
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>
              {t('fm.m349.coming_soon') ?? 'Contenido disponible próximamente'}
            </div>
          </div>
        )}

      </div>
      {/* Shared tab content — same layout as 303 */}
      {(activeTab === 'invoices' || activeTab === 'incidents' || activeTab === 'files' || activeTab === 'history') && (
        <div className="fm-page__body" style={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden', ...(activeTab === 'invoices' || activeTab === 'incidents' ? { padding: 0 } : {}) }}>
          {activeTab === 'invoices' && (
            <SourcesTab
              decl={{ ...decl, sources: liveInvoices ?? decl.invoices }}
              t={t}
              data-testid="SourcesTab__346dd5" />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              decl={decl}
              blocking={blocking}
              warning={warning}
              t={t}
              onGoToSources={() => setActiveTab('invoices')}
              data-testid="IncidentsTab__346dd5" />
          )}
          {activeTab === 'files' && (
            <FilesTab
              decl={decl}
              t={t}
              fileBlocked={fileBlocked}
              onGenerate={() => setShowFilegen(true)}
              genLabel={t('fm.action.gen349') ?? 'Generar fichero 349'}
              data-testid="FilesTab__346dd5" />
          )}
          {activeTab === 'history' && (
            <HistoryTab decl={decl} t={t} data-testid="HistoryTab__346dd5" />
          )}
        </div>
      )}
      {/* Overlays */}
      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={({ status: s }) => handleStatusChange(s)}
          onClose={() => setShowPresent(false)}
          data-testid="PresentModal__346dd5" />
      )}
      {showFilegen && (
        <FileGenModal
          decl={decl}
          onConfirm={({ phone, contact }) => handleGenerate({ phone, contact })}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal__346dd5" />
      )}
      {showPdf && (
        <DocumentPreview
          open={showPdf}
          onClose={() => { setShowPdf(false); clearPdf(); }}
          title={`Modelo 349 · ${decl.year} ${decl.period}`}
          pdfUrl={pdfUrl}
          data-testid="DocumentPreview__346dd5" />
      )}
    </div>
  );
}
