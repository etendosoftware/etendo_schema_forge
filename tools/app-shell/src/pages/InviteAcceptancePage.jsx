import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Building2, AlertCircle, Loader2, Lock, User, Mail, ArrowRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell, LoginStep, RegisterStep } from '@etendosoftware/etendo-go-core/onboarding';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLogout } from '@/auth/useLogout.js';
/**
 * Public Company Invitation Acceptance Page (ETP-4894).
 *
 * Dedicated acceptance flow outside OnboardingFlow. Supports:
 * 1. Existing Etendo Go account login, invitation return, and authenticated acceptance.
 * 2. New platform account registration locked to the invitation email, followed by acceptance.
 * 3. Idempotent accepted confirmation.
 * 4. Safe non-enumerating error states for expired/revoked/invalid tokens.
 */
/**
 * ETP-5202 — states of the "someone else is signed in" guard.
 *
 * CHECKING is the initial state on purpose: until the active session's identity is known, the
 * page must not render LoginStep/RegisterStep, or the invitee would start typing credentials
 * into a tab where another person's session is still live.
 */
const SESSION_GUARD = {
  CHECKING: 'checking',
  CLEAR: 'clear',
  CONFLICT: 'conflict',
  DEFERRED: 'deferred',
};

const ACTIONABLE_BRANCHES = new Set(['existing_account', 'registration_required']);

function readStoredToken(key) {
  try {
    return globalThis.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

export default function InviteAcceptancePage({ apiBase = import.meta.env.VITE_API_BASE || '' }) { // NOSONAR -- intentional finite invitation state machine.
  const ui = useUI();
  const navigate = useNavigate();
  const apiFetch = useApiFetch(apiBase);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [invitationData, setInvitationData] = useState(null);
  const [successData, setSuccessData] = useState(null);

  // Form state for registration
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [existingAuthenticated, setExistingAuthenticated] = useState(false);

  // ETP-5202 — the invitation link is routinely opened on a shared computer while somebody
  // else's session is still open. `sessionGuard` decides whether this page may proceed
  // straight to the acceptance flow, and `activeAccountEmail` names the person currently
  // signed in so the conflict prompt can say who is about to be signed out.
  const [sessionGuard, setSessionGuard] = useState(SESSION_GUARD.CHECKING);
  const [activeAccountEmail, setActiveAccountEmail] = useState(null);
  const logout = useLogout();

  const clearTokenFromUrl = () => {
    try {
      if (globalThis.history?.replaceState) {
        const cleanUrl = globalThis.location?.pathname || '/invite';
        globalThis.history.replaceState({}, document.title, cleanUrl);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (!token.trim()) {
      setLoading(false);
      setErrorState('missing_token');
      return;
    }

    let isMounted = true;
    async function resolveToken() {
      setLoading(true);
      setErrorState(null);
      try {
        // ETP-5022: tokenless is correct here (pre-login); apiFetch still sends the
        // locale header, and a domain-mapped 401 (invalid/expired token) must not be
        // swallowed into a generic logout, hence on401: 'ignore'.
        const res = await apiFetch(
          `/sws/go/company-invitations/resolve?token=${encodeURIComponent(token.trim())}`,
          { on401: 'ignore' }
        );
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;

        if (!res.ok || data.error) {
          setErrorState(data.code || 'invalid_token');
          setLoading(false);
          return;
        }

        setInvitationData(data);
        if (data.status === 'ACCEPTED' || data.branch === 'accepted') {
          setSuccessData({
            alreadyAccepted: true,
            clientName: data.clientName,
          });
        }
        setLoading(false);
      } catch {
        if (isMounted) {
          setErrorState('network_error');
          setLoading(false);
        }
      }
    }

    resolveToken();
    return () => {
      isMounted = false;
    };
  }, [token, apiFetch]);

  // ETP-5202 — resolves who is signed in RIGHT NOW, and blocks the acceptance flow when that is
  // somebody other than the invitee.
  //
  // The check is deliberately "is the open session a different person?", not "is a session
  // open?": being signed in with your OWN account in another tenant and accepting an invitation
  // to a second one is a legitimate, and soon routine, multi-tenant flow — prompting there would
  // be pure noise. The identity comes from GET /sws/neo/session, which resolves the platform
  // account (ETGO_ACCOUNT) behind the authenticated user and therefore works with the tenant JWT;
  // the platform token is the fallback for a session whose tenant JWT has expired, mirroring
  // `refreshAccountIdentity`.
  //
  // Fail SAFE, not open: if a session exists but its identity cannot be resolved, prompt. A
  // needless prompt costs one click; skipping it silently merges two identities in one browser.
  useEffect(() => {
    const branch = invitationData?.branch;
    if (!ACTIONABLE_BRANCHES.has(branch)) {
      setSessionGuard(SESSION_GUARD.CLEAR);
      return undefined;
    }

    const authToken = readStoredToken('sf_auth_token');
    const platformToken = readStoredToken('sf_platform_token');
    if (!authToken && !platformToken) {
      setSessionGuard(SESSION_GUARD.CLEAR);
      return undefined;
    }

    // Back to CHECKING before the identity request goes out. This is NOT redundant with the
    // initial useState: the effect runs once with `invitationData === null`, takes the
    // not-actionable path above and settles on CLEAR long before the branch is known. Without
    // this line the guard stays CLEAR for the whole duration of the fetch, LoginStep/RegisterStep
    // render underneath it, and the invitee can start typing credentials in a tab where the other
    // person's session is still live — the precise thing this guard exists to prevent.
    setSessionGuard(SESSION_GUARD.CHECKING);

    let isMounted = true;

    const readAccountEmail = async (bearer) => {
      if (!bearer) return null;
      try {
        const res = await apiFetch('/sws/neo/session', { token: bearer, on401: 'ignore' });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        return data?.accountEmail || null;
      } catch {
        return null;
      }
    };

    (async () => {
      // The fallback is skipped when both keys hold the same value, which happens for a session
      // that never went through the environment switch — one answer, one request.
      const email = (await readAccountEmail(authToken))
        || (platformToken === authToken ? null : await readAccountEmail(platformToken));
      if (!isMounted) return;

      const invitedEmail = invitationData?.email || '';
      if (email && invitedEmail && email.trim().toLowerCase() === invitedEmail.trim().toLowerCase()) {
        // Same person, another tenant — nothing to close, nothing to warn about.
        setSessionGuard(SESSION_GUARD.CLEAR);
        return;
      }

      setActiveAccountEmail(email || null);
      setSessionGuard(SESSION_GUARD.CONFLICT);
    })();

    return () => {
      isMounted = false;
    };
  }, [invitationData, apiFetch]);

  // ETP-5202 — signing the previous user out happens BEFORE the invitee is asked for any
  // credential, never after accepting: a logout at the end would still pass through the state
  // where `sf_platform_token` is already the invitee's while `sf_auth_*` still points at the
  // previous tenant — exactly the mix this ticket is about.
  //
  // `useLogout` (not a hand-rolled localStorage wipe) is the single exit path: it clears the
  // dashboard period filter and delegates to the core logout, which is the only thing that
  // clears BOTH identity layers (`sf_auth_*` and `sf_platform_token`).
  //
  // The hard reload afterwards is not cosmetic. `logout()` empties storage but leaves every
  // per-tenant cache alive in memory — the very reason `useEnvironmentSwitch.switchTo()` does a
  // full page load instead of a state update. On a shared computer the whole point is that the
  // next person sees nothing of the previous one. Reloading back into /invite with the token
  // still in the query string also keeps the invitation resolvable: `clearTokenFromUrl()` must
  // never run on this path, or the invitee would land on a "missing token" error with the other
  // person's session already destroyed.
  const handleCloseSessionAndContinue = () => {
    logout();
    const location = globalThis.location;
    const path = location?.pathname || '/invite';
    const target = `${path}?token=${encodeURIComponent(token.trim())}`;
    // The session is already destroyed by the time we get here, so leaving the user on this
    // screen is not an option: fall back to an assignment if `replace` is unavailable.
    if (typeof location?.replace === 'function') {
      location.replace(target);
    } else if (location) {
      location.href = target;
    }
  };

  const handleExistingAuthenticated = async () => {
    setActionError(null);
    setExistingAuthenticated(true);
  };

  const handleAcceptExisting = async () => {
    setActionError(null);
    setSubmitting(true);
    try {
      // ETP-5022: the platform session token is read from localStorage, not the
      // app's auth context (this flow runs before/outside it), so it is passed as an
      // explicit override; on401: 'ignore' keeps the existing domain error handling below.
      const sessionToken = globalThis.localStorage?.getItem('sf_platform_token') || '';
      const res = await apiFetch('/sws/go/company-invitations/accept', {
        method: 'POST',
        token: sessionToken,
        on401: 'ignore',
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setActionError(data.message || ui('invitePageInvalidDescription'));
        setSubmitting(false);
        return;
      }

      clearTokenFromUrl();
      setSuccessData({ clientName: data.clientName || invitationData?.clientName });
      setSubmitting(false);
    } catch {
      setActionError(ui('invitePageInvalidDescription'));
      setSubmitting(false);
    }
  };

  const handleRegisterAndAccept = async (e) => {
    e.preventDefault();
    setActionError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setActionError(ui('invitePageNameLabel'));
      return;
    }
    if (!password) {
      setActionError(ui('invitePagePasswordLabel'));
      return;
    }

    setSubmitting(true);
    try {
      // ETP-5022: anonymous registration (pre-login); on401: 'ignore' keeps the
      // domain error handling below instead of an automatic logout.
      const res = await apiFetch('/sws/go/company-invitations/register-and-accept', {
        method: 'POST',
        on401: 'ignore',
        body: JSON.stringify({
          token: token.trim(),
          name: trimmedName,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setActionError(
          data.code === 'WEAK_PASSWORD'
            ? ui('onboardingCredentialsMustMatch') || data.message
            : data.message || ui('invitePageInvalidDescription')
        );
        setSubmitting(false);
        return;
      }

      if (data.token) {
        try {
          globalThis.localStorage?.setItem('sf_platform_token', data.token);
        } catch {
          // Ignore
        }
      }

      clearTokenFromUrl();
      setSuccessData({
        clientName: data.clientName || invitationData?.clientName,
      });
      setSubmitting(false);
    } catch {
      setActionError(ui('invitePageInvalidDescription'));
      setSubmitting(false);
    }
  };

  const registerInvitationAccount = async ({ name: accountName, password: accountPassword }) => {
    // ETP-5022: anonymous registration (pre-login); on401: 'ignore' keeps the
    // domain error handling below instead of an automatic logout.
    const res = await apiFetch('/sws/go/company-invitations/register-and-accept', {
      method: 'POST',
      on401: 'ignore',
      body: JSON.stringify({
        token: token.trim(),
        name: accountName.trim(),
        password: accountPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const error = new Error(data.message || ui('invitePageInvalidDescription'));
      error.code = data.code || 'INVITATION_ERROR';
      throw error;
    }
    return data;
  };

  const handleInvitationRegistered = async (_sessionToken, account) => {
    clearTokenFromUrl();
    setSuccessData({
      clientName: invitationData?.clientName,
      account,
    });
  };

  const companyName = invitationData?.clientName || successData?.clientName || 'Etendo Go';
  const invitedEmail = invitationData?.email || invitationData?.maskedEmail || '';

  // The marketing shell is identical on every full-page state; the pre-existing states below
  // spell it out inline, the ETP-5202 states share this bag rather than copying it three times.
  const shellProps = {
    brandLabel: 'Etendo Go',
    marketingTitle: ui('onboardingMarketingTitle'),
    marketingDescription: ui('onboardingMarketingDescription'),
    featureLabels: [
      ui('onboardingAuthFeatureNoCard'),
      ui('onboardingAuthFeatureTrial'),
      ui('onboardingAuthFeatureInstantAccess'),
    ],
  };
  const guardApplies = !loading && !errorState && !successData
    && ACTIONABLE_BRANCHES.has(invitationData?.branch);

  if (loading) {
    return (
      <AuthShell
        brandLabel="Etendo Go"
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={[
          ui('onboardingAuthFeatureNoCard'),
          ui('onboardingAuthFeatureTrial'),
          ui('onboardingAuthFeatureInstantAccess'),
        ]}
        data-testid="AuthShell__fa3cd9">
        <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="invite-loading">
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            data-testid="Loader2__fa3cd9" />
          <p className="mt-4 text-base text-muted-foreground">{ui('invitePageLoading')}</p>
        </div>
      </AuthShell>
    );
  }

  // ETP-5202 — identity check in flight. Renders instead of the login/registration surface so
  // the invitee cannot start typing before it is known whose session is open.
  if (guardApplies && sessionGuard === SESSION_GUARD.CHECKING) {
    return (
      <AuthShell {...shellProps} data-testid="AuthShell__fa3cd9">
        <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="invite-session-checking">
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="Loader2__fa3cd9" />
          <p className="mt-4 text-base text-muted-foreground">{ui('inviteSessionCheckLoading')}</p>
        </div>
      </AuthShell>
    );
  }

  // ETP-5202 — a different person is signed in on this browser.
  if (guardApplies && sessionGuard === SESSION_GUARD.CONFLICT) {
    return (
      <AuthShell {...shellProps} data-testid="AuthShell__fa3cd9">
        <div className="text-center" data-testid="invite-session-conflict">
          <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" data-testid="invite-session-conflict-icon" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('inviteSessionConflictTitle')}
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-xl">
            {activeAccountEmail
              ? ui('inviteSessionConflictDescription')
                .replace('{currentUser}', activeAccountEmail)
                .replace('{invitedEmail}', invitedEmail)
              : ui('inviteSessionConflictDescriptionUnknown').replace('{invitedEmail}', invitedEmail)}
          </p>
          <Button
            className="mt-6 h-12 w-full gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
            onClick={handleCloseSessionAndContinue}
            data-testid="action-close-session"
          >
            <span>
              {activeAccountEmail
                ? ui('inviteSessionConflictLogout').replace('{currentUser}', activeAccountEmail)
                : ui('inviteSessionConflictLogoutUnknown')}
            </span>
            <ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" />
          </Button>
          {/* Signing out is not reversible from here and it reaches every tab, so it is
              spelled out next to the button rather than discovered afterwards. */}
          <p className="mt-2 text-xs text-muted-foreground">{ui('inviteSessionConflictLogoutWarning')}</p>
          <Button
            variant="outline"
            className="mt-4 h-12 w-full rounded-lg text-base font-medium"
            onClick={() => setSessionGuard(SESSION_GUARD.DEFERRED)}
            data-testid="action-defer-invitation"
          >
            {ui('inviteSessionConflictDefer')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ETP-5202 — "I will accept later": a terminal state that writes nothing and clears nothing.
  if (guardApplies && sessionGuard === SESSION_GUARD.DEFERRED) {
    return (
      <AuthShell {...shellProps} data-testid="AuthShell__fa3cd9">
        <div className="text-center" data-testid="invite-session-deferred">
          <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-8 w-8" data-testid="invite-session-deferred-icon" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('inviteSessionDeferredTitle')}
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-xl">
            {ui('inviteSessionDeferredDescription').replace('{invitedEmail}', invitedEmail)}
          </p>
        </div>
      </AuthShell>
    );
  }

  // Reuse the canonical Etendo Go authentication surface for existing accounts.
  // The invitation page resumes after LoginStep calls onAuthenticated; it never
  // starts the company onboarding flow.
  if (!loading && !errorState && !successData && sessionGuard === SESSION_GUARD.CLEAR
      && invitationData?.branch === 'existing_account' && !existingAuthenticated) {
    return (
      <div data-testid="invite-shared-login">
        <LoginStep
          config={{
            apiBase,
            brandLabel: 'Etendo Go',
            localeCodes: ['es_ES', 'en_US'],
          }}
          stepData={{ email: invitationData.email }}
          initialEmail={invitationData.email}
          emailReadOnly
          onAuthenticated={handleExistingAuthenticated}
          data-testid="LoginStep__fa3cd9" />
      </div>
    );
  }

  if (!loading && !errorState && !successData && sessionGuard === SESSION_GUARD.CLEAR
      && invitationData?.branch === 'registration_required') {
    return (
      <div data-testid="invite-new-account">
        <RegisterStep
          config={{
            apiBase,
            brandLabel: 'Etendo Go',
            localeCodes: ['es_ES', 'en_US'],
          }}
          stepData={{ email: invitationData.email }}
          initialEmail={invitationData.email}
          emailReadOnly
          registerHandler={registerInvitationAccount}
          onRegistered={handleInvitationRegistered}
          data-testid="RegisterStep__fa3cd9" />
      </div>
    );
  }

  if (!loading && errorState) {
    return (
      <AuthShell
        brandLabel="Etendo Go"
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={[
          ui('onboardingAuthFeatureNoCard'),
          ui('onboardingAuthFeatureTrial'),
          ui('onboardingAuthFeatureInstantAccess'),
        ]}
        data-testid="AuthShell__fa3cd9">
        <div className="text-center" data-testid="invite-error-state">
          <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" data-testid="invite-error-icon" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('invitePageInvalidTitle')}
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-xl">
            {ui('invitePageInvalidDescription')}
          </p>
          <Button
            variant="outline"
            className="mt-6 h-12 w-full rounded-lg text-base font-medium"
            onClick={() => navigate('/login')}
            data-testid="action-error-sign-in"
          >
            {ui('invitePageSignIn')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!loading && !errorState && successData) {
    return (
      <AuthShell
        brandLabel="Etendo Go"
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={[
          ui('onboardingAuthFeatureNoCard'),
          ui('onboardingAuthFeatureTrial'),
          ui('onboardingAuthFeatureInstantAccess'),
        ]}
        data-testid="AuthShell__fa3cd9">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-status-success">
            <CheckCircle2 className="h-8 w-8 text-status-success-foreground" data-testid="invite-success-icon" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]" data-testid="invite-success-state">
            {successData.alreadyAccepted
              ? ui('invitePageAlreadyAcceptedTitle')
              : ui('invitePageSuccessTitle').replace('{companyName}', companyName)}
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-xl">
            {successData.alreadyAccepted
              ? ui('invitePageAlreadyAcceptedDescription').replace('{companyName}', companyName)
              : ui('invitePageSuccessDescription')}
          </p>
          <Button
            className="mt-6 h-12 w-full gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
            onClick={() => navigate('/')}
            data-testid="action-go-to-app"
          >
            <span>{ui('invitePageGoToApp')}</span>
            <ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" />
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!loading && !errorState && !successData && invitationData?.branch === 'existing_account' && existingAuthenticated) {
    return (
      <AuthShell
        brandLabel="Etendo Go"
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={[
          ui('onboardingAuthFeatureNoCard'),
          ui('onboardingAuthFeatureTrial'),
          ui('onboardingAuthFeatureInstantAccess'),
        ]}
        data-testid="AuthShell__fa3cd9">
        <div className="text-center" data-testid="invite-authenticated-step">
          {actionError && (
            <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" data-testid="invite-action-error">
              {actionError}
            </div>
          )}
          <p className="mb-3 text-base text-muted-foreground sm:text-xl">
            {ui('invitePageAuthenticatedNotice')}
          </p>
          <Button
            className="h-12 w-full gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
            onClick={handleAcceptExisting}
            disabled={submitting}
            data-testid="action-accept-invitation"
          >
            {submitting
              ? <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__fa3cd9" />
              : <><span>{ui('invitePageAcceptButton')}</span><ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" /></>}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" data-testid="Building2__fa3cd9" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            {companyName}
          </h2>
        </div>

        {/* State: Loading */}
        {loading && (
          <div
            className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 shadow-sm space-y-3"
            data-testid="invite-loading"
          >
            <Loader2
              className="h-8 w-8 animate-spin text-primary"
              data-testid="Loader2__fa3cd9" />
            <p className="text-sm text-muted-foreground">{ui('invitePageLoading')}</p>
          </div>
        )}

        {/* State: Error / Expired */}
        {!loading && errorState && (
          <div
            className="rounded-xl border border-destructive/30 bg-card p-8 shadow-sm text-center space-y-4"
            data-testid="invite-error-state"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" data-testid="AlertCircle__fa3cd9" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {ui('invitePageInvalidTitle')}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {ui('invitePageInvalidDescription')}
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/login')}
                data-testid="action-error-sign-in"
              >
                {ui('invitePageSignIn')}
              </Button>
            </div>
          </div>
        )}

        {/* State: Success */}
        {!loading && !errorState && successData && (
          <AuthShell
            brandLabel="Etendo Go"
            marketingTitle={ui('onboardingMarketingTitle')}
            marketingDescription={ui('onboardingMarketingDescription')}
            featureLabels={[
              ui('onboardingAuthFeatureNoCard'),
              ui('onboardingAuthFeatureTrial'),
              ui('onboardingAuthFeatureInstantAccess'),
            ]}
            data-testid="AuthShell__fa3cd9">
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-status-success">
                <CheckCircle2 className="h-8 w-8 text-status-success-foreground" data-testid="invite-success-icon" strokeWidth={3} />
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]" data-testid="invite-success-state">
                {successData.alreadyAccepted
                  ? ui('invitePageAlreadyAcceptedTitle')
                  : ui('invitePageSuccessTitle').replace('{companyName}', companyName)}
              </h1>
              <p className="mt-3 text-base text-muted-foreground sm:text-xl">
                {successData.alreadyAccepted
                  ? ui('invitePageAlreadyAcceptedDescription').replace('{companyName}', companyName)
                  : ui('invitePageSuccessDescription')}
              </p>
              <Button
                className="mt-6 h-12 w-full gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
                onClick={() => navigate('/')}
                data-testid="action-go-to-app"
              >
                <span>{ui('invitePageGoToApp')}</span>
                <ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" />
              </Button>
            </div>
          </AuthShell>
        )}

        {/* State: Existing Account Branch */}
        {!loading && !errorState && !successData && invitationData?.branch === 'existing_account' && (
          <div
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6"
            data-testid="invite-existing-account"
          >
            <div className="space-y-1 text-center">
              <h3 className="text-lg font-semibold text-foreground">
                {ui('invitePageExistingTitle')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {ui('invitePageExistingDescription').replace('{companyName}', companyName)}
              </p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Mail className="h-4 w-4 text-primary shrink-0" data-testid="Mail__fa3cd9" />
                <span>{invitationData.maskedEmail || invitationData.email}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {ui('invitePageExistingAccountNotice').replace(
                  '{email}',
                  invitationData.maskedEmail || invitationData.email
                )}
              </p>
            </div>

          {actionError && (
            <div
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="invite-action-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" data-testid="AlertCircle__fa3cd9" />
                <span>{actionError}</span>
              </div>
            )}

            {existingAuthenticated ? (
              <div className="space-y-3" data-testid="invite-authenticated-step">
                <p className="text-sm text-muted-foreground">{ui('invitePageAuthenticatedNotice')}</p>
                <Button className="w-full gap-2" onClick={handleAcceptExisting} disabled={submitting} data-testid="action-accept-invitation">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__fa3cd9" /> : <><span>{ui('invitePageAcceptButton')}</span><ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" /></>}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* State: Registration Required Branch */}
        {!loading && !errorState && !successData && invitationData?.branch === 'registration_required' && (
          <div
            className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6"
            data-testid="invite-new-account"
          >
            <div className="space-y-1 text-center">
              <h3 className="text-lg font-semibold text-foreground">
                {ui('invitePageNewAccountTitle').replace('{companyName}', companyName)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {ui('invitePageNewAccountDescription').replace('{companyName}', companyName)}
              </p>
            </div>

            {actionError && (
              <div
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="invite-action-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" data-testid="AlertCircle__fa3cd9" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterAndAccept} className="space-y-4" data-testid="invite-register-form">
              <div className="space-y-1.5">
                <Label htmlFor="reg-email" data-testid="Label__fa3cd9">{ui('inviteUserEmailLabel')}</Label>
                <div className="relative">
                  <Input
                    id="reg-email"
                    type="email"
                    value={invitationData.email}
                    disabled
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed pl-9"
                    data-testid="invite-email"
                  />
                  <Mail
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    data-testid="Mail__fa3cd9" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-name" data-testid="Label__fa3cd9">{ui('invitePageNameLabel')}</Label>
                <div className="relative">
                  <Input
                    id="reg-name"
                    type="text"
                    required
                    placeholder={ui('invitePageNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    className="pl-9"
                    data-testid="invite-name"
                  />
                  <User
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    data-testid="User__fa3cd9" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password" data-testid="Label__fa3cd9">{ui('invitePagePasswordLabel')}</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type="password"
                    required
                    placeholder={ui('invitePagePasswordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    className="pl-9"
                    data-testid="invite-password"
                  />
                  <Lock
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    data-testid="Lock__fa3cd9" />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 pt-2"
                disabled={submitting || !name.trim() || !password}
                data-testid="action-register-accept"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__fa3cd9" />
                    {ui('invitePageCreatingAccount')}
                  </>
                ) : (
                  <>
                    <span>{ui('invitePageRegisterAndAcceptButton')}</span>
                    <ArrowRight className="h-4 w-4" data-testid="ArrowRight__fa3cd9" />
                  </>
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
