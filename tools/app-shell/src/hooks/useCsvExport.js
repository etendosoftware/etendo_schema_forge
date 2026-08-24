import { useCallback } from 'react';
import { getApiBase } from './useNeoResource';
import { readCredentialHeaders } from '../lib/sessionHeaders.js';

/**
 * Triggers a browser download for a Blob using a transient <a download>.
 */
function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Builds a query string from a params object, skipping null/undefined/empty
 * values and always forcing `export=csv`.
 */
function buildExportQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  search.set('export', 'csv');
  return search.toString();
}

/**
 * Hook exposing a generic CSV export trigger. It hits an existing NEO list GET
 * with `export=csv` (+ optional `ids`/`columns`/`filename` params), so the
 * server serializes the rows the endpoint already produces and streams them as
 * a file — no client-side CSV building, which is what makes it scale to large
 * lists. The fetch is authenticated with the `__Host-` session cookie, which is
 * why it opts into `credentials` rather than being a plain `window.open`: the
 * response has to be read as a blob and downloaded from script.
 *
 * @returns {(opts: { path: string, params?: object, filename?: string }) => Promise<void>}
 */
export function useCsvExport() {
  return useCallback(
    async ({ path, params = {}, filename = 'export' }) => {
      const apiBase = getApiBase();
      const query = buildExportQuery(params);
      const url = `${apiBase}${path}${path.includes('?') ? '&' : '?'}${query}`;
      // ETP-4576 — this carried `credentials: 'include'` and NO headers, so it
      // authenticated only by accident: the cookie travels on its own, but under
      // the bearer scheme nothing identified the caller and the export 401'd.
      // readCredentialHeaders() sends whichever credential the active scheme holds
      // and deliberately omits Content-Type — a bodyless GET that declares
      // application/json is not CORS-safelisted and forces a preflight.
      const res = await fetch(url, {
        credentials: 'include',
        headers: readCredentialHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const safeName = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
      triggerBlobDownload(blob, safeName);
    },
    [],
  );
}
