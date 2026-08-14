import { useState } from 'react';
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';

/**
 * Dedicated email-only modal for inviting users to the company (ETP-4894).
 */
export function InviteUserDialog({ open, onOpenChange, onSuccess, apiBase = '' }) {
  const ui = useUI();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const reset = () => {
    setEmail('');
    setError(null);
    setSuccessData(null);
    setLoading(false);
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && loading) return;
    if (!nextOpen) {
      reset();
    }
    onOpenChange?.(nextOpen);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError(ui('inviteUserEmailLabel'));
      return;
    }

    setLoading(true);
    try {
      const token =
        globalThis.localStorage?.getItem('sf_auth_token') ||
        globalThis.localStorage?.getItem('sf_platform_token') ||
        '';

      const response = await fetch(`${apiBase}/sws/go/company-invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        const errorMsg =
          data.code === 'USER_ALREADY_MEMBER'
            ? ui('inviteUserAlreadyMember')
            : data.code === 'INVALID_EMAIL_FORMAT'
            ? ui('onboardingInvalidEmailFormat')
            : data.message || ui('invitePageInvalidDescription');
        setError(errorMsg);
        setLoading(false);
        return;
      }

      setSuccessData({
        email: trimmed,
        invitation: data.invitation || {},
      });
      setLoading(false);
      onSuccess?.(data);
    } catch (err) {
      setError(err.message || 'Error sending invitation');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="invite-user-dialog">
        {successData ? (
          <div className="space-y-4 py-2" data-testid="invite-user-success-view">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {ui('inviteUserSuccessTitle')}
              </DialogTitle>
              <DialogDescription>
                {ui('inviteUserSuccessMessage').replace('{email}', successData.email)}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ui('inviteUserEmailLabel')}:</span>
                <span className="font-medium text-foreground">{successData.email}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30" data-testid="invite-user-pending-status">
                  {ui('inviteUserPendingBadge')}
                </Badge>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                data-testid="invite-user-close-btn"
              >
                {ui('close') || 'Close'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="invite-user-form">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                {ui('inviteUserModalTitle')}
              </DialogTitle>
              <DialogDescription>
                {ui('inviteUserModalDescription')}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="invite-user-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="invite-email">{ui('inviteUserEmailLabel')}</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                placeholder={ui('inviteUserEmailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                data-testid="invite-user-email"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
                data-testid="invite-user-cancel"
              >
                {ui('cancel') || 'Cancel'}
              </Button>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                data-testid="invite-user-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {ui('inviteUserSending')}
                  </>
                ) : (
                  ui('inviteUserSubmit')
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export default InviteUserDialog;
