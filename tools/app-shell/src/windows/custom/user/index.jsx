import { useUI } from '@/i18n';
import GeneratedUserPage from '@generated/user/generated/web/user/UserPage';

function InvitationInfoBanner() {
  const ui = useUI();

  return (
    <div
      className="mx-2 mb-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground"
      data-testid="user-invitation-info"
    >
      <p className="font-medium">{ui('inviteUserDescriptionTitle')}</p>
      <p className="mt-1 text-muted-foreground">{ui('inviteUserDescription')}</p>
    </div>
  );
}

/**
 * Company user administration.
 *
 * Creating a user without a password sends a server-side password-setup invitation, so the
 * list action is intentionally labelled as an invitation instead of generic user creation.
 */
export default function UserWindow(props) {
  const ui = useUI();

  return (
    <GeneratedUserPage
      {...props}
      newLabel={ui('inviteUser')}
      headerContent={<InvitationInfoBanner />}
    />
  );
}
