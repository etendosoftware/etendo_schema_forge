import { useState, useCallback, useRef } from 'react';
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
 * Hook that calls the NEO Headless callout endpoint when FK fields change.
 *
 * The backend checks if the column has a registered callout. If not, it
 * returns an empty response — so it is safe to call for every field change.
 *
 * Returns { calloutResult, calloutLoading, executeCallout, peekBusinessPartnerCallout }.
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
 * peekBusinessPartnerCallout(value, formState) (ETP-5024): a SEPARATE, isolated,
 * non-debounced one-shot check used by `useEntity.js` right before a
 * Complete/Confirm request — see its own doc comment below for why it must
 * never touch `calloutResult`/`calloutLoading`.
 */
export function useCallout(entity, { token, apiBaseUrl }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [calloutResult, setCalloutResult] = useState(null);
  const [calloutLoading, setCalloutLoading] = useState(false);
  // Per-field debounce timers and abort controllers so concurrent callouts don't cancel each other
  const debounceMapRef = useRef({});
  const abortMapRef = useRef({});

  const executeCallout = useCallback((field, value, formState, meta) => {
    if (!field || !token || !apiBaseUrl || !entity) return;

    // Cancel any pending debounced call for THIS field only
    if (debounceMapRef.current[field]) clearTimeout(debounceMapRef.current[field]);

    debounceMapRef.current[field] = setTimeout(async () => {
      // Abort previous in-flight request for THIS field only
      if (abortMapRef.current[field]) abortMapRef.current[field].abort();
      const controller = new AbortController();
      abortMapRef.current[field] = controller;

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

        if (!res.ok) {
          setCalloutLoading(false);
          return;
        }

        const data = await res.json();
        const updates = data.updates ?? {};
        const combos = data.combos ?? {};
        const messages = data.messages ?? [];

        // ETP-5024: a "credit limit exceeded" / "Business Partner on hold" message
        // must render as a PERSISTENT inline banner, not an auto-dismissing toast —
        // so it is pulled out of the loop below instead of being toasted. Every
        // other callout message keeps the existing toast behavior unchanged. Only
        // the last match wins if a response somehow carried more than one (in
        // practice the backend only ever sends one of these per callout).
        let blockingCondition = null;
        for (const msg of messages) {
          const text = sanitizeCalloutMessage(msg.text || msg.message || '');
          if (!text) continue;
          const condition = detectBlockingBpCondition(text);
          if (condition) {
            blockingCondition = condition;
            continue;
          }
          const type = (msg.type || '').toUpperCase();
          if (type === 'ERROR') toast.error(text);
          else if (type === 'WARNING') toast.warning(text);
          else toast.info(text);
        }

        setCalloutResult({ updates, combos, triggerField: field, meta, blockingCondition });
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Callout is best-effort — do not block the user on failure
        }
      } finally {
        setCalloutLoading(false);
      }
    }, 300);
  }, [entity, token, apiBaseUrl, apiFetch]);

  /**
   * ETP-5024: an isolated, non-debounced "peek" at the businessPartner callout —
   * used by `useEntity.js`'s `handleProcess`/`handleSaveAndProcess` right before a
   * Complete/Confirm request, to detect whether the CURRENTLY-loaded Business
   * Partner is over its credit limit.
   *
   * Why this exists instead of reusing `executeCallout`: credit-limit-exceeded is
   * NOT a backend hard block (confirmed empirically in both Etendo Classic and
   * Etendo Go — unlike BP-on-hold, which IS). So opening an EXISTING document
   * whose BP was selected in a PAST session (no fresh callout fired this
   * session) and clicking Confirmar completes silently — no error — so neither
   * of the two existing banner triggers (a fresh callout on BP change, or a
   * failed-Complete error match) ever fires, and the user never sees that their
   * contact is still over limit.
   *
   * This function deliberately:
   *  - does NOT debounce, and does NOT share `debounceMapRef`/`abortMapRef`
   *    with `executeCallout` — Confirm needs the answer immediately, not after
   *    300ms, and must not be cancelled by (or cancel) an in-flight per-field
   *    callout.
   *  - does NOT call `setCalloutResult` (or touch `calloutLoading`) — so it can
   *    never flow into `DetailView.jsx`'s `calloutResult` effect, which
   *    auto-applies `updates`/`combos` onto the form. That is exactly the
   *    "stale values overwrite the saved document" risk already identified and
   *    rejected for the "re-run callout on page load" alternative. This is a
   *    read-only peek: it resolves the classified `blockingCondition` (or
   *    `null`) directly to its caller, nothing more.
   *  - is best-effort: any failure (network error, non-OK response, no
   *    callout registered for this column) resolves to `null` — it must NEVER
   *    block or delay the real Confirm/Complete action, mirroring
   *    `executeCallout`'s own best-effort catch block above.
   *
   * @param {string} value the currently-loaded Business Partner id
   * @param {object} [formState] current header form state (`editing`/`selected`)
   * @returns {Promise<{kind: 'creditLimit'|'onHold', text: string, amount?: number|null} | null>}
   */
  const peekBusinessPartnerCallout = useCallback(async (value, formState) => {
    if (!value || !token || !apiBaseUrl || !entity) return null;
    try {
      const state = formState ?? {};
      const auxiliaryValues = extractAuxiliaryValues(state);
      const payload = {
        field: 'businessPartner',
        value,
        formState: state,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      };
      const res = await apiFetch(`/${entity}/callout`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;

      const data = await res.json();
      const messages = data.messages ?? [];
      for (const msg of messages) {
        const text = sanitizeCalloutMessage(msg.text || msg.message || '');
        if (!text) continue;
        const condition = detectBlockingBpCondition(text);
        if (condition) return condition;
      }
      return null;
    } catch {
      // Best-effort — never block the caller (Confirm/Complete) on failure.
      return null;
    }
  }, [entity, token, apiBaseUrl, apiFetch]);

  return { calloutResult, calloutLoading, executeCallout, peekBusinessPartnerCallout };
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

