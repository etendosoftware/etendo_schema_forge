import { render, screen } from '@testing-library/react';

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
