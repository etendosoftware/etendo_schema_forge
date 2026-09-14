import { useMemo } from 'react';
import { useEnvironmentSwitch } from './useEnvironmentSwitch.js';
import { isProductiveEnvironment } from '../lib/environmentPresentation.js';

/**
 * ETP-5190 — the plan of the environment the user is currently inside.
 *
 * There is no endpoint that answers this directly. `ETGO_SF_*` and the NEO token know the
 * client but not the plan; `GET /sws/go/onboarding/first-steps` and `/sws/go/me` are
 * account-scoped and do not know WHICH client the shell is in; and `POST /sws/go/login` returns
 * only a JWT and the role list. What does exist is `GET /sws/go/environments`, which since
 * ETP-4686 reports `plan` per environment, plus the client id the session was opened with in
 * `localStorage.sf_auth_client_id` — so the plan is the plan of the row that matches. That is
 * exactly the pair `useEnvironmentSwitch` already resolves for the company switcher.
 *
 * Returns `plan: null` while it cannot answer — still loading, no platform token, a failed
 * request, or a client id with no matching row. Callers must NOT read that as "free":
 * `isProductivePlan(null)` in `firstStepsConfig.js` is deliberately true, so an unknown plan
 * shows the full checklist. Use `loading` to hold off rendering a plan-dependent view rather
 * than rendering one and swapping it once the list lands.
 *
 * **Known cost:** this mounts its own `useEnvironmentSwitch`, so an app load that also renders
 * the `SideMenu` company switcher issues `/sws/go/environments` twice. It is one small
 * account-scoped GET and keeping the hook self-contained avoids threading the list through
 * `AppLayout` into both consumers; lifting `useEnvironmentSwitch` into a context shared by the
 * switcher and this hook is the follow-up if the second call ever matters.
 */
export function useTenantPlan() {
  const { environments, loading, currentClientId } = useEnvironmentSwitch();

  return useMemo(() => {
    if (loading) return { plan: null, loading: true };
    const current = Array.isArray(environments)
      ? environments.find((env) => env?.clientId === currentClientId)
      : undefined;
    // `isProductiveEnvironment` is the same predicate the switcher badge and the environment
    // sort use, so "Productivo" in the company switcher and the checklist length can never
    // disagree about what the plan is.
    if (!current) return { plan: null, loading: false };
    return { plan: isProductiveEnvironment(current) ? 'productive' : 'free', loading: false };
  }, [environments, loading, currentClientId]);
}

export default useTenantPlan;
