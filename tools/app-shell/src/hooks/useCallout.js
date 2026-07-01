import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

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
 * Returns { calloutResult, calloutLoading, executeCallout }.
 *
 * calloutResult: { updates, combos, messages } from the last callout response.
 * executeCallout(field, value, formState): triggers the callout (debounced 300ms).
 */
export function useCallout(entity, { token, apiBaseUrl }) {
  const [calloutResult, setCalloutResult] = useState(null);
  const [calloutLoading, setCalloutLoading] = useState(false);
  // Per-field debounce timers and abort controllers so concurrent callouts don't cancel each other
  const debounceMapRef = useRef({});
  const abortMapRef = useRef({});

  const executeCallout = useCallback((field, value, formState) => {
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
        const res = await fetch(`${apiBaseUrl}/${entity}/callout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
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

        // Show callout messages via toast
        for (const msg of messages) {
          const text = sanitizeCalloutMessage(msg.text || msg.message || '');
          if (!text) continue;
          const type = (msg.type || '').toUpperCase();
          if (type === 'ERROR') toast.error(text);
          else if (type === 'WARNING') toast.warning(text);
          else toast.info(text);
        }

        setCalloutResult({ updates, combos, triggerField: field });
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Callout is best-effort — do not block the user on failure
        }
      } finally {
        setCalloutLoading(false);
      }
    }, 300);
  }, [entity, token, apiBaseUrl]);

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

