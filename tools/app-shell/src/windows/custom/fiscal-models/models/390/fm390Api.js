// Modelo 390 — requests to the `/fiscal390/*` NEO endpoints (ETP-5716). Contract:
// {etendo_root}/modules/com.etendoerp.go/docs/aeat-390-endpoints.md.
//
// A plain module: it uses the core `apiFetch` (never a bare `fetch`, see docs/request-policy.md),
// with the explicit `token` the callers already hold as an override.
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { triggerDownload } from '../../fiscalModelsUtils.js';
import { ANNUAL_PERIOD } from '../../fiscalPeriods.js';

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
  const raw = await res.text().catch(() => '');
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
 * Resolves `{ ok: true }` or `{ ok: false, error, serverMessage }` (409 when already submitted).
 */
export async function generate390File(decl, { token, apiBaseUrl, fileName } = {}) {
  if (!apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const res = await apiFetch(`${neoRoot(apiBaseUrl)}/fiscal390/generate?${periodParams(decl)}`, {
      baseUrl: '', token, timeout: 0,
    });
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}`, serverMessage: await readServerMessage(res) };
    }
    const blob = await res.blob();
    triggerDownload(blob, generatedFileName(decl, fileName));
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}
