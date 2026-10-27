import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { extractBackendErrorCode } from '@/lib/backendErrors.js';

const ENDPOINT = '/sws/go/onboarding/calendar-review';

/**
 * ETP-5577 — the accounting calendar review state of the tenant in the current session.
 *
 * Read once per mount; `refresh` re-reads it (First Steps does on every visit, since opening a
 * period in Calendar completes the review). Any read failure leaves `required` false, so an unknown answer hides the row rather than
 * showing an error. `confirm` and `regenerate` answer with the new state; a refusal (403 not the
 * owner, 409 the calendar is already in use) rejects with an error carrying the HTTP `status`.
 */
export function useCalendarReview() {
  const apiFetch = useApiFetch(getApiBase());
  const [state, setState] = useState({ required: false, reviewed: false });
  const [loading, setLoading] = useState(true);
  // Bumped by `refresh`: the state changes outside this hook (a period opened in Calendar).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(ENDPOINT);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = await response.json();
        if (!cancelled && next) setState(next);
      } catch {
        // Hidden on failure: see the hook's Javadoc.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const post = useCallback(async (path, body) => {
    const response = await apiFetch(`${ENDPOINT}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // The server's message is English and for logs; the caller translates by `status`.
      throw Object.assign(new Error(payload?.message || `HTTP ${response.status}`),
        { status: response.status, code: extractBackendErrorCode(payload) });
    }
    setState(payload);
    return payload;
  }, [apiFetch]);

  const confirm = useCallback(() => post('confirm'), [post]);
  const regenerate = useCallback(
    (fiscalYearStart) => post('regenerate', { fiscalYearStart }), [post]);

  return { ...state, loading, confirm, regenerate, refresh };
}

export default useCalendarReview;
