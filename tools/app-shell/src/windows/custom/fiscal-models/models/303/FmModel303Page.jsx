import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  Download,
  OctagonAlert, TriangleAlert, CircleCheck,
  Calculator, Loader2, TrendingUp, TrendingDown,
  ClipboardCheck, ReceiptText, FileCheck, Landmark,
} from 'lucide-react';
import { Tabs, KpiWidget, MoreOptionsMenu } from '../../FmCommon.jsx';
import { SourcesTab, IncidentsTab } from '../../FmTabContent.jsx';
import FmBoxes303 from './FmBoxes303.jsx';
import { PresentModal, FileGenModal303 } from '../../FmOverlays.jsx';
import AeatSubmitFlow, { isMissingDefaultIaeActivity } from './AeatSubmitFlow.jsx';
import { isLastPeriodOfYear } from './fm303Layouts.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { formatAmount, formatPeriod, computeBoxes303, generate303File, fetchDeclarationIncidents, persistManualData } from '../../fiscalModelsUtils.js';
import { AttachmentsTab, useAttachments } from '@/components/attachments';
import { useApiFetch } from '@/auth/useApiFetch.js';

// AD table name backing the AEAT justificante attachments store — both the
// server-side auto-attach on a successful telematic submission and the
// manual "Presentación con Acuse de recibo" upload persist here.
const FISCAL_DECL_TABLE = 'ETGO_Fiscal_Decl';

// statusLabelKey (ETP-4755): the status badge must always read the plain "Presentado" for
// BOTH `submitted` and `submitted_ack` — `submitted_ack` collapses onto `submitted`'s i18n
// key here. HOW it was submitted is shown exclusively via the `submissionMethod` suffix
// rendered alongside the badge below, never inside the badge text itself.
function statusLabelKey(status) {
  return status === 'submitted_ack' ? 'submitted' : status;
}

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

function fetchOrgIdent(token, apiBaseUrl, setOrgIdent, apiFetch) {
  if (!apiBaseUrl) return;
  apiFetch(`${neoBase(apiBaseUrl)}/session`, { baseUrl: '' })
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

function CasillasTab({ decl, orgIdent, identChecks, onIdentChange, liveBoxes, onBoxChange, t, isSubmitted }) {
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
            readOnly={isSubmitted}
            data-testid="FmBoxes303__4f6c0d" />
        </div>
      </div>
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
  // Both hooks below back the ETP-4975 missing-default-IAE-activity guard only
  // (see handleGenerate). Requires a Router/AuthProvider ancestor — every test
  // that mounts this page must wrap it in both, or mock `react-router-dom`'s
  // `useNavigate` and `@/auth/AuthContext.jsx`'s `useAuth`.
  const navigate = useNavigate();
  const { selectedOrg } = useAuth();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [status, setStatus] = useState(decl.status);
  // submissionMethod (ETP-4755) — distinguishes the 3 code paths that can lead to
  // "Presentado" (2 of which collide on the exact same submitted_ack status). Hydrated
  // from decl.submissionMethod (persisted, present for any declaration submitted after
  // this feature shipped) and updated locally by handlePresent's two manual paths; the
  // AEAT telematic path sets it server-side only (see handleSubmit's onSuccess below) and
  // does not update this local state until the declaration is next refetched.
  const [submissionMethod, setSubmissionMethod] = useState(decl.submissionMethod);
  const [activeTab, setActiveTab] = useState('boxes');
  const [showPresent, setShowPresent] = useState(false);
  const [showAeatFlow, setShowAeatFlow] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [orgIdent, setOrgIdent] = useState({ nif: '', nombre: '' });
  // Hydrate from persisted decl.manualData when present, falling back to the old
  // non-persisted decl.identification only for fixtures/demo declarations that predate it.
  const [identChecks, setIdentChecks] = useState(decl.manualData?.identification ?? decl.identification ?? {});
  const handleIdentChange = (id, value) => {
    setIdentChecks(prev => ({ ...prev, [id]: value }));
    if (id === 'motivo_rectificacion' && value !== 'D') {
      setManualOverrides(prev => { const n = { ...prev }; delete n[108]; return n; });
      setLiveBoxes(removeBox108FromLive);
    }
  };
  const [liveBoxes,      setLiveBoxes]      = useState(decl._precomputed?.boxes   ?? null);
  const [manualOverrides, setManualOverrides] = useState(decl.manualData?.manualOverrides ?? {});
  // Refs backing the debounced manualData autosave effect further below (defined after
  // isSubmitted is computed, since it depends on it) — declared here alongside the state
  // they track.
  const manualDataSaveTimer = useRef(null);
  const isFirstManualDataRender = useRef(true);

  // Only used to grab `upload()` for the manual acuse-de-recibo path below —
  // isActive: false keeps it from eagerly listing/fetching attachments on
  // mount (that eager fetch is owned by the "receipt" tab's own AttachmentsTab).
  const { upload: uploadReceipt } = useAttachments({
    tableName: FISCAL_DECL_TABLE,
    recordId: decl.id,
    token,
    apiBaseUrl,
    isActive: false,
  });

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
  // Distinguishes the missing-default-IAE-activity pre-flight guard (ETP-4975) from every
  // other `genError` (IBAN required, generic backend failure) so only ITS banner gets the
  // "Go to Organization" CTA — mirrors `missingIaeGuard` in AeatSubmitFlow.jsx.
  const [missingIaeGuard, setMissingIaeGuard] = useState(false);

  // AEAT validation-error incidents (ETP-4456) — starts from whatever `decl.incidents` already
  // carries (list-load snapshot, or the demo mock in `FmListPage.jsx`'s DEMO_DECLARATIONS when no
  // token/apiBaseUrl is configured) and is refreshed from the real backend on mount and after
  // every AEAT submission attempt (test or production — both replace the persisted rows server
  // side, see `Fiscal303BoxesHandler#handleSubmit`).
  const [incidents, setIncidents] = useState(decl.incidents ?? { blocking: 0, warning: 0, items: [] });

  async function refreshIncidents() {
    const fresh = await fetchDeclarationIncidents(decl.id, { token, apiBaseUrl });
    setIncidents(fresh);
  }

  useEffect(() => {
    // No token/apiBaseUrl means demo/mock mode — keep the mocked `decl.incidents` as-is instead
    // of overwriting it with the all-zero empty shape `fetchDeclarationIncidents` would return.
    if (!apiBaseUrl) return;
    refreshIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id, token, apiBaseUrl]);

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computeBoxes303(decl, { token, apiBaseUrl });
      applyComputeResult(res, manualOverrides, setLiveBoxes, setLiveSummary, setLiveSources);
    } finally {
      setComputing(false);
    }
  }

  // Auto-compute on mount when the list didn't hand us any precomputed data
  // (ETP-4755 regression). `FmListPage`'s `useFiscalAutoCompute` only ever
  // precomputes DRAFT declarations — once a declaration is submitted (or is
  // opened via a path that bypasses the list's own auto-compute), `decl._precomputed`
  // is `undefined` and every KPI/box/source starts blank even though the backend
  // is always ready to recompute regardless of status. This mirrors what the
  // (now hidden-when-submitted) "Calcular" button used to do manually. Scoped to
  // `decl.id` only (not `liveBoxes`/`decl._precomputed`) so it fires exactly once
  // per opened declaration instead of looping once `handleCompute` populates state.
  useEffect(() => {
    const hasPrecomputed = decl._precomputed?.boxes != null || liveBoxes != null;
    if (hasPrecomputed) return;
    if (!apiBaseUrl) return;
    handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id]);

  async function handleGenerate({ filename } = {}) {
    setGenError(null);
    setMissingIaeGuard(false);
    setGenerating(true);
    // ETP-4975 pre-flight guard — mirrors the one in AeatSubmitFlow.jsx's handleSubmit
    // (see that file for the full rationale). "Generar fichero 303" hits the exact same
    // backend AEAT303Report code path as "Marcar como Presentado" for the last period of
    // the fiscal year, so without this it round-trips to an untranslated
    // `IndexOutOfBoundsException` 500 instead of failing fast with a translated message.
    // Only runs for the last period, only when an org id is resolvable, and fails OPEN on
    // any fetch/network error (never blocks a generation that might otherwise succeed).
    if (isLastPeriodOfYear(decl?.period) && selectedOrg?.id) {
      try {
        const iaeRes = await apiFetch(
          `${neoBase(apiBaseUrl)}/organization/actividadesDelIae?parentId=${selectedOrg.id}&_limit=100`,
          { baseUrl: '' },
        );
        if (iaeRes.ok) {
          const iaeRows = (await iaeRes.json())?.response?.data ?? [];
          if (isMissingDefaultIaeActivity(iaeRows)) {
            setMissingIaeGuard(true);
            setGenError(t('fm.aeat.error.missingDefaultIae') ?? 'This organization needs at least one IAE activity marked as default, with a code assigned, before filing the last period\'s declaration.');
            setGenerating(false);
            return;
          }
        }
      } catch (_) {
        // fail open — see comment above.
      }
    }
    const result = await generate303File(decl, { token, apiBaseUrl, identChecks, manualOverrides, filename });
    setGenerating(false);
    if (!result.ok) applyGenerateError(result, t, setGenError);
  }

  useEffect(() => { fetchOrgIdent(token, apiBaseUrl, setOrgIdent, apiFetch); }, [token, apiBaseUrl, apiFetch]);

  function handleStatusChange(newStatus, newSubmissionMethod) {
    setStatus(newStatus);
    if (newSubmissionMethod) setSubmissionMethod(newSubmissionMethod);
    onStatusChange?.(decl.id, newStatus, newSubmissionMethod);
  }

  // Bumped by AeatSubmitFlow's onAttached whenever the backend reports a
  // PDF was returned for the submission — including TEST_SUCCESS, which
  // deliberately does NOT go through handleStatusChange (test mode must
  // never change the declaration's status). Combined into the "Justificante"
  // tab's remount key below so a test-mode success also refreshes the tab,
  // without misusing the status-change path for it.
  const [receiptRefreshTick, setReceiptRefreshTick] = useState(0);
  function handleAeatAttached() {
    setReceiptRefreshTick(t => t + 1);
  }

  function handlePresent({ status: newStatus, acuseFile }) {
    // 'aeat_telematic' is a sentinel from PresentModal's 4th path, never a
    // real declaration status — it means "open the AEAT submission flow",
    // not "change the status directly" like the other 3 manual paths.
    if (newStatus === 'aeat_telematic') {
      setShowPresent(false);
      setShowAeatFlow(true);
      return;
    }
    // Manual "Presentación con Acuse de recibo" path: persist the uploaded
    // receipt to the same attachments store the "Justificante" tab reads
    // from. Fire-and-forget — useAttachments.upload() already toasts its
    // own errors and never rethrows, so a failed upload must not block the
    // status change the user explicitly confirmed.
    if (newStatus === 'submitted_ack' && acuseFile) {
      uploadReceipt(acuseFile);
    }
    // submissionMethod (ETP-4755): the two manual paths PresentModal can report here —
    // 'submitted_ack' always carries the uploaded acuse (see canConfirm in PresentModal),
    // 'submitted' never does. Neither collides with the AEAT telematic path's own
    // 'aeat_telematic' value, set server-side only (see handleSubmit's onSuccess below).
    const submissionMethodForPath = newStatus === 'submitted_ack' ? 'manual_ack' : 'manual_no_receipt';
    handleStatusChange(newStatus, submissionMethodForPath);
  }

  const blocking = incidents?.blocking ?? 0;
  const warning = incidents?.warning ?? 0;
  const incidentCount = blocking + warning;
  const isSubmitted = ['submitted', 'submitted_ext', 'submitted_ack'].includes(status);

  // Debounced autosave of identChecks/manualOverrides via PUT /fiscal303/declarations, so
  // manual identification/box edits survive a page refresh (ETP-4755). Skipped once the
  // declaration is submitted (nothing is editable at that point) and on the very first render
  // (that render is just the hydration above — not a genuine user edit).
  useEffect(() => {
    if (isFirstManualDataRender.current) {
      isFirstManualDataRender.current = false;
      return;
    }
    if (isSubmitted || !apiBaseUrl) return;
    if (manualDataSaveTimer.current) clearTimeout(manualDataSaveTimer.current);
    manualDataSaveTimer.current = setTimeout(() => {
      persistManualData(decl.id, { identification: identChecks, manualOverrides }, { token, apiBaseUrl });
    }, 800);
    return () => { if (manualDataSaveTimer.current) clearTimeout(manualDataSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identChecks, manualOverrides, isSubmitted, token, apiBaseUrl, decl.id]);

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
    { id: 'receipt',   label: t('fm.tab.receipt') ?? 'Justificante',
      icon: <FileCheck size={16} strokeWidth={1.75} data-testid="FileCheck__4f6c0d" /> },
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
          <MoreOptionsMenu
            favKey="fiscal-models"
            favLabel={t('fm.list.title') ?? 'Declaraciones'}
            data-testid="MoreOptionsMenu__4f6c0d" />
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
          style={{ borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14, color: 'hsl(var(--foreground))' }}
        >
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${statusLabelKey(status)}`) ?? status}
          {/* submissionMethod (ETP-4755) — only for the 2 statuses that can carry one;
              a declaration that predates this feature (no submissionMethod) shows the
              bare status, unchanged. The badge text itself never varies between `submitted`
              and `submitted_ack` (see `statusLabelKey`) — only this sub-suffix does. */}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', border: '1px solid hsl(var(--border-control))', padding: '9px 12px', fontSize: 14 }}
          >
            {computing
              ? <Loader2
              size={16}
              strokeWidth={1.75}
              style={{ animation: 'spin 1s linear infinite' }}
              data-testid="Loader2__4f6c0d" />
              : <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__4f6c0d" />
            }
            {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.compute') ?? 'Calcular')}
          </button>
        )}

        <button
          className="fm-btn"
          onClick={() => { setGenError(null); setShowFilegen(true); }}
          disabled={generating}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', border: '1px solid hsl(var(--border-control))', padding: '9px 12px', fontSize: 14 }}
        >
          <Download
            size={16}
            strokeWidth={1.75}
            style={{ color: fileBlocked ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}
            data-testid="Download__4f6c0d" />
          {t('fm.action.gen303') ?? 'Generar fichero 303'}
        </button>

        {!isSubmitted && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 500 }}
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
          flexWrap: 'wrap',
        }}>
          <OctagonAlert size={14} data-testid="OctagonAlert__gen_error" />
          {genError}
          {/* CTA only for the missing-default-IAE-activity guard — every other genError
              (IBAN required, generic backend failure) has no dedicated settings screen to
              send the user to. Mirrors AeatSubmitFlow.jsx's own CTA for the same guard. */}
          {missingIaeGuard && (
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
              onClick={() => navigate('/organization')}
            >
              <Landmark size={14} data-testid="Landmark__gen303GoToOrganization" />
              {t('fm.aeat.action.go_to_organization') ?? 'Go to Organization'}
            </button>
          )}
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
          isSubmitted={isSubmitted}
          data-testid="CasillasTab__4f6c0d" />
      )}
      {activeTab !== 'boxes' && (
        <div className="fm-page__body" style={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden', ...(activeTab === 'sources' || activeTab === 'incidents' ? { padding: 0 } : {}) }}>
          {activeTab === 'sources' && (
            <SourcesTab
              decl={{ ...decl, sources: liveSources ?? decl.sources, incidents }}
              t={t}
              data-testid="SourcesTab__4f6c0d" />
          )}
          {activeTab === 'incidents' && (
            <IncidentsTab
              decl={{ ...decl, incidents }}
              blocking={blocking}
              warning={warning}
              t={t}
              onGoToSources={() => setActiveTab('sources')}
              data-testid="IncidentsTab__4f6c0d" />
          )}
          {activeTab === 'receipt' && (
            // key={`${status}-${receiptRefreshTick}`}: `status` changes when a
            // production submission succeeds (handleStatusChange) — AEAT's own
            // auto-attach on a successful telematic submission happens
            // server-side and is invisible to this component, so remounting
            // AttachmentsTab (and its useAttachments instance) on a status
            // change is how this tab notices the new file. `receiptRefreshTick`
            // covers the case `status` can't: a TEST_SUCCESS submission also
            // gets a PDF attached server-side now, but test mode must never
            // change the declaration's status, so it can't ride the status-key
            // remount — AeatSubmitFlow's onAttached bumps the tick instead.
            (<AttachmentsTab
              tableName={FISCAL_DECL_TABLE}
              recordId={decl.id}
              token={token}
              apiBaseUrl={apiBaseUrl}
              isActive={activeTab === 'receipt'}
              config={{ allowedMimeTypes: ['application/pdf'] }}
              key={`${status}-${receiptRefreshTick}`}
              data-testid="AttachmentsTab__303receipt" />)
          )}
        </div>
      )}
      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={handlePresent}
          onClose={() => setShowPresent(false)}
          showAeatPath
          data-testid="PresentModal__4f6c0d" />
      )}
      {showAeatFlow && (
        <AeatSubmitFlow
          decl={decl}
          orgIdent={orgIdent}
          identChecks={identChecks}
          summary={summary}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onSuccess={(newStatus) => handleStatusChange(newStatus)}
          onAttached={handleAeatAttached}
          onIncidentsChanged={refreshIncidents}
          onClose={() => setShowAeatFlow(false)}
          data-testid="AeatSubmitFlow__4f6c0d" />
      )}
      {showFilegen && (
        <FileGenModal303
          decl={decl}
          onConfirm={handleGenerate}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal303__4f6c0d" />
      )}
    </div>
  );
}
