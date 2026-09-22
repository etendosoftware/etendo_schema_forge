import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';

/**
 * ETP-5190 — reads and persists the post-signup First Steps state.
 *
 *   GET  /sws/go/onboarding/first-steps
 *     -> { status, firstSteps: { v: 1, seen: bool, dismissed: bool, completed: string[] } | null }
 *   POST /sws/go/onboarding/first-steps
 *     body { firstSteps: { v: 1, seen: bool, dismissed: bool, completed: string[] } }
 *     -> { status }
 *
 * ETP-5364 added `dismissed`: the user closed the checklist for good and the sidebar must stop
 * offering it. It is NOT `seen` (which only spends the one-time post-signup redirect) and NOT
 * "every step is ticked" (a tenant can finish the list and still want the entry there) — it is
 * an explicit, reversible act, so it needs its own flag. It lives on the same account-level JSON
 * as the rest of the state, which is what makes it survive a logout and a new device.
 *
 * `dismissed` is deliberately TRI-STATE: `undefined` until the GET answers, then a real boolean.
 * `filterMenuGroupsByAccess` reveals the menu entry only on an exact `false`, so `undefined`
 * keeps it hidden — which is the whole reason the flag is not simply initialised to `false`. It
 * was, and a dismissed user then saw the entry render and vanish a moment later on every reload
 * and on every locale change. The two other menu axes (`capability`, `accessWindowId`) fail
 * closed the same way for the same reason.
 *
 * A FAILED load resolves it to `false`, not `undefined`: "we could not ask" is a different
 * signal from "we have not asked yet", and losing the onboarding entry to a backend blip is a
 * worse outcome than showing it to someone who had put it away.
 *
 * The POST replaces the whole object, so every mutation here sends the full next state.
 *
 * This hook is deliberately the transport layer only: it knows nothing about the step
 * catalogue (`firstStepsConfig.js`) and therefore does not drag that module's lucide icons
 * into `DashboardPage`, which mounts it purely for the one-time redirect. The caller that
 * actually toggles steps passes `allowedIds` so a non-toggleable id can never reach the wire
 * — the server allowlists exactly those ids and silently drops the rest, so sending one would
 * write a state that reads back different from what we just sent.
 */
const ENDPOINT = '/sws/go/onboarding/first-steps';
export const FIRST_STEPS_STATE_VERSION = 1;

const EMPTY_COMPLETED = Object.freeze([]);

/** Filters `completed` down to `allowedIds` (in allowlist order) and de-duplicates. */
export function sanitizeCompletedIds(completed, allowedIds) {
  if (!Array.isArray(completed)) return [];
  if (!Array.isArray(allowedIds)) return [...new Set(completed.filter((id) => typeof id === 'string'))];
  return allowedIds.filter((id) => completed.includes(id));
}

/**
 * Coerces whatever the endpoint returned (including `null`, i.e. never saved) into a state.
 *
 * Both booleans are read as `=== true` rather than truthily, so a stored state written before
 * ETP-5364 (no `dismissed` key at all) reads as "not dismissed" — the checklist stays in the
 * menu for every existing user, which is the only safe direction for a flag that hides
 * navigation.
 */
export function normalizeFirstStepsState(raw, allowedIds) {
  return {
    v: FIRST_STEPS_STATE_VERSION,
    seen: raw?.seen === true,
    dismissed: raw?.dismissed === true,
    completed: sanitizeCompletedIds(raw?.completed, allowedIds),
  };
}

/**
 * @param {object} [options]
 * @param {string[]} [options.allowedIds] the step ids this caller may toggle; omit when the
 *   caller only reads `seen` (the dashboard gate).
 */
export function useFirstSteps({ allowedIds } = {}) {
  // `useAuthOptional`, not `useAuth`: this hook is mounted by two pages that are routinely
  // rendered bare in component tests, and `useAuth` throws with no `AuthProvider` above it
  // (same rationale as `useApiFetch`/`useLogout` — see docs/request-policy.md). With no
  // session the hook simply never fetches and stays in `loading`.
  const isAuthenticated = useAuthOptional()?.isAuthenticated ?? false;
  const apiFetch = useApiFetch(getApiBase());

  // Callers pass a literal array, so memoize on its contents rather than its identity —
  // otherwise every render would look like a new allowlist and refire the GET.
  const allowKey = Array.isArray(allowedIds) ? allowedIds.join(',') : '';
  const allowList = useMemo(
    () => (Array.isArray(allowedIds) ? allowKey.split(',').filter(Boolean) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowKey],
  );

  const [state, setState] = useState(() => ({
    v: FIRST_STEPS_STATE_VERSION,
    seen: false,
    // `undefined`, not `false` — see "tri-state" in this module's header.
    dismissed: undefined,
    completed: EMPTY_COMPLETED,
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The state as last applied, readable synchronously. `toggleStep` needs the pre-mutation
  // value to be able to roll back, and reading it out of a `setState` callback would make the
  // rollback depend on React's batching.
  const stateRef = useRef(state);
  // Guards `markSeen` against duplicate POSTs. Set BEFORE awaiting, so two calls in the same
  // tick (a re-render, a double-mounted effect in StrictMode) collapse into one request.
  const seenSentRef = useRef(false);

  const applyState = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const persist = useCallback(async (next) => {
    const res = await apiFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ firstSteps: next }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [apiFetch]);

  useEffect(() => {
    // ETP-4576 — gated on `isAuthenticated`, NOT on a token. The intent below is right: do
    // not fire the GET before the session exists, because its 401 would read as an expired
    // session and log the user out. But under the cookie scheme the client holds no token at
    // all, so `!token` is permanently false, the request is never issued, and the page sits
    // in `loading` for ever with no error anywhere. `isAuthenticated` is true under both
    // schemes once the session is real.
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    setLoading(true);
    apiFetch(ENDPOINT)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        applyState(normalizeFirstStepsState(data?.firstSteps, allowList));
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        // Degrade to "nothing completed" instead of a blank page or a permanent spinner: the
        // user can still read the list and open every target. `error` stays set so the
        // dashboard gate does NOT redirect on a state it could not read (which would bounce a
        // user who had already dismissed the page).
        applyState({
          v: FIRST_STEPS_STATE_VERSION,
          seen: false,
          // A real `false` on failure, so a backend blip does not hide the entry for the
          // rest of the session — see the header.
          dismissed: false,
          completed: EMPTY_COMPLETED,
        });
        setError('load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, apiFetch, applyState, allowList]);

  /**
   * Flips one step, optimistically. The POST carries the full next state; if it fails the local
   * state is restored so the row never claims a completion the server rejected.
   *
   * @returns {Promise<boolean>} `false` only when the write failed — the caller surfaces that
   *   (the rollback alone is invisible to a user who just clicked something). An id outside
   *   `allowedIds` is a no-op with nothing to persist, so it reports success.
   */
  const toggleStep = useCallback(async (id) => {
    if (allowList && !allowList.includes(id)) return true;
    const previous = stateRef.current;
    const completed = previous.completed.includes(id)
      ? previous.completed.filter((entry) => entry !== id)
      : [...previous.completed, id];
    const next = { ...previous, completed: sanitizeCompletedIds(completed, allowList) };
    applyState(next);
    try {
      await persist(next);
      setError(null);
      return true;
    } catch {
      applyState(previous);
      setError('save');
      return false;
    }
  }, [allowList, applyState, persist]);

  /**
   * Records that the user has been shown the page, which is what makes the one-time dashboard
   * redirect one-time. Safe to call repeatedly: already-seen state and an in-flight call both
   * short-circuit. A failed POST releases the guard and restores `seen`, so the redirect is
   * retried on the next dashboard visit rather than being silently lost.
   *
   * @returns {Promise<boolean>} whether the page is now recorded as seen.
   */
  const markSeen = useCallback(async () => {
    if (seenSentRef.current) return true;
    const previous = stateRef.current;
    if (previous.seen) {
      seenSentRef.current = true;
      return true;
    }
    seenSentRef.current = true;
    const next = { ...previous, seen: true };
    applyState(next);
    try {
      await persist(next);
      return true;
    } catch {
      seenSentRef.current = false;
      applyState(previous);
      setError('save');
      return false;
    }
  }, [applyState, persist]);

  /**
   * ETP-5364 — closes (or re-opens) the checklist, optimistically, and persists the whole state
   * like every other mutation here.
   *
   * Takes the value rather than toggling so the two call sites say what they mean, and so a
   * double click on "Finalizar configuración inicial" cannot re-open what it just closed.
   *
   * @param {boolean} next `true` to hide the checklist from the menu, `false` to bring it back.
   * @returns {Promise<boolean>} `false` only when the write failed — the local state is rolled
   *   back, so the caller has to surface it or the click reads as having done nothing.
   */
  const setDismissed = useCallback(async (next) => {
    const previous = stateRef.current;
    if (previous.dismissed === next) return true;
    const nextState = { ...previous, dismissed: next };
    applyState(nextState);
    try {
      await persist(nextState);
      setError(null);
      return true;
    } catch {
      applyState(previous);
      setError('save');
      return false;
    }
  }, [applyState, persist]);

  return {
    completed: state.completed,
    seen: state.seen,
    dismissed: state.dismissed,
    loading,
    error,
    toggleStep,
    markSeen,
    setDismissed,
  };
}

export default useFirstSteps;
