import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountRowMenu } from '../AccountRowMenu.jsx';

// countryIso ES on purpose: "Conectar banco" is Spain-only since ETP-4896
// (see saltEdgeEligibility.js), so a fixture without it would hide that item.
const baseAccount = { id: 'acc-1', name: 'BBVA', type: 'B', countryIso: 'ES' };

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

    // ETP-4896 Test Case 6 — Salt Edge is Spain-only. Hidden rather than disabled here: this menu
    // has no disabled-item styling and conditionally renders every other inapplicable action.
    it('hides connect for a non-Spanish account', () => {
      openMenu({ ...baseAccount, countryIso: 'IT', bankConnected: false });
      expect(screen.queryByTestId('account-row-menu-connect-acc-1')).toBeNull();
    });

    it('hides connect when the account country is unknown', () => {
      openMenu({ ...baseAccount, countryIso: '', bankConnected: false });
      expect(screen.queryByTestId('account-row-menu-connect-acc-1')).toBeNull();
    });

    it('still offers disconnect on a non-Spanish account that is already linked', () => {
      // The rule gates CONNECTING, not managing an existing link — an account connected before
      // the restriction existed must still be releasable.
      openMenu({ ...baseAccount, countryIso: 'IT', bankConnected: true });
      expect(screen.getByTestId('account-row-menu-delete-connection-acc-1')).toBeInTheDocument();
    });

    it('dispatches deleteConnection with the account', () => {
      const onBankConnectionAction = openMenu({ ...baseAccount, bankConnected: true });
      fireEvent.click(screen.getByTestId('account-row-menu-delete-connection-acc-1'));
      expect(onBankConnectionAction).toHaveBeenCalledWith(
        'deleteConnection', expect.objectContaining({ id: 'acc-1' }),
      );
    });
  });

  // ETP-4871 — a real, irreversible delete. Independent of Archivar/Desarchivar above: both
  // items can appear on the same still-active, deletable account.
  describe('delete item (ETP-4871)', () => {
    it('is offered when the account is deletable', async () => {
      render(<AccountRowMenu account={{ ...baseAccount, deletable: true }} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-delete-acc-1')).toBeInTheDocument();
    });

    // ETP-5111 inverted both of these. Hiding the item left the user unable to tell an account
    // that CANNOT be deleted from one where the action does not exist, so it is offered on every
    // row and the refusal is explained after confirming — the same rule the movements kebab and
    // the three bulk-delete trash buttons follow. `deletable` no longer gates the menu at all.
    it('is offered even when deletable is explicitly false', async () => {
      render(<AccountRowMenu account={{ ...baseAccount, deletable: false }} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-delete-acc-1')).toBeInTheDocument();
    });

    it('is offered when deletable is absent (most fixtures)', async () => {
      render(<AccountRowMenu account={baseAccount} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-delete-acc-1')).toBeInTheDocument();
    });

    it('calls onDelete for a non-deletable account, so the refusal can be explained', async () => {
      const onDelete = vi.fn();
      render(<AccountRowMenu account={{ ...baseAccount, deletable: false }} onDelete={onDelete} />);
      openMenu();
      (await screen.findByTestId('account-row-menu-delete-acc-1')).click();
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete.mock.calls[0][0]).toMatchObject({ id: 'acc-1', deletable: false });
    });

    it('is still offered alongside Archive on a deletable, still-active account', async () => {
      // Deleting and archiving are independent actions on this row (see AccountRowMenu.jsx's
      // doc comment) — neither one replaces the other while the account is active.
      render(<AccountRowMenu account={{ ...baseAccount, deletable: true }} />);
      openMenu();
      expect(await screen.findByTestId('account-row-menu-delete-acc-1')).toBeInTheDocument();
      expect(screen.getByTestId('account-row-menu-archive-acc-1')).toBeInTheDocument();
    });

    it('fires onDelete with the account on click', async () => {
      const onDelete = vi.fn();
      const deletable = { ...baseAccount, deletable: true };
      render(<AccountRowMenu account={deletable} onDelete={onDelete} />);
      openMenu();

      fireEvent.click(await screen.findByTestId('account-row-menu-delete-acc-1'));

      expect(onDelete).toHaveBeenCalledWith(deletable);
    });
  });
});

// ETP-5457 — the write items moved into `AccountRowMenuWriteItems`; these two click paths had
// no test at all, so the extraction could have dropped their handlers unnoticed. Full access.
describe('AccountRowMenu — write item click wiring under full access (ETP-5457)', () => {
  it('calls onEdit with the account when "Editar" is clicked (ETP-5457)', async () => {
    const onEdit = vi.fn();
    render(<AccountRowMenu account={baseAccount} onEdit={onEdit} windowReadOnly={false} />);
    openMenu();

    fireEvent.click(await screen.findByTestId('account-row-menu-edit-acc-1'));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(baseAccount);
  });

  it('dispatches reconnect with the account when "Reconectar" is clicked (ETP-5457)', async () => {
    const onBankConnectionAction = vi.fn();
    const softDisconnected = { ...baseAccount, bankConnected: false, bankReconnectable: true };
    render(
      <AccountRowMenu
        account={softDisconnected}
        onBankConnectionAction={onBankConnectionAction}
        windowReadOnly={false}
      />,
    );
    openMenu();

    fireEvent.click(await screen.findByTestId('account-row-menu-reconnect-acc-1'));

    expect(onBankConnectionAction).toHaveBeenCalledTimes(1);
    expect(onBankConnectionAction).toHaveBeenCalledWith('reconnect', softDisconnected);
  });
});

// ETP-5457 — the window's "read-only" access tier. "Abrir cuenta" is pure navigation and is the
// ONLY item kept; every other item writes. Each account shape below reaches a different subset of
// the write items under full access, so together they cover all eleven, and each read-only case
// is paired with its full-access twin on the same shape.
describe('AccountRowMenu — read-only access tier (ETP-5457)', () => {
  const WRITE_ITEMS = [
    'edit', 'new-movement', 'transfer', 'sync', 'disconnect', 'reconnect',
    'connect', 'delete-connection', 'archive', 'unarchive', 'delete',
  ];

  const SHAPES = [
    {
      label: 'bank-connected',
      account: { ...baseAccount, bankConnected: true },
      fullItems: ['edit', 'new-movement', 'transfer', 'sync', 'disconnect', 'delete-connection', 'archive', 'delete'],
    },
    {
      label: 'soft-disconnected',
      account: { ...baseAccount, bankConnected: false, bankReconnectable: true },
      fullItems: ['edit', 'new-movement', 'transfer', 'reconnect', 'delete-connection', 'archive', 'delete'],
    },
    {
      label: 'offline Spanish',
      account: { ...baseAccount, bankConnected: false },
      fullItems: ['edit', 'new-movement', 'transfer', 'connect', 'archive', 'delete'],
    },
    {
      label: 'archived',
      account: { ...baseAccount, active: false },
      fullItems: ['edit', 'new-movement', 'transfer', 'connect', 'unarchive', 'delete'],
    },
    {
      label: 'cash',
      account: { id: 'acc-1', name: 'Caja', type: 'C' },
      fullItems: ['edit', 'new-movement', 'transfer', 'archive', 'delete'],
    },
  ];

  describe.each(SHAPES)('$label account', ({ account, fullItems }) => {
    it('offers only "Abrir cuenta" under the read-only tier (ETP-5457)', async () => {
      render(<AccountRowMenu account={account} windowReadOnly />);
      openMenu();

      expect(await screen.findByTestId('account-row-menu-open-acc-1')).toBeInTheDocument();
      for (const item of WRITE_ITEMS) {
        expect(screen.queryByTestId(`account-row-menu-${item}-acc-1`), item).not.toBeInTheDocument();
      }
      expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    });

    it('offers "Abrir cuenta" plus its write items under full access (ETP-5457 twin)', async () => {
      render(<AccountRowMenu account={account} windowReadOnly={false} />);
      openMenu();

      expect(await screen.findByTestId('account-row-menu-open-acc-1')).toBeInTheDocument();
      for (const item of fullItems) {
        expect(screen.getByTestId(`account-row-menu-${item}-acc-1`), item).toBeInTheDocument();
      }
      expect(screen.getAllByRole('menuitem')).toHaveLength(1 + fullItems.length);
    });
  });

  it('defaults windowReadOnly to false, keeping the write items for other callers (ETP-5457)', async () => {
    render(<AccountRowMenu account={baseAccount} />);
    openMenu();

    expect(await screen.findByTestId('account-row-menu-edit-acc-1')).toBeInTheDocument();
  });

  it('still routes "Abrir cuenta" to onOpen under the read-only tier (ETP-5457)', async () => {
    const onOpen = vi.fn();
    render(<AccountRowMenu account={baseAccount} onOpen={onOpen} windowReadOnly />);
    openMenu();

    fireEvent.click(await screen.findByTestId('account-row-menu-open-acc-1'));

    expect(onOpen).toHaveBeenCalledWith(baseAccount);
  });

  it('routes "Abrir cuenta" to onOpen under full access too (ETP-5457 twin)', async () => {
    const onOpen = vi.fn();
    render(<AccountRowMenu account={baseAccount} onOpen={onOpen} windowReadOnly={false} />);
    openMenu();

    fireEvent.click(await screen.findByTestId('account-row-menu-open-acc-1'));

    expect(onOpen).toHaveBeenCalledWith(baseAccount);
  });

  it('never invokes a write callback under the read-only tier (ETP-5457)', async () => {
    const writes = {
      onEdit: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(),
      onBankConnectionAction: vi.fn(), onTransfer: vi.fn(), onNewMovement: vi.fn(),
    };
    render(<AccountRowMenu account={{ ...baseAccount, bankConnected: true }} {...writes} windowReadOnly />);
    openMenu();

    // The single item on offer is navigation; clicking it reaches none of the writes.
    fireEvent.click(await screen.findByTestId('account-row-menu-open-acc-1'));

    for (const [name, fn] of Object.entries(writes)) {
      expect(fn, name).not.toHaveBeenCalled();
    }
  });
});
