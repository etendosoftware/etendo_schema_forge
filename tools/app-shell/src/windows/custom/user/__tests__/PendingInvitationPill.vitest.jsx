/**
 * Tests for `PendingInvitationPill.jsx` — ETP-4830 scope addition. This is the ONE
 * comprehensive suite for the `invitationStatus` → visual-treatment mapping; both
 * consuming call sites (`windows/custom/user/index.jsx`'s detail-toolbar
 * `TopbarExtra`, covered in `index.vitest.jsx`, and `UserHeaderTable.jsx`'s grid
 * column, covered in `UserHeaderTable.vitest.jsx`) only need light smoke coverage of
 * their own wiring (that they pass the right `status` through and place the result
 * where expected) — the exhaustive state matrix lives here, once, by construction:
 * there is exactly one file that renders a `DocumentStatusPill` for this field, and
 * this is its test.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // The real (unmocked) `DocumentStatusPill` also imports `useLocale`; its own
  // `label` is always explicit here, so `dictionary` is never actually read down
  // `statusLabel`'s fallback path — stubbed only so the import doesn't crash.
  useLocale: () => ({}),
}));

import PendingInvitationPill from '../PendingInvitationPill.jsx';

describe('PendingInvitationPill', () => {
  it.each(['PENDING', 'SENT'])('renders an amber pill with the pending-invitation label for status %s', (status) => {
    render(<PendingInvitationPill status={status} />);
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('pendingInvitationBadge');
    expect(pill).toHaveAttribute('data-tone', 'warning');
    expect(pill).toHaveAttribute('data-status', status);
  });

  it('renders a red pill with the delivery-failed label for DELIVERY_FAILED', () => {
    render(<PendingInvitationPill status="DELIVERY_FAILED" />);
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationDeliveryFailedBadge');
    expect(pill).toHaveAttribute('data-tone', 'destructive');
    expect(pill).toHaveAttribute('data-status', 'DELIVERY_FAILED');
  });

  it('renders a neutral (gray) pill with the expired label for EXPIRED (ETP-4830 item #2/#3 — a genuinely reachable value now that findLatestInvitationStatus computes it live)', () => {
    render(<PendingInvitationPill status="EXPIRED" />);
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationExpiredBadge');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
    expect(pill).toHaveAttribute('data-status', 'EXPIRED');
  });

  it('renders a green (success) pill with the accepted-invitation label for ACCEPTED (ETP-4999 — a blank cell for an accepted invitation misleadingly read as "no invitation was ever sent")', () => {
    render(<PendingInvitationPill status="ACCEPTED" />);
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationAcceptedBadge');
    expect(pill).toHaveAttribute('data-tone', 'success');
    expect(pill).toHaveAttribute('data-status', 'ACCEPTED');
  });

  it('renders nothing (null) for terminal status REVOKED', () => {
    const { container } = render(<PendingInvitationPill status="REVOKED" />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a null status', () => {
    const { container } = render(<PendingInvitationPill status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when status is undefined (no prop passed / field absent on the record)', () => {
    const { container } = render(<PendingInvitationPill />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unrecognized/unknown status string, without crashing', () => {
    const { container } = render(<PendingInvitationPill status="SOME_FUTURE_STATUS" />);
    expect(container).toBeEmptyDOMElement();
  });
});
