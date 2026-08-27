import { authHeaders, buildHeaders } from '@/auth/api.js';
/**
 * Thin client for the NEO Headless attachments endpoints
 * (com.etendoerp.go NeoBuiltInEndpointHandler /sws/neo/attachments/*).
 *
 * Splits the two-step access pattern: `listAttachments` returns lightweight
 * metadata rows, `fetchAttachmentBlobUrl` downloads a single file as a blob URL
 * the caller can hand to <iframe>/<embed>/react-pdf. Working with blobs avoids
 * the base64 round-trip that the legacy ListAttachments webhook required.
 */

function detectAttachmentsBase(apiBaseUrl) {
  // apiBaseUrl may be the full spec URL (e.g. http://host/sws/neo/sales-order).
  // Strip the spec-specific segment so we get the root proxy base.
  if (apiBaseUrl) return apiBaseUrl.split('/sws/neo/')[0];
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';
}

/**
 * Fetch the attachments tied to (tableName, recordId). Returns an array of
 * `{ id, name, ... }` rows (metadata only — no file bytes). Never throws —
 * returns [] on any error so the UI can stay simple.
 *
 * @param {{ token: string, tableName: string, recordId: string, apiBaseUrl?: string }} params
 */
export async function listAttachments({ token, tableName, recordId, apiBaseUrl } = {}) {
  if (!token || !tableName || !recordId) return [];
  const base = detectAttachmentsBase(apiBaseUrl);
  const url = `${base}/sws/neo/attachments/${tableName}/${recordId}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(token),
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const data = json?.items ?? json?.response?.data ?? json?.data ?? json;
    return Array.isArray(data) ? data.filter((row) => row && row.id) : [];
  } catch {
    return [];
  }
}

/**
 * Attach a file to (tableName, recordId).
 *
 * Writes to the very same endpoint `listAttachments` reads and that backs the
 * document's Attachments tab (`useAttachments`), so a file attached from the
 * side panel shows up there with no synchronisation step at all — ETP-4855
 * Error 3. Never throws: returns `{ ok }` plus a message the caller can render.
 *
 * @param {{ token: string, tableName: string, recordId: string, file: File|Blob,
 *           fileName?: string, apiBaseUrl?: string }} params
 *   `fileName` is required when `file` is a bare Blob — a Blob carries no name and
 *   the server would store it as "blob".
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function uploadAttachment({ token, tableName, recordId, file, fileName, apiBaseUrl } = {}) {
  if (!token || !tableName || !recordId || !file) return { ok: false, error: 'missing_params' };
  const base = detectAttachmentsBase(apiBaseUrl);
  const form = new FormData();
  const name = fileName || file.name;
  if (name) form.append('file', file, name);
  else form.append('file', file);
  try {
    const res = await fetch(`${base}/sws/neo/attachments/${tableName}/${recordId}`, {
      method: 'POST',
      credentials: 'include',
      // No Content-Type header — the browser must set the multipart boundary.
      headers: authHeaders(token),
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'upload_failed' };
  }
}

/**
 * Delete a single attachment. Never throws — returns `{ ok }` like its siblings.
 *
 * @param {{ token: string, attachmentId: string, apiBaseUrl?: string }} params
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deleteAttachment({ token, attachmentId, apiBaseUrl } = {}) {
  if (!token || !attachmentId) return { ok: false, error: 'missing_params' };
  const base = detectAttachmentsBase(apiBaseUrl);
  try {
    const res = await fetch(`${base}/sws/neo/attachments/file/${attachmentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders(token),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'delete_failed' };
  }
}

/**
 * Downloads a single attachment as a raw Blob. Returns null on any failure
 * so callers can short-circuit gracefully.
 *
 * @param {{ token: string, attachmentId: string, apiBaseUrl?: string }} params
 */
export async function fetchAttachmentBlob({ token, attachmentId, apiBaseUrl } = {}) {
  if (!token || !attachmentId) return null;
  const base = detectAttachmentsBase(apiBaseUrl);
  const url = `${base}/sws/neo/attachments/file/${attachmentId}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Download a single attachment as a Blob URL. Caller is responsible for
 * `URL.revokeObjectURL` when the document unmounts to avoid leaking memory.
 * Returns null on any failure so callers can short-circuit gracefully.
 *
 * @param {{ token: string, attachmentId: string, apiBaseUrl?: string }} params
 */
export async function fetchAttachmentBlobUrl({ token, attachmentId, apiBaseUrl } = {}) {
  const blob = await fetchAttachmentBlob({ token, attachmentId, apiBaseUrl });
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * Looks up the attachment currently marked as (tableName, recordId)'s "main"
 * document — the single file the sidebar/tab and preview must always agree
 * on. Returns `{ id, name, ... }` metadata, or `null` if none is marked or on
 * any failure.
 *
 * @param {{ token: string, tableName: string, recordId: string, apiBaseUrl?: string }} params
 */
export async function fetchMainAttachment({ token, tableName, recordId, apiBaseUrl } = {}) {
  if (!token || !tableName || !recordId) return null;
  const base = detectAttachmentsBase(apiBaseUrl);
  const url = `${base}/sws/neo/attachments/${tableName}/${recordId}/main`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json && json.id ? json : null;
  } catch {
    return null;
  }
}

/**
 * Uploads a file and marks it as (tableName, recordId)'s "main" document in
 * the same request — the previously-marked attachment, if any, is deleted
 * server-side as part of the same transaction. Returns the created
 * attachment's metadata, or `null` on failure.
 *
 * @param {{ token: string, tableName: string, recordId: string, file: File|Blob,
 *   fileName?: string, apiBaseUrl?: string }} params
 */
export async function uploadAndMarkMainAttachment({
  token, tableName, recordId, file, fileName, apiBaseUrl,
} = {}) {
  if (!token || !tableName || !recordId || !file) return null;
  const base = detectAttachmentsBase(apiBaseUrl);
  const url = `${base}/sws/neo/attachments/${tableName}/${recordId}?markAsMain=true`;
  const form = new FormData();
  form.append('file', file, fileName || file.name || 'document');
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(token),
      body: form,
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.response?.data ?? json?.data ?? json;
  } catch {
    return null;
  }
}

/**
 * Marks or unmarks an existing attachment as its record's "main" document.
 * Marking (`isMain: true`) deletes the previously-marked attachment for the
 * same record server-side, in the same transaction.
 *
 * @param {{ token: string, attachmentId: string, isMain: boolean, apiBaseUrl?: string }} params
 */
export async function markAttachmentAsMain({ token, attachmentId, isMain, apiBaseUrl } = {}) {
  if (!token || !attachmentId) return false;
  const base = detectAttachmentsBase(apiBaseUrl);
  const url = `${base}/sws/neo/attachments/file/${attachmentId}/main`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: buildHeaders(token),
      body: JSON.stringify({ isMain }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

