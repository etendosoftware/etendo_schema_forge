// @vitest-environment jsdom
// @covers tools/app-shell/src/components/access/SessionConflictNotice.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionConflictNotice } from '../SessionConflictNotice.jsx';

// The shared body of the invitation page's and the app's session-conflict screens: which action is
// the filled one, that the warning sits under the destructive action, and that `busy` locks both.

function renderNotice(props = {}) {
  const onPrimary = vi.fn();
  const onSecondary = vi.fn();
  render(
    <SessionConflictNotice
      title="Another session is open"
      description="c@example.test signed in on this browser"
      primaryLabel="Continue as c@example.test"
      onPrimary={onPrimary}
      primaryTestId="notice-primary"
      secondaryLabel="Sign out of this browser and sign in again"
      onSecondary={onSecondary}
      secondaryTestId="notice-secondary"
      warning="Every tab of this browser will be signed out."
      {...props}
    />,
  );
  return { onPrimary, onSecondary };
}

const actionOrder = () => screen.getAllByRole('button').map((b) => b.dataset.testid);

describe('SessionConflictNotice (ETP-5675)', () => {
  it('renders the title and description under its test id', () => {
    renderNotice();

    expect(screen.getByTestId('session-conflict')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Another session is open' })).toBeInTheDocument();
    expect(screen.getByText('c@example.test signed in on this browser')).toBeInTheDocument();
  });

  it('fills the primary action and puts it first by default', () => {
    renderNotice();

    expect(actionOrder()).toEqual(['notice-primary', 'notice-secondary']);
    expect(screen.getByTestId('session-conflict-primary-arrow')).toBeInTheDocument();
    expect(screen.queryByTestId('notice-secondary-arrow')).not.toBeInTheDocument();
  });

  it('fills the secondary action and puts it first with emphasis="secondary"', () => {
    renderNotice({ emphasis: 'secondary' });

    expect(actionOrder()).toEqual(['notice-secondary', 'notice-primary']);
    expect(screen.getByTestId('notice-secondary-arrow')).toBeInTheDocument();
    expect(screen.queryByTestId('session-conflict-primary-arrow')).not.toBeInTheDocument();
  });

  it.each(['primary', 'secondary'])('shows the warning right after the destructive action (emphasis=%s)', (emphasis) => {
    renderNotice({ emphasis });

    const warning = screen.getByText('Every tab of this browser will be signed out.');
    expect(screen.getByTestId('notice-secondary').nextElementSibling).toBe(warning);
  });

  it('renders only the primary action, and no warning, without a secondary label', () => {
    renderNotice({ secondaryLabel: undefined });

    expect(actionOrder()).toEqual(['notice-primary']);
    expect(screen.queryByText('Every tab of this browser will be signed out.')).not.toBeInTheDocument();
  });

  it('calls each handler from its own action', async () => {
    const user = userEvent.setup();
    const { onPrimary, onSecondary } = renderNotice();

    await user.click(screen.getByTestId('notice-primary'));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('notice-secondary'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while busy', async () => {
    const user = userEvent.setup();
    const { onPrimary, onSecondary } = renderNotice({ busy: true });

    expect(screen.getByTestId('notice-primary')).toBeDisabled();
    expect(screen.getByTestId('notice-secondary')).toBeDisabled();
    await user.click(screen.getByTestId('notice-primary'));
    await user.click(screen.getByTestId('notice-secondary'));
    expect(onPrimary).not.toHaveBeenCalled();
    expect(onSecondary).not.toHaveBeenCalled();
  });

  // Account emails make these labels long; a Button is `whitespace-nowrap` by default.
  it('lets long labels wrap inside the buttons', () => {
    renderNotice();

    for (const id of ['notice-primary', 'notice-secondary']) {
      expect(screen.getByTestId(id)).toHaveClass('whitespace-normal', 'break-words');
    }
  });
});
