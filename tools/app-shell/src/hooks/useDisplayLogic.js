import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Module-level "last known good" cache for the subset of evaluate-display keys a caller
 * has declared safe to reuse across different records (see `cacheableKeys` below) — keyed
 * by `${apiBaseUrl}/${entity}`, so it never crosses window or header/lines boundaries.
 * Deliberately NOT persisted anywhere durable (sessionStorage, etc.): it exists only to
 * seed the very first render of a freshly-mounted hook instance, and lives as long as the
 * SPA session does (cleared naturally on a full page reload).
 */
const lastKnownCache = new Map();

function readCache(cacheKey) {
  const cached = cacheKey ? lastKnownCache.get(cacheKey) : null;
  return cached
    ? { readOnly: { ...cached.readOnly }, visibility: { ...cached.visibility } }
    : { readOnly: {}, visibility: {} };
}

function writeCache(cacheKey, cacheableKeys, data) {
  if (!cacheKey || !cacheableKeys || cacheableKeys.size === 0) return;
  const entry = { readOnly: {}, visibility: {} };
  for (const key of cacheableKeys) {
    if (Object.prototype.hasOwnProperty.call(data.readOnly, key)) entry.readOnly[key] = data.readOnly[key];
    if (Object.prototype.hasOwnProperty.call(data.visibility, key)) entry.visibility[key] = data.visibility[key];
  }
  lastKnownCache.set(cacheKey, entry);
}

/** Test-only: clears the module-level cache so specs don't leak state into each other. */
export function __resetDisplayLogicCacheForTests() {
  lastKnownCache.clear();
}

/**
 * Hook that calls the NEO Headless evaluate-display endpoint to resolve
 * field visibility and read-only state based on AD metadata expressions
 * (AD_Column.ReadOnlyLogic, AD_Tab.DisplayLogic, etc.).
 *
 * Returns { readOnly: { fieldName: bool }, visibility: { fieldName: bool } }
 * which the form uses to disable/hide fields dynamically.
 *
 * Evaluates on record load and debounces on field changes (300ms).
 *
 * @param {string[]|Set<string>} [options.cacheableKeys] - keys whose resolved value is
 *   constant across every record in this window (e.g. the accounting-dimension macro,
 *   which depends only on GL Configuration, never on the record itself) — NOT per-record
 *   logic like a Posted-based readOnly flag, which must stay per-record-fresh. When
 *   provided, the LAST resolved value for these specific keys pre-seeds the very first
 *   render of a new mount (avoiding the "renders visible, then flips to hidden a moment
 *   later" flicker while the fresh evaluate-display call is still in flight), and gets
 *   refreshed from every subsequent resolution — evaluate-display still fires on every
 *   record load exactly as before, so this only smooths the FIRST paint, it never skips
 *   or delays re-checking the real answer.
 */
export function useDisplayLogic(entity, fieldValues, { token, apiBaseUrl, cacheableKeys }) {
  const cacheKeySet = cacheableKeys ? new Set(cacheableKeys) : null;
  const cacheKey = apiBaseUrl && entity ? `${apiBaseUrl}/${entity}` : null;

  const [displayState, setDisplayState] = useState(() => readCache(cacheKey));
  const debounceRef = useRef(null);

  // `evaluate` is memoized on [entity, token, apiBaseUrl] only — NOT on cacheKeySet — so that
  // a caller passing a fresh `cacheableKeys` array identity every render doesn't tear down and
  // recreate the debounce effect below. Reading through a ref (updated every render, below)
  // instead of closing over the value keeps `writeCache` honoring whatever `cacheableKeys` the
  // MOST RECENT render passed in, rather than whichever one happened to be in scope the last
  // time [entity, token, apiBaseUrl] changed.
  const cacheRef = useRef({ cacheKey, cacheKeySet });
  cacheRef.current = { cacheKey, cacheKeySet };

  const evaluate = useCallback(async (values) => {
    if (!values || !token || !apiBaseUrl || !entity) return;
    // Skip evaluation for new records (no id) — they have no meaningful state to evaluate
    if (!values.id) return;

    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/evaluate-display`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldValues: values }),
      });
      if (res.ok) {
        const data = await res.json();
        const next = {
          readOnly: data.readOnly ?? {},
          visibility: data.visibility ?? {},
        };
        setDisplayState(next);
        writeCache(cacheRef.current.cacheKey, cacheRef.current.cacheKeySet, next);
      }
    } catch {
      // Best-effort — if evaluate-display fails, all fields remain editable
    }
  }, [entity, token, apiBaseUrl]);

  // Evaluate when fieldValues change (debounced to avoid flooding on rapid edits)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      evaluate(fieldValues);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fieldValues, evaluate]);

  return displayState;
}
