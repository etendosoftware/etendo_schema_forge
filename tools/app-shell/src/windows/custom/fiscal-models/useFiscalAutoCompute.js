import { useEffect, useRef, useState } from 'react';

/**
 * Auto-computes fiscal boxes for a list of declarations on mount, then polls
 * for data changes every pollIntervalMs and recomputes only modified ones.
 *
 * All function/token/apiBaseUrl arguments are captured via a ref, so the
 * polling interval is never recreated due to prop changes.
 *
 * @param {Array} decls - Declarations to compute (should be a stable memoized array)
 * @param {object} opts
 * @param {Function} opts.computeFn - async (decl, { token, apiBaseUrl }) => { boxes, summary } | null
 * @param {Function} opts.checkModifiedFn - async (decl, sinceMs, { token, apiBaseUrl }) => boolean
 * @param {string}   opts.token
 * @param {string}   opts.apiBaseUrl
 * @param {number}   opts.pollIntervalMs - default 180_000 (3 min)
 * @param {boolean}  opts.enabled - set false to disable all activity (e.g. in demo mode)
 * @returns {{ computedMap: { [id]: { boxes, summary, error, computedAt } } }}
 */
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

  // Initial compute: run in parallel for all decls on mount / when decls changes
  useEffect(() => {
    if (!enabled || !decls.length) return;
    let cancelled = false;

    (async () => {
      await Promise.all(decls.map(async (decl) => {
        const { computeFn: fn, token: t, apiBaseUrl: api } = ctxRef.current;
        try {
          const result = await fn(decl, { token: t, apiBaseUrl: api });
          if (cancelled) return;
          const computedAt = Date.now();
          computedAtRef.current[decl.id] = computedAt;
          setComputedMap(m => ({
            ...m,
            [decl.id]: result
              ? { ...result, error: null, computedAt }
              : { boxes: null, summary: null, error: null, computedAt },
          }));
        } catch (err) {
          if (!cancelled) {
            const computedAt = Date.now();
            computedAtRef.current[decl.id] = computedAt;
            setComputedMap(m => ({
              ...m,
              [decl.id]: { boxes: null, summary: null, error: String(err), computedAt },
            }));
          }
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
        const { checkModifiedFn: checkFn, computeFn: fn, token: t, apiBaseUrl: api } = ctxRef.current;
        if (!checkFn) return;
        const sinceMs = computedAtRef.current[decl.id] ?? 0;
        try {
          const modified = await checkFn(decl, sinceMs, { token: t, apiBaseUrl: api });
          if (cancelled || !modified) return;
          const result = await fn(decl, { token: t, apiBaseUrl: api });
          if (cancelled) return;
          const computedAt = Date.now();
          computedAtRef.current[decl.id] = computedAt;
          setComputedMap(m => ({
            ...m,
            [decl.id]: result
              ? { ...result, error: null, computedAt }
              : { boxes: null, summary: null, error: null, computedAt },
          }));
        } catch (err) {
          if (!cancelled) {
            const computedAt = Date.now();
            computedAtRef.current[decl.id] = computedAt;
            setComputedMap(m => ({
              ...m,
              [decl.id]: { boxes: null, summary: null, error: String(err), computedAt },
            }));
          }
        }
      });
    }, pollIntervalMs);

    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, decls, pollIntervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return { computedMap };
}
