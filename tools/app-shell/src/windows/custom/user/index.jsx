import { useState } from 'react';
import { Mail, UserPlus } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import GeneratedUserPage from '@generated/user/generated/web/user/UserPage';
import { InviteUserDialog } from './InviteUserDialog.jsx';

function InvitationInfoBanner({ onOpenInvite }) {
  const ui = useUI();

  return (
    <div
      className="mx-2 mb-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center text-foreground"
      data-testid="user-invitation-info"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <Mail className="h-4 w-4 text-primary" />
          <span>{ui('inviteUserDescriptionTitle')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {ui('inviteUserDescription')}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onOpenInvite}
        className="shrink-0 gap-2"
        data-testid="action-open-invite"
      >
        <UserPlus className="h-4 w-4" />
        {ui('inviteUser')}
      </Button>
    </div>
  );
}

/**
 * Company user administration.
 *
 * Provides a dedicated email-only invitation flow (ETP-4894) with pending confirmation.
 */
export default function UserWindow(props) {
  const ui = useUI();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <GeneratedUserPage
        {...props}
        newLabel={ui('inviteUser')}
        headerContent={
          <InvitationInfoBanner onOpenInvite={() => setInviteOpen(true)} />
        }
      />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </>
  );
}
