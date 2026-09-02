import { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The ways an account can be signed in with, and the controls to change them (ETP-5115).
 *
 * Everything on screen is drawn from the `authMethods` object the server puts in /me. Nothing about
 * which methods exist, or which may be removed, is decided here: a remove control is enabled only
 * when the server listed that method in `removable`, and the server checks the rule again when the
 * removal is actually requested. Recomputing it in the browser would put the invariant that keeps
 * an account reachable in the one place that cannot enforce it — two tabs would each see one method
 * left and both would let the user through.
 */
export function SecuritySection({ authMethods, onChangePassword, onRemove, removing }) {
  const ui = useUI();
  const [confirming, setConfirming] = useState(null);
  // Removing the password is the one case the server asks to be re-authenticated for, so the
  // confirmation has to collect it. Without this the button was unusable: `removeAuthMethod`
  // omits `currentPassword`, and the servlet answers 400 CHANGE_PASSWORD_MISSING_CREDENTIALS every
  // single time. Removing an SSO identity asks for nothing — the password is not what proves you
  // own that one.
  const [currentPassword, setCurrentPassword] = useState('');
  const needsPassword = confirming === 'password';

  const closeConfirm = () => { setConfirming(null); setCurrentPassword(''); };

  const password = authMethods?.password || { enabled: false };
  const identities = authMethods?.identities || [];
  const removable = new Set(authMethods?.removable || []);

  const formatDate = (iso) => {
    if (!iso) return null;
    // Business dates go through parseCalendarDate; these are timestamps, and only ever displayed,
    // so toLocaleDateString on the parsed instant is correct and carries no day-shift risk.
    return new Date(iso).toLocaleDateString();
  };

  const renderRow = (key, icon, title, subtitle, detail, actions) => (
    <div
      key={key}
      className="flex items-start justify-between gap-4 border-b last:border-b-0 py-4"
      data-testid={`auth-method-row-${key}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );

  const removeButton = (method) => {
    const allowed = removable.has(method);
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!allowed || removing === method}
        onClick={() => { setConfirming(method); setCurrentPassword(''); }}
        // The tooltip is the whole reason the sole method is still drawn instead of hidden: the
        // user has to be able to see the method exists and understand why it cannot go yet.
        title={allowed ? undefined : ui('accountMethodRemoveLastTooltip')}
        data-testid={`auth-method-remove-${method}`}
      >
        {removing === method
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__20cc4d" />
          : <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__20cc4d" />}
        <span className="ml-1.5">{ui('accountMethodRemove')}</span>
      </Button>
    );
  };

  return (
    <Card data-testid="account-security-section">
      <CardContent className="pt-6" data-testid="CardContent__20cc4d">
        <h2 className="text-base font-semibold">{ui('accountSettingsSecurity')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{ui('accountSettingsSecurityIntro')}</p>

        <div className="mt-4">
          {renderRow(
            'password',
            <KeyRound className="h-4 w-4" data-testid="KeyRound__20cc4d" />,
            ui('accountMethodPassword'),
            password.enabled
              ? ui('accountMethodPasswordEnabled')
              : ui('accountMethodPasswordDisabled'),
            password.lastChanged
              ? ui('accountMethodLastChanged').replace('{0}', formatDate(password.lastChanged))
              : null,
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onChangePassword}
                data-testid="auth-method-change-password"
              >
                {password.enabled ? ui('accountMethodChange') : ui('accountMethodCreate')}
              </Button>
              {password.enabled && removeButton('password')}
            </>
          )}

          {identities.map((identity) =>
            renderRow(
              identity.provider,
              <ShieldCheck className="h-4 w-4" data-testid="ShieldCheck__20cc4d" />,
              identity.provider,
              identity.email,
              identity.lastLogin
                ? ui('accountMethodLastLogin').replace('{0}', formatDate(identity.lastLogin))
                : null,
              removeButton(identity.provider)
            )
          )}
        </div>

        {confirming && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3"
               data-testid="auth-method-remove-confirm">
            <p className="text-sm font-medium">{ui('accountMethodRemoveConfirmTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ui('accountMethodRemoveConfirmBody')}
            </p>
            {needsPassword && (
              <div className="mt-3 space-y-1.5">
                <Label
                  htmlFor="auth-method-remove-current-password"
                  className="text-xs"
                  data-testid="Label__20cc4d">
                  {ui('onboardingCurrentPasswordLabel')}
                </Label>
                <Input
                  id="auth-method-remove-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  data-testid="auth-method-remove-current-password" />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                // Guarding on an empty field keeps the user from spending a request to be told the
                // field they were never shown is missing. The server still decides: it re-checks
                // both the password and the last-method rule inside the transaction.
                disabled={needsPassword && !currentPassword}
                onClick={() => {
                  const m = confirming;
                  const pwd = currentPassword;
                  closeConfirm();
                  onRemove(m, pwd);
                }}
                data-testid="auth-method-remove-confirm-yes"
              >
                {ui('accountMethodRemove')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={closeConfirm}
                      data-testid="auth-method-remove-confirm-no">
                {ui('cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SecuritySection;
