import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { changePassword, resolveAuthErrorMessage } from '@etendosoftware/etendo-go-core/onboarding/api';
import { isStrongPassword } from '@etendosoftware/etendo-go-core/onboarding/password-policy';
import { PasswordStrengthChecklist } from '@etendosoftware/etendo-go-core/onboarding/password-strength-checklist';
import { getSessionCsrfToken } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import { detectBaseUrl } from './copilot/copilotApi.js';

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Dialog that lets a signed-in user change their platform account password.
 *
 * On success the rotated session is intentionally discarded and
 * `onSuccess` is invoked so the caller can log the user out — they then sign
 * in again with the new password (the app routes unauthenticated users back to
 * the onboarding page automatically).
 */
export function ChangePasswordDialog({ open, onOpenChange, onSuccess, hasPassword = true }) {
  const ui = useUI();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // An account with no local password is ENROLLING one, not changing it. The server has always
  // supported that branch, but this dialog demanded the current password as a required field — a
  // password that does not exist — so the form could never be submitted and an SSO user had no way
  // to set one from settings at all. The mailed recovery link was the only route.
  const enrolling = !hasPassword;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    if (loading) return;
    setForm(EMPTY_FORM);
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirmPassword) {
      setError(ui('onboardingCredentialsMustMatch'));
      return;
    }
    setLoading(true);
    try {
      // Send no currentPassword at all when enrolling — the server reads it with optString and
      // skips verification precisely because there is nothing to verify.
      const payload = enrolling
        ? { newPassword: form.newPassword, confirmPassword: form.confirmPassword }
        : form;
      // ETP-5455: the third argument is the X-Go-CSRF proof of the cookie session, the only
      // credential the browser holds. It used to be localStorage['sf_platform_token'], which
      // nothing writes since ADR-0001, so every password change went out without CSRF (403).
      await changePassword(fetch, detectBaseUrl(), getSessionCsrfToken(), payload);
      // Rotated token is discarded on purpose: we sign the user out so they
      // re-authenticate with the new password.
      onSuccess?.();
    } catch (err) {
      // AUTH-07 / ETP-5022: `err.userMessage` is the backend's English developer text, so the
      // error is resolved from its code only. ETP-5258: an unmapped code no longer falls back to
      // that English text either — it gets the generic, translated failure.
      setError(resolveAuthErrorMessage(ui, err, 'onboardingCredentialChangeFailed'));
      setLoading(false);
    }
  };

  // Named rather than nested inside the submit button's loading ternary: two levels of ternary in
  // JSX is what Sonar flags, and the label is easier to read as its own line anyway.
  const submitLabel = enrolling
    ? ui('accountCreatePasswordAction')
    : ui('onboardingSavePasswordAction');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      data-testid="Dialog__c015d3">
      <DialogContent className="sm:max-w-md" data-testid="change-password-dialog">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader data-testid="DialogHeader__c015d3">
            <DialogTitle className="flex items-center gap-2" data-testid="DialogTitle__c015d3">
              <Lock className="h-4 w-4" data-testid="Lock__c015d3" />
              {enrolling ? ui('accountCreatePasswordTitle') : ui('onboardingChangePasswordTitle')}
            </DialogTitle>
            <DialogDescription data-testid="DialogDescription__c015d3">{enrolling ? ui('createPasswordLogoutNotice') : ui('changePasswordLogoutNotice')}</DialogDescription>
          </DialogHeader>

          {!enrolling && (
            <div className="space-y-2">
              <Label htmlFor="change-current-password" data-testid="Label__c015d3">{ui('onboardingCurrentPasswordLabel')}</Label>
              <Input
                id="change-current-password"
                type="password"
                required
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={setField('currentPassword')}
                disabled={loading}
                data-testid="Input__c015d3" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="change-new-password" data-testid="Label__c015d3">{ui('onboardingNewPasswordLabel')}</Label>
            <Input
              id="change-new-password"
              type="password"
              required
              autoComplete="new-password"
              value={form.newPassword}
              onChange={setField('newPassword')}
              disabled={loading}
              data-testid="Input__c015d3" />
          </div>
          <PasswordStrengthChecklist
            password={form.newPassword}
            testIdPrefix="change-password"
            className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm"
            data-testid="PasswordStrengthChecklist__c015d3" />
          <div className="space-y-2">
            <Label htmlFor="change-confirm-password" data-testid="Label__c015d3">{ui('onboardingConfirmPasswordLabel')}</Label>
            <Input
              id="change-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              disabled={loading}
              data-testid="Input__c015d3" />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2" data-testid="DialogFooter__c015d3">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={loading}
              data-testid="Button__c015d3">
              {ui('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={loading || !isStrongPassword(form.newPassword)}
              data-testid="change-password-submit">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" data-testid="Loader2__c015d3" />
                  {ui('onboardingSavingPassword')}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
