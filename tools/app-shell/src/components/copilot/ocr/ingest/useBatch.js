import { useCallback, useMemo, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { getNeoBaseUrl } from '@/lib/neoBaseUrl.js';
/**
 * Drives the generic transactional batch endpoint.
 *
 *   POST /sws/neo/batch
 *     body: { operations: [{ id, spec, entity, body, parentRef? }, ...] }
 *
 * Returns one of:
 *   { committed: true, operations: [{ id, recordId, ok: true }, ...] }
 *   { committed: false, failedAt: { id, index }, error: { status, message, detail } }
 *
 * Find-or-create logic lives in the caller (typically a per-window descriptor).
 * This hook does no orchestration beyond POST + JSON parsing — the same shape
 * an MCP agent would use when calling a `neo_batch` tool.
 */
export function useBatch({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const apiFetch = useApiFetch('');

  // The /batch endpoint lives at the NEO root, not under any spec, so it is asked for directly
  // rather than derived from the caller's own base URL.
  //
  // ETP-5371 — this used to strip the last segment off the host spec's URL
  // (`/etendo/sws/neo/product` → `/etendo/sws/neo`), which silently carried the assumption that
  // every caller passes a spec URL. `FirstStepsImportButton` passed the deployment prefix
  // (`/etendo`), so the chop produced `''` and the POST went to `/batch` — a URL outside the
  // backend entirely, which CloudFront rejected with a 403 that read like an infrastructure
  // outage. The derivation could not tell a right answer from a wrong one because both are
  // strings, so it no longer derives: the NEO root has one owner now.
  const batchUrl = useMemo(() => `${getNeoBaseUrl()}/batch`, []);

  const runBatch = useCallback(async (operations) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(batchUrl, {
        baseUrl: '',
        method: 'POST',
        body: JSON.stringify({ operations }),
      });
      const text = await res.text().catch(() => '');
      let json = null;
      if (text) {
        try { json = JSON.parse(text); } catch { /* leave null */ }
      }
      if (!res.ok && !json) {
        // A non-ok response whose body isn't even valid JSON is a genuinely uncontrolled
        // failure (a raw Tomcat/servlet-container error page, an unhandled exception's
        // stack trace as plain text) — as opposed to BatchService.java's own graceful
        // `{ committed: false, ... }` JSON failure, which is returned above, not thrown.
        // The raw text is the only diagnostic available for this case; preserving it as
        // `.raw` lets the import UI show it instead of just a bare "Batch failed (500)".
        const err = new Error(`Batch failed (${res.status})`);
        err.raw = text;
        throw err;
      }
      return json;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [batchUrl, apiFetch]);

  return { runBatch, loading, error };
}

export default useBatch;
