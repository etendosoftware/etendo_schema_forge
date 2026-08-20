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
 * own red pill so the admin notices the email never went out. Every other value
 * (`ACCEPTED`, `EXPIRED`, `REVOKED`, `null`, or any unrecognized string) renders
 * nothing — a blank cell in the grid, nothing in the toolbar.
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
  return null;
}
