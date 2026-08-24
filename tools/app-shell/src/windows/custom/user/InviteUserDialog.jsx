import { useState } from 'react';
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { writeHeaders } from '@/lib/sessionHeaders.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';

function invitationErrorMessage(ui, code, message) {
  const messages = {
    USER_ALREADY_MEMBER: 'inviteUserAlreadyMember',
    INVITED_USER_NOT_FOUND: 'inviteUserNotFound',
    INVITED_USER_NO_ROLE: 'inviteUserNoRole',
    INVALID_EMAIL_FORMAT: 'onboardingInvalidEmailFormat',
  };
  return messages[code] ? ui(messages[code]) : message || ui('invitePageInvalidDescription');
}

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
      // ETP-4576 — writeHeaders(), not a localStorage read. This is a POST, so
      // it needs the write proof: under `cookie` the request carries `X-Go-CSRF`
      // and the browser attaches the session, and it used to carry NEITHER —
      // the hand-built bearer came from a key nothing writes any more, so the
      // header was simply absent and the invitation 401'd or 403'd.
      const response = await fetch(`${apiBase}/sws/go/company-invitations`, {
        method: 'POST',
        credentials: 'include',
        headers: writeHeaders(),
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        setError(invitationErrorMessage(ui, data.code, data.message));
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
      setError(err.message || ui('invitePageInvalidDescription'));
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} data-testid="Dialog__fdd5a3">
      <DialogContent className="sm:max-w-md" data-testid="invite-user-dialog">
        {successData ? (
          <div className="space-y-4 py-2" data-testid="invite-user-success-view">
            <DialogHeader data-testid="DialogHeader__fdd5a3">
              <DialogTitle
                className="flex items-center gap-2 text-primary"
                data-testid="DialogTitle__fdd5a3">
                <CheckCircle2
                  className="h-5 w-5 text-status-success-foreground"
                  data-testid="CheckCircle2__fdd5a3" />
                {ui('inviteUserSuccessTitle')}
              </DialogTitle>
              <DialogDescription data-testid="DialogDescription__fdd5a3">
                {ui('inviteUserSuccessMessage').replace('{email}', successData.email)}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ui('inviteUserEmailLabel')}:</span>
                <span className="font-medium text-foreground">{successData.email}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ui('inviteUserStatusLabel')}:</span>
                <Badge variant="outline" className="border-status-warning-border bg-status-warning/10 text-status-warning-foreground" data-testid="invite-user-pending-status">
                  {ui('inviteUserPendingBadge')}
                </Badge>
              </div>
            </div>

            <DialogFooter className="pt-2" data-testid="DialogFooter__fdd5a3">
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
            <DialogHeader data-testid="DialogHeader__fdd5a3">
              <DialogTitle className="flex items-center gap-2" data-testid="DialogTitle__fdd5a3">
                <Mail className="h-5 w-5 text-primary" data-testid="Mail__fdd5a3" />
                {ui('inviteUserModalTitle')}
              </DialogTitle>
              <DialogDescription data-testid="DialogDescription__fdd5a3">
                {ui('inviteUserModalDescription')}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="invite-user-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" data-testid="AlertCircle__fdd5a3" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="invite-email" data-testid="Label__fdd5a3">{ui('inviteUserEmailLabel')}</Label>
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

            <DialogFooter className="gap-2 pt-2 sm:gap-0" data-testid="DialogFooter__fdd5a3">
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" data-testid="Loader2__fdd5a3" />
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
