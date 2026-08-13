/**
 * Thin client for `/sws/neo/preview-file` (NeoPreviewFileService).
 *
 * The endpoint keeps **one file per (client, specName, recordId)** with upsert
 * semantics — a document slot, not a list. Two things use that slot:
 *
 *   - a cache of a PDF *we* generated (sales invoice, order, quotation)
 *   - the document the user provided (purchase invoice), where nothing else
 *     competes for the slot because those windows have no generated report
 *
 * Extracted from usePreviewAttachment so the OCR flow can fill the slot
 * imperatively after its batch commits, without duplicating the encoding and
 * URL rules (ETP-4855).
 */

/** `apiBaseUrl` is a spec URL (…/sws/neo/purchase-invoice); the endpoint sits one level up. */
function neoBaseOf(apiBaseUrl) {
  return apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '') : null;
}

function slotQuery({ specName, recordId }) {
  return `specName=${encodeURIComponent(specName)}&recordId=${encodeURIComponent(recordId)}`;
}

export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Read the slot. Returns `{ fileName, mimeType, fileData }` (base64) or null —
 * an empty slot is the normal case, not an error.
 */
export async function fetchPreviewFile({ token, apiBaseUrl, specName, recordId } = {}) {
  const neoBase = neoBaseOf(apiBaseUrl);
  if (!token || !neoBase || !specName || !recordId) return null;
  try {
    const res = await fetch(`${neoBase}/preview-file?${slotQuery({ specName, recordId })}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.fileData ? json : null;
  } catch {
    return null;
  }
}

/**
 * Upsert the slot. Returns `{ ok, error? }` — never throws, so callers on a
 * best-effort path (the OCR flow) can ignore the result without a try/catch.
 */
export async function storePreviewFile({ token, apiBaseUrl, specName, recordId, file, fileName, mimeType } = {}) {
  const neoBase = neoBaseOf(apiBaseUrl);
  if (!token || !neoBase || !specName || !recordId || !file) {
    return { ok: false, error: 'missing_params' };
  }
  try {
    const name = fileName || file.name || 'document.pdf';
    const type = mimeType || file.type || 'application/pdf';
    const fileData = await blobToBase64(file);
    if (!fileData) return { ok: false, error: 'empty_file' };
    const res = await fetch(`${neoBase}/preview-file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ specName, recordId, fileName: name, mimeType: type, fileData }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'store_failed' };
  }
}

/** Empty the slot. Never throws. */
export async function deletePreviewFile({ token, apiBaseUrl, specName, recordId } = {}) {
  const neoBase = neoBaseOf(apiBaseUrl);
  if (!token || !neoBase || !specName || !recordId) return { ok: false, error: 'missing_params' };
  try {
    const res = await fetch(`${neoBase}/preview-file?${slotQuery({ specName, recordId })}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err?.message || 'delete_failed' };
  }
}

/** Decode a slot payload into a Blob the viewer can render. */
export function previewFileToBlob(payload) {
  if (!payload?.fileData) return null;
  const bytes = Uint8Array.from(atob(payload.fileData), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: payload.mimeType });
}
