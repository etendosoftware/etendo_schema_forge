import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { detectBlockingBpCondition } from '@/lib/blockingBpConditions.js';
function sanitizeCalloutMessage(raw) {
  return raw
    .replace(/<br[^>]{0,10}>/gi, ' ')
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/^(Note|Warning|Error):\s*/i, '')
    .trim();
}

/**
 * ETP-5024: a "credit limit exceeded" / "Business Partner on hold" message must render as a
 * PERSISTENT inline banner, not an auto-dismissing toast, so it is pulled out of the toasts and
 * returned here instead. Only the last match wins if a response somehow carried more than one
 * (in practice the backend only ever sends one of these per callout).
 *
 * @param {Array} messages raw callout messages
 * @returns {object|null} the blocking condition, or null
 */
function resolveBlockingCondition(messages) {
  let blockingCondition = null;
  for (const msg of messages) {
    const text = sanitizeCalloutMessage(msg.text || msg.message || '');
    if (!text) continue;
    const condition = detectBlockingBpCondition(text);
    if (condition) blockingCondition = condition;
  }
  return blockingCondition;
}

/** Toast every callout message that is NOT a blocking condition (those render as a banner). */
function toastCalloutMessages(messages) {
  for (const msg of messages) {
    const text = sanitizeCalloutMessage(msg.text || msg.message || '');
    if (!text || detectBlockingBpCondition(text)) continue;
    const type = (msg.type || '').toUpperCase();
    if (type === 'ERROR') toast.error(text);
    else if (type === 'WARNING') toast.warning(text);
    else toast.info(text);
  }
}

/**
 * Perform one callout request and hand the result to the consumer.
 *
 * Extracted from the debounce callback in `useCallout` so that callback stays a thin
 * dispatch/timing shell (Sonar javascript:S3776) and the request itself is readable.
 *
 * @returns {Promise<boolean>} true when a `calloutResult` was handed over (the consumer must
 *   apply it), false when there is nothing to apply (non-OK response, network error or abort)
 */
async function performCallout({ field, value, formState, meta, entity, apiFetch, controller, setCalloutLoading, setCalloutResult }) {
  setCalloutLoading(true);
  try {
    // Extract auxiliary values from formState (keys like "businessPartner_LOC")
    const state = formState ?? {};
    const auxiliaryValues = extractAuxiliaryValues(state);
    const payload = {
      field,
      value,
      formState: state,
      ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
    };
    const res = await apiFetch(`/${entity}/callout`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) return false;

    const data = await res.json();
    const messages = data.messages ?? [];
    toastCalloutMessages(messages);
    setCalloutResult({
      updates: data.updates ?? {},
      combos: data.combos ?? {},
      triggerField: field,
      meta,
      blockingCondition: resolveBlockingCondition(messages),
    });
    return true;
  } catch {
    // Callout is best-effort — do not block the user on failure (abort included)
    return false;
  } finally {
    setCalloutLoading(false);
  }
}

/**
 * Hook that calls the NEO Headless callout endpoint when FK fields change.
 *
 * The backend checks if the column has a registered callout. If not, it
 * returns an empty response — so it is safe to call for every field change.
 *
 * Returns { calloutResult, calloutLoading, executeCallout }.
 *
 * calloutResult: { updates, combos, triggerField, meta, blockingCondition } from the
 * last callout response. `meta` is an opaque passthrough of whatever the caller
 * passed to executeCallout (e.g. a per-field generation snapshot used by
 * DetailView to detect and discard stale responses — ETP-4772); this hook
 * does not interpret it. `blockingCondition` (ETP-5024) is
 * `{ kind: 'creditLimit' | 'onHold', text }` when this response's messages included
 * one of those two conditions, or `null` otherwise — consumers (DetailView) use it
 * to show/clear the persistent inline banner; see `lib/blockingBpConditions.js`.
 * executeCallout(field, value, formState, meta): triggers the callout (debounced 300ms).
 * ETP-4742: it returns a promise that settles once the callout has been fully
 * accounted for — `true` when a response was handed to the consumer through
 * `calloutResult` (the consumer must apply it; a form gating itself on the chain
 * releases on its own apply effect, not on this resolution), `false` when there
 * is nothing to apply (non-OK response, network error or abort). Callers that
 * ignore the return value (the user-change path) are unaffected.
 */
export function useCallout(entity, { token, apiBaseUrl }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [calloutResult, setCalloutResult] = useState(null);
  const [calloutLoading, setCalloutLoading] = useState(false);
  // Per-field debounce timers and abort controllers so concurrent callouts don't cancel each
  // other. ETP-4742: each debounce entry also carries its own `resolve`, so a superseded
  // debounce (or an unmount) can SETTLE the promise it handed out instead of leaving it
  // pending forever — a caller gating on that promise would otherwise wait for its budget.
  const debounceMapRef = useRef({}); // field -> { timer, resolve }
  const abortMapRef = useRef({});

  const settleSupersededDebounce = useCallback((field) => {
    const pending = debounceMapRef.current[field];
    if (!pending) return;
    clearTimeout(pending.timer);
    delete debounceMapRef.current[field];
    pending.resolve(false);
  }, []);

  // Unmount: clear every pending debounce (settling it) and abort every in-flight request,
  // so no promise handed to a caller is left hanging.
  useEffect(() => () => {
    Object.values(debounceMapRef.current).forEach(({ timer, resolve }) => {
      clearTimeout(timer);
      resolve(false);
    });
    debounceMapRef.current = {};
    Object.values(abortMapRef.current).forEach(controller => controller.abort());
    abortMapRef.current = {};
  }, []);

  const executeCallout = useCallback((field, value, formState, meta) => {
    if (!field || !apiBaseUrl || !entity) return Promise.resolve(false);

    // Cancel any pending debounced call for THIS field only, settling its promise.
    settleSupersededDebounce(field);

    return new Promise((resolve) => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(async () => {
        // This debounce fired: drop it so a later supersede does not try to settle it.
        if (debounceMapRef.current[field] === entry) delete debounceMapRef.current[field];
        // Abort previous in-flight request for THIS field only
        if (abortMapRef.current[field]) abortMapRef.current[field].abort();
        const controller = new AbortController();
        abortMapRef.current[field] = controller;
        // ETP-4742: settle the caller AFTER the request handled setCalloutResult, so the
        // consumer's apply effect runs on a later commit than this resolution.
        const hasResult = await performCallout({
          field, value, formState, meta, entity, apiFetch, controller,
          setCalloutLoading, setCalloutResult,
        });
        resolve(hasResult);
      }, 300);
      debounceMapRef.current[field] = entry;
    });
  }, [entity, token, apiBaseUrl, apiFetch, settleSupersededDebounce]);

  return { calloutResult, calloutLoading, executeCallout };
}
function extractAuxiliaryValues(state) {
  const auxiliaryValues = {};
  for (const [key, val] of Object.entries(state)) {
    if (/^[a-zA-Z]+_[A-Z]{2,4}$/.test(key) && val != null && val !== '') {
      auxiliaryValues[key] = String(val);
    }
  }
  return auxiliaryValues;
}

