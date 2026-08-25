import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { Loader2, TriangleAlert, OctagonAlert, CircleCheck, Download, Landmark } from 'lucide-react';
import { formatAmount, formatPeriod, triggerBase64Download, applyIdentParams, IBAN_REQUIRED_TIPOS, DECLARATION_TYPE_INGRESO } from '../../fiscalModelsUtils.js';
import { isLastPeriodOfYear } from './fm303Layouts.js';

// ── Pure helpers (exported for unit testing — no DOM/React involved) ──────────

/**
 * Request body shape for POST /fiscal303/submit, per the ETP-4456 Phase 2
 * backend contract. `nrc`/`presenterNif`/`presenterName` are trimmed so an
 * accidental leading/trailing space (e.g. pasted NRC) doesn't reach AEAT.
 */
export function buildAeatSubmitBody({ testMode, nrc, presenterNif, presenterName, idi = 'ES' } = {}) {
  return {
    testMode: !!testMode,
    idi,
    nrc: (nrc ?? '').trim(),
    presenterNif: (presenterNif ?? '').trim(),
    presenterName: (presenterName ?? '').trim(),
  };
}

/**
 * Builds the confirmation-screen declaration data from data already known
 * client-side (decl + orgIdent + identChecks + the current computed summary)
 * — no extra API round-trip before the actual submission. The result screen
 * later shows the server's own `declarationData` (parsed from the real
 * generated file), which is the authoritative version.
 */
export function buildLocalDeclarationData({ decl, orgIdent, identChecks, summary } = {}) {
  return {
    nif: orgIdent?.nif ?? '',
    businessName: orgIdent?.nombre ?? '',
    fiscalYear: decl?.year ?? '',
    period: decl?.period ?? '',
    declarationType: identChecks?.tipo_declaracion ?? decl?.result?.kind ?? '',
    resultAmount: summary?.result ?? decl?.summary?.result ?? null,
    iban: identChecks?.bank_iban ?? '',
  };
}

/**
 * Returns true when NONE of the given `actividadesDelIae` rows (ETP-4975,
 * `EPIAE_OrgInfo_Epigraph` via the `organization` NEO spec) qualifies as the
 * Modelo 303 "default IAE activity" — `default = true` AND `epiaeCode` set.
 * That is exactly the condition the AEAT 303 backend requires on the last
 * period of the fiscal year (reused via reflection from Classic); without it,
 * GO currently raises an untranslated `IndexOutOfBoundsException` (see
 * docs/generated-custom-windows/organization.md "Actividades del IAE"). Pure
 * (no fetch) so it stays trivially unit-testable.
 */
export function isMissingDefaultIaeActivity(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return true;
  return !rows.some(r => (r?.default === true || r?.default === 'Y') && r?.epiaeCode);
}

/**
 * Runs the ETP-4975 missing-default-IAE-activity pre-flight guard, extracted
 * out of `handleSubmit` to keep its cognitive complexity within limits
 * (S3776) — behavior is unchanged from the inline version. Mirrors the IBAN
 * guard next to its call site. The last period of the fiscal year (4T
 * quarterly or month 12 monthly) needs the organization to have at least one
 * `actividadesDelIae` row with `default = true` AND `epiaeCode` set; without
 * it, GO's backend (reusing Classic's Modelo 303 code via reflection) throws
 * an untranslated `IndexOutOfBoundsException` instead of a translated error —
 * confirmed live: period=12 -> HTTP 500, period=8/11 -> 200 OK. Only runs for
 * the last period (the only period the backend actually needs this for) and
 * only when an organization id is resolvable; on any fetch/network error (or
 * a non-ok response) it fails OPEN (lets the submission proceed) rather than
 * blocking a submission that might otherwise succeed — same reasoning as
 * NeoExchangeRateService.hasRate (neo-headless.md §5, ETP-4838): a flaky
 * pre-check must never manufacture a false block, and the backend's own
 * (even if untranslated) guard remains the final authority.
 *
 * `apiFetch`'s base is already `neoBase(apiBaseUrl)` (the true `/sws/neo`
 * root — `apiBaseUrl` itself is scoped to this window's OWN spec, e.g.
 * `/sws/neo/fiscal-models`), so it reaches the `organization` spec's
 * `actividadesDelIae` entity the same way `useActividadesIae.js` does for
 * the Organization window itself, and reuses this file's existing auth
 * wiring instead of a second, parallel raw `fetch`.
 *
 * Returns `{ blocked: true, message }` when the submission must be stopped,
 * or `{ blocked: false }` for every other case (not the last period, no
 * resolvable org id, a non-ok response, no missing activity, or a
 * fetch/network error).
 */
export async function checkMissingIaeGuard({ decl, selectedOrg, apiFetch, t }) {
  if (!isLastPeriodOfYear(decl?.period) || !selectedOrg?.id) return { blocked: false };
  try {
    const iaeRes = await apiFetch(`/organization/actividadesDelIae?parentId=${selectedOrg.id}&_limit=100`);
    if (iaeRes.ok) {
      const iaeRows = (await iaeRes.json())?.response?.data ?? [];
      if (isMissingDefaultIaeActivity(iaeRows)) {
        return {
          blocked: true,
          message: t('fm.aeat.error.missingDefaultIae') ?? 'This organization needs at least one IAE activity marked as default, with a code assigned, before filing the last period\'s declaration.',
        };
      }
    }
  } catch (_) {
    // fail open — see docstring above.
  }
  return { blocked: false };
}

/** Maps a /fiscal303/submit response to one of the 3 result-screen outcomes. */
export function classifySubmitOutcome(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  if (data.status === 'SUCCESS') return 'success';
  if (data.status === 'TEST_SUCCESS') return 'test_success';
  if (data.status === 'ERROR') return 'error';
  return 'unknown';
}

/**
 * Returns the i18n key for a specific, actionable message for the known
 * pre-flight/idempotency error codes that need dedicated UI copy. Returns
 * null for any other code (including SUBMISSION_FAILED) — the caller falls
 * back to rendering the generic `errors[]` list from AEAT.
 */
export function resolveErrorCodeKey(errorCode) {
  if (errorCode === 'MISSING_PRESENTER') return 'fm.aeat.error.missingPresenter';
  if (errorCode === 'NO_CERTIFICATE') return 'fm.aeat.error.noCertificate';
  if (errorCode === 'ALREADY_SUBMITTED') return 'fm.aeat.error.alreadySubmitted';
  return null;
}

// ── UI ──────────────────────────────────────────────────────────────────────

// Reuses the same labels as the tipo_declaracion dropdown (fm303Layouts.js) instead of a
// separate fm.result.* set, which only ever covered C/I/N/V (a different, older context) and
// would otherwise need to be kept in sync by hand every time a declaration type is added.
const DECL_TYPE_LABEL_KEY = {
  C: 'fm.ident.decl.compensacion',
  D: 'fm.ident.decl.devolucion',
  I: 'fm.ident.decl.ingreso',
  U: 'fm.ident.decl.domiciliacion',
  N: 'fm.ident.decl.resultado_cero',
  V: 'fm.ident.decl.dev_cta_corriente',
  X: 'fm.ident.decl.dev_transferencia_ext',
};

function resolveDeclTypeLabel(declarationType, t) {
  if (!declarationType) return null;
  const key = DECL_TYPE_LABEL_KEY[declarationType];
  if (key) return t(key);
  return declarationType;
}

const INPUT_ST = {
  width: 376, height: 40, fontSize: 14, padding: '8px 12px',
  border: '1px solid hsl(var(--border-control))', borderRadius: 8,
  boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none', background: 'hsl(var(--card))',
};

function Field({ label, children }) {
  return (
    <div style={{ width: 376 }}>
      <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid hsl(var(--border-subtle))', fontSize: 14 }}>
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span style={{ color: 'hsl(var(--foreground))', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Banner({ tone, icon, title, body, children }) {
  const vars = {
    success: ['var(--fm-success-bg)', 'var(--fm-success-border)', 'var(--fm-success-fg)'],
    warning: ['var(--fm-warning-bg)', 'var(--fm-warning-border)', 'var(--fm-warning-fg)'],
    danger:  ['var(--fm-danger-bg)',  'var(--fm-danger-border)',  'var(--fm-danger-fg)'],
    info:    ['var(--fm-info-bg)',    'var(--fm-info-border)',    'var(--fm-info-fg)'],
  }[tone] ?? ['var(--fm-info-bg)', 'var(--fm-info-border)', 'var(--fm-info-fg)'];
  const [bg, border, fg] = vars;
  return (
    <div style={{ padding: '12px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 12, color: fg, display: 'flex', gap: 10 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {body && <div style={{ fontSize: 13, marginTop: 4, lineHeight: '18px' }}>{body}</div>}
        {children}
      </div>
    </div>
  );
}

// decl:      the declaration record (year, period, id, model, result?.kind, summary?.result)
// orgIdent:  { nif, nombre } — declarant identity, fetched from /neo/session by FmModel303Page
// identChecks: casillas identification state (tipo_declaracion, bank_iban, ...)
// summary:   currently displayed KPI summary { accrued, deductible, result }
// onSuccess:  called with 'submitted_ack' once AEAT confirms a production (non-test) submission
// onAttached: called (no args) whenever the backend response carries a receipt PDF
//             (`response.pdfBase64` truthy) — for BOTH SUCCESS and TEST_SUCCESS. Lets the
//             caller refresh the "Justificante" attachments tab even for a test-mode success,
//             which deliberately does NOT go through onSuccess/handleStatusChange (test mode
//             must never change the declaration's status).
// onIncidentsChanged: called (no args) whenever the backend returned a structured submission
//             result (SUCCESS/TEST_SUCCESS/ERROR — i.e. any `data.status`), regardless of outcome.
//             The backend replaces the declaration's persisted AEAT incidents on EVERY submission
//             attempt (test mode included), so the "Incidencias" tab must re-fetch after every
//             attempt, not just on success — see ETP-4456, `Fiscal303BoxesHandler#handleSubmit`.
// onClose:    called to dismiss the flow (any step)
export default function AeatSubmitFlow({ decl, orgIdent, identChecks, summary, token, apiBaseUrl, onSuccess, onAttached, onIncidentsChanged, onClose }) {
  const ui = useUI();
  const t = ui;
  const navigate = useNavigate();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  // `selectedOrg` (AuthContext) is only needed for the IAE-activity guard below.
  // Requires an AuthProvider ancestor (`useAuth()` throws without one) — every
  // test that mounts this component must wrap it in one, or mock
  // `@/auth/AuthContext.jsx`, the same way it must already provide a Router
  // for `useNavigate()` above.
  const { selectedOrg } = useAuth();

  const localData = buildLocalDeclarationData({ decl, orgIdent, identChecks, summary });

  const [step, setStep] = useState('confirm'); // 'confirm' | 'result'
  const [submitting, setSubmitting] = useState(false);
  const [connError, setConnError] = useState(null);
  // Distinguishes the missing-default-IAE-activity pre-flight guard from every
  // other `connError` so only ITS banner gets the "Go to Organization" CTA
  // (see the guard in handleSubmit below and its render further down).
  const [missingIaeGuard, setMissingIaeGuard] = useState(false);
  const [response, setResponse] = useState(null);

  const [testMode, setTestMode] = useState(false);
  const [nrc, setNrc] = useState('');
  const [presenterNif, setPresenterNif] = useState(orgIdent?.nif ?? '');
  const [presenterName, setPresenterName] = useState(orgIdent?.nombre ?? '');

  async function handleSubmit() {
    setSubmitting(true);
    setConnError(null);
    setMissingIaeGuard(false);
    try {
      // ETP-4975 pre-flight guard — see checkMissingIaeGuard's docstring for
      // the full rationale (fail-open semantics, why it only runs on the last
      // period, etc.).
      const iaeGuard = await checkMissingIaeGuard({ decl, selectedOrg, apiFetch, t });
      if (iaeGuard.blocked) {
        setMissingIaeGuard(true);
        setConnError(iaeGuard.message);
        setSubmitting(false);
        return;
      }
      const tipo = localData.declarationType || decl?.result?.kind || 'N';
      // Mirrors fm303Layouts.js's datos_bancarios.sectionVisibleWhen anyOf (ETP-4456 follow-up):
      // the bank section — and its required bank_iban field — is shown whenever tipo_declaracion
      // is U/D/X OR rectificativa is checked (independent of tipo). This pre-flight guard must
      // fire under the same condition, otherwise a rectificativa filed under e.g. tipo 'I' shows
      // the IBAN field as required but lets the user submit with it empty, round-tripping to the
      // backend for an untranslated AEAT303_section_bank_empty 500 instead of failing fast with
      // the existing translated fm.aeat.error.ibanRequired message.
      const ibanRequired = IBAN_REQUIRED_TIPOS.includes(tipo) || identChecks?.rectificativa === true;
      if (ibanRequired && !identChecks?.bank_iban?.trim()) {
        setConnError(t('fm.aeat.error.ibanRequired') ?? 'IBAN is required to submit this declaration type. Fill in the IBAN field in the Identification section.');
        setSubmitting(false);
        return;
      }
      const params = new URLSearchParams({ year: decl.year, period: decl.period, tipo, id: decl.id });
      if (identChecks) applyIdentParams(params, identChecks);
      const res = await apiFetch(`/fiscal303/submit?${params}`, {
        method: 'POST',
        body: JSON.stringify(buildAeatSubmitBody({ testMode, nrc, presenterNif, presenterName })),
      });
      const data = await res.json().catch(() => null);
      // Intentionally does not branch on `res.ok` — only `data.status` (SUCCESS/TEST_SUCCESS/
      // ERROR, all set by buildFailureJson-style responses, including MISSING_PRESENTER/
      // NO_CERTIFICATE). The backend's missing-id (400) and declaration-not-found (404) guards
      // return a different shape (`{error:{message,status}}`, no top-level `status`) and fall
      // through to the generic connection-error message below rather than a specific one — left
      // as-is (considered, not missed): `decl.id` is always supplied by this page itself, never
      // user-editable, so those two guards are not user-reachable in practice.
      if (!data || !data.status) {
        setConnError(t('fm.aeat.error.connection') ?? 'Connection error while submitting to the AEAT. Please try again.');
        setSubmitting(false);
        return;
      }
      setResponse(data);
      setStep('result');
      // Fired for SUCCESS, TEST_SUCCESS and ERROR alike — the backend replaces the persisted
      // AEAT incidents on every attempt (delete-then-reinsert, empty on success), so the
      // "Incidencias" tab needs a fresh fetch regardless of outcome, not just on success.
      onIncidentsChanged?.();
      if (data.status === 'SUCCESS') onSuccess?.('submitted_ack');
      // Fired for both SUCCESS and TEST_SUCCESS — the backend now attaches the
      // receipt PDF to the declaration's attachments in either case. Calling
      // this unconditionally on SUCCESS too is harmless: it just triggers an
      // extra remount of an already-fresh tab (a no-op refresh, not a bug).
      if (data.pdfBase64) onAttached?.();
    } catch (_) {
      setConnError(t('fm.aeat.error.connection') ?? 'Connection error while submitting to the AEAT. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const outcome = step === 'result' ? classifySubmitOutcome(response) : null;

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.aeat.title') ?? 'AEAT electronic submission'}</div>
            {step === 'confirm' && (
              <div className="fm-config-modal__sub">
                {t('fm.aeat.confirm.subtitle') ?? 'Review the data before sending to the Tax Agency'}
              </div>
            )}
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body">
          {step === 'confirm' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <InfoRow
                  label={t('fm.aeat.confirm.nif') ?? 'NIF'}
                  value={localData.nif}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.confirm.business_name') ?? 'Business name'}
                  value={localData.businessName}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.confirm.period') ?? 'Fiscal year / Period'}
                  value={`${localData.fiscalYear} / ${formatPeriod(localData.period)}`}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.confirm.decl_type') ?? 'Declaration type'}
                  value={resolveDeclTypeLabel(localData.declarationType, t)}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.confirm.result') ?? 'Result'}
                  value={formatAmount(localData.resultAmount)}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.confirm.iban') ?? 'IBAN'}
                  value={localData.iban}
                  data-testid="InfoRow__fc2aac" />
              </div>

              <div style={{ fontWeight: 600, fontSize: 14, color: 'hsl(var(--foreground))', marginBottom: 12 }}>
                {t('fm.aeat.presenter.title') ?? 'Presenter (certificate holder)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Field
                  label={t('fm.aeat.presenter.nif') ?? 'Presenter NIF'}
                  data-testid="Field__fc2aac">
                  <input
                    type="text"
                    value={presenterNif}
                    onChange={e => setPresenterNif(e.target.value)}
                    style={INPUT_ST}
                    data-testid="AeatSubmitFlow__presenterNif" />
                </Field>
                <Field
                  label={t('fm.aeat.presenter.name') ?? 'Presenter name'}
                  data-testid="Field__fc2aac">
                  <input
                    type="text"
                    value={presenterName}
                    onChange={e => setPresenterName(e.target.value)}
                    style={INPUT_ST}
                    data-testid="AeatSubmitFlow__presenterName" />
                </Field>
                {localData.declarationType === DECLARATION_TYPE_INGRESO && (
                  <Field
                    label={t('fm.aeat.nrc.label') ?? 'NRC'}
                    data-testid="Field__fc2aac">
                    <input
                      type="text"
                      value={nrc}
                      onChange={e => setNrc(e.target.value)}
                      placeholder={t('fm.aeat.nrc.placeholder') ?? 'Complete Reference Number'}
                      style={{ ...INPUT_ST, fontFamily: 'monospace' }}
                      data-testid="AeatSubmitFlow__nrc" />
                  </Field>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer', marginBottom: testMode ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={e => setTestMode(e.target.checked)}
                  data-testid="AeatSubmitFlow__testMode" />
                {t('fm.aeat.test_mode.label') ?? 'Test mode (no certificate required)'}
              </label>
              {testMode && (
                <Banner
                  tone="warning"
                  icon={<TriangleAlert size={16} data-testid="TriangleAlert__aeat" />}
                  title={t('fm.aeat.test_mode.warning') ?? 'In test mode the declaration is validated by AEAT but NOT submitted.'}
                  data-testid="Banner__aeatTestWarning" />
              )}

              {connError && (
                <div style={{ marginTop: 12 }}>
                  <Banner
                    tone="danger"
                    icon={<OctagonAlert size={16} data-testid="OctagonAlert__aeatConn" />}
                    title={connError}
                    data-testid="Banner__aeatConnError">
                    {/* CTA only for the missing-default-IAE-activity guard — every other
                        connError (connection failure, IBAN required) has no dedicated
                        settings screen to send the user to. */}
                    {missingIaeGuard && (
                      <button
                        type="button"
                        className="fm-btn fm-btn--primary"
                        style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => navigate('/organization')}
                      >
                        <Landmark size={14} data-testid="Landmark__aeatGoToOrganization" />
                        {t('fm.aeat.action.go_to_organization') ?? 'Go to Organization'}
                      </button>
                    )}
                  </Banner>
                </div>
              )}
            </>
          )}

          {step === 'result' && outcome === 'success' && (
            <>
              <Banner
                tone="success"
                icon={<CircleCheck size={18} data-testid="CircleCheck__aeatSuccess" />}
                title={t('fm.aeat.result.success.title') ?? 'Declaration submitted successfully'}
                data-testid="Banner__aeatSuccess" />
              <div style={{ marginTop: 16 }}>
                <InfoRow
                  label={t('fm.aeat.result.success.csv') ?? 'CSV'}
                  value={response?.csv}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.result.success.date') ?? 'Presentation date'}
                  value={response?.presentationDate}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.result.success.registry') ?? 'Registry number'}
                  value={response?.registryNumber}
                  data-testid="InfoRow__fc2aac" />
                <InfoRow
                  label={t('fm.aeat.result.success.justificante') ?? 'Receipt number'}
                  value={response?.justificanteNumber}
                  data-testid="InfoRow__fc2aac" />
              </div>
              {response?.pdfDownloadFailed ? (
                <div style={{ marginTop: 16 }}>
                  <Banner
                    tone="warning"
                    icon={<TriangleAlert size={16} data-testid="TriangleAlert__aeatPdfFailed" />}
                    title={t('fm.aeat.result.pdf_failed') ?? 'The declaration was submitted successfully, but the receipt PDF could not be retrieved.'}
                    data-testid="Banner__aeatPdfFailed" />
                </div>
              ) : response?.pdfBase64 && (
                <button
                  type="button"
                  className="fm-btn"
                  style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => triggerBase64Download(
                    response.pdfBase64,
                    `303_justificante_${decl.year}_${decl.period}.pdf`,
                  )}
                >
                  <Download size={14} data-testid="Download__aeatPdf" />
                  {t('fm.aeat.action.download_pdf') ?? 'Download receipt (PDF)'}
                </button>
              )}
              {response?.warnings?.length > 0 && (
                <div style={{ marginTop: 16, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('fm.aeat.warnings.title') ?? 'Warnings'}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {response.warnings.map(w => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {step === 'result' && outcome === 'test_success' && (
            <>
              <Banner
                tone="warning"
                icon={<TriangleAlert size={18} data-testid="TriangleAlert__aeatTest" />}
                title={t('fm.aeat.result.test.title') ?? 'Test submission — declaration NOT filed'}
                body={t('fm.aeat.result.test.body') ?? 'This was a validation-only test against the AEAT test service. Nothing was actually submitted.'}
                data-testid="Banner__aeatTestSuccess" />
              {response?.pdfBase64 && (
                <button
                  type="button"
                  className="fm-btn"
                  style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => triggerBase64Download(
                    response.pdfBase64,
                    `303_borrador_${decl.year}_${decl.period}.pdf`,
                  )}
                >
                  <Download size={14} data-testid="Download__aeatDraftPdf" />
                  {t('fm.aeat.action.download_pdf') ?? 'Download receipt (PDF)'}
                </button>
              )}
            </>
          )}

          {step === 'result' && outcome === 'error' && (() => {
            const specificKey = resolveErrorCodeKey(response?.errorCode);
            const isNoCertificate = response?.errorCode === 'NO_CERTIFICATE';
            let errorBody;
            if (specificKey) {
              errorBody = <div style={{ marginTop: 4 }}>{t(specificKey) ?? specificKey}</div>;
            } else if (response?.errors?.length > 0) {
              errorBody = (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {response.errors.map(e => <li key={e}>{e}</li>)}
                </ul>
              );
            } else {
              errorBody = <div style={{ marginTop: 4 }}>{t('fm.aeat.error.generic') ?? 'Unknown error. Please try again.'}</div>;
            }
            return (
              <>
                <Banner
                  tone="danger"
                  icon={<OctagonAlert size={18} data-testid="OctagonAlert__aeatError" />}
                  title={t('fm.aeat.result.error.title') ?? 'The submission could not be completed'}
                  data-testid="Banner__aeatError">
                  {errorBody}
                </Banner>
                {isNoCertificate && (
                  <button
                    type="button"
                    className="fm-btn fm-btn--primary"
                    style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => navigate('/fiscal-config')}
                  >
                    <Landmark size={14} data-testid="Landmark__aeatGoToCertConfig" />
                    {t('fm.aeat.action.go_to_cert_config') ?? 'Go to Fiscal configuration'}
                  </button>
                )}
              </>
            );
          })()}

          {/* Defensive fallback — should never trigger against the documented contract
              (status is always SUCCESS/TEST_SUCCESS/ERROR), kept so an unexpected
              backend value degrades to a message instead of a blank body. */}
          {step === 'result' && outcome === 'unknown' && (
            <Banner
              tone="danger"
              icon={<OctagonAlert size={18} data-testid="OctagonAlert__aeatUnknown" />}
              title={t('fm.aeat.result.error.title') ?? 'The submission could not be completed'}
              body={t('fm.aeat.error.generic') ?? 'Unknown error. Please try again.'}
              data-testid="Banner__aeatUnknown" />
          )}
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {step === 'result' ? (t('fm.action.close') ?? 'Close') : (t('fm.action.cancel') ?? 'Cancel')}
          </button>
          {step === 'confirm' && (
            <button
              className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
              disabled={submitting}
              onClick={handleSubmit}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {submitting
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__aeatSubmitting" />
                : <Landmark size={14} data-testid="Landmark__aeatSubmit" />}
              {submitting
                ? (t('fm.aeat.action.submitting') ?? 'Submitting to AEAT…')
                : (t('fm.aeat.action.submit') ?? 'Submit to AEAT')}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
