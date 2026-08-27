import { useUI } from '@/i18n';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';

/**
 * ETP-4830 item #4 — visual "Owner" tag for the ONE `AD_User` per client flagged via
 * `EM_ETGO_Is_Owner` (see `com.etendoerp.go`'s `OwnerSupport`/`docs/neo-headless.md` §8d
 * "Owner protection"). Deliberately backend-enforcement-only until now (write-path guards already
 * existed — `UserRoleAssignmentHandler#rejectNonOwnerEditingOwner`,
 * `UserRoleCompositionService#enforceOwnerProtection`) — this is purely the read-side surfacing
 * the human asked for once the write-side protection already shipped.
 *
 * Extracted into its own file (mirroring `PendingInvitationPill.jsx`'s own precedent) so the
 * Users LIST GRID (`UserHeaderTable.jsx`) and the detail header's `TopbarExtra` share ONE
 * `isOwner` → visual-treatment mapping instead of two. Reuses `DocumentStatusPill`'s neutral tone
 * — the same gray pill `PendingInvitationPill`'s `EXPIRED` state uses — for visual consistency
 * with the rest of this window's tag family, rather than inventing a new badge style.
 *
 * `isOwner` comes straight off the `user` NeoHandler's GET response (list + single-record alike,
 * `UserRoleAssignmentHandler#attachOwnerFlag`) — always a boolean, never absent, so `false` (not
 * `null`/`undefined`) is the normal "not the owner" case.
 */
export default function OwnerBadge({ isOwner, 'data-testid': dataTestId = 'OwnerBadge' }) {
  const ui = useUI();
  if (!isOwner) {
    return null;
  }
  return (
    <DocumentStatusPill
      status="OWNER"
      tone="neutral"
      label={ui('ownerBadge')}
      data-testid={dataTestId} />
  );
}
