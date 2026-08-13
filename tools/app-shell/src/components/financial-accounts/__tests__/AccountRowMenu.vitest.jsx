import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountRowMenu } from '../AccountRowMenu.jsx';

const baseAccount = { id: 'acc-1', name: 'BBVA', type: 'B' };

/** Radix opens on pointerdown, not click. */
function openMenu(id = 'acc-1') {
  fireEvent.pointerDown(
    screen.getByTestId(`account-row-menu-trigger-${id}`),
    { button: 0, ctrlKey: false, pointerType: 'mouse' },
  );
}

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

  // ── Archive / unarchive swap ────────────────────────────────────────────────
  describe('archive vs unarchive item', () => {
    it('offers Archive on an active account', async () => {
      render(<AccountRowMenu account={baseAccount} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-archive-acc-1')).toBeInTheDocument();
      expect(screen.queryByTestId('account-row-menu-unarchive-acc-1')).not.toBeInTheDocument();
    });

    it('offers Unarchive instead once the account is archived', async () => {
      // Before this, an archived account's only action was to archive it again — no way back.
      render(<AccountRowMenu account={{ ...baseAccount, active: false }} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-unarchive-acc-1')).toBeInTheDocument();
      expect(screen.queryByTestId('account-row-menu-archive-acc-1')).not.toBeInTheDocument();
    });

    it('routes both directions through the same onArchive callback', async () => {
      const onArchive = vi.fn();
      const archived = { ...baseAccount, active: false };
      render(<AccountRowMenu account={archived} onArchive={onArchive} />);
      openMenu();

      fireEvent.click(await screen.findByTestId('account-row-menu-unarchive-acc-1'));

      // The dialog derives the direction from the record, so one callback serves both.
      expect(onArchive).toHaveBeenCalledWith(archived);
    });

    it('keeps Archive for an account whose active flag is absent', async () => {
      // Most fixtures omit `active`; only an explicit false means archived.
      const { active, ...noFlag } = { ...baseAccount, active: undefined };
      render(<AccountRowMenu account={noFlag} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-archive-acc-1')).toBeInTheDocument();
    });
  });

  // The bank-connection group is a three-way choice, not a connected/not-connected toggle:
  // an account can also be soft-disconnected — deactivated but still linked (ETP-4764).
  describe('bank connection group', () => {
    function openMenu(account) {
      const onBankConnectionAction = vi.fn();
      render(<AccountRowMenu account={account} onBankConnectionAction={onBankConnectionAction} />);
      // Radix's DropdownMenuTrigger opens on pointerDown, not click.
      fireEvent.pointerDown(
        screen.getByTestId(`account-row-menu-trigger-${account.id}`),
        { button: 0, ctrlKey: false, pointerType: 'mouse' },
      );
      return onBankConnectionAction;
    }

    it('offers disconnect and permanent deletion while connected', () => {
      openMenu({ ...baseAccount, bankConnected: true });
      expect(screen.getByTestId('account-row-menu-disconnect-acc-1')).toBeInTheDocument();
      expect(screen.getByTestId('account-row-menu-delete-connection-acc-1')).toBeInTheDocument();
      expect(screen.queryByTestId('account-row-menu-connect-acc-1')).toBeNull();
    });

    it('offers reconnect instead of connect once soft-disconnected', () => {
      openMenu({ ...baseAccount, bankConnected: false, bankReconnectable: true });
      expect(screen.getByTestId('account-row-menu-reconnect-acc-1')).toBeInTheDocument();
      // Connecting from scratch would orphan the surviving connection.
      expect(screen.queryByTestId('account-row-menu-connect-acc-1')).toBeNull();
      // The link still exists, so it can still be released for good.
      expect(screen.getByTestId('account-row-menu-delete-connection-acc-1')).toBeInTheDocument();
    });

    it('offers only connect when there is no bank link at all', () => {
      openMenu({ ...baseAccount, bankConnected: false });
      expect(screen.getByTestId('account-row-menu-connect-acc-1')).toBeInTheDocument();
      expect(screen.queryByTestId('account-row-menu-reconnect-acc-1')).toBeNull();
      expect(screen.queryByTestId('account-row-menu-delete-connection-acc-1')).toBeNull();
    });

    it('dispatches deleteConnection with the account', () => {
      const onBankConnectionAction = openMenu({ ...baseAccount, bankConnected: true });
      fireEvent.click(screen.getByTestId('account-row-menu-delete-connection-acc-1'));
      expect(onBankConnectionAction).toHaveBeenCalledWith(
        'deleteConnection', expect.objectContaining({ id: 'acc-1' }),
      );
    });
  });
});
