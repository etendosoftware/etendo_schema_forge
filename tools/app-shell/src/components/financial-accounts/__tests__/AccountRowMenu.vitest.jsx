import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountRowMenu } from '../AccountRowMenu.jsx';

const baseAccount = { id: 'acc-1', name: 'BBVA', type: 'B' };

describe('AccountRowMenu', () => {
  it('renders the trigger button keyed by the row id', () => {
    render(<AccountRowMenu account={baseAccount} />);
    expect(screen.getByTestId('account-row-menu-trigger-acc-1')).toBeInTheDocument();
  });

  it('uses the round-icon-button treatment on the trigger', () => {
    render(<AccountRowMenu account={baseAccount} />);
    const trigger = screen.getByTestId('account-row-menu-trigger-acc-1');
    expect(trigger.className).toMatch(/rounded-full/);
    expect(trigger.className).toMatch(/text-\[hsl\(var\(--text-disabled\)\)\]/);
  });

  it('renders an aria-label on the trigger for accessibility', () => {
    render(<AccountRowMenu account={baseAccount} />);
    const trigger = screen.getByTestId('account-row-menu-trigger-acc-1');
    expect(trigger).toHaveAttribute('aria-label');
  });

  it('passes the account id through to the data-testid', () => {
    render(<AccountRowMenu account={{ ...baseAccount, id: 'other-id' }} />);
    expect(screen.getByTestId('account-row-menu-trigger-other-id')).toBeInTheDocument();
  });

  it('accepts an onOpen callback without crashing', () => {
    const onOpen = vi.fn();
    expect(() =>
      render(<AccountRowMenu account={baseAccount} onOpen={onOpen} />),
    ).not.toThrow();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
