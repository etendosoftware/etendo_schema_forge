import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Building2, AlertCircle, Loader2, Lock, User, Mail, ArrowRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell, LoginStep, RegisterStep } from '@etendosoftware/etendo-go-core/onboarding';

/**
 * Public Company Invitation Acceptance Page (ETP-4894).
 *
 * Dedicated acceptance flow outside OnboardingFlow. Supports:
 * 1. Existing Etendo Go account login, invitation return, and authenticated acceptance.
 * 2. New platform account registration locked to the invitation email, followed by acceptance.
 * 3. Idempotent accepted confirmation.
 * 4. Safe non-enumerating error states for expired/revoked/invalid tokens.
 */
export default function InviteAcceptancePage({ apiBase = import.meta.env.VITE_API_BASE || '' }) {
  const ui = useUI();
  const navigate = useNavigate();
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
        const res = await fetch(
          `${apiBase}/sws/go/company-invitations/resolve?token=${encodeURIComponent(token.trim())}`
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
  }, [token, apiBase]);

  const handleExistingAuthenticated = async () => {
    setActionError(null);
    setExistingAuthenticated(true);
  };

  const handleAcceptExisting = async () => {
    setActionError(null);
    setSubmitting(true);
    try {
      const sessionToken = globalThis.localStorage?.getItem('sf_platform_token') || '';
      const res = await fetch(`${apiBase}/sws/go/company-invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
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
      const res = await fetch(`${apiBase}/sws/go/company-invitations/register-and-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${apiBase}/sws/go/company-invitations/register-and-accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      >
        <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="invite-loading">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-base text-muted-foreground">{ui('invitePageLoading')}</p>
        </div>
      </AuthShell>
    );
  }

  // Reuse the canonical Etendo Go authentication surface for existing accounts.
  // The invitation page resumes after LoginStep calls onAuthenticated; it never
  // starts the company onboarding flow.
  if (!loading && !errorState && !successData && invitationData?.branch === 'existing_account' && !existingAuthenticated) {
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
        />
      </div>
    );
  }

  if (!loading && !errorState && !successData && invitationData?.branch === 'registration_required') {
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
        />
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
      >
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
      >
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
            <ArrowRight className="h-4 w-4" />
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
      >
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
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <><span>{ui('invitePageAcceptButton')}</span><ArrowRight className="h-4 w-4" /></>}
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
            <Building2 className="h-6 w-6" />
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
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
              <AlertCircle className="h-6 w-6" />
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
          >
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
                <ArrowRight className="h-4 w-4" />
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
                <Mail className="h-4 w-4 text-primary shrink-0" />
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
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {existingAuthenticated ? (
              <div className="space-y-3" data-testid="invite-authenticated-step">
                <p className="text-sm text-muted-foreground">{ui('invitePageAuthenticatedNotice')}</p>
                <Button className="w-full gap-2" onClick={handleAcceptExisting} disabled={submitting} data-testid="action-accept-invitation">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>{ui('invitePageAcceptButton')}</span><ArrowRight className="h-4 w-4" /></>}
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
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterAndAccept} className="space-y-4" data-testid="invite-register-form">
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">{ui('inviteUserEmailLabel')}</Label>
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
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-name">{ui('invitePageNameLabel')}</Label>
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
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password">{ui('invitePagePasswordLabel')}</Label>
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
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {ui('invitePageCreatingAccount')}
                  </>
                ) : (
                  <>
                    <span>{ui('invitePageRegisterAndAcceptButton')}</span>
                    <ArrowRight className="h-4 w-4" />
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
