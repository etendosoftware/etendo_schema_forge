import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountsSyncedJustNow: 'Sincronizado',
      financeAccountsSyncPending: 'Sincronización pendiente',
      financeAccountsConnectBank: 'Conectar banco',
    };
    return map[key] ?? key;
  },
}));

import { SyncStatusInline } from '../SyncStatusInline.jsx';

describe('SyncStatusInline', () => {
  it('returns null for cash accounts', () => {
    const { container } = render(<SyncStatusInline account={{ type: 'C' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no account is provided', () => {
    const { container } = render(<SyncStatusInline account={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the pending warning when bankConnectionPending is true', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnectionPending: true }} />);
    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });

  it('renders the green "Sincronizado" pill when bankConnected is true', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true }} />);
    expect(screen.getByText('Sincronizado')).toBeInTheDocument();
  });

  it('renders the "Conectar banco" link by default for bank accounts', () => {
    render(<SyncStatusInline account={{ type: 'B', countryIso: 'ES' }} />);
    expect(screen.getByText('Conectar banco')).toBeInTheDocument();
  });

  it('renders the "Conectar banco" link by default for card accounts', () => {
    render(<SyncStatusInline account={{ type: 'CA', countryIso: 'ES' }} />);
    expect(screen.getByText('Conectar banco')).toBeInTheDocument();
  });

  // ETP-4896 — Salt Edge is contracted for Spain only, so the inline connect affordance is not
  // offered at all outside ES. This cell has nowhere to explain a disabled state, so it hides.
  it('renders no connect link for a non-Spanish account', () => {
    const { container } = render(<SyncStatusInline account={{ type: 'B', countryIso: 'IT' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders no connect link when the country is unknown (pre-ETP-4896 rows)', () => {
    const { container } = render(<SyncStatusInline account={{ type: 'B' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('still reports a live connection for a non-Spanish account (the rule only gates connecting)', () => {
    // An account linked before the restriction existed keeps showing its real state — the rule
    // governs the connect ACTION, it does not pretend an existing connection is gone.
    render(<SyncStatusInline account={{ type: 'B', countryIso: 'IT', bankConnected: true }} />);
    expect(screen.getByText('Sincronizado')).toBeInTheDocument();
  });
});

// ETP-5457 — the window's "read-only" access tier. Connecting a bank is a write, so the inline
// "Conectar banco" CTA is not rendered; the status lines (synced / pending) are read-only
// information and stay. Every read-only case has a full-access twin.
describe('SyncStatusInline — read-only access tier (ETP-5457)', () => {
  const OFFLINE_ES = { id: 'acc-9', type: 'B', countryIso: 'ES' };

  it('renders no "Conectar banco" CTA under the read-only tier (ETP-5457)', () => {
    const { container } = render(<SyncStatusInline account={OFFLINE_ES} onConnect={vi.fn()} windowReadOnly />);

    expect(screen.queryByTestId('account-sync-connect-acc-9')).not.toBeInTheDocument();
    expect(screen.queryByText('Conectar banco')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Conectar banco" CTA and wires onConnect under full access (ETP-5457 twin)', () => {
    const onConnect = vi.fn();
    render(<SyncStatusInline account={OFFLINE_ES} onConnect={onConnect} windowReadOnly={false} />);

    fireEvent.click(screen.getByTestId('account-sync-connect-acc-9'));

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('hides the CTA for a card account under the read-only tier too (ETP-5457)', () => {
    render(<SyncStatusInline account={{ ...OFFLINE_ES, type: 'CA' }} windowReadOnly />);

    expect(screen.queryByText('Conectar banco')).not.toBeInTheDocument();
  });

  it('still reports a live connection under the read-only tier (ETP-5457)', () => {
    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnected: true }} windowReadOnly />);

    expect(screen.getByText('Sincronizado')).toBeInTheDocument();
  });

  it('still reports a pending connection under the read-only tier (ETP-5457)', () => {
    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnectionPending: true }} windowReadOnly />);

    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });

  it('reports the same live / pending states under full access (ETP-5457 twin)', () => {
    const { unmount } = render(
      <SyncStatusInline account={{ ...OFFLINE_ES, bankConnected: true }} windowReadOnly={false} />,
    );
    expect(screen.getByText('Sincronizado')).toBeInTheDocument();
    unmount();

    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnectionPending: true }} windowReadOnly={false} />);
    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });
});
