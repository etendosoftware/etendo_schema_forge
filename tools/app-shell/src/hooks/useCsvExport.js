import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

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
 * lists. The fetch is authenticated with the session Bearer token (a plain
 * `window.open` could not carry it).
 *
 * @returns {(opts: { path: string, params?: object, filename?: string }) => Promise<void>}
 */
export function useCsvExport() {
  const { token } = useAuth();

  return useCallback(
    async ({ path, params = {}, filename = 'export' }) => {
      const apiBase = getApiBase();
      const query = buildExportQuery(params);
      const url = `${apiBase}${path}${path.includes('?') ? '&' : '?'}${query}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const safeName = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
      triggerBlobDownload(blob, safeName);
    },
    [token],
  );
}
