import { render, screen } from '@testing-library/react';

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
  it('labels creation as an invitation and explains password setup', () => {
    render(<UserWindow />);

    expect(screen.getByRole('button', { name: 'inviteUser' })).toBeInTheDocument();
    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescriptionTitle',
    );
    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescription',
    );
  });
});
