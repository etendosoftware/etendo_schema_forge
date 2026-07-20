import { useCallback, useMemo, useState } from 'react';

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
export function useBatch({ apiBaseUrl, token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The /batch endpoint lives at the NEO root, not under any spec. apiBaseUrl
  // points at the *host* spec (e.g. /sws/neo/purchase-invoice) so we strip
  // the trailing spec segment to land on /sws/neo.
  const batchUrl = useMemo(() => {
    if (!apiBaseUrl) return '/sws/neo/batch';
    return `${apiBaseUrl.replace(/\/[^/]+$/, '')}/batch`;
  }, [apiBaseUrl]);

  const runBatch = useCallback(async (operations) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
  }, [batchUrl, token]);

  return { runBatch, loading, error };
}

export default useBatch;
