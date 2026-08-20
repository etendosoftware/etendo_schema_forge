import React, { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import {
  Download, CircleCheck, Search,
  Loader2, Globe, ChevronDown, Users, FileEdit,
  TriangleAlert, ReceiptText, Calculator, PenLine, ShieldAlert, Info, FileCheck,
  OctagonAlert,
} from 'lucide-react';
import { KpiWidget, Tabs, MoreOptionsMenu } from '../../FmCommon.jsx';
import { SourcesTab, IncidentsTab } from '../../FmTabContent.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { PresentModal, FileGenModal } from '../../FmOverlays.jsx';
import { formatAmount, compute349Operators, generate349File } from '../../fiscalModelsUtils.js';
import { AttachmentsTab, useAttachments } from '@/components/attachments';
import '../../fiscal-models.css';

// AD table name backing the AEAT justificante attachments store — this is the
// same shared, model-agnostic table 303 uses. 349 only wires the manual
// "Presentación con Acuse de recibo" upload path here — no telematic
// submission flow (no backend endpoint for it yet).
const FISCAL_DECL_TABLE = 'ETGO_Fiscal_Decl';

// statusLabelKey (ETP-4755): see FmModel303Page.jsx for the identical helper — the status
// badge must always read the plain "Presentado" for BOTH `submitted` and `submitted_ack`;
// HOW it was submitted is shown exclusively via the `submissionMethod` suffix below.
function statusLabelKey(status) {
  return status === 'submitted_ack' ? 'submitted' : status;
}

// ── Constants ────────────────────────────────────────────────────
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

  const keyColors = { E: 'var(--status-info-bg)', S: 'var(--status-info-bg)', A: 'var(--status-warning-bg)', I: 'var(--status-info-bg)' };
  const keyFgColors = { E: 'var(--status-info-fg)', S: 'var(--status-info-fg)', A: 'var(--status-warning-fg)', I: 'var(--status-info-fg)' };
  const keyBorderColors = { E: 'var(--status-info-border)', S: 'var(--status-info-border)', A: 'var(--status-warning-border)', I: 'var(--status-info-border)' };

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

// VIES pending-validation banner — extracted out of the main component's render
// (SonarQube S3776: keeps FmModel349Page's own cognitive complexity down without
// changing behavior) so the `viesPending > 0 && !dismissed` gate lives in its own
// small function instead of nesting inside the main render tree.
function ViesBanner({ viesPending, dismissed, onDismiss, t }) {
  if (viesPending <= 0 || dismissed) return null;
  return (
    <div style={{ padding: '8px 20px', flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 8, background: 'var(--status-info-bg)',
      }}>
        <Globe
          size={14}
          strokeWidth={1.75}
          style={{ color: 'var(--status-info-fg)', flexShrink: 0 }}
          data-testid="Globe__346dd5" />
        <span style={{ fontSize: 14, flex: 1 }}>
          <span style={{ color: 'var(--status-info-fg)', fontWeight: 500 }}>
            {t('fm.m349.banner.vies_title', { count: viesPending }) ?? `${viesPending} NIF-IVA con validación VIES pendiente`}
          </span>
          {' '}
          <span style={{ color: 'var(--status-info-fg)', fontWeight: 400 }}>
            {t('fm.m349.banner.vies_sub') ?? 'Validación VIES asíncrona — informativa, no bloqueante'}
          </span>
        </span>
        <button
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--status-info-fg)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap' }}
        >
          {t('fm.m349.banner.vies_action') ?? 'Validar VIES'}
        </button>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-info-fg)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          onClick={onDismiss}
          aria-label={t('fm.action.close') ?? 'Cerrar'}
        >×</button>
      </div>
    </div>
  );
}

// Shared invoices/incidents/receipt tab content — extracted out of the main
// component's render (SonarQube S3776, same rationale as ViesBanner above): the
// `activeTab === 'invoices' || ... || ...` gate and its 3 nested per-tab `&&`
// branches now live in their own function, called unconditionally below.
function DetailTabContent({
  activeTab, decl, liveInvoices, blocking, warning, t, onGoToSources, apiBaseUrl, status,
}) {
  if (activeTab !== 'invoices' && activeTab !== 'incidents' && activeTab !== 'receipt') return null;
  return (
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
          onGoToSources={onGoToSources}
          data-testid="IncidentsTab__346dd5" />
      )}
      {activeTab === 'receipt' && (
        <AttachmentsTab
          tableName={FISCAL_DECL_TABLE}
          recordId={decl.id}
          apiBaseUrl={apiBaseUrl}
          isActive={activeTab === 'receipt'}
          config={{ allowedMimeTypes: ['application/pdf'] }}
          key={status}
          data-testid="AttachmentsTab__349receipt" />
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function FmModel349Page({ decl, onBack, onStatusChange, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;

  const [status,      setStatus]      = useState(decl.status);
  // submissionMethod (ETP-4755) — see FmModel303Page.jsx's identical state for the full
  // rationale: distinguishes the manual "Presentado" paths from a real AEAT telematic
  // submission (303-only; a 349 declaration only ever reaches the two manual paths).
  const [submissionMethod, setSubmissionMethod] = useState(decl.submissionMethod);
  const [activeTab,   setActiveTab]   = useState('operators');
  const [keyFilter,   setKeyFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  const [liveOperators, setLiveOperators] = useState(decl._precomputed?.operators ?? null);
  const [liveInvoices,  setLiveInvoices]  = useState(decl._precomputed?.invoices  ?? null);
  const [liveRectifications, setLiveRectifications] = useState(decl._precomputed?.rectifications ?? null);
  const [viesBannerDismissed, setViesBannerDismissed] = useState(false);

  React.useEffect(() => {
    if (decl._precomputed?.operators) setLiveOperators(decl._precomputed.operators);
    if (decl._precomputed?.invoices)  setLiveInvoices(decl._precomputed.invoices);
    if (decl._precomputed?.rectifications) setLiveRectifications(decl._precomputed.rectifications);
  }, [decl._precomputed]);
  // Only the setter is used below (no consumer reads the filtered value yet —
  // pre-existing, not introduced by this change); keeping the binding slot
  // empty avoids an unused-variable warning without touching that behavior.
  const [, setInvoiceNifFilter] = useState(null);
  const [computing,    setComputing]    = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState(null);

  // Only used to grab `upload()` for the manual acuse-de-recibo path below —
  // isActive: false keeps it from eagerly listing/fetching attachments on
  // mount (that eager fetch is owned by the "receipt" tab's own AttachmentsTab).
  const { upload: uploadReceipt } = useAttachments({
    tableName: FISCAL_DECL_TABLE,
    recordId: decl.id,
    apiBaseUrl,
    isActive: false,
  });

  const operators = liveOperators ?? decl.operators ?? MOCK_OPERATORS;

  const monthNum  = /^\d{2}$/.test(decl.period) ? parseInt(decl.period, 10) : null;
  const monthName = monthNum
    ? new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000, monthNum - 1, 1))
    : null;
  const periodLabel = monthName ? `${decl.year} / ${monthName}` : `${decl.year} ${decl.period}`;

  const blocking     = decl.incidents?.blocking ?? 0;
  const warning      = decl.incidents?.warning  ?? 0;
  const viesPending  = operators.filter(o => o.vies === 'pending').length;
  const totalBase    = operators.reduce((s,o) => s + (parseFloat(o.base) || 0), 0);
  const rectifRows     = liveRectifications ?? decl.rectifications ?? [];
  const rectifications = Array.isArray(rectifRows) ? rectifRows.length : 0;

  function handleStatusChange(newStatus, newSubmissionMethod) {
    setStatus(newStatus);
    if (newSubmissionMethod) setSubmissionMethod(newSubmissionMethod);
    onStatusChange?.(decl.id, newStatus, newSubmissionMethod);
  }

  // Manual "Presentación con Acuse de recibo" path: persist the uploaded
  // receipt to the same attachments store the "Justificante" tab reads
  // from. Fire-and-forget — useAttachments.upload() already toasts its
  // own errors and never rethrows, so a failed upload must not block the
  // status change the user explicitly confirmed.
  function handlePresent({ status: newStatus, acuseFile }) {
    if (newStatus === 'submitted_ack' && acuseFile) {
      uploadReceipt(acuseFile);
    }
    // submissionMethod (ETP-4755) — see FmModel303Page.jsx's handlePresent for the
    // identical rationale; 349 only ever exercises these two manual paths.
    const submissionMethodForPath = newStatus === 'submitted_ack' ? 'manual_ack' : 'manual_no_receipt';
    handleStatusChange(newStatus, submissionMethodForPath);
  }

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await compute349Operators(decl, { apiBaseUrl });
      if (res?.operators) setLiveOperators(res.operators);
      if (res?.invoices)  setLiveInvoices(res.invoices);
      if (res?.rectifications) setLiveRectifications(res.rectifications);
    } finally {
      setComputing(false);
    }
  }

  // Auto-compute on mount when the list didn't hand us any precomputed data
  // (ETP-4755 regression). `FmListPage`'s `useFiscalAutoCompute` only ever
  // precomputes DRAFT declarations — once a declaration is submitted (or is
  // opened via a path that bypasses the list's own auto-compute), `decl._precomputed`
  // is `undefined` and operators/invoices/rectifications all start blank (and, worse,
  // `operators` below falls back to `MOCK_OPERATORS` — real-looking demo data —
  // instead of showing empty). This mirrors what the (now hidden-when-submitted)
  // "Calcular" button used to do manually. Scoped to `decl.id` only (not
  // `liveOperators`/`decl._precomputed`) so it fires exactly once per opened
  // declaration instead of looping once `handleCompute` populates state.
  useEffect(() => {
    const hasPrecomputed = decl._precomputed?.operators != null || liveOperators != null;
    if (hasPrecomputed) return;
    if (!apiBaseUrl) return;
    handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id]);

  async function handleGenerate({
    phone, contact, fileName, substitutive, formerStatement, representativeTaxId, navarra, guipuzcoa,
  } = {}) {
    setGenError(null);
    setGenerating(true);
    const result = await generate349File(decl, { apiBaseUrl, phone, contact,
      fileName, substitutive, formerStatement, representativeTaxId, navarra, guipuzcoa,
    });
    setGenerating(false);
    if (!result.ok) {
      // Classic does not client-side-validate Substitutive/Navarra/Guipuzcoa combinations
      // either (no AD_Val_Rule for it) — it lets the user attempt and shows AEAT3492010Report's
      // real validation error (e.g. "@AEAT349_FormerStatement_Required@",
      // "@AEAT349_NAVARRA_OR_GUIPUZCOA@") when the backend rejects it. Mirror that here instead
      // of adding preventive validation, which would be stricter than classic.
      const msg = result.serverMessage
        || t('fm.gen349.error.generic')
        || 'Error al generar el fichero. Por favor, inténtelo de nuevo.';
      setGenError(msg);
      console.error('generate349File failed for', decl.year, decl.period, result.error, result.serverMessage);
    }
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
      const k = `${inv.nifIva}|${inv.key ?? ''}`;
      if (!map[k]) map[k] = { Compra: 0, Venta: 0 };
      map[k][inv.type] = (map[k][inv.type] ?? 0) + 1;
    });
    return map;
  }, [liveInvoices]);

  function formatOrigin(op) {
    if (op.origin) return op.origin;
    const counts = originByNif[`${op.nif}|${op.key ?? ''}`];
    if (!counts) return null;
    const c = counts['Compra'] ?? 0;
    const v = counts['Venta']  ?? 0;
    if (c > 0 && v > 0) return `${c} compra, ${v} venta`;
    if (c > 0) return `${c} factura${c !== 1 ? 's' : ''} compra`;
    if (v > 0) return `${v} factura${v !== 1 ? 's' : ''} venta`;
    return null;
  }

  const TABS = [
    { id:'operators', label: t('fm.m349.tab.operators'), badge: operators.length,        icon: <Users size={16} strokeWidth={1.75} data-testid="Users__346dd5" /> },
    { id:'rectif',    label: t('fm.m349.tab.rectif'),    badge: rectifications || null,  icon: <FileEdit size={16} strokeWidth={1.75} data-testid="FileEdit__346dd5" /> },
    { id:'invoices',  label: t('fm.m349.tab.invoices'),  badge: liveInvoices?.length ?? null, icon: <ReceiptText size={16} strokeWidth={1.75} data-testid="ReceiptText__346dd5" /> },
    { id:'incidents', label: t('fm.m349.tab.incidents'), badge: blocking || null,        icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__346dd5" /> },
    { id:'receipt',   label: t('fm.tab.receipt') ?? 'Justificante', badge: null,        icon: <FileCheck size={16} strokeWidth={1.75} data-testid="FileCheck__346dd5" /> },
  ];

  const isSubmitted = ['submitted', 'submitted_ext', 'submitted_ack'].includes(status);

  return (
    <div className="fm-page fm-page--freeflow">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="fm-model-badge fm-model-badge--349">349</span>
          <span style={{ fontWeight: 600, fontSize: 20, color: 'hsl(var(--foreground))' }}>
            Modelo 349 - {periodLabel}
          </span>
          <div style={{ flex: 1 }} />
          <MoreOptionsMenu
            favKey="fiscal-models"
            favLabel={t('fm.list.title') ?? 'Declaraciones'}
            data-testid="MoreOptionsMenu__346dd5" />
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', marginTop: 2 }}>
          Tesorería / Declaraciones / Modelo 349 - {periodLabel}
        </div>
      </div>
      {/* ── Action bar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px 10px',
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <button className="fm-btn" onClick={onBack}
          style={{ borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14, color: 'hsl(var(--foreground))' }}>
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${statusLabelKey(status)}`) ?? status}
          {/* submissionMethod (ETP-4755) — see FmModel303Page.jsx for the identical pattern.
              The badge text itself never varies between `submitted` and `submitted_ack`
              (see `statusLabelKey`) — only this sub-suffix does. */}
          {submissionMethod && (status === 'submitted' || status === 'submitted_ack') && (
            <span style={{ opacity: .75 }}> · {t(`fm.present.method.${submissionMethod}`)}</span>
          )}
        </span>

        <div style={{ flex: 1 }} />

        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={handleCompute}
            disabled={computing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14 }}
          >
            {computing
              ? <Loader2
                  size={16}
                  strokeWidth={1.75}
                  style={{ animation: 'spin 1s linear infinite' }}
                  data-testid="Loader2__346dd5" />
              : <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__346dd5" />
            }
            {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.compute') ?? 'Calcular')}
          </button>
        )}

        <button
          className="fm-btn"
          onClick={() => { setGenError(null); setShowFilegen(true); }}
          disabled={generating}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14 }}
        >
          <Download size={16} strokeWidth={1.75} data-testid="Download__346dd5" />
          {t('fm.action.gen349') ?? 'Generar fichero 349'}
        </button>

        {!isSubmitted && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowPresent(true)}
          >
            <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__346dd5" />
            {t('fm.action.present') ?? "Marcar como 'Presentado'"}
          </button>
        )}
      </div>
      {/* ── VIES banner ──────────────────────────────────────────── */}
      <ViesBanner
        viesPending={viesPending}
        dismissed={viesBannerDismissed}
        onDismiss={() => setViesBannerDismissed(true)}
        t={t}
        data-testid="ViesBanner__346dd5" />
      {/* ── KPI bar ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: 12, padding: '0 8px',
        height: 84, flexShrink: 0,
      }}>
        <KpiWidget
          icon={<Users size={20} strokeWidth={1.75} data-testid="Users__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.operators') ?? 'Operadores'}
          value={String(operators.length)}
          badge={t('fm.m349.kpi.operators_desc') ?? 'Activos'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--text-disabled))"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.total_ops') ?? 'Total operaciones'}
          value={formatAmount(totalBase)}
          badge={t('fm.m349.kpi.total_ops_desc') ?? 'Base total'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--text-disabled))"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<PenLine size={20} strokeWidth={1.75} data-testid="PenLine__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.rectif') ?? 'Rectificaciones'}
          value={String(rectifications)}
          badge={t('fm.m349.kpi.rectif_desc') ?? 'Previos'}
          badgeBg="var(--status-warning-bg)"
          badgeColor="var(--status-warning-fg)"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<ShieldAlert size={20} strokeWidth={1.75} data-testid="ShieldAlert__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.vies_pending') ?? 'Pendientes VIES'}
          value={String(viesPending)}
          valueColor={viesPending > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))'}
          badge={t('fm.m349.kpi.vies_pending_desc') ?? 'Sin validar'}
          badgeBg={viesPending > 0 ? 'var(--status-destructive-bg)' : 'hsl(var(--muted))'}
          badgeColor={viesPending > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--text-disabled))'}
          data-testid="KpiWidget__346dd5" />
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
          <OctagonAlert size={14} data-testid="OctagonAlert__gen_error_349" />
          {genError}
        </div>
      )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: `1px solid ${searchQuery ? 'hsl(var(--focus-ring))' : 'hsl(var(--border-subtle))'}`, borderRadius: 8, fontSize: 14, color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--card))', minWidth: 240 }}>
                <Search
                  size={15}
                  strokeWidth={1.75}
                  style={{ flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}
                  data-testid="Search__346dd5" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('fm.m349.search_placeholder')}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'hsl(var(--muted-foreground))', width: '100%' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
                )}
              </div>
            </div>

            {/* Full-width separator above NIF-IVA columns */}
            <div style={{ margin: '4px -20px 0', borderTop: '1px solid hsl(var(--border-subtle))' }} />

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
          rectifRows.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'hsl(var(--foreground))', marginBottom: 6 }}>
                {t('fm.m349.tab.rectif') ?? 'Rectificaciones'}
              </div>
              <div style={{ fontSize: 13, color: 'hsl(var(--text-disabled))' }}>
                {t('fm.m349.rectif.empty')}
              </div>
            </div>
          ) : (
            <div className="fm-table-wrap" style={{ marginTop: 8 }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 20 }}>{t('fm.col.date')}</th>
                    <th>{t('fm.m349.rectif.col.invoice')}</th>
                    <th>{t('fm.col.type')}</th>
                    <th>{t('fm.m349.col.operator')}</th>
                    <th>{t('fm.m349.rectif.col.original')}</th>
                    <th>{t('fm.m349.rectif.col.declared_period')}</th>
                    <th style={{ textAlign: 'right' }}>{t('fm.m349.rectif.col.base_products')}</th>
                    <th style={{ textAlign: 'right' }}>{t('fm.m349.rectif.col.base_services')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rectifRows.map((r, idx) => (
                    <tr key={`${r.ref}-${r.originalRef}-${idx}`}>
                      <td style={{ paddingLeft: 20, fontWeight: 600 }}>{r.date || '—'}</td>
                      <td>{r.ref}</td>
                      <td>{r.type}</td>
                      <td>
                        <div>{r.party}</div>
                        {r.nifIva && <div style={{ fontSize: 12, color: 'var(--fm-fg-3)' }}>{r.nifIva}</div>}
                      </td>
                      <td>{r.originalRef || '—'}</td>
                      <td>{r.declaredYear ? `${r.declaredYear} / ${r.declaredPeriod || '—'}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatAmount(r.baseProducts)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatAmount(r.baseServices)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
      {/* Shared tab content — same layout as 303 */}
      <DetailTabContent
        activeTab={activeTab}
        decl={decl}
        liveInvoices={liveInvoices}
        blocking={blocking}
        warning={warning}
        t={t}
        onGoToSources={() => setActiveTab('invoices')}
        apiBaseUrl={apiBaseUrl}
        status={status}
        data-testid="DetailTabContent__346dd5" />
      {/* Overlays */}
      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={handlePresent}
          onClose={() => setShowPresent(false)}
          data-testid="PresentModal__346dd5" />
      )}
      {showFilegen && (
        <FileGenModal
          decl={decl}
          onConfirm={(payload) => handleGenerate(payload)}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal__346dd5" />
      )}
    </div>
  );
}
