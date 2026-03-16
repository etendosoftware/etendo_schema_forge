import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

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
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const executeCallout = useCallback((field, value, formState) => {
    if (!field || !token || !apiBaseUrl || !entity) return;

    // Cancel any pending debounced call
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // Abort previous in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCalloutLoading(true);
      try {
        const payload = { field, value, formState: formState ?? {} };
        console.log('[useCallout] POST callout:', JSON.stringify(payload, null, 2));
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
          const text = msg.text || msg.message || '';
          if (!text) continue;
          const type = (msg.type || '').toUpperCase();
          if (type === 'ERROR') toast.error(text);
          else if (type === 'WARNING') toast.warning(text);
          else toast.info(text);
        }

        // Only set result if there are actual updates or combos
        const hasUpdates = Object.keys(updates).length > 0;
        const hasCombos = Object.keys(combos).length > 0;
        if (hasUpdates || hasCombos) {
          setCalloutResult({ updates, combos });
        } else {
          setCalloutResult(null);
        }
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
