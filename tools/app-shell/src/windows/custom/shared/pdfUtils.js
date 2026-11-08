import { useState, useEffect, useRef } from 'react';
import { buildLocationAddressLines } from '@/lib/locationAddress.js';
import {
  isAttachmentStale,
  isCachedRenderingStale,
  isRenderedByOlderBundle,
  RENDERER_BUILD_EPOCH_MS,
  toInstantMs,
} from '@/lib/attachmentFreshness.js';
import {
  fetchMainAttachment,
  fetchAttachmentBlob,
  fetchBrandingUpdated,
} from '@/components/copilot/ocr/listAttachments';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { COMMON_HANDLEBARS_HELPERS, JSREPORT_CHROME_A4 } from './printableSources.js';
// ---------------------------------------------------------------------------
// Shared PDF CSS, movement templates and return-doc helpers — defined in printableSources.js
// (ETP-6013): the build publishes them for the server-side render, so they live in an
// alias-free module. Re-exported here unchanged.
// ---------------------------------------------------------------------------
export {
  COMMON_PDF_CSS, RETURN_DOC_HELPERS,
  MOVEMENT_TEMPLATE_OPEN, MOVEMENT_TEMPLATE_HEADER, MOVEMENT_TEMPLATE_PARTIES,
  MOVEMENT_TEMPLATE_SIGNATURE, MOVEMENT_TEMPLATE_NOTES, MOVEMENT_TEMPLATE_FOOTER,
} from './printableSources.js';

// ---------------------------------------------------------------------------
// Shared Handlebars helpers (date + conditional — no fmt, which differs per doc).
// Defined in printableSources.js (ETP-6013): the build publishes it for the server-side
// render, so it must live in an alias-free module. Re-exported here unchanged.
// ---------------------------------------------------------------------------
export { COMMON_HANDLEBARS_HELPERS };


// ---------------------------------------------------------------------------
// Shared fetch helpers
// ---------------------------------------------------------------------------
export async function fetchJson(url, token) {
  const res = await apiFetch(url, { baseUrl: '', token });
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  const d = await res.json();
  return d?.response?.data?.[0] ?? d?.response?.data ?? d;
}

export async function fetchAll(url, token) {
  const res = await apiFetch(url, { baseUrl: '', token });
  if (!res.ok) return [];
  const d = await res.json();
  return d?.response?.data ?? (Array.isArray(d) ? d : []);
}

export async function fetchOptionalJson(url, token) {
  try { return await fetchJson(url, token); } catch { return null; }
}

export async function fetchExchangeRate(fromCurrencyId, toCurrencyId, date, base, token) {
  if (!fromCurrencyId || !toCurrencyId || !date) return null;
  if (fromCurrencyId === toCurrencyId) return null;
  return fetchOptionalJson(
    `${base}/validate-exchange-rate?fromCurrency=${encodeURIComponent(fromCurrencyId)}&toCurrency=${encodeURIComponent(toCurrencyId)}&date=${encodeURIComponent(date)}`,
    token,
  );
}

export async function fetchLocationAddress(locationId, base, token) {
  if (!locationId) return null;
  try {
    return await fetchJson(`${base}/contacts/locationAddress/${locationId}`, token);
  } catch { return null; }
}

export { buildLocationAddressLines };

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read company logo'));
    reader.readAsDataURL(blob);
  });
}

export async function fetchImageDataUrl(imageId, base, token) {
  if (!imageId) return null;
  try {
    const res = await apiFetch(`${base}/image/${imageId}`, { baseUrl: '', token });
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch { return null; }
}

export function downloadBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Shared jsreport renderer (A4, chrome-pdf, handlebars)
// ---------------------------------------------------------------------------
/**
 * Same template, same helpers, same data as `renderPdf` — but asks jsreport for the
 * compiled HTML instead of a PDF (`recipe: 'html'`).
 *
 * Needed by the list view's multi-document print: that flow concatenates one document's
 * markup after another with page breaks and sends the whole thing to chrome-pdf once, so
 * it needs HTML per document, not a PDF per document. Handlebars compilation stays on
 * jsreport's side, so the browser bundle does not grow a template engine.
 *
 * @returns {Promise<string>} the rendered HTML
 */
export async function renderHtml(content, css, helpers, data) {
  const res = await apiFetch('/jsreport/api/report', {
    method: 'POST',
    baseUrl: '',
    body: JSON.stringify({
      template: { content, engine: 'handlebars', recipe: 'html', helpers },
      data: { css, ...data },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`jsreport ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.text();
}

export async function renderPdf(content, css, helpers, data) {
  const payload = {
    template: {
      content,
      engine: 'handlebars',
      recipe: 'chrome-pdf',
      helpers,
      // The same object the published manifest carries (ETP-6013) — see printableSources.js.
      chrome: { ...JSREPORT_CHROME_A4 },
    },
    data: { css, ...data },
  };

  const res = await apiFetch('/jsreport/api/report', {
    method: 'POST',
    baseUrl: '',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`jsreport ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.blob();
}


// ---------------------------------------------------------------------------
// Generic PDF hook — shared by all per-window pdf hooks
// ---------------------------------------------------------------------------
/**
 * Which of the three causes made the cached rendering stale, for the `[pdf]` console
 * line. Diagnosing a stale document from the console instead of by reading code is a
 * documented requirement (`docs/document-printables.md`, criterion 5), and the
 * causes read very differently in practice: an edit invalidating one document is
 * routine, whereas a whole deploy's worth of bundle-invalidations — or a logo change's
 * (ETP-5541) — is expected exactly once per document, and none of them should be
 * mistaken for a cache that never converges.
 */
function staleReason(attachment, recordUpdated, brandingUpdated) {
  const writtenAt = attachment.updatedAt || attachment.uploadedAt;
  if (isAttachmentStale(attachment, recordUpdated)) {
    return `written ${writtenAt}, record updated ${recordUpdated}`;
  }
  if (isRenderedByOlderBundle(attachment)) {
    return `written ${writtenAt}, before this bundle built at ${new Date(RENDERER_BUILD_EPOCH_MS).toISOString()}`;
  }
  return `written ${writtenAt}, company branding updated ${brandingUpdated}`;
}

/**
 * The cached rendering of this record, or null when there is none or it no longer
 * matches the record (ETP-4787), the renderer that produced it (ETP-5125) or the
 * company branding it printed (ETP-5541) — see `lib/attachmentFreshness.js`. Returning
 * null on staleness is all the invalidation the read side needs: the caller's next step
 * is already "render fresh".
 *
 * The session's `brandingUpdated` is fetched in parallel with the attachment metadata,
 * and only for a window that passes `recordUpdated` — an opted-out window can never be
 * invalidated, so asking would be a wasted round trip.
 */
async function fetchCachedBlob({ token, tableName, recordId, apiBaseUrl, recordUpdated, isCancelled }) {
  const [main, brandingUpdated] = await Promise.all([
    fetchMainAttachment({ token, tableName, recordId, apiBaseUrl }),
    toInstantMs(recordUpdated) == null ? null : fetchBrandingUpdated({ token, apiBaseUrl }),
  ]);
  if (isCancelled() || !main?.id) return null;
  if (isCachedRenderingStale(main, recordUpdated, RENDERER_BUILD_EPOCH_MS, brandingUpdated)) {
    console.info(
      `[pdf] ${tableName}/${recordId}: cached attachment is stale `
      + `(${staleReason(main, recordUpdated, brandingUpdated)}) — re-rendering`,
    );
    return null;
  }
  return fetchAttachmentBlob({ token, attachmentId: main.id, apiBaseUrl });
}

/**
 * @param {Object} [cacheConfig] - ETP-4315 follow-up (2026-08-18): when a marked
 *   Attachment already exists for (tableName, recordId), it is served directly
 *   instead of re-rendering via jsreport on every open. Every window's own
 *   `useXxxPdf` hook gets this for free by passing the same
 *   `{ tableName, storeCondition }` shape it already builds for
 *   `attachmentConfig` — no per-window gating logic needed.
 *   - cacheConfig.tableName: AD_Table.name, e.g. 'C_Order' (must match attachmentConfig.tableName)
 *   - cacheConfig.storeCondition: false (e.g. Draft) → always render live, same as omitting cacheConfig
 */
export function usePdfGenerator(recordId, apiBaseUrl, token, buildBlobFn, cacheConfig = null) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const prevUrlRef = useRef(null);
  const buildRef = useRef(buildBlobFn);
  buildRef.current = buildBlobFn;

  const cacheTableName = cacheConfig?.tableName ?? null;
  const cacheStoreCondition = !!cacheConfig?.storeCondition;
  // ETP-4787 — the record's own `updated`, so a cached PDF older than the last edit is
  // ignored. Absent (window not passing it, or a backend without the `updated`
  // exemption) means "cache as before", never "cache off".
  const cacheRecordUpdated = cacheConfig?.recordUpdated ?? null;

  useEffect(() => {
    if (!recordId || !apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setPdfBlob(null);

    (async () => {
      try {
        let blob = null;
        if (cacheStoreCondition && cacheTableName) {
          blob = await fetchCachedBlob({
            token, tableName: cacheTableName, recordId, apiBaseUrl,
            recordUpdated: cacheRecordUpdated,
            isCancelled: () => cancelled,
          });
          if (cancelled) return;
        }
        // Which of the two paths produced this PDF is invisible from the outside —
        // both end up as the same pdfUrl — yet it is the difference between a render
        // that cost a jsreport round-trip and one that did not. Staleness logs its own
        // line inside fetchCachedBlob, so the three cases stay distinguishable.
        if (blob) {
          console.info(`[pdf] ${cacheTableName}/${recordId}: served from cached attachment (no re-render)`);
        } else {
          console.info(`[pdf] ${cacheTableName ?? 'no-cache'}/${recordId}: rendering fresh${cacheStoreCondition ? ' (cache miss)' : ' (cache disabled)'}`);
        }
        if (!blob) {
          blob = await buildRef.current(recordId, base, token);
          if (cancelled) return;
        }
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
        setPdfBlob(blob);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setPdfBlob(null);
      // Clear url/loading too, not just the blob, so a later reopen starts from a clean slate.
      setPdfUrl(null);
      setError(null);
      setLoading(false);
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [recordId, apiBaseUrl, token, cacheTableName, cacheStoreCondition, cacheRecordUpdated]);

  return { pdfUrl, pdfBlob, loading, error };
}

export function buildReturnDocCommonFields(header, companyLogoDataUrl) {
  const org = header.issuerOrg ?? {};
  return {
    companyName: org.name || header['organization$_identifier'] || 'Empresa',
    companyAddress1: org.address1 || null,
    companyAddress2: org.address2 || null,
    companyCityLine: org.cityLine || null,
    companyTaxId: org.taxId || null,
    companyLogoDataUrl,
    documentNo: header.documentNo || '',
    movementDate: header.movementDate || '',
  };
}

export function sortLinesByLineNo(lines) {
  return [...lines].sort(
    (a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0),
  );
}
