import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@generated/user/generated/web/user/UserPage', () => ({
  default: ({ newLabel, headerContent }) => (
    <div>
      <button>{newLabel}</button>
      {headerContent}
    </div>
  ),
}));

import UserWindow from '../index.jsx';

describe('UserWindow invitation entry point', () => {
  it('renders the invitation info banner and invite button', () => {
    render(<UserWindow />);

    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescriptionTitle',
    );
    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescription',
    );
    expect(screen.getByTestId('action-open-invite')).toBeInTheDocument();
  });

  it('opens the InviteUserDialog when clicking the invite button', () => {
    render(<UserWindow />);

    fireEvent.click(screen.getByTestId('action-open-invite'));
    expect(screen.getByTestId('invite-user-dialog')).toBeInTheDocument();
  });
});
