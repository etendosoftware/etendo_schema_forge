import { useCallback } from 'react';
import { getApiBase } from './useNeoResource';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * What each export format is called on the wire, what its response must look like, and what
 * extension the downloaded file carries. One table so a new format cannot be half-added — the
 * server's `export=` value, the Content-Type guard and the filename all come from here.
 *
 * `contentTypeMatch` is a substring of the real header: CSV answers
 * `text/csv; charset=UTF-8` and xlsx answers the OOXML type, whose distinguishing tail is
 * `spreadsheetml.sheet`.
 */
const EXPORT_FORMATS = {
  csv: { extension: '.csv', contentTypeMatch: 'csv' },
  xlsx: { extension: '.xlsx', contentTypeMatch: 'spreadsheetml' },
};

/**
 * Builds a query string from a params object, skipping null/undefined/empty
 * values and forcing `export=<format>`.
 */
function buildExportQuery(params, format) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  search.set('export', format);
  return search.toString();
}

/**
 * The filename with the format's own extension, replacing any spreadsheet extension the caller
 * supplied. Callers pass one filename for both formats (`contacts-export.csv`) because the format
 * is chosen at click time, so handing back a `.csv` name on a workbook — which is what a naive
 * pass-through does — would give the user a file Excel refuses to open. The server applies the
 * same rule to Content-Disposition; this keeps the `<a download>` name agreeing with it.
 */
function withFormatExtension(filename, extension) {
  const base = String(filename || 'export').replace(/\.(csv|xlsx)$/i, '');
  return `${base}${extension}`;
}

/**
 * Hook exposing a generic file export trigger. It hits an existing NEO list GET
 * with `export=csv` or `export=xlsx` (+ optional `ids`/`columns`/`valueMaps`/`filename`
 * params), so the server serializes the rows the endpoint already produces and streams them as
 * a file — no client-side file building, which is what makes it scale to large
 * lists. The fetch is authenticated with the session Bearer token (a plain
 * `window.open` could not carry it).
 *
 * `baseUrl` overrides the page-derived base for one call. A window-scoped caller (ETP-4997's
 * list export) holds an `apiBaseUrl` prop that already includes the window segment —
 * `/sws/neo/contacts` — and addresses its entity relative to that, which `getApiBase()` alone
 * would resolve to the wrong URL. Callers passing a complete `/sws/neo/...` path need nothing.
 *
 * `format` picks the serialization — `'csv'` (default) or `'xlsx'`. Both are streamed by the
 * same endpoint from the same resolved table, so the column spec, `valueMaps` and `ids` params
 * are identical either way; only `export=` and the response's Content-Type differ.
 *
 * @returns {(opts: { path: string, params?: object, filename?: string, baseUrl?: string,
 *   format?: 'csv'|'xlsx' }) => Promise<void>}
 */
export function useCsvExport() {
  const apiBase = getApiBase();
  const apiFetch = useApiFetch(apiBase);

  return useCallback(
    async ({ path, params = {}, filename = 'export', baseUrl, format = 'csv' }) => {
      const spec = EXPORT_FORMATS[format];
      if (!spec) throw new Error(`unsupported export format: ${format}`);
      const query = buildExportQuery(params, format);
      const url = `${path}${path.includes('?') ? '&' : '?'}${query}`;
      const res = await apiFetch(url, baseUrl === undefined ? undefined : { baseUrl });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The backend DECLINES to export (`NeoCsvExportService.tryExport` returns false) by
      // writing its normal JSON response with a 200 — a legitimate answer for a GET that is not
      // a list. Without this check that JSON was saved verbatim under the `.csv` name and the
      // user only discovered it when the import rejected the file (ETP-4997). A missing header
      // is treated as fine, so a test double or a proxy that strips it still downloads.
      const contentType = res.headers?.get?.('Content-Type');
      if (contentType && !contentType.includes(spec.contentTypeMatch)) {
        throw new Error(`expected a ${format.toUpperCase()} response, got ${contentType}`);
      }
      const blob = await res.blob();
      triggerBlobDownload(blob, withFormatExtension(filename, spec.extension));
    },
    [apiFetch],
  );
}
