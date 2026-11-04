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
function rememberResolvedIdentity(resolved, attempt, state) {
  if (resolved && resolved.flagsResolved !== false && !attempt.request.signal.aborted) {
    state.resolvedIdentity.current = attempt.signature;
  }
}

function retryUnresolved(attempt, state, onRetry) {
  if (attempt.request.signal.aborted || state.resolvedIdentity.current === attempt.signature) return;
  const delay = [500, 1500][state.retryAttempts.current.count];
  if (delay === undefined) return;
  state.retryAttempts.current.count += 1;
  attempt.retryTimer = setTimeout(onRetry, delay);
}

async function publishKnownAnalytics(identity, signal) {
  if (signal.aborted) return false;
  if (identity.accountId) await identify(identity.accountId);
  if (signal.aborted) return false;
  if (identity.clientId) await group('account_id', identity.clientId);
  return !signal.aborted;
}

function reportCompanyTransition(attempt, applied) {
  if (!attempt.companyChanged) return;
  reportFlagDiagnostic({ operation: 'company_switch', outcome: applied ? 'success' : 'error',
    source: 'auth', account_id: attempt.identity.clientId, durationMs: Date.now() - attempt.started,
    reason: applied ? 'company_changed' : 'provider_error' });
}

async function resolveKnownAccount(attempt, state, token) {
  const { identity, request } = attempt;
  const applied = await setFeatureFlagContext(identity);
  if (!await publishKnownAnalytics(identity, request.signal) || request.signal.aborted) return;
  reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'success', source: 'auth', account_id: identity.clientId });
  reportCompanyTransition(attempt, applied);
  if (applied && identity.accountEmail) state.resolvedIdentity.current = attempt.signature;
  // A partially populated account must never inherit another account's cached email.
  if (identity.accountId && !identity.accountEmail) {
    const resolved = await refreshAccountIdentity({ token, apiBase: getApiBase(),
      signal: request.signal, expectedAccountId: identity.accountId });
    rememberResolvedIdentity(resolved, attempt, state);
  }
}

async function resolveIdentityAttempt(attempt, state, token, onRetry) {
  // Keep a known account across a company change; drop a different or unverified owner.
  if (attempt.accountChanged || attempt.legacySwitched) await clearAccountIdentity(undefined, 'account_changed');
  else await waitForIdentityReset();
  if (attempt.request.signal.aborted) return;
  setSessionIdentity({ username: attempt.identity.username, clientId: attempt.identity.clientId });
  if (attempt.identity.accountId || attempt.identity.accountEmail) {
    await resolveKnownAccount(attempt, state, token);
  } else {
    const resolved = await refreshAccountIdentity({ token, apiBase: getApiBase(), signal: attempt.request.signal });
    rememberResolvedIdentity(resolved, attempt, state);
  }
  retryUnresolved(attempt, state, onRetry);
}

function createIdentityAttempt(identity, signature, request, state) {
  const previous = state.previousIdentity.current;
  state.previousIdentity.current = identity;
  return {
    identity, signature, request, started: Date.now(),
    companyChanged: previous && previous.clientId !== identity.clientId,
    accountChanged: previous && (previous.accountId !== identity.accountId || previous.accountEmail !== identity.accountEmail),
    legacySwitched: previous && !identity.accountId && !identity.accountEmail && (
      previous.username !== identity.username || previous.clientId !== identity.clientId
    ),
  };
}

function beginIdentityEffect({ isAuthenticated, identity, token }, state, onRetry) {
  const request = new AbortController();
  if (!isAuthenticated) {
    state.previousIdentity.current = null;
    state.resolvedIdentity.current = null;
    return () => request.abort();
  }
  const signature = JSON.stringify(identity);
  if (state.retryAttempts.current.signature !== signature) {
    state.retryAttempts.current = { signature, count: 0 };
    state.resolvedIdentity.current = null;
  }
  if (state.resolvedIdentity.current === signature) return () => request.abort();
  const attempt = createIdentityAttempt(identity, signature, request, state);
  if (attempt.companyChanged) {
    reportFlagDiagnostic({ operation: 'company_switch', outcome: 'started', source: 'auth', account_id: identity.clientId });
  }
  void resolveIdentityAttempt(attempt, state, token, onRetry).catch(() => {
    reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'error', reason: 'provider_error' });
    retryUnresolved(attempt, state, onRetry);
  });
  return () => { request.abort(); clearTimeout(attempt.retryTimer); };
}

export function useAccountIdentity() {
  const { token, isAuthenticated, username, clientId, account } = useAuth();
  const accountId = account?.id;
  const accountEmail = account?.email;
  const previousIdentity = useRef(null);
  const resolvedIdentity = useRef(null);
  const retryAttempts = useRef({ signature: null, count: 0 });
  const [retryRevision, setRetryRevision] = useState(0);
  // Successful credential rotation is not an identity change; unresolved requests
  // use the latest credential when the effect runs again.
  const latestToken = useRef(token);
  latestToken.current = token;

  useEffect(() => beginIdentityEffect({
    isAuthenticated, identity: { username, clientId, accountId, accountEmail }, token: latestToken.current,
  }, { previousIdentity, resolvedIdentity, retryAttempts }, () => setRetryRevision(value => value + 1)),
  [token, isAuthenticated, username, clientId, accountId, accountEmail, retryRevision]);
}
