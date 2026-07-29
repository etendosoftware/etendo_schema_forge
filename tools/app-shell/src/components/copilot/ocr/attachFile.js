/**
 * Thin client for Etendo's `AttachFile` webhook
 * (com.etendoerp.copilot.toolpack.webhooks.AttachFileWebhook).
 *
 * Wraps a `File`/`Blob` in base64 and POSTs it together with the AD_Tab_ID
 * and Record_ID so Etendo's standard AttachImplementationManager can persist
 * the document under the AD_Attachment grid for that record. Same backend the
 * paperclip menu uses, so files are visible in Etendo Classic and any other
 * UI on top of Etendo metadata.
 */

/**
 * Resolve the Etendo base URL the same way simSearch does — strip the `/web/...`
 * suffix so we hit the servlet root.
 */
function detectEtendoBase() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  // Fallback for tooling/dev where pathname does not include /web/.
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';
}

/**
 * Convert a Blob/File to a base64 string (without the `data:` prefix), so it
 * matches the FileContent format the webhook expects.
 *
 * Exported for tests so they can stub the FileReader without going through
 * a real browser API.
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      // result looks like "data:application/pdf;base64,JVBERi..." — strip the prefix.
      resolve(commaIdx === -1 ? result : result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Persist a file under a record via the AttachFile webhook. Returns the parsed
 * JSON response (which carries `{ message }` on success or `{ error }` on
 * failure). Never throws on non-2xx — we surface the failure by returning the
 * envelope so the caller can decide whether the OCR flow is salvageable.
 *
 * @param {{
 *   token: string,
 *   tabId: string,        // AD_Tab_ID of the entity's main tab
 *   recordId: string,     // id of the record the file should attach to
 *   file: File|Blob,      // browser File from <input type=file> or drop event
 *   fileName?: string,    // optional override; defaults to file.name
 * }} params
 */
export async function attachFile({ token, tabId, recordId, file, fileName } = {}) {
  if (!token || !tabId || !recordId || !file) {
    return { error: 'Missing required parameters' };
  }
  const name = fileName || file.name || 'document.pdf';
  let base64;
  try {
    base64 = await blobToBase64(file);
  } catch (e) {
    return { error: e?.message || 'failed_to_read_file' };
  }
  if (!base64) return { error: 'empty_file' };

  const url = `${detectEtendoBase()}/webhooks/?name=AttachFile`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ADTabId: tabId,
        RecordId: recordId,
        FileName: name,
        FileContent: base64,
      }),
    });
    const envelope = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: envelope?.error || `HTTP ${res.status}` };
    }
    return envelope || { error: 'empty_response' };
  } catch (e) {
    return { error: e?.message || 'fetch_failed' };
  }
}
