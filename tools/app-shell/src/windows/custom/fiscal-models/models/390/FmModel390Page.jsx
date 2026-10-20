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
// Presentar (ETP-5716): PresentModal offers the AEAT telematic filing (AeatSubmitFlow with the
// 390 adapter, `POST /fiscal390/submit` — the backend sets submitted_ack + the filing data) and
// "Registrar como presentada" (RegisterSubmitted390Modal: justificante, date, PDF → PUT
// manualData.submission, then PUT status — the 303/349 manual-register status and method). Both save pending changes first and both
// ask "Declaro que los datos … son conformes". A submitted 390 shows the "Presentación en la
// AEAT" card and "Crear declaración sustitutiva" (submission390.js).
//
// 303 preload (ETP-5716, preload390.js): `GET /fiscal390/preload` gives the year's 303s and the
// block-9 / [85] / territory values they determine. They are applied to the inputs the user has
// not changed — on opening a draft never preloaded before, and on every Calcular — and recorded in
// `manualData.aeatPreloaded` (origin "Modificado" + Restaurar). The Resultado card shows the cuadre
// with the 303s (Reconciliation390) and block 9 lists them (Settlements303Table390).
//
// Incidents (ETP-5716, incidents390.js): the rules are computed by the backend. `POST
// /fiscal390/validate` recomputes them from the STORED inputs — on opening a draft and after
// every successful save (Guardar, Calcular, the saves before Generar / Presentar) — and answers
// every incident of the declaration. The Incidencias tab (Incidents390Tab) and card split them
// into Bloqueantes and Advertencias; Generar / Presentar are disabled while a blocking RULE
// incident exists (ruleBlockingCount) and the backend refuses them too (409 BLOCKING_INCIDENTS).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useUI, useLocaleSwitch } from '@/i18n';
import {
  Calculator, CalendarDays, CircleAlert, CircleCheck, ClipboardCheck, Download, FileCheck, Loader2, OctagonAlert, RefreshCw, Save,
  TrendingDown, TrendingUp, TriangleAlert, ReceiptText,
} from 'lucide-react';
import { KpiWidget, Tabs } from '../../FmCommon.jsx';
import {
  FmStatusChip, FmDetailHeader, FmDetailActionBar, FmDetailButton, useFmDetailPageMeta, buildDeclTitle,
  tabCount, incidentsTabBadge, FmEmptyState,
} from '../../FmDetailChrome.jsx';
import { PresentModal } from '../../FmOverlays.jsx';
import AeatSubmitFlow from '../303/AeatSubmitFlow.jsx';
import RegisterSubmitted390Modal from './RegisterSubmitted390Modal.jsx';
import SubmissionCard390 from './SubmissionCard390.jsx';
import {
  AEAT_SUBMIT_390, REGISTER_PATH, SUBMISSION_KEY, manualRegistrationStatus, ruleBlockingCount,
  buildManualSubmission, createSubstitute390, submissionFromResponse, submissionOf,
} from './submission390.js';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import {
  formatAmount, persistManualData, fetchDeclarationIncidents, resolveResultColors,
  RECEIPT_ATTACHMENT_CONFIG, fetchDeclaration,
} from '../../fiscalModelsUtils.js';
import { incidentKpiVariants } from '../../incidentSeverity.js';
import { FORMER_STATEMENT_LENGTH, isValidFormerStatement, sanitizeFormerStatementInput } from '../../formerStatement.js';
import { invalidateFiscalComputeCache } from '../../useFiscalAutoCompute.js';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { AttachmentsTab, useAttachments } from '@/components/attachments';
import FmBoxes390 from './FmBoxes390.jsx';
import FmSources390 from './FmSources390.jsx';
import { emptySourcesFilter, sourcesFilterForBox } from './sources390.js';
import FileGenModal390 from './FileGenModal390.jsx';
import useOrg390Identity from './useOrg390Identity.js';
import { fetchBoxes390, generate390File, validate390 } from './fm390Api.js';
import Incidents390Tab from './Incidents390Tab.jsx';
import { nameWarningsFromIncidents390, normalizeIncidents390 } from './incidents390.js';
import usePreload390 from './usePreload390.js';
import { applyPreload390, hasPreloadedValues, reconcile390, restorePreloaded390 } from './preload390.js';
import Reconciliation390 from './Reconciliation390.jsx';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import {
  FISCAL_CALENDAR_ROUTE, GO_TO_FISCAL_CALENDAR_KEY, incompleteFiscalYearOf, incompleteFiscalYearText,
} from './incompleteYear390.js';
import Settlements303Table390 from './Settlements303Table390.jsx';
import {
  getLayout390, deriveInputBoxes, annualResultOf, toBoxMap, normalizeInputValue,
  isSubstitutive, buildManualData390, TERRITORY_INPUTS, TERRITORY_PERCENT_MAX, FLAG,
  resultKind390, RESULT_LABEL_KEY_390, sanitizeAeatInputs390, conflictingInput390, isConcurso,
  isMonthlyReturn,
} from './fm390Layouts.js';
import '../../fiscal-models.css';

const MODEL_ID = '390';
const FISCAL_DECL_TABLE = 'ETGO_Fiscal_Decl';
const SUBMITTED_STATUSES = new Set(['submitted', 'submitted_ext', 'submitted_ack']);
const EMPTY_INCIDENTS = { blocking: 0, warning: 0, items: [] };
/** PresentModal's left column for the 390: one "Registrar como presentada" path (step 2 follows). */
const REGISTER_PATHS_390 = [
  { id: REGISTER_PATH, titleKey: 'fm.m390.present.path.register', descKey: 'fm.m390.present.path.register_desc', continues: true },
];

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
// and "Sustitutiva por rectificación de cuotas" — the latter only for a declarant in insolvency
// proceedings (`concurso`, AEAT art. 80.Tres). Same banner as the 349's substitute declaration.
function SubstitutiveBanner({ identification, concurso, onChange, disabled, showError, t }) {
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
          {concurso && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))' }}>
              <CheckboxField
                checked={identification?.rectificacionCuotas === true}
                disabled={disabled}
                onToggle={(next) => onChange('rectificacionCuotas', next)}
                data-testid="FmModel390Page__byQuotas" />
              <span>{t('fm.m390.substitutive.by_quotas')}</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function FmModel390Page({
  decl, onBack, onStatusChange, onSubmittedRemotely, onDeclarationCreated, onManualDataSaved, token, apiBaseUrl,
  onOpenDeclaration,
}) {
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
  // The values the 303 preload put in (`manualData.aeatPreloaded`); a ref too, for the handlers
  // that apply a fresh preload and save in the same tick.
  const [preloaded, setPreloaded] = useState(() => decl.manualData?.aeatPreloaded ?? null);
  const preloadedRef = useRef(preloaded);
  const aeatInputsRef = useRef(aeatInputs);
  aeatInputsRef.current = aeatInputs;
  const { preload, loading: preloadLoading, error: preloadError, load: loadPreload } = usePreload390({ decl, token, apiBaseUrl });
  const [payload, setPayload] = useState(() => submittedSnapshotOf(decl) ?? (decl._precomputed?.boxes != null ? decl._precomputed : null));
  const [computeError, setComputeError] = useState(null);
  // `{ year, missingPeriods }` when the last computation failed for lack of calendar periods.
  const [incompleteYear, setIncompleteYear] = useState(null);
  const incompleteYearRef = useRef(null);
  const goToFiscalCalendar = () => navigate(FISCAL_CALENDAR_ROUTE);
  const toastIncompleteYear = (info) => toast.error(incompleteFiscalYearText(info, t), {
    action: { label: t(GO_TO_FISCAL_CALENDAR_KEY), onClick: goToFiscalCalendar },
  });
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [showPresent, setShowPresent] = useState(false);
  const [showAeatFlow, setShowAeatFlow] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [creatingSubstitute, setCreatingSubstitute] = useState(false);
  // The filing data (`manualData.submission`) — local so the card shows at once after filing.
  const [submission, setSubmission] = useState(() => submissionOf(decl.manualData));
  const [showIdError, setShowIdError] = useState(false);
  const [activeTab, setActiveTab] = useState('boxes');
  // Facturas tab filter, owned here so "Ver facturas" can open the tab filtered by a box.
  const [sourcesFilter, setSourcesFilter] = useState(emptySourcesFilter);
  const viewInvoicesForBox = (box) => {
    setSourcesFilter(sourcesFilterForBox(box));
    setActiveTab('sources');
  };
  // "Ir a la casilla" of an incident: the Casillas tab, at that box (FmBoxes390 `goToBox`).
  const [goToBox, setGoToBox] = useState(null);
  const goToBoxOfIncident = (box) => {
    setActiveTab('boxes');
    setGoToBox(prev => ({ box, nonce: (prev?.nonce ?? 0) + 1 }));
  };
  // "Ver detalle por trimestre" of the cuadre banner: the Casillas tab, at the year's 303s
  // (block "Resultado de las liquidaciones", FmBoxes390 `goToBlock`).
  const [goToBlock, setGoToBlock] = useState(null);
  const viewSettlements = () => {
    setActiveTab('boxes');
    setGoToBlock(prev => ({ id: 'resultado_liquidaciones', nonce: (prev?.nonce ?? 0) + 1 }));
  };
  const [incidents, setIncidents] = useState(decl.incidents?.items ? decl.incidents : EMPTY_INCIDENTS);
  // Facturas tab badge: the unfiltered line count, known once the tab has loaded it (FmSources390).
  const [sourcesCount, setSourcesCount] = useState(null);
  // Edits since the last successful save — a ref so a handler can read it synchronously.
  const dirtyRef = useRef(false);
  const lastSavedManualData = useRef(decl.manualData ?? {});
  const busy = computing || saving || generating || presenting || creatingSubstitute;
  const layout = useMemo(() => getLayout390(payload?.taxReport?.layoutYear), [payload?.taxReport?.layoutYear]);

  const { count: receiptCount = null, upload: uploadReceipt, list: listReceipts } = useAttachments({
    tableName: FISCAL_DECL_TABLE, recordId: decl.id, token, apiBaseUrl, isActive: false, prefetchCount: true,
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  async function compute(inputsForRequest) {
    setComputing(true);
    setComputeError(null);
    setIncompleteYear(null);
    incompleteYearRef.current = null;
    try {
      const res = await fetchBoxes390(decl, { token, apiBaseUrl, inputs: inputsForRequest });
      setPayload(res);
      return res;
    } catch (err) {
      // An exercise without its calendar periods is explained in the UI language (never the
      // backend text) and offers the fiscal calendar.
      const incomplete = incompleteFiscalYearOf(err);
      incompleteYearRef.current = incomplete;
      setIncompleteYear(incomplete);
      setComputeError(incomplete
        ? incompleteFiscalYearText(incomplete, t)
        : (err?.serverMessage || err?.message || t('fm.m390.compute_error')));
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

  // Mount: the year's 303s (table + cuadre). A draft never preloaded before — no
  // `aeatPreloaded`, or an empty one recorded while the year had no 303 yet (ETP-5716) — shows
  // their values at once (only into inputs still empty — `applyPreload390`); it is saved with the
  // next save. The backend applies the same preload to everything it computes (boxes, file,
  // submission, incidents), so nothing depends on that save (AEAT PAR016).
  useEffect(() => {
    if (!apiBaseUrl) return;
    loadPreload(isMonthlyReturn(aeatInputsRef.current)).then(res => {
      if (!res || isSubmitted || hasPreloadedValues(preloadedRef.current)) return;
      if (!Array.isArray(res.declarations) || res.declarations.length === 0) return;
      applyFreshPreload(res);
    });
  }, [decl.id]);

  // Incidents: a draft has its rules recomputed by the backend on opening (validate390 — the
  // organization or the invoices may have changed since the last save); a presented declaration
  // keeps its frozen incidents. `incidentsVersion` re-reads them after an AEAT attempt (the
  // backend replaces the AEAT ones).
  const [incidentsVersion, setIncidentsVersion] = useState(0);
  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let cancelled = false;
    const read = () => fetchDeclarationIncidents(decl.id, { token, apiBaseUrl, model: MODEL_ID });
    const load = incidentsVersion === 0 && !isSubmitted
      ? validate390(decl, { token, apiBaseUrl }).then(res => res ?? read())
      : read();
    load.then(res => {
      if (!cancelled && res) setIncidents(res);
    });
    return () => { cancelled = true; };
  }, [decl.id, token, apiBaseUrl, incidentsVersion]);

  /** Recomputes the rule incidents from what is stored (after a save). Never throws. */
  async function revalidate() {
    if (!apiBaseUrl || isSubmitted) return;
    const res = await validate390(decl, { token, apiBaseUrl });
    if (res) setIncidents(res);
  }

  // Display values: a presented declaration shows the snapshot as frozen; a draft re-derives the
  // input-dependent boxes from the inputs on screen (fm390Layouts.deriveInputBoxes).
  const display = useMemo(() => {
    if (!payload?.boxes) return { boxes: {}, mode: 'liquidation' };
    if (isSubmitted) return { boxes: toBoxMap(payload.boxes), mode: payload.mode ?? 'liquidation' };
    return deriveInputBoxes(payload.boxes, payload.inputs ?? {}, aeatInputs);
  }, [payload, aeatInputs, isSubmitted]);
  const summary = summaryOf(display.boxes, display.mode);
  // The 390 result is informative (resultKind390): its badge shows only the sign, in neutral
  // colours — the payment / offset / refund was settled by the last 303 ([97] / [98]).
  const resultKind = payload?.boxes
    ? resultKind390(summary.result, { hasActivity: summary.accrued !== 0 || summary.deductible !== 0 })
    : null;
  const resultColors = resolveResultColors(resultKind);
  const resultLabel = resultKind ? t(RESULT_LABEL_KEY_390[resultKind]) : t('fm.m303.summary.result_sub');
  // Cuadre of the result on screen with the year's 303s (Reconciliation390).
  const reconciliation = payload?.boxes ? reconcile390(summary.result, preload) : null;

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
    if (normalized != null && spec?.percent && (Number(normalized) < 0 || Number(normalized) > TERRITORY_PERCENT_MAX)) {
      toast.error(t('fm.m390.input.percent_range', { box: spec.box, max: TERRITORY_PERCENT_MAX }));
      return;
    }
    // [85] and [93] cannot coexist (classic BothAmtPrevious): the second one is refused.
    const conflict = normalized != null && Number(normalized) !== 0 ? conflictingInput390(key, aeatInputs) : null;
    if (conflict) {
      toast.error(t('fm.m390.input.compensation_conflict'));
      return;
    }
    if ((aeatInputs[key] ?? null) === normalized) return;
    markDirty();
    // sanitizeAeatInputs390: e.g. a territory percentage > 0 clears [85] (not just disables it).
    setAeatInputs(prev => {
      const next = { ...prev };
      if (normalized == null) delete next[key]; else next[key] = normalized;
      return sanitizeAeatInputs390(next);
    });
  }

  function handleRestore(key) {
    if (!preloaded || !Object.hasOwn(preloaded, key)) return;
    markDirty();
    setAeatInputs(prev => restorePreloaded390(prev, preloaded, key));
  }

  /**
   * Applies a preload payload to the inputs the user has not changed and records its values as
   * `aeatPreloaded`. Returns the resulting `{ inputs, preloaded }` (the state updates are async).
   */
  function applyFreshPreload(res) {
    const result = applyPreload390(aeatInputsRef.current, preloadedRef.current, res?.inputs);
    const before = JSON.stringify(preloadedRef.current ?? null);
    preloadedRef.current = result.preloaded;
    aeatInputsRef.current = result.inputs;
    setPreloaded(result.preloaded);
    setAeatInputs(result.inputs);
    if (result.applied.length > 0 || before !== JSON.stringify(result.preloaded)) markDirty();
    return result;
  }

  // Turning ISMONTHLYRETURN off clears DEVOLVER_01..12; turning ConcursoAcr off clears
  // ConcursoUltPer (sanitizeAeatInputs390) and "Sustitutiva por rectificación de cuotas".
  function handleFlagChange(flag, on) {
    markDirty();
    setAeatInputs(prev => sanitizeAeatInputs390({ ...prev, [flag]: on ? 'Y' : 'N' }));
    if (flag === FLAG.CONCURSO && !on && identification?.rectificacionCuotas) {
      setIdentification(prev => ({ ...prev, rectificacionCuotas: false }));
    }
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
  const currentManualData = () => buildManualData390(
    lastSavedManualData.current, identification, aeatInputsRef.current, preloadedRef.current);

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
        revalidate();
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

  // Calcular re-reads the 303s first and applies them to the inputs the user has not changed, so
  // the boxes are computed (and saved) with them.
  async function handleCompute() {
    const fresh = await loadPreload(isMonthlyReturn(aeatInputsRef.current));
    if (fresh) applyFreshPreload(fresh);
    const res = await compute(currentManualData().aeatInputs);
    if (!res) {
      if (incompleteYearRef.current) toastIncompleteYear(incompleteYearRef.current);
      else toast.error(t('fm.m390.compute_error'));
      return;
    }
    invalidateFiscalComputeCache(decl.id);
    const wasDirty = dirtyRef.current;
    const { ok } = await persistIfDirty();
    if (!ok) toast.error(t('fm.action.save_error'));
    // A save revalidates by itself; with nothing to save the invoices may still have changed.
    else if (!wasDirty) revalidate();
  }

  function guardSubstituteIdentifier() {
    const errorKey = substituteIdentifierError(identification);
    if (!errorKey) return true;
    setShowIdError(true);
    toast.error(t(errorKey));
    return false;
  }

  // Counts as the shared Incidencias table shows them (anything not `warn` is blocking).
  const { blocking, warning } = normalizeIncidents390(incidents);
  // Only the model's own blocking rules gate Generar / Presentar — never a stored AEAT answer.
  const ruleBlocking = ruleBlockingCount(incidents);

  function openGenerate() {
    if (ruleBlocking > 0) {
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
      if (result.error === 'blocking_incidents') {
        // The backend found a blocking rule the page did not know yet (e.g. the organization
        // changed): show the fresh list.
        toast.error(t('fm.m390.blocked_by_incidents'));
        revalidate();
        setActiveTab('incidents');
      } else if (result.error === 'incomplete_fiscal_year') {
        toastIncompleteYear(result);
      } else if (!result.ok) {
        toast.error(result.serverMessage || t('fm.m390.generate_error'));
      }
    } finally {
      setGenerating(false);
    }
  }

  function openPresent() {
    if (ruleBlocking > 0) {
      toast.error(t('fm.m390.blocked_by_incidents'));
      return;
    }
    if (!guardSubstituteIdentifier()) return;
    setShowPresent(true);
  }

  // PresentModal's choice. Pending changes are saved FIRST (the backend files / freezes from the
  // stored inputs); a failed save stops here. Then the next step opens: the AEAT flow, or the
  // registration form.
  async function handlePresentPath({ status: path }) {
    if (path !== 'aeat_telematic' && path !== REGISTER_PATH) return;
    setPresenting(true);
    try {
      const saved = await persistIfDirty();
      if (!saved.ok) {
        toast.error(t('fm.action.save_error'));
        return;
      }
      if (path === 'aeat_telematic') setShowAeatFlow(true);
      else setShowRegister(true);
    } finally {
      setPresenting(false);
    }
  }

  // AEAT accepted the filing: the backend already stored submitted_ack, aeat_telematic, the
  // snapshot and manualData.submission — mirror them locally and let the parent re-read the
  // declaration (a status PUT here would be a 409 submitted → submitted).
  function handleTelematicResult(data) {
    if (data?.status !== 'SUCCESS') return;
    const filed = submissionFromResponse(data, { user: auth?.username });
    const manualData = { ...lastSavedManualData.current, [SUBMISSION_KEY]: filed };
    lastSavedManualData.current = manualData;
    setSubmission(filed);
    setStatus('submitted_ack');
    setSubmissionMethod('aeat_telematic');
    onManualDataSaved?.(decl.id, manualData);
    onSubmittedRemotely?.(decl.id, 'submitted_ack');
  }

  // "Registrar como presentada": the filing data is saved in its OWN PUT (with the inputs), the
  // PDF uploaded, then the status changes in a second PUT (the backend freezes the snapshot).
  async function handleRegister({ justificante, date, file }) {
    setPresenting(true);
    try {
      const filed = buildManualSubmission({ justificante, date, user: auth?.username });
      const manualData = { ...currentManualData(), [SUBMISSION_KEY]: filed };
      const saved = await persistManualData(decl.id, manualData, { token, apiBaseUrl });
      if (!saved.ok) {
        toast.error(t('fm.action.save_error'));
        return;
      }
      dirtyRef.current = false;
      lastSavedManualData.current = manualData;
      invalidateFiscalComputeCache(decl.id);
      onManualDataSaved?.(decl.id, manualData);
      if (file) uploadReceipt?.(file);
      const previous = { status, submissionMethod };
      const next = manualRegistrationStatus(file);
      setStatus(next.status);
      setSubmissionMethod(next.submissionMethod);
      const result = await onStatusChange?.(decl.id, next.status, next.submissionMethod);
      if (result?.ok === false) {
        setStatus(previous.status);
        setSubmissionMethod(previous.submissionMethod);
        toast.error(t('fm.action.present_error'));
        return;
      }
      setSubmission(filed);
      setShowRegister(false);
      if (result?.submittedSnapshot?.boxes != null) setPayload(result.submittedSnapshot);
    } finally {
      setPresenting(false);
    }
  }

  // "Crear declaración sustitutiva": a new draft (type substitute) with the same inputs and the
  // former declaration's identifier — the 13-digit justificante — prefilled. Opened at once.
  async function handleCreateSubstitute() {
    setCreatingSubstitute(true);
    try {
      const result = await createSubstitute390({ ...decl, manualData: { ...lastSavedManualData.current, [SUBMISSION_KEY]: submission } }, { token, apiBaseUrl });
      if (result.ok) {
        toast.success(t('fm.m390.substitute.created'));
        onDeclarationCreated?.(result.decl);
        return;
      }
      if (result.decl) onDeclarationCreated?.(result.decl);
      toast.error(t(result.error === 'draft_exists' ? 'fm.m390.substitute.draft_exists' : 'fm.m390.substitute.error'));
    } finally {
      setCreatingSubstitute(false);
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

  // Same Incidencias card as the 303: the total and the severity badge (incidentKpiVariants).
  const incidentVariants = incidentKpiVariants({ blocking, warning }, t);
  const nameWarnings = nameWarningsFromIncidents390(incidents?.items);
  const typeLabel = isSubstitutive(identification) ? t('fm.m349.type.substitutive') : t('fm.m349.type.normal');
  const blockedTitle = ruleBlocking > 0 ? t('fm.m390.blocked_by_incidents') : undefined;

  const tabs = [
    { id: 'boxes', label: t('fm.tab.boxes'), icon: <ClipboardCheck size={16} strokeWidth={1.75} data-testid="ClipboardCheck__fm390" /> },
    { id: 'sources', label: t('fm.tab.sources'), badge: isSubmitted ? null : tabCount(sourcesCount), icon: <ReceiptText size={16} strokeWidth={1.75} data-testid="ReceiptText__fm390tab" /> },
    { id: 'incidents', label: t('fm.tab.incidents'), ...incidentsTabBadge(blocking, warning), icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__fm390tab" /> },
    { id: 'receipt', label: t('fm.tab.receipt'), badge: tabCount(receiptCount), icon: <FileCheck size={16} strokeWidth={1.75} data-testid="FileCheck__fm390" /> },
  ];

  const hasBoxes = payload?.boxes != null;

  // "Abrir" on a 303 of block 9: pending changes are saved first (the page is left), then the 303
  // opens through the parent (FiscalModelsPage).
  async function handleOpen303(id) {
    if (!onOpenDeclaration) return;
    const saved = await persistIfDirty();
    if (!saved.ok) {
      toast.error(t('fm.action.save_error'));
      return;
    }
    const target = await fetchDeclaration(id, { token, apiBaseUrl });
    if (target) onOpenDeclaration(target);
    else toast.error(t('fm.m390.preload.open_error'));
  }
  // "Editar en Organización" / an invoice list from an incident: pending changes are saved first
  // (the page is left).
  async function handleNavigateAway(path) {
    const saved = await persistIfDirty();
    if (!saved.ok) {
      toast.error(t('fm.action.save_error'));
      return;
    }
    navigate(path);
  }
  const blockExtras = {
    resultado_liquidaciones: (
      <Settlements303Table390
        preload={preload}
        loading={preloadLoading}
        error={preloadError}
        year={decl.year}
        onOpen={onOpenDeclaration ? handleOpen303 : undefined}
        t={t}
        bcpLocale={bcpLocale} />
    ),
  };

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
          right={isSubmitted ? (
            <FmDetailButton onClick={handleCreateSubstitute} disabled={busy} data-testid="FmModel390Page__createSubstitute">
              {creatingSubstitute
                ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__substitute390" />
                : <RefreshCw size={16} strokeWidth={1.75} data-testid="RefreshCw__substitute390" />}
              {t('fm.m390.substitute.action')}
            </FmDetailButton>
          ) : (
            <>
              <FmDetailButton onClick={handleCompute} disabled={busy} data-testid="FmModel390Page__compute">
                {computing
                  ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__compute390" />
                  : <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__compute390" />}
                {computing ? t('fm.action.computing') : t('fm.action.compute')}
              </FmDetailButton>
              {/* Like the 303: a blocked Generar / Presentar stays clickable and says why in a
                  toast (openGenerate / openPresent); the Download icon turns red while blocked. */}
              <FmDetailButton
                onClick={openGenerate}
                disabled={busy || !hasBoxes}
                title={blockedTitle}
                data-testid="FmModel390Page__generate"
              >
                {generating
                  ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__generate390" />
                  : (
                    <Download
                      size={16}
                      strokeWidth={1.75}
                      style={{ color: ruleBlocking > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}
                      data-testid="Download__generate390" />
                  )}
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
                disabled={busy || !hasBoxes}
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
        {isSubmitted && <SubmissionCard390 submission={submission} t={t} bcpLocale={bcpLocale} />}
        <SubstitutiveBanner
          identification={identification}
          concurso={isConcurso(aeatInputs)}
          onChange={handleIdentificationChange}
          disabled={isSubmitted || busy}
          showError={showIdError || String(identification?.formerStatement ?? '').length > 0}
          t={t} />

        <div className="fm-390-kpis">
          {/* Incidencias — the 303 card: total + severity badge; a click opens the tab. */}
          <KpiWidget
            icon={blocking > 0
              ? <OctagonAlert size={20} strokeWidth={1.75} data-testid="OctagonAlert__fm390" />
              : <TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__fm390kpi" />}
            iconColor={incidentVariants.iconColor}
            label={t('fm.tab.incidents')}
            onClick={() => setActiveTab('incidents')}
            value={<span data-testid="FmModel390Page__incidentsCount">{String(blocking + warning)}</span>}
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
              los 303" banner (Reconciliation390) goes right under the cards. */}
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
        {/* The cuadre with the year's 303s: a full-width banner between the cards and the tabs. */}
        {hasBoxes && (
          <Reconciliation390
            reconciliation={reconciliation}
            preload={preload}
            year={decl.year}
            onViewDetail={viewSettlements}
            t={t} />
        )}

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
            {!hasBoxes && !computing && computeError && (
              // Why the boxes could not be computed: the system notice banner (never the raw
              // backend text for an exercise without calendar periods — incompleteYear390.js).
              <div className="fm-390-notices fm-390-notices--gutter">
                <InfoBanner
                  tone={incompleteYear ? 'warning' : 'danger'}
                  icon={incompleteYear ? TriangleAlert : CircleAlert}
                  dismissible={false}
                  role="alert"
                  data-testid="FmModel390Page__computeError"
                  action={incompleteYear && (
                    <button type="button" className="fm-btn fm-btn--cancel-pill fm-390-reconcile__btn" onClick={goToFiscalCalendar} data-testid="FmModel390Page__goToFiscalCalendar">
                      <CalendarDays size={14} strokeWidth={1.75} data-testid="CalendarDays__empty390" />
                      {t(GO_TO_FISCAL_CALENDAR_KEY)}
                    </button>
                  )}
                >
                  {computeError}
                </InfoBanner>
              </div>
            )}
            {!hasBoxes && !computing && (
              <FmEmptyState
                icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__empty390" />}
                title={t('fm.m390.empty.title', { year: decl.year })}
                sub={t('fm.m390.empty.sub')}
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
                warnings={payload.warnings}
                year={decl.year}
                readOnly={isSubmitted}
                onInputChange={handleInputChange}
                onRestore={handleRestore}
                onFlagChange={handleFlagChange}
                onClearTerritory={handleClearTerritory}
                onEditOrganization={() => navigate('/organization')}
                goToBox={goToBox}
                goToBlock={goToBlock}
                nameWarnings={nameWarnings}
                invoiceBoxes={payload.invoiceBoxes}
                onViewInvoices={isSubmitted ? undefined : viewInvoicesForBox}
              onViewSettlements={viewSettlements}
                blockExtras={blockExtras}
                t={t}
                bcpLocale={bcpLocale} />
            )}
          </div>
        )}
        {activeTab === 'sources' && (
          <div className="fm-page__body" style={{ padding: 0 }}>
            <FmSources390
              decl={decl}
              token={token}
              apiBaseUrl={apiBaseUrl}
              filter={sourcesFilter}
              onFilterChange={setSourcesFilter}
              isSubmitted={isSubmitted}
              refreshKey={payload}
              onCountChange={setSourcesCount}
              t={t}
              bcpLocale={bcpLocale} />
          </div>
        )}
        {activeTab === 'incidents' && (
          <div className="fm-page__body" style={{ padding: 0 }}>
            <Incidents390Tab
              incidents={incidents}
              onGoToBox={goToBoxOfIncident}
              onViewInvoices={isSubmitted ? undefined : viewInvoicesForBox}
              onViewSettlements={viewSettlements}
              onNavigate={handleNavigateAway}
              t={t} />
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
        <PresentModal
          decl={decl}
          onConfirm={handlePresentPath}
          onClose={() => setShowPresent(false)}
          showAeatPath
          registerPaths={REGISTER_PATHS_390} />
      )}
      {showAeatFlow && (
        <AeatSubmitFlow
          decl={decl}
          adapter={AEAT_SUBMIT_390}
          orgIdent={{ nif: orgIdentity.nif, nombre: orgIdentity.name }}
          identChecks={identification}
          summary={summary}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onResult={handleTelematicResult}
          onAttached={() => listReceipts?.()}
          onIncidentsChanged={() => setIncidentsVersion(v => v + 1)}
          onClose={() => setShowAeatFlow(false)} />
      )}
      {showRegister && (
        <RegisterSubmitted390Modal
          busy={presenting}
          onConfirm={handleRegister}
          onClose={() => setShowRegister(false)} />
      )}
    </div>
  );
}
