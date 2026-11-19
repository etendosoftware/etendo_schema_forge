// ETP-6247 — the SEPA file of a remittance: «Antes de confirmar», «Confirmar», «Descargar fichero»
// and «Regenerar fichero». Pure functions over injected `apiFetch` helpers (docs/request-policy.md),
// so the components stay thin and these can be unit-tested without React.
//
// Contract (RemittanceHeaderHandler, com.etendoerp.go; NEO action envelope read defensively):
//   POST <spec>/remittance/{id}/action/fileReadiness   {}
//     → { ready, scheme: 'CORE'|'SCT'|null,
//          problems: [{ scope: 'org'|'account'|'line', code, message, params: [string],
//            organizationId? (org), accountId? (account),
//            lineId?, lineIds?, businessPartnerId?, businessPartnerName?, invoiceId?, documentNo? (line) }],
//          A contact problem (no IBAN, mandate, address, tax ID, invalid BIC...) comes ONCE per contact
//          and code, `lineIds` listing every line it affects (lineId/documentNo = the first one); the
//          amount problem stays per line. On a processed remittance the amount check is skipped, so
//          `ready` there means «generateFile can run».
//          summary: { invoiceCount, lineCount, totalAmount, currency (ISO), dueDate (yyyy-MM-dd|null) },
//          latestFile: { attachmentId, fileName } | null }   (the main .xml attachment)
//     `message` is ALREADY localized server-side (request language, params substituted) and is what
//     the block shows; `code` (ETGO_RemittanceFile*) + positional `params` are only the fallback.
//   POST <spec>/remittance/{id}/action/confirm          { fieldValues: { grouping: 'P'|'GGPD' } }
//     atomic: readiness, process (REM), settle every payment (automated remittance: Cobrada/Pagada,
//     not reversible), generate the SEPA file and store it as the main attachment.
//     → { status, attachmentId, fileName, downloadUrl (signed public link for MCP; the SPA downloads
//          through /sws/neo/attachments with attachmentId) }
//     Refusals: 422 `error: { message (localized, params substituted), messageKeys: [key] }`, plus
//     `error.problems` for ETGO_RemittanceFileNotReady only; everything is rolled back.
//   POST <spec>/remittance/{id}/action/generateFile      {}
//     processed remittances only; a NEW main attachment (previous files kept) → same shape as confirm.
//   GET  /sws/neo/attachments/file/{attachmentId}        the file bytes (shared attachments API)
//   GET  /sws/neo/attachments/REM_Remittance/{id}        { items: [{ id, name, dataType, uploadedAt }] }
//     fallback only, when fileReadiness carries no `latestFile` (or refuses): the newest .xml wins.

import {
  translateBackendError,
  extractBackendMessageKeys,
  extractBackendMessageParams,
} from '@/lib/backendErrors.js';
import { downloadBlobAsFile } from '@/windows/custom/shared/pdfUtils.js';
import { fetchNeoList } from '@etendosoftware/app-shell-core/lib/import/fetchNeoList.js';

export const GROUPING_NONE = 'P';

/** The readiness problems about the creditor identifier saved on the account (collection remittances). */
export const CREDITOR_ID_PROBLEM_CODES = new Set(['ETGO_RemittanceFileAccountNoCreditorId', 'ETGO_RemittanceFileAccountInvalidCreditorId']);

export function isCreditorIdProblem(problem) {
  return problem?.scope === 'account' && CREDITOR_ID_PROBLEM_CODES.has(problem.code);
}

/** A remittance that was confirmed has a SEPA file to download: PR, SB, CT, PT, CP, PP (not PE, not voided AN). */
export const FILE_STATUSES = new Set(['PR', 'SB', 'CT', 'PT', 'CP', 'PP']);

/**
 * «Regenerar / Generar fichero» is offered only while the remittance is Pendiente de envío (PR) or
 * Enviada al banco (SB): once it is collected the file already went to the bank.
 */
export const REGENERATE_STATUSES = new Set(['PR', 'SB']);
const ATTACHMENTS_PATH = '/sws/neo/attachments';
const REMITTANCE_TABLE = 'REM_Remittance';

const actionPath = (remittanceId, action) =>
  `/remittance/${encodeURIComponent(remittanceId)}/action/${action}`;

/** The action's payload, whether or not NEO wrapped it in `response.data`. */
function unwrap(json) {
  return json?.response?.data ?? json?.data ?? json ?? {};
}

async function readJsonSafely(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function httpError(res, label) {
  const body = await readJsonSafely(res);
  return Object.assign(new Error(body?.error?.message || body?.message || `${label} ${res.status}`), {
    status: res.status,
    body,
  });
}

function textOrNull(value) {
  return value == null || value === '' ? null : String(value);
}

function normalizeProblem(raw) {
  const p = raw ?? {};
  return {
    scope: ['org', 'account', 'line'].includes(p.scope) ? p.scope : 'line',
    lineId: textOrNull(p.lineId),
    lineIds: Array.isArray(p.lineIds) ? p.lineIds.map(String) : (p.lineId ? [String(p.lineId)] : []),
    businessPartnerId: textOrNull(p.businessPartnerId),
    businessPartnerName: textOrNull(p.businessPartnerName),
    documentNo: textOrNull(p.documentNo),
    organizationId: textOrNull(p.organizationId),
    accountId: textOrNull(p.accountId),
    // ETP-6148 — on the account problems «no / invalid creditor identifier»: the proposal computed from the organization.
    suggestedCreditorId: textOrNull(p.suggestedCreditorId),
    code: textOrNull(p.code),
    message: textOrNull(p.message),
    // Positional (`{0}`, `{1}` in the catalog): kept as an array, which the key route interpolates by index.
    params: Array.isArray(p.params) || (p.params && typeof p.params === 'object') ? p.params : null,
  };
}

function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    invoiceCount: num(raw.invoiceCount),
    lineCount: num(raw.lineCount),
    totalAmount: num(raw.totalAmount),
    currency: textOrNull(raw.currency),
    dueDate: textOrNull(raw.dueDate),
  };
}

function normalizeFileRef(raw) {
  const id = textOrNull(raw?.attachmentId ?? raw?.id);
  return id ? { attachmentId: id, fileName: textOrNull(raw?.fileName ?? raw?.name) } : null;
}

/** The read model of `fileReadiness`, every key defaulted. `ready` is false whenever there is a problem. */
export function normalizeFileReadiness(raw) {
  const data = raw ?? {};
  const problems = Array.isArray(data.problems) ? data.problems.map(normalizeProblem) : [];
  return {
    ready: data.ready === true && problems.length === 0,
    scheme: data.scheme === 'CORE' || data.scheme === 'SCT' ? data.scheme : null,
    problems,
    summary: normalizeSummary(data.summary),
    latestFile: normalizeFileRef(data.latestFile),
  };
}

/** The result of `confirm` / `generateFile`. */
export function normalizeFileResult(raw) {
  const data = raw ?? {};
  return {
    status: textOrNull(data.status),
    attachmentId: textOrNull(data.attachmentId),
    fileName: textOrNull(data.fileName),
    downloadUrl: textOrNull(data.downloadUrl),
  };
}

/**
 * What the SEPA file still needs before the remittance can be confirmed.
 *
 * @param {Function} apiFetch - `useApiFetch(apiBaseUrl)` of the remittance spec
 * @param {string} remittanceId
 * @returns {Promise<ReturnType<typeof normalizeFileReadiness>>}
 * @throws {Error} with `status` and `body` when the backend refuses
 */
export async function fetchFileReadiness(apiFetch, remittanceId) {
  const res = await apiFetch(actionPath(remittanceId, 'fileReadiness'), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await httpError(res, 'fileReadiness');
  return normalizeFileReadiness(unwrap(await res.json()));
}

/**
 * Confirms the remittance (atomic: process, settle, generate and attach the file).
 *
 * @param {Function} apiFetch - `useApiFetch(apiBaseUrl)` of the remittance spec
 * @param {string} remittanceId
 * @param {string} grouping - 'P' (none) or 'GGPD' (by business partner and due date)
 * @returns {Promise<ReturnType<typeof normalizeFileResult>>}
 * @throws {Error} with `status` and `body` (messageKeys, problems) when the backend refuses
 */
export async function confirmRemittance(apiFetch, remittanceId, grouping = GROUPING_NONE) {
  const res = await apiFetch(actionPath(remittanceId, 'confirm'), {
    method: 'POST',
    body: JSON.stringify({ fieldValues: { grouping: grouping || GROUPING_NONE } }),
  });
  if (!res.ok) throw await httpError(res, 'confirm');
  return normalizeFileResult(unwrap(await res.json()));
}

/**
 * Regenerates the SEPA file of a processed remittance as a new main attachment.
 *
 * @returns {Promise<ReturnType<typeof normalizeFileResult>>}
 * @throws {Error} with `status` and `body` when the backend refuses
 */
export async function regenerateRemittanceFile(apiFetch, remittanceId) {
  const res = await apiFetch(actionPath(remittanceId, 'generateFile'), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await httpError(res, 'generateFile');
  return normalizeFileResult(unwrap(await res.json()));
}

/**
 * ETP-6247 returns — `returnState`: per line, whether it can be returned. `state` is PENDING |
 * PROCESSED | SETTLED | RETURNED; `returnable` only for a settled line nothing blocks, otherwise
 * `reasonCode` says why (NOT_PROCESSED, NOT_SETTLED, ALREADY_RETURNED, NOT_A_COLLECTION, POSTED,
 * RECONCILED). `paymentLineIds` are the lines that share the line's payment: a return takes them all.
 */
export function normalizeReturnState(raw) {
  const lines = {};
  for (const [lineId, line] of Object.entries(raw?.lines ?? {})) {
    lines[lineId] = {
      state: textOrNull(line?.state),
      returnable: line?.returnable === true,
      reasonCode: textOrNull(line?.reasonCode),
      returnDate: textOrNull(line?.returnDate),
      paymentId: textOrNull(line?.paymentId),
      paymentLineIds: Array.isArray(line?.paymentLineIds) && line.paymentLineIds.length > 0 ? line.paymentLineIds : [lineId],
    };
  }
  return { collection: raw?.collection === true, hasReturns: raw?.hasReturns === true, lines };
}

export async function fetchReturnState(apiFetch, remittanceId) {
  const res = await apiFetch(actionPath(remittanceId, 'returnState'), { method: 'POST', body: JSON.stringify({}) });
  if (!res.ok) throw await httpError(res, 'returnState');
  return normalizeReturnState(unwrap(await res.json()));
}

/**
 * Returns the given lines (all or nothing) with `returnDate` (yyyy-MM-dd, default today, never in
 * the future). The status afterwards is CP; the caller refetches the record, its lines and the state.
 *
 * @returns {Promise<{ status: string|null, returned: string[], returnPaymentId: string|null, returnPaymentDocumentNo: string|null }>}
 * @throws {Error} with `status` and `body` (messageKeys, problems) when the backend refuses
 */
export async function returnRemittanceLines(apiFetch, remittanceId, lineIds, returnDate) {
  const fieldValues = { lineIds };
  if (returnDate) fieldValues.returnDate = returnDate;
  const res = await apiFetch(actionPath(remittanceId, 'returnLines'), { method: 'POST', body: JSON.stringify({ fieldValues }) });
  if (!res.ok) throw await httpError(res, 'returnLines');
  const data = unwrap(await res.json());
  return {
    status: textOrNull(data.status),
    returned: Array.isArray(data.returned) ? data.returned : [],
    returnPaymentId: textOrNull(data.returnPaymentId),
    returnPaymentDocumentNo: textOrNull(data.returnPaymentDocumentNo),
  };
}

/**
 * «Pasar a Enviada al banco» (`markSent`): informational, PR -> SB; nothing is created or settled.
 *
 * @returns {Promise<{ status: string|null }>}
 * @throws {Error} with `status` and `body` (messageKeys) when the backend refuses
 */
export async function markRemittanceSent(apiFetch, remittanceId) {
  const res = await apiFetch(actionPath(remittanceId, 'markSent'), { method: 'POST', body: JSON.stringify({}) });
  if (!res.ok) throw await httpError(res, 'markSent');
  return { status: textOrNull(unwrap(await res.json()).status) };
}

/**
 * «Pasar a Cobrada» (`markCollected`): settles every payment at the remittance's due date and
 * the invoices become collected; the status becomes CT (collection) or PT (payment). All or nothing.
 *
 * @returns {Promise<{ status: string|null, settledOn: string|null }>}
 * @throws {Error} with `status` and `body` (messageKeys) when the backend refuses
 */
export async function markRemittanceCollected(apiFetch, remittanceId) {
  const res = await apiFetch(actionPath(remittanceId, 'markCollected'), { method: 'POST', body: JSON.stringify({}) });
  if (!res.ok) throw await httpError(res, 'markCollected');
  const data = unwrap(await res.json());
  return { status: textOrNull(data.status), settledOn: textOrNull(data.settledOn) };
}

/**
 * Every line of the remittance (invoice, partner, amount, currency) for the return picker, read
 * page by page with the shared `fetchNeoList` until a short page comes back: a single
 * `_endRow=999` request silently showed only the first 1000 lines. The window's `apiFetch` already
 * carries the base URL, so it is called with the relative path only (the helper's own `baseUrl: ''`
 * option would drop it).
 *
 * @throws {NeoListError} when a page is refused or is not a row list (failing is not empty)
 */
/** The lines grid's own order (decisions.json `window.detailSortBy`), so paging is deterministic and the dialog matches the grid. */
const LINES_SORT = 'lineNo asc';

export async function fetchRemittanceLines(apiFetch, remittanceId) {
  const rows = await fetchNeoList(`/lines?parentId=${encodeURIComponent(remittanceId)}&_sortBy=${encodeURIComponent(LINES_SORT)}`, {
    fetchFn: (url) => apiFetch(url),
  });
  return rows.filter((l) => l && !l.isGridSummary);
}

/** The per-line refusals of a 422 `ETGO_RemittanceReturnNotAllowed`: `[{ lineId, reasonCode, documentNo, message }]`. */
export function returnProblemsFromError(err) {
  const raw = err?.body?.error?.problems ?? err?.body?.problems ?? null;
  return Array.isArray(raw)
    ? raw.map((p) => ({ lineId: textOrNull(p?.lineId), reasonCode: textOrNull(p?.reasonCode), documentNo: textOrNull(p?.documentNo), message: textOrNull(p?.message) }))
    : [];
}

function uploadedAtMillis(item) {
  const time = Date.parse(item?.uploadedAt ?? item?.createdAt ?? '');
  return Number.isFinite(time) ? time : 0;
}

function isXmlAttachment(item) {
  const name = String(item?.name ?? '').toLowerCase();
  const type = String(item?.dataType ?? '').toLowerCase();
  return name.endsWith('.xml') || type.includes('xml');
}

/**
 * The newest SEPA file attached to the remittance, or null. Used only when `fileReadiness` does
 * not name it (`latestFile`): the attachments list carries no main flag, so the newest .xml wins.
 *
 * @param {Function} rootApiFetch - `useApiFetch(getApiBase())` (absolute NEO paths)
 * @param {string} remittanceId
 * @returns {Promise<{ attachmentId: string, fileName: string|null }|null>}
 */
export async function findLatestRemittanceFile(rootApiFetch, remittanceId) {
  const res = await rootApiFetch(`${ATTACHMENTS_PATH}/${REMITTANCE_TABLE}/${encodeURIComponent(remittanceId)}`);
  if (!res.ok) return null;
  const json = await readJsonSafely(res);
  const items = json?.items ?? json?.response?.data ?? json?.data ?? [];
  if (!Array.isArray(items)) return null;
  const newest = items
    .filter((item) => item?.id && isXmlAttachment(item))
    .reduce((best, item) => (best && uploadedAtMillis(best) >= uploadedAtMillis(item) ? best : item), null);
  return newest ? { attachmentId: String(newest.id), fileName: textOrNull(newest.name) } : null;
}

/**
 * Downloads an attachment through the shared attachments endpoint and saves it as a file.
 *
 * @param {Function} rootApiFetch - `useApiFetch(getApiBase())` (absolute NEO paths)
 * @param {{ attachmentId: string, fileName?: string|null }} file
 * @throws {Error} with `status` and `body` when the download is refused
 */
export async function downloadRemittanceFile(rootApiFetch, { attachmentId, fileName }) {
  const res = await rootApiFetch(`${ATTACHMENTS_PATH}/file/${encodeURIComponent(attachmentId)}`);
  if (!res.ok) throw await httpError(res, 'download');
  const blob = await res.blob();
  downloadBlobAsFile(blob, fileName || `remittance-${attachmentId}.xml`);
}

/**
 * The remittance's main SEPA file, however the caller got there: `fileReadiness` names it
 * (`latestFile`); the attachments list is only the fallback, for a backend that refuses the read on a
 * processed remittance or omits the key. Shared by «Fichero SEPA» and the grid's row menu. Resolves
 * to `{ attachmentId, fileName }` or null when there is none; it never throws.
 *
 * @param {Function} apiFetch - `useApiFetch(apiBaseUrl)` of the remittance spec
 * @param {Function} rootApiFetch - `useApiFetch(getApiBase())` (absolute NEO paths)
 */
export function resolveLatestRemittanceFile(apiFetch, rootApiFetch, remittanceId) {
  return fetchFileReadiness(apiFetch, remittanceId)
    .then((readiness) => readiness.latestFile ?? findLatestRemittanceFile(rootApiFetch, remittanceId))
    .catch(() => findLatestRemittanceFile(rootApiFetch, remittanceId).catch(() => null));
}

/** A translated message for a refused file action: `messageKeys` first, its text second, then the fallback. */
export function fileActionErrorMessage(err, ui, fallbackKey) {
  const body = err?.body ?? null;
  const text = body?.error?.message ?? body?.message ?? '';
  const translated = translateBackendError(text, ui, {
    code: body?.error?.code ?? body?.code,
    messageKeys: extractBackendMessageKeys(body),
    messageParams: extractBackendMessageParams(body),
  });
  return translated || ui(fallbackKey);
}

/** The readiness problems carried by a refused `confirm` (422 from the readiness check), if any. */
export function problemsFromError(err) {
  const body = err?.body ?? null;
  const raw = body?.error?.problems ?? body?.problems ?? body?.response?.problems ?? null;
  return Array.isArray(raw) ? raw.map(normalizeProblem) : [];
}

/**
 * One problem's sentence. The backend's `message` is already localized (request language, params
 * substituted), so it wins; the key route (`code` + positional `params`) is only the fallback for a
 * problem that arrives without text.
 */
export function readinessProblemText(problem, ui) {
  if (problem?.message) return problem.message;
  const translated = problem?.code
    ? translateBackendError('', ui, { messageKeys: [problem.code], messageParams: problem.params ?? undefined })
    : null;
  return translated || ui('remittanceFileProblemUnknown');
}

/**
 * The problems grouped the way «Antes de confirmar» lists them: the organization's, the account's,
 * then one group per business partner (in first-seen order), each keeping its lines' problems.
 *
 * @returns {{ org: object[], account: object[], partners: Array<{ businessPartnerId: string|null,
 *   businessPartnerName: string|null, problems: object[] }> }}
 */
export function groupReadinessProblems(problems = []) {
  const groups = { org: [], account: [], partners: [] };
  const byPartner = new Map();
  for (const problem of problems) {
    if (problem.scope === 'org') { groups.org.push(problem); continue; }
    if (problem.scope === 'account') { groups.account.push(problem); continue; }
    const key = problem.businessPartnerId ?? `line:${problem.lineId ?? groups.partners.length}`;
    let group = byPartner.get(key);
    if (!group) {
      group = { businessPartnerId: problem.businessPartnerId, businessPartnerName: problem.businessPartnerName, problems: [] };
      byPartner.set(key, group);
      groups.partners.push(group);
    }
    group.problems.push(problem);
  }
  return groups;
}
