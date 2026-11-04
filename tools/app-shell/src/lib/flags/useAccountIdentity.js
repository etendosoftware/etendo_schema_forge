import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { setSessionIdentity } from '../sessionIdentity.js';
import { identify, group } from '../observability.js';
import { reportFlagDiagnostic } from './diagnostics.js';
import { clearAccountIdentity, refreshAccountIdentity, setFeatureFlagContext, waitForIdentityReset } from './bootstrap.js';

/**
 * Resolves the account identity flags are targeted on, once per signed-in session, and publishes
 * who is signed in for the plain modules that cannot call `useAuth()` (flag targeting, analytics).
 *
 * Mount this inside the authenticated shell. Until it resolves, flags target the environment's
 * ERP admin username, which the backend never sees — so a rule keyed on the account evaluates
 * inconsistently between the two ends. The evaluation-context change re-renders subscribed
 * components, so a flag that flips once the account arrives corrects itself without a reload.
 *
 * ETP-5455 — it used to run only when localStorage held `sf_platform_token`, which nothing writes
 * since the cookie session, so under the cookie scheme it never ran. It now runs for any signed-in
 * session: the cookie travels on its own, and a legacy bearer session passes its own token.
 */
export function useAccountIdentity() {
  const { token, isAuthenticated, username, clientId, account } = useAuth();
  const accountId = account?.id;
  const accountEmail = account?.email;
  const previousIdentity = useRef(null);
  const resolvedIdentity = useRef(null);
  const retryAttempts = useRef({ signature: null, count: 0 });
  const [retryRevision, setRetryRevision] = useState(0);
  // Credential rotation is not an identity change. The next real identity
  // transition still uses the latest credential for a legacy lookup.
  const latestToken = useRef(token);
  latestToken.current = token;

  useEffect(() => {
    const request = new AbortController();
    let retryTimer;
    if (!isAuthenticated) {
      previousIdentity.current = null;
      resolvedIdentity.current = null;
      return () => request.abort();
    }

    const nextIdentity = { username, clientId, accountId, accountEmail };
    const signature = JSON.stringify(nextIdentity);
    if (retryAttempts.current.signature !== signature) {
      retryAttempts.current = { signature, count: 0 };
      resolvedIdentity.current = null;
    }
    const retryUnresolved = () => {
      if (request.signal.aborted || resolvedIdentity.current === signature) return;
      const delay = [500, 1500][retryAttempts.current.count];
      if (delay === undefined) return;
      retryAttempts.current.count += 1;
      retryTimer = setTimeout(() => setRetryRevision(value => value + 1), delay);
    };
    if (resolvedIdentity.current === signature) return () => request.abort();
    const started = Date.now();
    const previous = previousIdentity.current;
    previousIdentity.current = nextIdentity;
    const accountChanged = previous && (
      previous.accountId !== accountId || previous.accountEmail !== accountEmail
    );
    const legacySwitched = previous && !accountId && !accountEmail && (
      previous.username !== username || previous.clientId !== clientId
    );

    const companyChanged = previous && previous.clientId !== clientId;
    if (companyChanged) reportFlagDiagnostic({ operation: 'company_switch', outcome: 'started', source: 'auth', account_id: clientId });

    void (async () => {
      // A known account survives a company change. A different account (or an
      // unverified legacy identity) must drop the old account before resolving.
      if (accountChanged || legacySwitched) await clearAccountIdentity(undefined, 'account_changed');
      else await waitForIdentityReset();
      if (request.signal.aborted) return;
      setSessionIdentity({ username, clientId });
      if (accountId || accountEmail) {
        const applied = await setFeatureFlagContext(nextIdentity);
        if (request.signal.aborted) return;
        if (accountId) await identify(accountId);
        if (request.signal.aborted) return;
        if (clientId) await group('account_id', clientId);
        if (request.signal.aborted) return;
        reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'success', source: 'auth', account_id: clientId });
        if (companyChanged) reportFlagDiagnostic({ operation: 'company_switch', outcome: applied ? 'success' : 'error',
          source: 'auth', account_id: clientId, durationMs: Date.now() - started, reason: applied ? 'company_changed' : 'provider_error' });
        if (applied && accountEmail) resolvedIdentity.current = signature;
        // A partially populated auth account must not inherit another account's
        // cached email. Resolve the missing backend targeting key explicitly.
        if (accountId && !accountEmail) {
          const resolved = await refreshAccountIdentity({ token: latestToken.current, apiBase: getApiBase(),
            signal: request.signal, expectedAccountId: accountId });
          if (resolved && resolved.flagsResolved !== false && !request.signal.aborted) resolvedIdentity.current = signature;
        }
      } else {
        const resolved = await refreshAccountIdentity({ token: latestToken.current, apiBase: getApiBase(), signal: request.signal });
        if (resolved && resolved.flagsResolved !== false && !request.signal.aborted) resolvedIdentity.current = signature;
      }
      retryUnresolved();
    })().catch(() => {
      reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'error', reason: 'provider_error' });
      retryUnresolved();
    });

    return () => { request.abort(); clearTimeout(retryTimer); };
  }, [token, isAuthenticated, username, clientId, accountId, accountEmail, retryRevision]);
}
