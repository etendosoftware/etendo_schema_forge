import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * Fetches whether SII/TicketBAI/VeriFactu are forced into test mode for the
 * current client — AD_Preference "Fuerza SII/TicketBAI/VeriFactu a modo
 * prueba" — via `GET /sws/neo/fiscal-test-mode` (ETP-5272).
 *
 * FAILS OPEN: any network/HTTP/parse error leaves `forceTestMode` at `false`
 * (the window is NOT locked) rather than treating a transient failure as a
 * lock reason — the fiscal-config window must stay usable even if this check
 * cannot be resolved. The failure is still surfaced via `console.warn` so it
 * is never silently swallowed.
 */
export function useFiscalTestMode(apiBaseUrl) {
  const [forceTestMode, setForceTestMode] = useState(false);
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  useEffect(() => {
    if (!apiBaseUrl) {
      setForceTestMode(false);
      return;
    }
    const controller = new AbortController();
    apiFetch('/fiscal-test-mode', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setForceTestMode(data?.forceTestMode === true);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        // eslint-disable-next-line no-console
        console.warn('[fiscal-config] Failed to fetch /fiscal-test-mode; defaulting to unlocked (fail-open).', err);
        setForceTestMode(false);
      });
    return () => controller.abort();
  }, [apiFetch, apiBaseUrl]);

  return { forceTestMode };
}
