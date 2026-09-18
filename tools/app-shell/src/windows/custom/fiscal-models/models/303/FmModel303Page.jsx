import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  Download, Save,
  OctagonAlert, TriangleAlert, CircleCheck,
  Calculator, Loader2, TrendingUp, TrendingDown,
  ClipboardCheck, ReceiptText, FileCheck,
} from 'lucide-react';
import { Tabs, KpiWidget, MoreOptionsMenu } from '../../FmCommon.jsx';
import { SourcesTab, IncidentsTab } from '../../FmTabContent.jsx';
import FmBoxes303 from './FmBoxes303.jsx';
import { PresentModal, FileGenModal303 } from '../../FmOverlays.jsx';
import AeatSubmitFlow, { isMissingDefaultIaeActivity } from './AeatSubmitFlow.jsx';
import { isLastPeriodOfYear, getMissingRequiredFields } from './fm303Layouts.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import {
  formatAmount, formatPeriod, computeBoxes303, generate303File, fetchDeclarationIncidents,
  persistManualData, deriveResultKind, toBoxArray, applyOverrides, recomputeDerivedBoxes, getBoxValue,
  resolveResultColors,
} from '../../fiscalModelsUtils.js';
import { useRecordWriteQueue } from '@/hooks/useRecordWriteQueue.js';
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

// toBoxArray/applyOverrides/recomputeDerivedBoxes/getBoxValue moved to
// fiscalModelsUtils.js (ETP-5272 pt.6) — shared with FmListPage.jsx so the
// override-merge + derived-box formula lives in exactly one place.

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
  const mergedBoxes = recomputeDerivedBoxes(applyOverrides(res.boxes, manualOverrides));
  setLiveBoxes(mergedBoxes);
  // ETP-5272 pt.6 (cont.) — two independent reasons `res.summary` can't be trusted as-is,
  // both because the GET /fiscal303/boxes backend computes purely from invoice data (no
  // declaration-id/manualData input at all, so it never sees manualOverrides):
  // 1) `result` is the backend's box 46 ("Resultado régimen general") under a "standard
  //    company" assumption (100% state attribution, no territorial split). The real final
  //    liquidation result is box 71 ("Resultado de la liquidación"), which DOES correctly
  //    reflect the territorial split (box 65/66) through `mergedBoxes` (recomputeDerivedBoxes
  //    chains box 71 through box 66/69).
  // 2) `deductible` is box 45 ("total_deducir"), computed as sum([29,31,33,35,37,39,41,42,43,44]).
  //    Boxes 42/43/44 are pure manual entries (compensaciones régimen agricultura,
  //    regularización bienes de inversión, prorrata definitiva) the backend never receives —
  //    so its raw `deductible` silently assumes 42/43/44 = 0.
  // Both are re-derived here from the override-aware `mergedBoxes` instead of the raw backend
  // value. `accrued` (box 27, IVA devengado) needs no such treatment — it has no manual-entry
  // inputs anywhere in its formula.
  setLiveSummary({
    ...res.summary,
    deductible: getBoxValue(mergedBoxes, 45) ?? res.summary?.deductible ?? 0,
    result: getBoxValue(mergedBoxes, 71) ?? res.summary?.result ?? 0,
  });
  if (res.sources) setLiveSources(res.sources);
}

function fetchOrgIdent(token, apiBaseUrl, setOrgIdent, apiFetch) {
  if (!token || !apiBaseUrl) return;
  apiFetch(`${neoBase(apiBaseUrl)}/session`, { baseUrl: '' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const org = data?.organization;
      if (!org) return;
      setOrgIdent({ nif: org.taxId ?? '', nombre: org.name ?? '' });
    })
    .catch(() => {});
}

function applyGenerateError(result, t) {
  if (result.error === 'iban_required') {
    toast.error(t('fm.gen303.error.iban_required') ?? 'Se necesita el IBAN para generar el fichero. Selecciona tipo C o N, o introduce el IBAN.');
  } else {
    const msg = result.serverMessage
      || t('fm.gen303.error.generic')
      || 'Error al generar el fichero. Por favor, inténtelo de nuevo.';
    toast.error(msg);
    console.error('generate303File failed:', result.error, result.serverMessage);
  }
}

// ── Tab content components ────────────────────────────────────────

// Casillas tab — left sidebar nav + content area
const CASILLAS_SECTIONS = [
  { id: 'identificacion',  titleKey: 'fm.page.identificacion',  sections: ['identificacion', 'datos_bancarios'] },
  { id: 'liquidacion',     titleKey: 'fm.page.liquidacion',     sections: ['iva_devengado', 'iva_deducible', 'resultado'] },
  { id: 'info_adicional',  titleKey: 'fm.page.info_adicional',  sections: ['info_adicional', 'tributacion_territorial', 'info_adicional_ultimo_periodo'] },
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

export default function FmModel303Page({ decl, onBack, onStatusChange, onManualDataSaved, token, apiBaseUrl }) {
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
  /**
   * ETP-5338 (architecture change) — `identChecks`/`manualOverrides` are now purely LOCAL,
   * in-memory state until the user explicitly clicks "Guardar". There is no more debounced
   * autosave-on-every-commit: that was the root cause of Bug B (a "Cancelar" that could not
   * actually cancel anything older than the 800ms debounce, because it had already been PUT to
   * the server by the time the user clicked it). See `handleCancel`/`handleSave` below.
   *
   * `hasPendingManualDataEditRef` still tracks "at least one edit happened since the last
   * successful save" — flipped synchronously (not via an effect) the instant an identification
   * or box edit happens, so `handleSave` can gate on it without waiting for a render, and
   * `handleCancel` can clear it as part of discarding those edits.
   */
  const hasPendingManualDataEditRef = useRef(false);
  const handleIdentChange = (id, value) => {
    hasPendingManualDataEditRef.current = true;
    setIdentChecks(prev => ({ ...prev, [id]: value }));
    if (id === 'motivo_rectificacion' && value !== 'D') {
      setManualOverrides(prev => { const n = { ...prev }; delete n[108]; return n; });
      setLiveBoxes(removeBox108FromLive);
    }
  };
  const [liveBoxes,      setLiveBoxes]      = useState(decl._precomputed?.boxes   ?? null);
  const [manualOverrides, setManualOverrides] = useState(decl.manualData?.manualOverrides ?? {});
  // ETP-5338 (Guardar) — drives the Save/Loader2 icon swap and disables the button while a
  // flush is in flight, same convention as the shared `saveActions.jsx` Save buttons.
  const [isSavingManualData, setIsSavingManualData] = useState(false);
  /**
   * Snapshot of the payload the most recent (or in-flight) `persistManualData` call is sending —
   * rebuilt fresh from current state by `handleSave` itself, immediately before flushing. No
   * longer mirrored by a background debounce effect (there isn't one anymore); it exists purely
   * so `flushManualData()` has a stable value to read at the instant it's called.
   */
  const manualDataLatest = useRef(null);
  /**
   * `useRecordWriteQueue` below still serialises writes per declaration — kept because Guardar
   * clicks can still race each other: a rapid double-click, or a second click landing while an
   * earlier Guardar's PUT is still in flight. This ref is the eligibility gate a QUEUED replay
   * re-checks right before it fires (`writeManualData`), for the same reason it existed under
   * the old debounce design: PUT(A) in flight → user clicks Guardar again (queued) → declaration
   * gets filed via the Present flow before PUT(A) settles → the replay would otherwise write
   * manualData to a declaration that is now submitted. The server does not stop it —
   * `FiscalDeclCrudHandler#handleDeclPut` has no submitted guard — so this ref is the sole gate.
   * Kept in sync by its own effect rather than written during render, so it always reflects the
   * render that actually committed.
   */
  const isManualDataEligible = useRef(false);
  /**
   * ETP-5338 (Guardar) — the outcome of the most recent `persistManualData` call, so an
   * explicit user-initiated save (`handleSave`) can tell the user whether it actually
   * succeeded. Read by `handleSave` AFTER awaiting `flushManualData()`/`waitUntilManualDataIdle`.
   */
  const lastManualDataResultRef = useRef({ ok: true });

  /**
   * The single write path for manualData. At most one PUT is open at a time; a save requested
   * while one is in flight is queued and replayed when it settles, reading `manualDataLatest`
   * again so the replay carries the newest value rather than the one current when it was queued.
   */
  /**
   * Sends the manual data. Single-flight and the queued replay belong to the write queue below
   * (ETP-5255); the eligibility gate stays here because it is this panel's own rule.
   */
  const writeManualData = useCallback(async ({ value }) => {
    // Re-checked on EVERY entry, so it gates the queued replay and not just the arming of the
    // timer. A save that has become ineligible is DROPPED — returning `false` discards anything
    // queued behind it rather than carrying it forward: once the declaration is submitted its
    // content is a filed record, and a late autosave silently mutating it is worse than losing an
    // unsaved tweak made seconds before filing. This is the one place in this flow where dropping
    // beats queueing.
    if (!isManualDataEligible.current) return false;
    if (!value) return false;
    const result = await persistManualData(value.id, value.manualData, {
      token: value.token,
      apiBaseUrl: value.apiBaseUrl,
    });
    // Recorded for `persistEditableFields` to read after the flush settles.
    lastManualDataResultRef.current = result;
    return true;
  }, []);

  /**
   * Serialises per DECLARATION (ETP-5255).
   *
   * This panel was already correct before the shared queue existed, but only because it autosaves
   * the whole record at once — so its single in-flight flag WAS a per-record key, by accident of
   * shape rather than by design. The other three panels that hand-rolled this guarded per field or
   * per input and let two writes to one record overlap. Using the same queue here is what stops
   * this file from drifting back into a fourth private copy.
   */
  const { persist: persistManualDataQueued, waitUntilIdle: waitUntilManualDataIdle } =
    useRecordWriteQueue({ write: writeManualData });

  // Returns the (settled-or-not) promise so callers that need durability before proceeding —
  // currently only `handleSave` — can await it instead of firing-and-forgetting.
  function flushManualData() {
    const snapshot = manualDataLatest.current;
    if (!snapshot) return Promise.resolve();
    return persistManualDataQueued(snapshot.id, 'manualData', snapshot).catch(() => {});
  }

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
    hasPendingManualDataEditRef.current = true;
    const value = parseBoxInput(rawValue);
    const fallback = decl._precomputed?.boxes ?? decl.boxes;

    // ETP-5338 pt.2 (replaces the advisory-warning-only approach from the previous commit):
    // box78 ("cuotas de periodos anteriores que se compensan en esta declaracion") can never
    // legitimately exceed box110 ("cuotas pendientes de compensar de periodos anteriores") —
    // there's nothing to compensate beyond what's actually pending. Rather than warn the user
    // post-hoc, the invalid state is made structurally impossible: whenever this commit would
    // leave box78 > box110, box78 is silently clamped down to box110's value. This fires both
    // when box78 itself is the box being edited (clamp its own new value), AND reactively when
    // box110 is edited/lowered below an already-larger box78 (re-clamp box78 so the invariant
    // holds at all times, not just at box78's own edit time). When box110 is blank/absent there
    // is nothing to clamp against, so box78 is accepted as typed.
    const currentBoxes = liveBoxes ?? fallback;
    const nextBox110 = boxNum === 110 ? value : getBoxValue(currentBoxes, 110);
    const rawNextBox78 = boxNum === 78 ? value : getBoxValue(currentBoxes, 78);
    const nextBox78 = (nextBox110 != null && rawNextBox78 != null && rawNextBox78 > nextBox110)
      ? nextBox110
      : rawNextBox78;
    const box78WasClamped = nextBox78 !== rawNextBox78;

    setManualOverrides(prev => {
      const next = { ...prev, [boxNum]: value };
      // Pin the clamped box78 value into the overrides too — otherwise a later recompute
      // (handleCompute/"Calcular" -> applyComputeResult -> applyOverrides) would re-merge the
      // un-clamped manual override and resurrect box78 > box110.
      if (box78WasClamped) next[78] = nextBox78;
      return next;
    });
    setLiveSummary(null);
    setLiveBoxes(prev => {
      const applied = applyBoxChange(prev, boxNum, value, fallback);
      if (!box78WasClamped) return applied;
      // applyBoxChange already ran recomputeDerivedBoxes once, but it did so against the
      // un-clamped box78 (e.g. 900 before being pinned down to box110's 500) — box69/71 in
      // `applied` are derived from that transiently-invalid value. Splice in the corrected
      // box78 and recompute a SECOND time so 69/71 reflect the final, clamped figure instead
      // of a materially wrong one that would otherwise only self-heal on the next edit.
      const corrected = applied.map(b => (b.num === 78 ? { ...b, value: nextBox78 } : b));
      return recomputeDerivedBoxes(corrected);
    });
  }

  const [liveSummary, setLiveSummary] = useState(decl._precomputed?.summary ?? null);
  const [liveSources, setLiveSources] = useState(decl._precomputed?.sources ?? null);
  const [computing,   setComputing]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState(null);
  // The missing-default-IAE-activity pre-flight guard (ETP-4975) is now the ONLY path that
  // still writes `genError` and renders the inline banner: every other generation failure
  // (IBAN required, generic backend error) was moved to a toast in ETP-5027. This flag stays
  // because the banner carries a "Go to Organization" CTA that is specific to that guard —
  // mirrors `missingIaeGuard` in AeatSubmitFlow.jsx.
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
    if (!token || !apiBaseUrl) return;
    refreshIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id, token, apiBaseUrl]);

  // Pure recompute — no persistence. Called both by the "Calcular" button (via
  // `handleComputeClick` below) and by the mount effect further down, which fires
  // AUTOMATICALLY (not from a user click) whenever the list didn't hand this page any
  // precomputed data. That automatic call must never persist editable-field edits — see
  // `handleComputeClick`'s comment for why the two are kept deliberately separate.
  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computeBoxes303(decl, { token, apiBaseUrl });
      applyComputeResult(res, manualOverrides, setLiveBoxes, setLiveSummary, setLiveSources);
    } finally {
      setComputing(false);
    }
  }

  // ETP-5338 (design decision) — "Calcular" is an explicit user click too, so — unlike the
  // automatic mount-time recompute above, and unlike `FmListPage`'s own `useFiscalAutoCompute`
  // polling hook (a wholly separate mechanism in a different component that recomputes LIST
  // rows from invoice data on an interval; it never touches this page's identChecks/
  // manualOverrides and has no write path at all) — it also flushes any pending editable-field
  // edits, via the exact same `persistEditableFields` "Guardar" uses rather than a second
  // hand-rolled copy.
  //
  // The recompute and the persist run independently: `handleCompute` owns its own `computing`
  // spinner and is unaffected by how long the save takes, and a save failure must not stop the
  // KPIs/boxes from refreshing (the user asked for a recompute; a slow save is not their
  // problem). The save's only feedback here is a toast on failure — no success toast, so a
  // "Calcular" click that also happens to persist doesn't stack a second, confusing "guardado"
  // message on top of the compute's own visual feedback (the refreshed KPI/box values).
  function handleComputeClick() {
    persistEditableFields().then(({ ok }) => {
      if (!ok) toast.error(t('fm.action.save_error') ?? 'No se pudo guardar. Inténtalo de nuevo.');
    });
    return handleCompute();
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
    // ETP-5272 pt.6 — `decl._precomputed` is the RAW, override-free auto-compute result
    // `FmListPage`'s `useFiscalAutoCompute` already fetched for every draft declaration
    // before this page ever mounted. Route it through `applyComputeResult` (same helper
    // `handleCompute` and "Calcular" use) so the already-hydrated `manualOverrides` get
    // merged in immediately — otherwise `liveBoxes` stays pinned to the raw seed from the
    // initial state above and the user's saved manual edits are invisible until they
    // manually re-run "Calcular". No new network call: this reuses the payload we already have.
    if (decl._precomputed?.boxes != null) {
      applyComputeResult(decl._precomputed, manualOverrides, setLiveBoxes, setLiveSummary, setLiveSources);
      return;
    }
    if (liveBoxes != null) return;
    if (!token || !apiBaseUrl) return;
    handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id]);

  async function handleGenerate({ filename } = {}) {
    // ETP-5187 — required-field pre-flight (see `missingRequiredFields` above). Must run before
    // any other guard/state change below: an unset `tipo_declaracion` (or, when visible, a blank
    // `bank_iban`) must never reach the backend, which used to silently default a missing
    // declaration type to "N" instead of rejecting it.
    if (missingRequiredFields.length > 0) {
      missingRequiredFieldsToast(
        'fm.validation.missing_required_generate',
        "Completá {fields} antes de generar el fichero.",
      );
      return;
    }
    setGenError(null);
    setMissingIaeGuard(false);
    setGenerating(true);
    // ETP-4975 pre-flight guard — mirrors the one in AeatSubmitFlow.jsx's handleSubmit
    // (see that file for the full rationale). "Generar fichero 303" hits the exact same
    // backend AEAT303Report code path as "Registrar/Presentar" for the last period of
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
    if (!result.ok) applyGenerateError(result, t);
  }

  useEffect(() => { fetchOrgIdent(token, apiBaseUrl, setOrgIdent, apiFetch); }, [token, apiBaseUrl, apiFetch]);

  function handleStatusChange(newStatus, newSubmissionMethod) {
    setStatus(newStatus);
    if (newSubmissionMethod) setSubmissionMethod(newSubmissionMethod);
    onStatusChange?.(decl.id, newStatus, newSubmissionMethod);
  }

  // ETP-5338 (architecture change) — the single write path for `identChecks`/`manualOverrides`,
  // extracted out of `handleSave` so BOTH explicit user actions that must persist them — "Guardar"
  // and, per the later product decision, "Calcular" (see `handleComputeClick` below) — share
  // exactly one implementation instead of a second hand-rolled copy. There is no more debounced
  // background autosave: these fields are pure local React state until one of those two clicks
  // flushes them. That is what makes "Cancelar" (`handleCancel` below) able to genuinely discard
  // an edit again — under the old debounce, anything older than 800ms was already on the wire and
  // no client-side "cancel" could undo it (Bug B).
  //
  // Everything through the `waitUntilManualDataIdle`/`flushManualData` calls is carried over
  // verbatim from the debounce-era `handleSave` (ETP-5338 Bug 2 hardening): rebuild the snapshot
  // from CURRENT state rather than trust a possibly-stale mirror, and wait for a write already in
  // flight — now from an earlier explicit Guardar/Calcular click rather than an earlier debounce
  // cycle — before flushing this one, via `waitUntilIdle`'s re-read loop rather than a single
  // captured promise. `useRecordWriteQueue` (and the `isManualDataEligible` gate it wraps) is kept
  // for exactly this: two explicit saves can still race (a rapid double-click, or Calcular firing
  // while a Guardar from moments ago is still in flight).
  //
  // Returns `{ ok }` so each caller can apply its own feedback: `handleSave` always toasts (it's
  // the user's one unambiguous "save" action), `handleComputeClick` only toasts on failure (its
  // own success signal is the recomputed KPIs/boxes, not a second "saved" toast layered on top of
  // "Calcular").
  async function persistEditableFields() {
    if (isSubmitted) return { ok: true };
    if (!hasPendingManualDataEditRef.current || !token || !apiBaseUrl) return { ok: true };
    setIsSavingManualData(true);
    let ok = true;
    try {
      // ETP-5338 Bug 2, part 1 — an edit made while a field still has focus (no blur — none of
      // these inputs have a blur handler, they commit via `onChange` on every keystroke, see
      // `handleIdentChange`/`handleBoxChange`) is already in `identChecks`/`manualOverrides` React
      // state by the time this runs. Rebuilding the snapshot directly from current state (rather
      // than trusting a mirror populated by a background effect) removes that indirection
      // entirely.
      //
      // ETP-5338 Bug 2, part 2 — wait for any write ALREADY in flight (from an earlier explicit
      // save) before flushing this one. `persistManualDataQueued` (in `flushManualData`) is
      // single-flight per record: calling it while a write is still open only QUEUES this
      // snapshot and returns immediately, it does not wait for the eventual replay.
      // `waitUntilIdle` (from `useRecordWriteQueue`) loops instead of trusting one captured
      // promise reference, so it is structurally guaranteed to wait for a replay armed mid-wait
      // too — see its own doc.
      await waitUntilManualDataIdle(decl.id);
      manualDataLatest.current = {
        id: decl.id,
        manualData: { identification: identChecks, manualOverrides },
        token,
        apiBaseUrl,
      };
      await flushManualData();
      // Wait for the flush just issued (not just whatever was in flight before it) to settle, so
      // `lastManualDataResultRef` reflects THIS call's own write, not a stale one.
      await waitUntilManualDataIdle(decl.id);
      ok = lastManualDataResultRef.current?.ok !== false;
      // Only clear the pending-edit flag on success — a failed save must still look "pending" so
      // a retry click actually attempts the write again instead of silently no-op'ing.
      if (ok) {
        hasPendingManualDataEditRef.current = false;
        // ETP-5338 Bug A fix — pushes the just-saved manualData into `FmListPage`'s own cached
        // `decls` entry for this declaration, the same way `onStatusChange` already does for
        // status changes. Without this, reopening the declaration from the list (without a full
        // page reload) would show the pre-save value again: `FmListPage` never refetches on its
        // own, and there is otherwise no mechanism that updates its cache for a manualData save.
        onManualDataSaved?.(decl.id, { identification: identChecks, manualOverrides });
      }
    } finally {
      setIsSavingManualData(false);
    }
    return { ok };
  }

  // "Guardar" — the user's explicit, unambiguous save action. Always reports its outcome via
  // toast (unlike the old debounced autosave, which stayed silent-on-failure by design — a button
  // the user explicitly clicked must say whether it worked). Defense in depth: a submitted
  // declaration has nothing left to flush (`persistEditableFields` itself is gated on
  // `!isSubmitted`) and the button is hidden once submitted, but the explicit guard is kept so a
  // stray call is still a no-op.
  async function handleSave() {
    const { ok } = await persistEditableFields();
    if (ok) {
      toast.success(t('recordSaved') ?? 'Registro guardado');
    } else {
      toast.error(t('fm.action.save_error') ?? 'No se pudo guardar. Inténtalo de nuevo.');
    }
  }

  // "Cancelar" (ETP-5338 Bug B fix) — genuinely discards any unsaved edit now, with NO network
  // call: since `identChecks`/`manualOverrides` are pure local state with no background autosave
  // racing ahead of this click, simply not flushing them and unmounting (this page always
  // unmounts on `onBack`) IS the discard. `hasPendingManualDataEditRef` is still cleared
  // explicitly — not because unmounting needs it, but so the intent reads the same as
  // `persistEditableFields`'s own bookkeeping, and so it stays correct if this page is ever made
  // to survive its own `onBack` (e.g. a future "confirm discard" prompt reusing this handler).
  function handleCancel() {
    hasPendingManualDataEditRef.current = false;
    onBack?.();
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

  // ETP-5338 pt.4 — "processing a rectificativa un-checks the checkbox" root cause: unlike
  // `handleComputeClick` (which always calls `persistEditableFields()` before recomputing),
  // this handler never flushed pending `identChecks`/`manualOverrides` edits before changing
  // the declaration's status. A user who checks "Autoliquidación Rectificativa" and clicks
  // "Registrar/Presentar" directly — without an intervening "Guardar" click — had that edit
  // discarded: `persistEditableFields()` is gated on `!isSubmitted` (see its own comment
  // above), and `handleStatusChange` below flips local `status` to a submitted value, so any
  // call to `persistEditableFields()` AFTER that point becomes a silent permanent no-op. The
  // checkbox itself never actually unchecks in this page's own local state — what happens is
  // the check was simply never sent to the server, so every OTHER surface that reads it back
  // from persisted `manualData` (reopening the declaration, the list's "Tipo" column) shows it
  // unchecked, which reads to the user as "the checkbox unchecked itself".
  //
  // Fix: flush pending edits BEFORE any status transition, for both the two manual paths and
  // the 'aeat_telematic' sentinel (AeatSubmitFlow's own AEAT params are read live off
  // `identChecks`, but the persisted `manualData` copy needs the same flush so it doesn't
  // drift from what was actually filed). If the flush fails, the transition is aborted rather
  // than proceeding and losing the edit permanently — the pending-edit flag stays set
  // (`persistEditableFields` only clears it on success), so the user can retry via "Guardar"
  // or by clicking "Registrar/Presentar" again.
  async function handlePresent({ status: newStatus, acuseFile }) {
    // ETP-5187 — required-field pre-flight (see `missingRequiredFields` above), covering all
    // paths this function can take — including 'aeat_telematic' below, which only opens the
    // AeatSubmitFlow but must not even get that far with an unset declaration type.
    if (missingRequiredFields.length > 0) {
      missingRequiredFieldsToast(
        'fm.validation.missing_required_present',
        "Completá {fields} antes de marcar la declaración como presentada.",
      );
      return;
    }
    const { ok: savedOk } = await persistEditableFields();
    if (!savedOk) {
      toast.error(t('fm.action.save_error') ?? 'No se pudo guardar. Inténtalo de nuevo.');
      return;
    }
    // 'aeat_telematic' is a sentinel from PresentModal's 4th path, never a
    // real declaration status — it means "open the AEAT submission flow",
    // not "change the status directly" like the other 2 manual paths.
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

  // ETP-5187 — `decl._hasDuplicatePeriod` is set by FmListPage.jsx when this declaration is a
  // 2nd/Nth one for the same (model, year, period): another declaration already exists for that
  // period, so AEAT requires this one to be marked "Autoliquidación rectificativa" (the checkbox
  // already exists — see `identChecks.rectificativa`, wired through `CasillasTab` →
  // `FmBoxes303` → the `resultado_final` nav section). The user must check it themselves (never
  // auto-checked here) before the declaration can be marked "Presentado". Cleared once submitted:
  // there is nothing left to gate on a declaration that already went through.
  const requiresRectificativa = Boolean(decl._hasDuplicatePeriod) && !identChecks.rectificativa && !isSubmitted;

  // ETP-5187 — generic required-field gate: `getMissingRequiredFields` reads the SAME
  // `field.required` flags fm303Layouts.js declares for `identificacion`/`datos_bancarios`
  // (the ones FmBoxes303 already renders a red asterisk for), respecting each field's own
  // visibility — e.g. `bank_iban` only counts while `datos_bancarios`'s section is actually
  // shown (tipo U/D/X, or rectificativa checked). A third field marked `required: true` in a
  // future year's patch is automatically covered here, no gate-side change needed. Blocks both
  // "Generar fichero 303" and "Marcar como Presentado" — see handleGenerate/handlePresent below
  // and their button pre-checks — because the backend silently defaulted a missing/blank
  // declaration type to "N" instead of rejecting it (Fiscal303BoxesHandler.resolveDeclType).
  const missingRequiredFields = getMissingRequiredFields(decl?.year, decl?.period, identChecks);
  // Shared "'Label A', 'Label B'" rendering of missingRequiredFields, used by both the toast
  // helper below and the inline banner — a single non-nested template literal per field
  // (javascript:S4624 flags nesting one template literal's `${}` inside another's).
  const missingFieldNames = missingRequiredFields.map(f => `'${t(f.labelKey)}'`).join(', ');

  function missingRequiredFieldsToast(actionKey, fallback) {
    toast.error(t(actionKey, { fields: missingFieldNames }) ?? fallback.replace('{fields}', missingFieldNames));
  }

  // Keeps `isManualDataEligible` current so a QUEUED explicit-save replay (see
  // `persistEditableFields`/`writeManualData`) can re-check the same preconditions right before
  // it fires — it cannot read fresh React state from inside a `finally` that runs long after the
  // click that scheduled it. There is no more background debounce effect here: identChecks/
  // manualOverrides are local-only state now, flushed exclusively by an explicit "Guardar" or
  // "Calcular" click (see `persistEditableFields`).
  useEffect(() => {
    isManualDataEligible.current = !isSubmitted && !!token && !!apiBaseUrl;
  }, [isSubmitted, token, apiBaseUrl]);

  const fileBlocked = blocking > 0;
  // Derive KPI card values from liveBoxes so manual overrides (box 42, 43, etc.)
  // are reflected in the accrued/deductible/result cards without a full recalculate.
  const kpi27 = getBoxValue(liveBoxes, 27);
  const kpi45 = getBoxValue(liveBoxes, 45);
  // ETP-5272 pt.6 (cont.) — the final liquidation result is box 71 ("Resultado de la
  // liquidación"), not box 46 ("Resultado régimen general"), which is only an intermediate
  // figure. See applyComputeResult above for the full rationale.
  const kpi71 = getBoxValue(liveBoxes, 71);
  const liveBoxSummary = (kpi27 !== null || kpi45 !== null || kpi71 !== null)
    ? { accrued: kpi27, deductible: kpi45, result: kpi71 }
    : null;
  const summary = liveSummary ?? liveBoxSummary ?? decl.summary ?? {};
  // ETP-5187 — was `decl.result?.kind`, which the backend never populates (declToJson has no
  // `result` field), so this always fell through to the generic "Resultado" label regardless of
  // the real computed result shown just above it. Now derived from the same `summary` this KPI
  // card already displays, via the single shared `deriveResultKind` also used by FmListPage.jsx,
  // so both screens agree on the same label for the same declaration.
  const sourcesForResult = liveSources ?? decl.sources ?? [];
  const resultKind = deriveResultKind(summary, { hasInvoices: sourcesForResult.length > 0 });

  // Derive result sublabel from kind
  const resultSubLabel = resultKind ? (t(`fm.result.${resultKind}`) ?? resultKind) : (t('fm.m303.summary.result_sub') ?? 'Resultado');
  const resultColors = resolveResultColors(resultKind);


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
            {t('fm.config.m303.title') ?? 'Modelo 303'} - {periodLabel}
          </span>
          <MoreOptionsMenu
            favKey="fiscal-models"
            favLabel={t('fm.list.title') ?? 'Declaraciones'}
            data-testid="MoreOptionsMenu__4f6c0d" />
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', marginTop: 1 }}>
          {ui('finance')} / {ui('fm.breadcrumb.section')} / {t('fm.config.m303.title') ?? 'Modelo 303'} - {periodLabel}
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
          onClick={handleCancel}
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

        {/* ETP-5338 PIVOT — "Guardar" replaces the earlier go-back button (which used to sit
            next to Cancelar on the left). Moved into the right-aligned primary-action group,
            leftmost of it, matching `saveActions.jsx`'s convention of Save preceding the
            Confirm/primary action. Persists pending manual edits (handleSave) without
            navigating away; hidden once submitted since there is nothing left to save on a
            filed declaration (same `!isSubmitted` gate as "Calcular"/"Registrar-Presentar"). */}
        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={handleSave}
            disabled={isSavingManualData}
            title={t('fm.action.save') ?? 'Guardar'}
            aria-label={t('fm.action.save') ?? 'Guardar'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14, color: 'hsl(var(--foreground))' }}
            data-testid="FmModel303Page__save"
          >
            {isSavingManualData
              ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__save" />
              : <Save size={16} strokeWidth={1.75} data-testid="Save__save" />}
            {t('fm.action.save') ?? 'Guardar'}
          </button>
        )}

        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={handleComputeClick}
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
          onClick={() => {
            // ETP-5187 — same required-field gate handleGenerate itself enforces; checked here
            // too so the "Generar fichero 303" modal never even opens on an unset declaration type.
            if (missingRequiredFields.length > 0) {
              missingRequiredFieldsToast(
                'fm.validation.missing_required_generate',
                "Completá {fields} antes de generar el fichero.",
              );
              return;
            }
            setShowFilegen(true);
          }}
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
            onClick={() => {
              // ETP-5187 — same required-field gate handlePresent itself enforces; checked here
              // too so the "Marcar como Presentado" modal never even opens on an unset declaration
              // type (checked before requiresRectificativa: an unfilled tipo_declaracion is a more
              // fundamental gap than a missing rectificativa checkbox).
              if (missingRequiredFields.length > 0) {
                missingRequiredFieldsToast(
                  'fm.validation.missing_required_present',
                  "Completá {fields} antes de marcar la declaración como presentada.",
                );
                return;
              }
              if (requiresRectificativa) {
                toast.error(t('fm.duplicate_period.warning') ?? 'Ya existe otra declaración para el mismo período. Marca "Autoliquidación rectificativa" antes de presentar esta declaración.');
                return;
              }
              setShowPresent(true);
            }}
          >
            <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__4f6c0d" />
            {t('fm.action.submit') ?? 'Registrar/Presentar'}
          </button>
        )}
      </div>
      {/* ── Duplicate-period warning (ETP-5187) ─────────────────────── */}
      {requiresRectificativa && (
        <div style={{
          margin: '4px 20px 0',
          padding: '8px 14px',
          background: 'var(--status-warning-bg)',
          border: '1px solid var(--status-warning-border)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--status-warning-fg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <TriangleAlert size={14} strokeWidth={1.75} data-testid="TriangleAlert__duplicatePeriod" />
          {t('fm.duplicate_period.warning') ?? 'Ya existe otra declaración para el mismo período. Marca "Autoliquidación rectificativa" antes de presentar esta declaración.'}
        </div>
      )}
      {/* ── Missing required field(s) warning (ETP-5187) ────────────── */}
      {missingRequiredFields.length > 0 && (
        <div style={{
          margin: '4px 20px 0',
          padding: '8px 14px',
          background: 'var(--status-warning-bg)',
          border: '1px solid var(--status-warning-border)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--status-warning-fg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <TriangleAlert size={14} strokeWidth={1.75} data-testid="TriangleAlert__missingRequired" />
          {t('fm.validation.missing_required_banner', { fields: missingFieldNames })
            ?? `Hay campos obligatorios sin completar: ${missingFieldNames}.`}
        </div>
      )}
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

        {/* Resultado — color-coded by sign (ETP-5236 / M303-01): green when the org owes
            money ('I'), blue when refundable/offsettable ('V'/'C'), neutral otherwise. */}
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__4f6c0d" />}
          iconColor="hsl(var(--foreground))"
          label={t('fm.m303.summary.result') ?? 'Resultado'}
          value={formatAmount(summary.result ?? 0)}
          valueColor={resultColors.valueColor}
          badge={resultSubLabel}
          badgeBg={resultColors.badgeBg}
          badgeColor={resultColors.badgeColor}
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
          {/* CTA for the missing-default-IAE-activity guard, which is the only remaining
              producer of `genError` (all other generation failures surface as toasts since
              ETP-5027). Mirrors AeatSubmitFlow.jsx's own CTA for the same guard. No
              positioning style — a plain adjacent sibling already flows immediately after
              `{genError}` given this container's `display:flex; flexWrap:wrap`; the previous
              `marginLeft: 'auto'` was what pushed it to the far right instead. */}
          {missingIaeGuard && (
            <button
              type="button"
              className="fm-link-btn fm-link-btn--bold"
              onClick={() => navigate('/organization')}
              data-testid="Landmark__gen303GoToOrganization"
            >
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
