import { useUI } from '@/i18n';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';

/**
 * ETP-4830 — the ONE place that maps `invitationStatus` to a visual treatment.
 *
 * Extracted out of `windows/custom/user/index.jsx` (where it originated, as the
 * detail-form toolbar's `topbarExtra` pill) so the Users LIST GRID
 * (`UserHeaderTable.jsx`) can render the exact same pill per row, without a second,
 * possibly-diverging copy of the state→style mapping. Both call sites pass the raw
 * `invitationStatus` value directly as `status` — the detail header reads it off
 * `data?.invitationStatus` (the loaded/just-saved record) and the grid reads it off
 * `row?.invitationStatus` (every `user` GET list-row response already carries this
 * field — confirmed backend contract, see `docs/generated-custom-windows/user.md`
 * → "Invite-on-create flow (ETP-4830)"); this component itself is deliberately
 * data-shape-agnostic (`status` in, pill or `null` out) so it doesn't care which
 * caller it is.
 *
 * `PENDING` is only a transient pre-send state within the request that creates the
 * invitation — the persisted status after a successful send is `SENT`, so both render
 * the same amber pill (an invite is outstanding either way). `DELIVERY_FAILED` gets its
 * own red pill so the admin notices the email never went out. `EXPIRED` gets a neutral
 * (gray) pill (ETP-4830 item #2/#3) — this is a genuinely reachable value now that
 * `CompanyInvitationService#findLatestInvitationStatus` computes it live from
 * `expiresAt` rather than relying on a stored column nothing ever wrote (see that
 * method's own javadoc); it also gives the new "Resend invitation" button (rendered
 * next to this pill, see `index.jsx`'s `TopbarExtra`) something to sit beside instead
 * of floating with no status indicator. `ACCEPTED` gets its own green/success pill
 * (ETP-4999 — a blank cell for an accepted invitation reads as "no invitation was
 * ever sent", misleading for a user who already accepted theirs). `REVOKED`, `null`,
 * and any unrecognized string still render nothing — there is genuinely no
 * outstanding/relevant invitation state to show in those cases.
 *
 * Purely reactive to `status` — no local state or polling. In the grid, this means a
 * row updates the next time its data reloads (same as every other cell); in the
 * detail header, it means the pill disappears once the backend flips `invitationStatus`
 * to a terminal state (e.g. once the invitee accepts).
 */
export default function PendingInvitationPill({ status, 'data-testid': dataTestId = 'PendingInvitationPill' }) {
  const ui = useUI();
  if (status === 'PENDING' || status === 'SENT') {
    return (
      <DocumentStatusPill
        status={status}
        tone="warning"
        label={ui('pendingInvitationBadge')}
        data-testid={dataTestId} />
    );
  }
  if (status === 'DELIVERY_FAILED') {
    return (
      <DocumentStatusPill
        status={status}
        tone="destructive"
        label={ui('invitationDeliveryFailedBadge')}
        data-testid={dataTestId} />
    );
  }
  if (status === 'EXPIRED') {
    return (
      <DocumentStatusPill
        status={status}
        tone="neutral"
        label={ui('invitationExpiredBadge')}
        data-testid={dataTestId} />
    );
  }
  if (status === 'ACCEPTED') {
    return (
      <DocumentStatusPill
        status={status}
        tone="success"
        label={ui('invitationAcceptedBadge')}
        data-testid={dataTestId} />
    );
  }
  return null;
}
