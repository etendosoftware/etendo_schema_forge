/**
 * Tests for `OwnerBadge.jsx` — ETP-4830 item #4. This is the ONE comprehensive suite for the
 * `isOwner` → visual-treatment mapping; both consuming call sites
 * (`windows/custom/user/index.jsx`'s detail-toolbar `TopbarExtra`, covered in `index.vitest.jsx`,
 * and `UserHeaderTable.jsx`'s grid column, covered in `UserHeaderTable.vitest.jsx`) only need
 * light smoke coverage of their own wiring — the exhaustive state matrix lives here, mirroring
 * `PendingInvitationPill.vitest.jsx`'s own convention.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // The real (unmocked) `DocumentStatusPill` also imports `useLocale`; its own `label` is
  // always explicit here, so `dictionary` is never actually read down `statusLabel`'s fallback
  // path — stubbed only so the import doesn't crash.
  useLocale: () => ({}),
}));

import OwnerBadge from '../OwnerBadge.jsx';

describe('OwnerBadge', () => {
  it('renders a neutral (gray) pill with the owner label when isOwner is true', () => {
    render(<OwnerBadge isOwner />);
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('ownerBadge');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
    expect(pill).toHaveAttribute('data-status', 'OWNER');
  });

  it('renders nothing when isOwner is false (the normal case)', () => {
    const { container } = render(<OwnerBadge isOwner={false} />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when isOwner is undefined (field absent / pre-ETP-4830 response shape)', () => {
    const { container } = render(<OwnerBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when isOwner is null', () => {
    const { container } = render(<OwnerBadge isOwner={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
