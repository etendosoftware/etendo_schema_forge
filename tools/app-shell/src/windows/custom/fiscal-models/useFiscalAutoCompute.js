import { useEffect, useRef, useState } from 'react';

/**
 * Auto-computes fiscal boxes for a list of declarations on mount, then polls
 * for data changes every pollIntervalMs and recomputes only modified ones.
 *
 * On mount, if a cached result exists in sessionStorage AND checkModifiedFn is
 * provided, the cached result is restored immediately and a checkModifiedFn call
 * then determines whether a fresh compute is needed. If checkModifiedFn is omitted,
 * the hook always recomputes on mount (cache is not consulted).
 * This prevents redundant server queries when the user navigates away and
 * back without any underlying data change.
 *
 * @param {Array} decls - Declarations to compute (should be a stable memoized array)
 * @param {object} opts
 * @param {Function} opts.computeFn - async (decl, { token, apiBaseUrl }) => result | null
 * @param {Function} opts.checkModifiedFn - async (decl, sinceMs, { token, apiBaseUrl }) => boolean
 * @param {string}   opts.token
 * @param {string}   opts.apiBaseUrl
 * @param {number}   opts.pollIntervalMs - default 180_000 (3 min)
 * @param {boolean}  opts.enabled - set false to disable all activity
 * @returns {{ computedMap: { [id]: { ...result, error, computedAt } } }}
 */

function sessionCacheKey(declId) {
  // v2: 349 compute payload gained `rectifications` (ETP-4404) — bump invalidates
  // cached v1 results that lack the field
  return `fiscal_ac_v2_${declId}`;
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.computedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, result, computedAt) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ result, computedAt }));
  } catch {
    // Quota exceeded or private browsing mode — silently skip
  }
}

async function computeOne(decl, { fn, token, apiBaseUrl, isCancelled, computedAtRef, setComputedMap, cacheKey }) {
  try {
    const result = await fn(decl, { token, apiBaseUrl });
    if (isCancelled()) return;
    if (result === null) {
      // null means the backend returned an error or non-ok response.
      // Do NOT advance computedAtRef so the next poll retries from the
      // last successful sinceMs rather than skipping this window.
      setComputedMap(m => ({
        ...m,
        [decl.id]: { boxes: null, summary: null, error: 'compute_failed', computedAt: Date.now() },
      }));
      return;
    }
    const computedAt = Date.now();
    computedAtRef.current[decl.id] = computedAt;
    if (cacheKey) writeCache(cacheKey, result, computedAt);
    setComputedMap(m => ({ ...m, [decl.id]: { ...result, error: null, computedAt } }));
  } catch (err) {
    if (!isCancelled()) {
      // Do not update computedAtRef on error — sinceMs stays at the last
      // successful compute time so any subsequent invoice change still triggers a retry.
      setComputedMap(m => ({
        ...m,
        [decl.id]: { boxes: null, summary: null, error: String(err), computedAt: Date.now() },
      }));
    }
  }
}

export default function useFiscalAutoCompute(decls, {
  computeFn,
  checkModifiedFn,
  token,
  apiBaseUrl,
  pollIntervalMs = 180_000,
  enabled = true,
} = {}) {
  const [computedMap, setComputedMap] = useState({});
  const computedAtRef = useRef({});

  // Keep latest values accessible inside intervals without deps churn
  const ctxRef = useRef({});
  ctxRef.current = { computeFn, checkModifiedFn, token, apiBaseUrl };

  // Initial compute: restore from session cache when possible, recompute only
  // when checkModifiedFn confirms data has changed since the cached result.
  useEffect(() => {
    if (!enabled || !decls.length) return;
    let cancelled = false;

    (async () => {
      const { computeFn: fn, checkModifiedFn: checkFn, token: t, apiBaseUrl: api } = ctxRef.current;
      await Promise.all(decls.map(async (decl) => {
        const key = sessionCacheKey(decl.id);
        const cached = readCache(key);

        if (cached && checkFn) {
          // Restore so the polling interval uses the real last-compute timestamp
          computedAtRef.current[decl.id] = cached.computedAt;
          try {
            const modified = await checkFn(decl, cached.computedAt, { token: t, apiBaseUrl: api });
            if (!cancelled && !modified) {
              setComputedMap(m => ({
                ...m,
                [decl.id]: { ...cached.result, error: null, computedAt: cached.computedAt },
              }));
              return;
            }
          } catch {
            // checkModifiedFn failed — fall through to full recompute
          }
        }

        if (!cancelled) {
          await computeOne(decl, {
            fn, token: t, apiBaseUrl: api,
            isCancelled: () => cancelled,
            computedAtRef, setComputedMap,
            cacheKey: key,
          });
        }
      }));
    })();

    return () => { cancelled = true; };
  }, [enabled, decls]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: check for modifications, recompute only changed declarations
  useEffect(() => {
    if (!enabled || !decls.length) return;
    let cancelled = false;

    const interval = setInterval(() => {
      decls.forEach(async (decl) => {
        try {
          const { checkModifiedFn: checkFn, computeFn: fn, token: t, apiBaseUrl: api } = ctxRef.current;
          if (!checkFn) return;
          const sinceMs = computedAtRef.current[decl.id] ?? 0;
          const modified = await checkFn(decl, sinceMs, { token: t, apiBaseUrl: api });
          if (cancelled || !modified) return;
          await computeOne(decl, {
            fn, token: t, apiBaseUrl: api,
            isCancelled: () => cancelled,
            computedAtRef, setComputedMap,
            cacheKey: sessionCacheKey(decl.id),
          });
        } catch {
          // poll errors are silent — computedAtRef stays at last success so next tick retries
        }
      });
    }, pollIntervalMs);

    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, decls, pollIntervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return { computedMap };
}
