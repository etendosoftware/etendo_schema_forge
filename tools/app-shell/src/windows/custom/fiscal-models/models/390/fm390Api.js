// Modelo 390 — requests to the `/fiscal390/*` NEO endpoints (ETP-5716). Contract:
// {etendo_root}/modules/com.etendoerp.go/docs/aeat-390-endpoints.md.
//
// A plain module: it uses the core `apiFetch` (never a bare `fetch`, see docs/request-policy.md),
// with the explicit `token` the callers already hold as an override.
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { incidentsFromRows, triggerDownload } from '../../fiscalModelsUtils.js';
import { ANNUAL_PERIOD } from '../../fiscalPeriods.js';

/** `error.code` of the 409 `generate` / `submit` answer while a blocking rule holds. */
export const BLOCKING_INCIDENTS_390 = 'BLOCKING_INCIDENTS';

/** `/sws/neo/<entity>` → `/sws/neo` (the fiscal routes hang off the NEO base). */
function neoRoot(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]+$/, '');
}

function periodParams(decl) {
  return new URLSearchParams({ year: String(decl.year), period: decl.period || ANNUAL_PERIOD });
}

// The error message of a failed request: `{ error: { message } }` or `{ message }`, with a Java
// exception prefix and Openbravo `@Key@` delimiters stripped (same rule as the 303/349 helpers).
export async function readServerMessage(res) {
  return messageOf(await res.text().catch(() => ''));
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function messageOf(raw) {
  try {
    const parsed = JSON.parse(raw);
    const full = parsed?.error?.message || parsed?.message || '';
    const exIdx = full.indexOf('Exception: ');
    let cleaned = (exIdx >= 0 ? full.slice(exIdx + 11) : full).trim();
    if (cleaned.startsWith('@') && cleaned.endsWith('@')) cleaned = cleaned.slice(1, -1);
    return cleaned || undefined;
  } catch (_) {
    return raw && raw.length < 500 ? raw.trim() || undefined : undefined;
  }
}

/**
 * `GET /fiscal390/boxes` — the boxes payload `{ boxes, summary, mode, taxReport, inputs, warnings }`.
 * `inputs` (optional) are sent as query parameters: the backend overrides the stored
 * `manualData.aeatInputs` with them, so an unsaved edit is computed too. A submitted declaration
 * is answered from its frozen snapshot. Throws on a failed request (message in `error.message`).
 */
export async function fetchBoxes390(decl, { token, apiBaseUrl, inputs } = {}) {
  if (!apiBaseUrl) throw new Error('missing credentials');
  const params = periodParams(decl);
  for (const [k, v] of Object.entries(inputs ?? {})) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/boxes?${params}`, { baseUrl: '', token, timeout: 0 });
  if (!res.ok) {
    const message = await readServerMessage(res);
    const err = new Error(message || `boxes fetch failed: ${res.status}`);
    err.status = res.status;
    err.serverMessage = message;
    throw err;
  }
  return res.json();
}

/**
 * `GET /fiscal390/modified` — true when an invoice of the exercise changed after `sinceMs`. False
 * on any error (the list's draft polling treats "unknown" as "unchanged").
 */
export async function checkModified390(decl, sinceMs, { token, apiBaseUrl } = {}) {
  if (!apiBaseUrl) return false;
  try {
    const params = periodParams(decl);
    params.set('since', String(sinceMs));
    const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/modified?${params}`, { baseUrl: '', token });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.modified === true;
  } catch (_) {
    return false;
  }
}

/** Download name of the file: the backend's own (`390_0A_<year>.txt`) unless the user typed one. */
export function generatedFileName(decl, typed) {
  const name = String(typed ?? '').trim();
  if (!name) return `390_${decl.period || ANNUAL_PERIOD}_${decl.year}.txt`;
  return /\.txt$/i.test(name) ? name : `${name}.txt`;
}

/**
 * `GET /fiscal390/generate` — downloads the AEAT TXT file. The inputs are read by the backend
 * from the STORED `manualData.aeatInputs`, so the caller saves pending changes first. The body is
 * ISO-8859-1: it is read as a Blob (never as text) so no byte is re-encoded.
 * Resolves `{ ok: true }`, `{ ok: false, error: 'blocking_incidents', incidents }` (409 — the
 * backend re-evaluates the blocking rules from the stored inputs, ETP-5716) or
 * `{ ok: false, error, serverMessage }` (409 when already submitted).
 */
export async function generate390File(decl, { token, apiBaseUrl, fileName } = {}) {
  if (!apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/generate?${periodParams(decl)}`, {
      baseUrl: '', token, timeout: 0,
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      const error = parseJson(raw)?.error;
      if (res.status === 409 && error?.code === BLOCKING_INCIDENTS_390) {
        return { ok: false, error: 'blocking_incidents', incidents: incidentsFromRows(error.incidents) };
      }
      return { ok: false, error: `http_${res.status}`, serverMessage: messageOf(raw) };
    }
    const blob = await res.blob();
    triggerDownload(blob, generatedFileName(decl, fileName));
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

/**
 * `GET /fiscal390/sources` — the Facturas tab: `{ rows, count, page, pageSize, totals, boxes,
 * taxes, submitted }`. `params` are the filter/page query parameters (`sourcesQueryParams` of
 * sources390.js). No timeout: the backend runs the whole box computation to list the lines.
 * Throws on a failed request (message in `error.message`).
 */
export async function fetchSources390(decl, { token, apiBaseUrl, params } = {}) {
  if (!apiBaseUrl) throw new Error('missing credentials');
  const query = periodParams(decl);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v != null && v !== '') query.set(k, String(v));
  }
  const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/sources?${query}`, { baseUrl: '', token, timeout: 0 });
  if (!res.ok) {
    const message = await readServerMessage(res);
    const err = new Error(message || `sources fetch failed: ${res.status}`);
    err.status = res.status;
    err.serverMessage = message;
    throw err;
  }
  return res.json();
}

/**
 * `GET /fiscal390/preload` — the year's Modelo 303 declarations and the 390 inputs they preload:
 * `{ year, periodicity, monthlyReturn, declarations: [...], missingPeriods, lastPeriod, inputs,
 * totals, territory, carryOverKnown, expectedResult, tolerance, warnings }` (preload390.js).
 * `monthlyReturn` (the on-screen ISMONTHLYRETURN) decides where refunds go; omitted, the backend
 * reads the stored one. No timeout: a draft 303 is computed live, up to 12 of them.
 * Throws on a failed request (message in `error.message`).
 */
export async function fetchPreload390(decl, { token, apiBaseUrl, monthlyReturn } = {}) {
  if (!apiBaseUrl) throw new Error('missing credentials');
  const params = periodParams(decl);
  if (monthlyReturn != null) params.set('monthlyReturn', monthlyReturn ? 'Y' : 'N');
  const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/preload?${params}`, { baseUrl: '', token, timeout: 0 });
  if (!res.ok) {
    const message = await readServerMessage(res);
    const err = new Error(message || `preload fetch failed: ${res.status}`);
    err.status = res.status;
    err.serverMessage = message;
    throw err;
  }
  return res.json();
}

/**
 * `POST /fiscal390/validate` — the backend recomputes the declaration's rule incidents from its
 * STORED inputs (save first) and answers every incident of the declaration (rule + AEAT ones), as
 * `{ blocking, warning, items }` (incidentsFromRows). A submitted declaration is not recomputed
 * (`frozen`). Resolves `null` on any failure: the caller keeps what it has.
 */
export async function validate390(decl, { token, apiBaseUrl } = {}) {
  if (!apiBaseUrl || !decl?.id) return null;
  try {
    const params = periodParams(decl);
    params.set('id', decl.id);
    const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/validate?${params}`, {
      method: 'POST', baseUrl: '', token, timeout: 0,
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body ? { ...incidentsFromRows(body.data), frozen: body.frozen === true } : null;
  } catch (_) {
    return null;
  }
}
