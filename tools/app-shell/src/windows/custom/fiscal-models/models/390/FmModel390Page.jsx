// Modelo 390 (annual VAT summary) detail page (ETP-5716) — skeleton + boxes phase.
//
// Same structure as the Modelo 303 page (FmDetailChrome: app top bar, sticky action bar, KPI
// cards, tabs), smaller: the boxes are computed by the backend (`GET /fiscal390/boxes`) and the
// user only completes the manual inputs (`manualData.aeatInputs`, classic parameter search keys)
// and the header "Tipo" (Normal | Sustitutiva, `manualData.identification`).
//
// Save flow — inputs are ALWAYS persisted in their own PUT, before anything that depends on them:
//   Guardar             PUT manualData
//   Calcular            GET boxes with the on-screen inputs as query params, then PUT manualData
//   Generar fichero     PUT manualData (when dirty) → GET generate (reads the STORED inputs)
//   Registrar/Presentar PUT manualData (when dirty) → PUT status (a separate request: the backend
//                       freezes the submission snapshot from the stored inputs BEFORE applying a
//                       same-request manualData — aeat-390-endpoints.md, "User inputs").
//
// Later phases plug in here: the invoices tab (a `sources` array in the payload), incident rules
// (backend `replaceIncidents`, already listed by the Incidencias tab), the 303 preload
// (`manualData.aeatPreloaded`, already read for the origin legend / restore) and the telematic
// filing (registry `telematicFiling` + a submit flow next to PresentModal).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useUI, useLocaleSwitch } from '@/i18n';
import {
  Calculator, CircleCheck, ClipboardCheck, Download, FileCheck, Loader2, OctagonAlert, RefreshCw, Save,
  TrendingDown, TrendingUp, TriangleAlert,
} from 'lucide-react';
import { KpiWidget, Tabs } from '../../FmCommon.jsx';
import {
  FmStatusChip, FmDetailHeader, FmDetailActionBar, FmDetailButton, useFmDetailPageMeta, buildDeclTitle,
  tabCount, incidentsTabBadge, FmEmptyState,
} from '../../FmDetailChrome.jsx';
import { IncidentsTab } from '../../FmTabContent.jsx';
import { PresentModal } from '../../FmOverlays.jsx';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import {
  formatAmount, persistManualData, fetchDeclarationIncidents, deriveResultKind, resolveResultColors,
  RECEIPT_ATTACHMENT_CONFIG,
} from '../../fiscalModelsUtils.js';
import { getIncidentIndicator } from '../../incidentSeverity.js';
import { FORMER_STATEMENT_LENGTH, isValidFormerStatement, sanitizeFormerStatementInput } from '../../formerStatement.js';
import { invalidateFiscalComputeCache } from '../../useFiscalAutoCompute.js';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { AttachmentsTab, useAttachments } from '@/components/attachments';
import FmBoxes390 from './FmBoxes390.jsx';
import FileGenModal390 from './FileGenModal390.jsx';
import useOrg390Identity from './useOrg390Identity.js';
import { fetchBoxes390, generate390File } from './fm390Api.js';
import {
  getLayout390, deriveInputBoxes, annualResultOf, toBoxMap, normalizeInputValue,
  isSubstitutive, buildManualData390, TERRITORY_INPUTS,
} from './fm390Layouts.js';
import '../../fiscal-models.css';

const MODEL_ID = '390';
const FISCAL_DECL_TABLE = 'ETGO_Fiscal_Decl';
const SUBMITTED_STATUSES = new Set(['submitted', 'submitted_ext', 'submitted_ack']);
const EMPTY_INCIDENTS = { blocking: 0, warning: 0, items: [] };

// ── Pure helpers (exported for their unit tests) ─────────────────────────────

/** The payload the backend froze when the declaration was presented, or `null`. */
export function submittedSnapshotOf(decl) {
  const snapshot = decl?.submittedSnapshot;
  return snapshot && typeof snapshot === 'object' && snapshot.boxes != null ? snapshot : null;
}

/**
 * Why the substitute identifier blocks Generar / Presentar, or `null`: a substitute declaration
 * needs the former declaration's 13-digit identifier (the shared `isValidFormerStatement` rule).
 */
export function substituteIdentifierError(identification) {
  if (!isSubstitutive(identification)) return null;
  return isValidFormerStatement(identification?.formerStatement) ? null : 'fm.m390.substitutive.id_invalid';
}

/** The figures of the 4 KPI cards from the display boxes. */
export function summaryOf(boxes, mode) {
  const map = toBoxMap(boxes);
  return { accrued: map[47] ?? 0, deductible: map[64] ?? 0, result: annualResultOf(map, mode) };
}

// ── Header controls ──────────────────────────────────────────────────────────

function DeclarationTypeControl({ identification, onChange, disabled, t }) {
  const substitutive = isSubstitutive(identification);
  const options = [
    { value: false, label: t('fm.m349.type.normal'), testId: 'normal' },
    { value: true, label: t('fm.m349.type.substitutive'), testId: 'sustitutiva' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="fm-toolbar__sep" aria-hidden="true" />
      <span style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>{t('fm.m349.type.label')}</span>
      <div className="fm-newdecl-segmented fm-type-segmented" role="radiogroup" aria-label={t('fm.m349.type.label')}>
        {options.map(o => {
          const active = substitutive === o.value;
          return (
            <button
              key={o.testId}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              className={`fm-newdecl-segmented__btn${active ? ' fm-newdecl-segmented__btn--active' : ''}`}
              onClick={() => { if (!active) onChange('sustitutiva', o.value); }}
              data-testid={`FmModel390Page__type_${o.testId}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Shown while Tipo = Sustitutiva: the former declaration's identifier (13 digits, inline error)
// and "Sustitutiva por rectificación de cuotas". Same banner as the 349's substitute declaration.
function SubstitutiveBanner({ identification, onChange, disabled, showError, t }) {
  if (!isSubstitutive(identification)) return null;
  const value = identification?.formerStatement ?? '';
  const invalid = showError && !isValidFormerStatement(value);
  const label = t('fm.m349.substitutive_banner.former_statement');
  return (
    <div style={{ padding: '8px 20px', flexShrink: 0 }}>
      <div className="fm-349-substitutive-banner fm-substitutive-banner" data-testid="FmModel390Page__substitutiveBanner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 300px', minWidth: 0 }}>
          <RefreshCw size={18} strokeWidth={1.75} style={{ color: 'var(--status-warning-fg)', flexShrink: 0 }} data-testid="RefreshCw__fm390" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{t('fm.m349.substitutive_banner.title')}</div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{t('fm.m390.substitutive.sub')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>
            <span>
              {label}
              <span aria-hidden="true" style={{ color: 'var(--status-destructive-fg)', marginLeft: 2 }}>*</span>
            </span>
            <input
              value={value}
              onChange={e => onChange('formerStatement', sanitizeFormerStatementInput(e.target.value))}
              disabled={disabled}
              required
              aria-label={label}
              aria-invalid={invalid || undefined}
              maxLength={FORMER_STATEMENT_LENGTH}
              inputMode="numeric"
              placeholder={t('fm.m349.substitutive_banner.former_statement_placeholder')}
              className={`fm-390-former-input${invalid ? ' fm-390-former-input--invalid' : ''}`}
              data-testid="FmModel390Page__formerStatement" />
          </label>
          {invalid && (
            <span className="fm-390-inline-error" role="alert" data-testid="FmModel390Page__formerStatementError">
              {t('fm.m390.substitutive.id_invalid')}
            </span>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))' }}>
            <CheckboxField
              checked={identification?.rectificacionCuotas === true}
              disabled={disabled}
              onToggle={(next) => onChange('rectificacionCuotas', next)}
              data-testid="FmModel390Page__byQuotas" />
            <span>{t('fm.m390.substitutive.by_quotas')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function buildIncidentVariants(blocking, warning, t) {
  const indicator = getIncidentIndicator({ blocking, warning }, t);
  if (!indicator) return { iconColor: 'hsl(var(--text-disabled))', badge: null };
  return { iconColor: indicator.iconColor, badge: indicator.label, badgeBg: indicator.badgeBg, badgeColor: indicator.badgeColor };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function FmModel390Page({ decl, onBack, onStatusChange, onManualDataSaved, token, apiBaseUrl }) {
  const t = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const orgIdentity = useOrg390Identity({ apiBaseUrl, orgId: auth?.selectedOrg?.id });

  const [status, setStatus] = useState(decl.status);
  const [submissionMethod, setSubmissionMethod] = useState(decl.submissionMethod);
  const isSubmitted = SUBMITTED_STATUSES.has(status);
  const [identification, setIdentification] = useState(() => ({ ...(decl.manualData?.identification ?? {}) }));
  const [aeatInputs, setAeatInputs] = useState(() => ({ ...(decl.manualData?.aeatInputs ?? {}) }));
  const preloaded = decl.manualData?.aeatPreloaded ?? null;
  const [payload, setPayload] = useState(() => submittedSnapshotOf(decl) ?? (decl._precomputed?.boxes != null ? decl._precomputed : null));
  const [computeError, setComputeError] = useState(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [showPresent, setShowPresent] = useState(false);
  const [showIdError, setShowIdError] = useState(false);
  const [activeTab, setActiveTab] = useState('boxes');
  const [incidents, setIncidents] = useState(decl.incidents?.items ? decl.incidents : EMPTY_INCIDENTS);
  // Edits since the last successful save — a ref so a handler can read it synchronously.
  const dirtyRef = useRef(false);
  const lastSavedManualData = useRef(decl.manualData ?? {});
  const busy = computing || saving || generating || presenting;
  const layout = useMemo(() => getLayout390(payload?.taxReport?.layoutYear), [payload?.taxReport?.layoutYear]);

  const { count: receiptCount = null, upload: uploadReceipt } = useAttachments({
    tableName: FISCAL_DECL_TABLE, recordId: decl.id, token, apiBaseUrl, isActive: false, prefetchCount: true,
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  async function compute(inputsForRequest) {
    setComputing(true);
    setComputeError(null);
    try {
      const res = await fetchBoxes390(decl, { token, apiBaseUrl, inputs: inputsForRequest });
      setPayload(res);
      return res;
    } catch (err) {
      setComputeError(err?.serverMessage || err?.message || t('fm.m390.compute_error'));
      return null;
    } finally {
      setComputing(false);
    }
  }

  // Mount: a presented declaration shows its frozen snapshot; a draft the list already computed
  // shows that; anything else is computed once (with the stored inputs).
  useEffect(() => {
    if (payload != null || !apiBaseUrl) return;
    compute(undefined);
  }, [decl.id]);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let cancelled = false;
    fetchDeclarationIncidents(decl.id, { token, apiBaseUrl, model: MODEL_ID }).then(res => {
      if (!cancelled) setIncidents(res);
    });
    return () => { cancelled = true; };
  }, [decl.id, token, apiBaseUrl]);

  // Display values: a presented declaration shows the snapshot as frozen; a draft re-derives the
  // input-dependent boxes from the inputs on screen (fm390Layouts.deriveInputBoxes).
  const display = useMemo(() => {
    if (!payload?.boxes) return { boxes: {}, mode: 'liquidation' };
    if (isSubmitted) return { boxes: toBoxMap(payload.boxes), mode: payload.mode ?? 'liquidation' };
    return deriveInputBoxes(payload.boxes, payload.inputs ?? {}, aeatInputs);
  }, [payload, aeatInputs, isSubmitted]);
  const summary = summaryOf(display.boxes, display.mode);
  const resultKind = payload?.boxes
    ? deriveResultKind({ result: summary.result }, { hasInvoices: summary.accrued !== 0 || summary.deductible !== 0 })
    : null;
  const resultColors = resolveResultColors(resultKind);
  const resultLabel = resultKind ? t(`fm.result.${resultKind}`) : t('fm.m303.summary.result_sub');

  // ── Edits ─────────────────────────────────────────────────────────────────
  function markDirty() { dirtyRef.current = true; }

  function handleInputChange(key, raw, spec) {
    const normalized = normalizeInputValue(raw);
    if (String(raw ?? '').trim() !== '' && normalized == null) {
      toast.error(t('fm.m390.input.invalid_number'));
      return;
    }
    if (normalized != null && spec?.nonNegative && Number(normalized) < 0) {
      toast.error(t('fm.m390.input.negative', { box: spec.box }));
      return;
    }
    if (normalized != null && spec?.percent && (Number(normalized) < 0 || Number(normalized) > 100)) {
      toast.error(t('fm.m390.input.percent_range', { box: spec.box }));
      return;
    }
    if ((aeatInputs[key] ?? null) === normalized) return;
    markDirty();
    setAeatInputs(prev => {
      const next = { ...prev };
      if (normalized == null) delete next[key]; else next[key] = normalized;
      return next;
    });
  }

  function handleRestore(key) {
    if (!preloaded || !Object.hasOwn(preloaded, key)) return;
    markDirty();
    setAeatInputs(prev => ({ ...prev, [key]: preloaded[key] }));
  }

  function handleFlagChange(flag, on) {
    markDirty();
    setAeatInputs(prev => ({ ...prev, [flag]: on ? 'Y' : 'N' }));
  }

  function handleClearTerritory() {
    if (!TERRITORY_INPUTS.some(k => aeatInputs[k] != null)) return;
    markDirty();
    setAeatInputs(prev => {
      const next = { ...prev };
      TERRITORY_INPUTS.forEach(k => { delete next[k]; });
      return next;
    });
  }

  function handleIdentificationChange(field, value) {
    markDirty();
    setIdentification(prev => ({ ...prev, [field]: value }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const currentManualData = () => buildManualData390(lastSavedManualData.current, identification, aeatInputs);

  /** Persists manualData when something changed. Resolves `{ ok }`; never throws. */
  async function persistIfDirty({ force = false } = {}) {
    if (isSubmitted) return { ok: true };
    if (!force && !dirtyRef.current) return { ok: true };
    if (!apiBaseUrl) return { ok: true };
    const manualData = currentManualData();
    setSaving(true);
    try {
      const result = await persistManualData(decl.id, manualData, { token, apiBaseUrl });
      if (result.ok) {
        dirtyRef.current = false;
        lastSavedManualData.current = manualData;
        invalidateFiscalComputeCache(decl.id);
        onManualDataSaved?.(decl.id, manualData);
      }
      return result;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const { ok } = await persistIfDirty({ force: true });
    if (ok) toast.success(t('recordSaved'));
    else toast.error(t('fm.action.save_error'));
  }

  async function handleCompute() {
    const res = await compute(currentManualData().aeatInputs);
    if (!res) {
      toast.error(t('fm.m390.compute_error'));
      return;
    }
    invalidateFiscalComputeCache(decl.id);
    const { ok } = await persistIfDirty();
    if (!ok) toast.error(t('fm.action.save_error'));
  }

  function guardSubstituteIdentifier() {
    const errorKey = substituteIdentifierError(identification);
    if (!errorKey) return true;
    setShowIdError(true);
    toast.error(t(errorKey));
    return false;
  }

  const blocking = incidents?.blocking ?? 0;
  const warning = incidents?.warning ?? 0;

  function openGenerate() {
    if (blocking > 0) {
      toast.error(t('fm.m390.blocked_by_incidents'));
      return;
    }
    if (!guardSubstituteIdentifier()) return;
    setShowFilegen(true);
  }

  // "Generar fichero 390": pending changes are saved FIRST — the backend generates from the
  // stored inputs — and a failed save stops the generation.
  async function handleGenerate({ fileName } = {}) {
    setGenerating(true);
    try {
      const saved = await persistIfDirty();
      if (!saved.ok) {
        toast.error(t('fm.action.save_error'));
        return;
      }
      const result = await generate390File(decl, { token, apiBaseUrl, fileName });
      if (!result.ok) toast.error(result.serverMessage || t('fm.m390.generate_error'));
    } finally {
      setGenerating(false);
    }
  }

  function openPresent() {
    if (blocking > 0) {
      toast.error(t('fm.m390.blocked_by_incidents'));
      return;
    }
    if (!guardSubstituteIdentifier()) return;
    setShowPresent(true);
  }

  // Registering the filing: inputs are saved in their OWN PUT first, then the status changes in a
  // second one (the backend freezes the snapshot from the stored inputs).
  async function handlePresent({ status: newStatus, acuseFile }) {
    setPresenting(true);
    try {
      const saved = await persistIfDirty();
      if (!saved.ok) {
        toast.error(t('fm.action.save_error'));
        return;
      }
      if (newStatus === 'submitted_ack' && acuseFile) uploadReceipt?.(acuseFile);
      const method = newStatus === 'submitted_ack' ? 'manual_ack' : 'manual_no_receipt';
      const previous = { status, submissionMethod };
      setStatus(newStatus);
      setSubmissionMethod(method);
      const result = await onStatusChange?.(decl.id, newStatus, method);
      if (result?.ok === false) {
        setStatus(previous.status);
        setSubmissionMethod(previous.submissionMethod);
        toast.error(t('fm.action.present_error'));
        return;
      }
      if (result?.submittedSnapshot?.boxes != null) setPayload(result.submittedSnapshot);
    } finally {
      setPresenting(false);
    }
  }

  // ── Header meta ───────────────────────────────────────────────────────────
  const declTitle = buildDeclTitle(t('fm.config.m390.title'), decl, bcpLocale);
  useFmDetailPageMeta({
    model: MODEL_ID,
    title: declTitle,
    breadcrumb: `${t('finance')} / ${t('fm.breadcrumb.section')} / ${declTitle}`,
    favLabel: t('fm.breadcrumb.section'),
  });

  const incidentVariants = buildIncidentVariants(blocking, warning, t);
  const typeLabel = isSubstitutive(identification) ? t('fm.m349.type.substitutive') : t('fm.m349.type.normal');
  const blockedTitle = blocking > 0 ? t('fm.m390.blocked_by_incidents') : undefined;

  const tabs = [
    { id: 'boxes', label: t('fm.tab.boxes'), icon: <ClipboardCheck size={16} strokeWidth={1.75} data-testid="ClipboardCheck__fm390" /> },
    { id: 'incidents', label: t('fm.tab.incidents'), ...incidentsTabBadge(blocking, warning), icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__fm390tab" /> },
    { id: 'receipt', label: t('fm.tab.receipt'), badge: tabCount(receiptCount), icon: <FileCheck size={16} strokeWidth={1.75} data-testid="FileCheck__fm390" /> },
  ];

  const hasBoxes = payload?.boxes != null;

  return (
    <div className="fm-page fm-page--detail" data-testid="FmModel390Page">
      <FmDetailHeader>
        <FmDetailActionBar
          left={(
            <>
              <FmDetailButton onClick={onBack} data-testid="FmModel390Page__cancel">{t('fm.action.cancel')}</FmDetailButton>
              <FmStatusChip status={status} submissionMethod={submissionMethod} t={t} variant="detail" />
              <DeclarationTypeControl
                identification={identification}
                onChange={handleIdentificationChange}
                disabled={isSubmitted || busy}
                t={t} />
            </>
          )}
          right={!isSubmitted && (
            <>
              <FmDetailButton onClick={handleCompute} disabled={busy} data-testid="FmModel390Page__compute">
                {computing
                  ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__compute390" />
                  : <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__compute390" />}
                {computing ? t('fm.action.computing') : t('fm.action.compute')}
              </FmDetailButton>
              <FmDetailButton
                onClick={openGenerate}
                disabled={busy || !hasBoxes || blocking > 0}
                title={blockedTitle}
                data-testid="FmModel390Page__generate"
              >
                {generating
                  ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__generate390" />
                  : <Download size={16} strokeWidth={1.75} data-testid="Download__generate390" />}
                {t('fm.action.gen390')}
              </FmDetailButton>
              <FmDetailButton onClick={handleSave} disabled={busy} aria-label={t('fm.action.save')} data-testid="FmModel390Page__save">
                {saving
                  ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__save390" />
                  : <Save size={16} strokeWidth={1.75} data-testid="Save__save390" />}
                {t('fm.action.save')}
              </FmDetailButton>
              <FmDetailButton
                primary
                onClick={openPresent}
                disabled={busy || !hasBoxes || blocking > 0}
                title={blockedTitle}
                data-testid="FmModel390Page__present"
              >
                <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__present390" />
                {t('fm.action.submit')}
              </FmDetailButton>
            </>
          )} />
      </FmDetailHeader>

      <div className="fm-page--freeflow fm-detail-scroll">
        <SubstitutiveBanner
          identification={identification}
          onChange={handleIdentificationChange}
          disabled={isSubmitted || busy}
          showError={showIdError || String(identification?.formerStatement ?? '').length > 0}
          t={t} />

        <div className="fm-390-kpis">
          <KpiWidget
            icon={blocking > 0
              ? <OctagonAlert size={20} strokeWidth={1.75} data-testid="OctagonAlert__fm390" />
              : <TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__fm390kpi" />}
            iconColor={incidentVariants.iconColor}
            label={t('fm.tab.incidents')}
            value={String(blocking + warning)}
            badge={incidentVariants.badge}
            badgeBg={incidentVariants.badgeBg}
            badgeColor={incidentVariants.badgeColor} />
          <KpiWidget
            icon={<TrendingUp size={20} strokeWidth={1.75} data-testid="TrendingUp__fm390kpi" />}
            iconColor="hsl(var(--foreground))"
            label={t('fm.m390.kpi.accrued')}
            value={formatAmount(summary.accrued)}
            badge={t('fm.m303.summary.accrued_sub')}
            badgeBg="hsl(var(--muted))"
            badgeColor="hsl(var(--muted-foreground))" />
          <KpiWidget
            icon={<TrendingDown size={20} strokeWidth={1.75} data-testid="TrendingDown__fm390kpi" />}
            iconColor="hsl(var(--foreground))"
            label={t('fm.m390.kpi.deductible')}
            value={formatAmount(summary.deductible)}
            badge={t('fm.m303.summary.deductible_sub')}
            badgeBg="hsl(var(--muted))"
            badgeColor="hsl(var(--muted-foreground))" />
          {/* Resultado — [86], or [94] when filing to several administrations. The "cuadre con
              los 303" line under it belongs to the 303-preload phase. */}
          <KpiWidget
            icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__fm390kpi" />}
            iconColor="hsl(var(--foreground))"
            label={t(display.mode === 'territory' ? 'fm.m390.kpi.result_territory' : 'fm.m390.kpi.result')}
            value={formatAmount(summary.result)}
            valueColor={resultColors.valueColor}
            badge={resultLabel}
            badgeBg={resultColors.badgeBg}
            badgeColor={resultColors.badgeColor} />
        </div>

        <div className="fm-tabs-sticky">
          <Tabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />
        </div>

        {activeTab === 'boxes' && (
          <div className="fm-390-tab" data-testid="FmModel390Page__boxesTab">
            {!hasBoxes && computing && (
              <FmEmptyState
                icon={<Loader2 size={20} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__empty390" />}
                title={t('fm.m390.empty.computing_title', { year: decl.year })}
                sub={t('fm.m390.empty.sub')}
                data-testid="FmModel390Page__computing" />
            )}
            {!hasBoxes && !computing && (
              <FmEmptyState
                icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__empty390" />}
                title={t('fm.m390.empty.title', { year: decl.year })}
                sub={computeError || t('fm.m390.empty.sub')}
                cta={!isSubmitted && (
                  <FmDetailButton onClick={handleCompute} disabled={busy} data-testid="FmModel390Page__emptyCompute">
                    <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__emptyCta390" />
                    {t('fm.action.compute')}
                  </FmDetailButton>
                )}
                data-testid="FmModel390Page__empty" />
            )}
            {hasBoxes && (
              <FmBoxes390
                layout={layout}
                boxes={display.boxes}
                inputs={isSubmitted ? { ...aeatInputs, ...(payload.inputs ?? {}) } : aeatInputs}
                preloaded={preloaded}
                identification={identification}
                orgIdentity={orgIdentity}
                taxReport={payload.taxReport}
                warnings={payload.warnings}
                year={decl.year}
                readOnly={isSubmitted}
                onInputChange={handleInputChange}
                onRestore={handleRestore}
                onFlagChange={handleFlagChange}
                onClearTerritory={handleClearTerritory}
                onEditOrganization={() => navigate('/organization')}
                t={t}
                bcpLocale={bcpLocale} />
            )}
          </div>
        )}
        {activeTab === 'incidents' && (
          <div className="fm-page__body" style={{ padding: 0 }}>
            <IncidentsTab decl={{ ...decl, incidents }} blocking={blocking} warning={warning} t={t} />
          </div>
        )}
        {activeTab === 'receipt' && (
          <div className="fm-page__body">
            <AttachmentsTab
              key={status}
              tableName={FISCAL_DECL_TABLE}
              recordId={decl.id}
              token={token}
              apiBaseUrl={apiBaseUrl}
              isActive
              config={RECEIPT_ATTACHMENT_CONFIG}
              readOnly={status !== 'draft'} />
          </div>
        )}
      </div>

      {showFilegen && (
        <FileGenModal390
          decl={decl}
          summary={summary}
          typeLabel={typeLabel}
          resultLabel={resultLabel}
          onConfirm={handleGenerate}
          onClose={() => setShowFilegen(false)}
          t={t} />
      )}
      {showPresent && (
        <PresentModal decl={decl} onConfirm={handlePresent} onClose={() => setShowPresent(false)} showAeatPath={false} />
      )}
    </div>
  );
}
