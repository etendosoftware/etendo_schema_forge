import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { fetchAccount } from '@etendosoftware/etendo-go-core/onboarding/api';
import {
  removeAuthMethod,
  resolveAuthMethodErrorKey,
  readPlatformToken,
  writePlatformToken,
} from '@/lib/authMethodsApi.js';
import { detectBaseUrl } from '@/components/copilot/copilotApi.js';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog.jsx';
import { SecuritySection } from '@/components/account/SecuritySection.jsx';
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // raw-fetch-ok: the platform account endpoints are reached through the core package's own
      // client, which takes the fetch implementation as an argument. Same call the onboarding flow
      // makes; the header policy lives in buildAuthHeaders there, not here.
      const account = await fetchAccount(fetch, detectBaseUrl(), readPlatformToken());
      // A response without authMethods is a failure, not an account with no methods. Treating it as
      // data made the section fall back to `{ enabled: false }` and state "no password set" for an
      // account that has one — a false claim about the account's security, and one that invites the
      // user to "add" a password they already have.
      if (!account?.authMethods) throw new Error('The account response carried no authMethods');
      setAuthMethods(account.authMethods);
      setLoadFailed(false);
    } catch {
      setAuthMethods(null);
      setLoadFailed(true);
      toast.error(ui('accountMethodsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = useCallback(async (method, currentPassword) => {
    setRemoving(method);
    try {
      // raw-fetch-ok: see the note in load().
      const result = await removeAuthMethod(
        fetch, detectBaseUrl(), readPlatformToken(), method, currentPassword
      );
      // The removal rotates the session token. Persist it before anything else: the old one is dead
      // from this moment, and losing it logs the user out silently on their next action.
      writePlatformToken(result?.token);
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

  // The loaded half of the body, named so the JSX below carries one ternary instead of two nested.
  // A failed load must not fall through to the section: with no authMethods it would render its
  // `{ enabled: false }` default and tell the user their account has no password.
  const loadedBody = loadFailed ? (
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

  return (
    <div className="mx-auto w-full max-w-3xl p-6" data-testid="account-settings-page">
      <h1 className="text-xl font-semibold">{ui('accountSettingsTitle')}</h1>

      <div className="mt-6 space-y-6">
        {loading
          ? <p className="text-sm text-muted-foreground">{ui('loading')}</p>
          : loadedBody}
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
