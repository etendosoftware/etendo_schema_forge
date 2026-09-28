import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { fetchAccount } from '@etendosoftware/etendo-go-core/onboarding/api';
import {
  removeAuthMethod,
  resolveAuthMethodErrorKey,
} from '@/lib/authMethodsApi.js';
import { detectBaseUrl } from '@/components/copilot/copilotApi.js';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog.jsx';
import { SecuritySection } from '@/components/account/SecuritySection.jsx';
import { SubscriptionSection } from '@/components/account/SubscriptionSection.jsx';
import { useLogout } from '@/auth/useLogout.js';

/**
 * Account settings (ETP-5115).
 *
 * A route rather than a dialog: sections keep arriving, a security email can link straight at it,
 * and — the practical one — the password form is already a dialog, which a page can host and a
 * dialog cannot.
 */
export default function AccountSettingsPage() {
  const ui = useUI();
  const logout = useLogout();
  const [authMethods, setAuthMethods] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  // ETP-5455 — a 401 from either request on this page. It is a state of the session, not of a
  // section, so it replaces the whole page rather than one card: nothing here is down, Retry can
  // never succeed, and signing in again is the only thing that helps. Setting it twice (the account
  // read and billing are refused together) is idempotent, so the user sees one state, not two.
  const [sessionExpired, setSessionExpired] = useState(false);
  const markSessionExpired = useCallback(() => setSessionExpired(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // raw-fetch-ok: reached through the core package's own client, which takes the fetch
      // implementation as an argument. `fetchAccount` sends `credentials: 'include'`, so the
      // `__Host-` session travels on its own; it is a GET, which needs no CSRF proof.
      const account = await fetchAccount(fetch, detectBaseUrl());
      // A response without authMethods is a failure, not an account with no methods. Treating it as
      // data made the section fall back to `{ enabled: false }` and state "no password set" for an
      // account that has one — a false claim about the account's security, and one that invites the
      // user to "add" a password they already have.
      if (!account?.authMethods) throw new Error('The account response carried no authMethods');
      setAuthMethods(account.authMethods);
      setLoadFailed(false);
    } catch (err) {
      setAuthMethods(null);
      // The core client stamps the HTTP status on the error. A 401 is not a load failure: the
      // toast and the Retry block would both say the methods "could not be loaded", which is false.
      if (err?.status === 401) {
        markSessionExpired();
        return;
      }
      setLoadFailed(true);
      toast.error(ui('accountMethodsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [ui, markSessionExpired]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = useCallback(async (method, currentPassword) => {
    setRemoving(method);
    try {
      const result = await removeAuthMethod(method, currentPassword, detectBaseUrl());
      // The server sends back the account's remaining methods, so the screen redraws from the
      // authority rather than from a guess about what the removal did.
      setAuthMethods(result?.authMethods || null);
      toast.success(ui('accountMethodRemoved'));
    } catch (err) {
      // Resolve the server's code through the dictionary first. Preferring `userMessage` would show
      // the backend's English sentence to a Spanish user, which is exactly the defect ETP-5022 fixed
      // for the change-password codes; it stays only as the fallback for an unmapped code.
      const uiKey = resolveAuthMethodErrorKey(err?.code);
      toast.error(
        (uiKey && ui(uiKey)) || err?.userMessage || ui('accountMethodRemoveFailed')
      );
    } finally {
      setRemoving(null);
    }
  }, [ui]);

  // Changing the password still signs the user out: the server rotates the session and the old
  // token stops working, so staying on the page would only produce a confusing 401 on the next
  // action. Whether that is still wanted now the action lives among several is an open question.
  const handlePasswordChanged = () => {
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    localStorage.setItem('sf_onboarding_notice', 'password-changed');
    logout();
  };

  // Signing out is what lands the user on the login view; the session it clears is already dead
  // server-side, so this cannot loop back into another 401. Never done automatically: the user
  // reads why before being taken away from the page they asked for.
  const handleSignInAgain = () => {
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    logout();
  };

  // The loaded half of the SECURITY body only, named so the JSX below carries one ternary
  // instead of two nested. A failed load must not fall through to the section: with no
  // authMethods it would render its `{ enabled: false }` default and tell the user their
  // account has no password.
  //
  // Deliberately scoped to SecuritySection alone (ETP-5443 REVIEW N5): SubscriptionSection reads
  // its own data over its own independent request and must not be gated behind this page's
  // authMethods load — the two blocks share nothing, and a Stripe/account outage having nothing
  // to do with authMethods should never also hide the security section, nor should an
  // authMethods failure hide subscription. See the render below for how it stays positioned
  // right after SecuritySection regardless of which of the three states this ternary is in.
  const securityBody = loadFailed ? (
    <div className="space-y-3" data-testid="account-settings-load-error">
      <p className="text-sm text-muted-foreground">{ui('accountMethodsLoadFailed')}</p>
      <Button variant="outline" size="sm" onClick={load} data-testid="account-settings-retry">
        {ui('retry')}
      </Button>
    </div>
  ) : (
    <SecuritySection
      authMethods={authMethods}
      removing={removing}
      onRemove={handleRemove}
      onChangePassword={() => setChangePasswordOpen(true)}
      data-testid="SecuritySection__account" />
  );

  if (sessionExpired) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6" data-testid="account-settings-page">
        <h1 className="text-xl font-semibold">{ui('accountSettingsTitle')}</h1>
        <div className="mt-6 space-y-3" role="alert" data-testid="account-settings-session-expired">
          <p className="text-sm text-muted-foreground">{ui('accountSessionExpired')}</p>
          <Button size="sm" onClick={handleSignInAgain} data-testid="account-settings-sign-in-again">
            {ui('accountSignInAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6" data-testid="account-settings-page">
      <h1 className="text-xl font-semibold">{ui('accountSettingsTitle')}</h1>

      <div className="mt-6 space-y-6">
        {loading
          ? <p className="text-sm text-muted-foreground">{ui('loading')}</p>
          : securityBody}

        <SubscriptionSection
          apiBaseUrl={detectBaseUrl()}
          onSessionExpired={markSessionExpired}
          data-testid="SubscriptionSection__account" />
      </div>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onSuccess={handlePasswordChanged}
        hasPassword={!!authMethods?.password?.enabled}
        data-testid="ChangePasswordDialog__account" />
    </div>
  );
}
