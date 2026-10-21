// Modelo 390 — presentation (ETP-5716): the AEAT telematic filing adapter for AeatSubmitFlow, the
// filing data kept in `manualData.submission`, the manual "Con / Sin acuse de recibo" record and
// "Crear declaración sustitutiva".
//
// `manualData.submission` (written by the backend on a telematic filing, by the page on a manual
// registration — aeat-390-endpoints.md, "Submission"):
//   { method: 'aeat_telematic' | 'manual', presentationDate, justificante, csv?,
//     registryNumber?, user, submittedAt }
//
// A manual registration gets the SAME status + submissionMethod as the 303/349 manual register
// (`manualRegistrationStatus`), so it can be reactivated; a telematic filing cannot.
//
// A plain module: requests go through the core `apiFetch` (docs/request-policy.md).
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { persistManualData } from '../../fiscalModelsUtils.js';
import { ANNUAL_PERIOD } from '../../fiscalPeriods.js';
import { isValidFormerStatement } from '../../formerStatement.js';
import { buildManualData390, isSubstitutive } from './fm390Layouts.js';

export const SUBMISSION_KEY = 'submission';
/** `manualData.submission.method` of a manual registration. */
export const SUBMISSION_RECORD_MANUAL = 'manual';
/**
 * PresentModal's manual paths — the same two as the 303/349 (`REGISTER_PATHS` of
 * FmOverlays.jsx): "Con acuse de recibo" and "Sin acuse de recibo". Their ids are the statuses.
 */
export const MANUAL_REGISTER_PATHS = Object.freeze(['submitted_ack', 'submitted']);
/** Code prefix of the incidents stored from an AEAT answer (backend AEAT_INCIDENT_CODE_PREFIX). */
export const AEAT_INCIDENT_PREFIX = 'AEAT-';

/**
 * Status and submissionMethod of a manual registration — the 303/349 values for the path picked
 * in PresentModal: "Con acuse" `submitted_ack` / `manual_ack`, "Sin acuse" `submitted` /
 * `manual_no_receipt`. Both can be reactivated; only a telematic filing cannot.
 */
export function manualRegistrationStatus(path) {
  return path === 'submitted_ack'
    ? { status: 'submitted_ack', submissionMethod: 'manual_ack' }
    : { status: 'submitted', submissionMethod: 'manual_no_receipt' };
}

/** True for an incident stored from an AEAT answer (`AEAT-<code>`): informative, never blocking. */
export function isAeatIncident(item) {
  return String(item?.origin ?? '').startsWith(AEAT_INCIDENT_PREFIX);
}

/**
 * Blocking incidents that gate Generar / Presentar: the model's own rules only. AEAT answers are
 * listed and counted on the cards, but never block the retry that fixes them (the backend guard
 * counts the same).
 */
export function ruleBlockingCount(incidents) {
  const items = Array.isArray(incidents?.items) ? incidents.items : null;
  if (!items) return incidents?.blocking ?? 0;
  return items.filter(i => i.severity !== 'warn' && !isAeatIncident(i)).length;
}

/** The filing data of a declaration (`manualData.submission`), or `null`. */
export function submissionOf(manualData) {
  const s = manualData?.[SUBMISSION_KEY];
  return s && typeof s === 'object' ? s : null;
}

/**
 * The `manualData.submission` of a manual registration: the presentation date, who registered it
 * and when. The 303-aligned flow asks no justificante number (`justificante` stays empty unless
 * given), so a substitute asks for the former identifier itself.
 */
export function buildManualSubmission({ justificante, date, user, now = new Date() } = {}) {
  return {
    method: SUBMISSION_RECORD_MANUAL,
    justificante: String(justificante ?? '').trim(),
    presentationDate: date ?? '',
    user: user ?? '',
    submittedAt: now.toISOString(),
  };
}

/** The filing data of a telematic response (the backend stores the same data server-side). */
export function submissionFromResponse(data, { user, now = new Date() } = {}) {
  return {
    method: 'aeat_telematic',
    presentationDate: data?.presentationDate ?? '',
    justificante: data?.justificanteNumber ?? '',
    csv: data?.csv ?? '',
    registryNumber: data?.registryNumber ?? '',
    user: user ?? '',
    submittedAt: now.toISOString(),
  };
}

/** The "Identificador declaración anterior" of a substitute: the 13-digit justificante, or ''. */
export function formerStatementFrom(submission) {
  const id = String(submission?.justificante ?? '').trim();
  return isValidFormerStatement(id) ? id : '';
}

/**
 * The `manualData` of a new substitute of `decl`: the same inputs and 303 preload, Tipo =
 * Sustitutiva with the former identifier prefilled, and no filing data. Built with
 * `buildManualData390`, so the classic substitute flags (ISSUPPLEMENTARY / SUPPLEMENTARYNO) are
 * already in the stored inputs — the file can be generated without a first "Guardar".
 */
export function substituteManualData(decl) {
  const previous = { ...(decl?.manualData ?? {}) };
  delete previous[SUBMISSION_KEY];
  const identification = {
    ...(previous.identification ?? {}),
    sustitutiva: true,
    formerStatement: formerStatementFrom(submissionOf(decl?.manualData)),
  };
  return buildManualData390(previous, identification, previous.aeatInputs ?? {});
}

function neoRoot(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]+$/, '');
}

async function duplicateId(res) {
  try {
    const body = await res.json();
    return body?.error?.existingId ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * "Crear declaración sustitutiva": `POST /fiscal303/declarations` with `type: 'com'` (the backend
 * keeps the single-ordinary rule for ordinaries only), then `PUT manualData` with
 * `substituteManualData(decl)`. Resolves `{ ok: true, decl }` (the created declaration, with its
 * manualData) or `{ ok: false, error }` — `error: 'draft_exists'` when the exercise already has a
 * draft (409), `'manual_data'` when the declaration was created but its data could not be saved.
 */
export async function createSubstitute390(decl, { token, apiBaseUrl } = {}) {
  if (!apiBaseUrl) return { ok: false, error: 'no_token' };
  let created;
  try {
    const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal303/declarations`, {
      baseUrl: '',
      token,
      method: 'POST',
      body: JSON.stringify({
        model: decl.model, year: Number(decl.year), period: decl.period || ANNUAL_PERIOD, type: 'com', status: 'draft',
      }),
    });
    if (!res.ok) {
      if (res.status === 409) return { ok: false, error: 'draft_exists', existingId: await duplicateId(res) };
      return { ok: false, error: `http_${res.status}` };
    }
    const body = await res.json();
    created = body?.data ?? body;
  } catch (_) {
    return { ok: false, error: 'network' };
  }
  const manualData = substituteManualData(decl);
  const saved = await persistManualData(created.id, manualData, { token, apiBaseUrl });
  return saved.ok
    ? { ok: true, decl: { ...created, manualData } }
    : { ok: false, error: 'manual_data', decl: created };
}

// ── AeatSubmitFlow adapter ───────────────────────────────────────────────────

/**
 * The Modelo 390 adapter of AeatSubmitFlow (see "Model adapters" there): `POST /fiscal390/submit`
 * with only year / period / id — the backend generates the file from the STORED inputs, so the
 * page saves pending changes before opening the flow. No NRC (a 390 is informative), no client
 * pre-flight (blocking incidents already disable "Presentar"; the backend checks them again) and
 * the conformity check is required.
 */
export const AEAT_SUBMIT_390 = Object.freeze({
  buildLocalData: ({ decl, orgIdent, identChecks, summary } = {}) => ({
    nif: orgIdent?.nif ?? '',
    businessName: orgIdent?.nombre ?? '',
    fiscalYear: decl?.year ?? '',
    period: decl?.period ?? ANNUAL_PERIOD,
    declarationType: isSubstitutive(identChecks) ? 'substitutive' : 'normal',
    resultAmount: summary?.result ?? null,
    iban: '',
  }),
  showNrc: () => false,
  declTypeLabel: (localData, t) => t(localData.declarationType === 'substitutive' ? 'fm.m349.type.substitutive' : 'fm.m349.type.normal'),
  requireConformity: true,
  preflight: async () => null,
  submitPath: ({ decl }) => {
    const params = new URLSearchParams({ year: String(decl.year), period: decl.period || ANNUAL_PERIOD, id: decl.id });
    return `/fiscal390/submit?${params}`;
  },
  pdfName: (decl, kind) => `390_${kind}_${decl.year}.pdf`,
});
