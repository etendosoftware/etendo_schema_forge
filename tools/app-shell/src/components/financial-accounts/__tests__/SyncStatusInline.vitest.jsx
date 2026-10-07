// @covers tools/app-shell/src/components/financial-accounts/SyncStatusInline.jsx
// @covers tools/app-shell/src/components/financial-accounts/LastSyncLabel.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
  useUI: () => (key, params = {}) => {
    const map = {
      financeAccountsSyncedAgo: `Sincronizado ${params.time}`,
      financeAccountsNeverSynced: 'Nunca sincronizada',
      financeAccountsSyncPending: 'Sincronización pendiente',
      financeAccountsConnectBank: 'Conectar banco',
    };
    return map[key] ?? key;
  },
}));

import { SyncStatusInline } from '../SyncStatusInline.jsx';

const NOW = new Date('2026-10-06T12:00:00Z').getTime();
const SIXTY_SECONDS_AGO = '2026-10-06T11:59:00Z';
const SYNCED_1_MIN = 'Sincronizado hace 1 minuto';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

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

  it('renders "Sincronizado hace X" when bankConnected is true', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} />);
    expect(screen.getByText(SYNCED_1_MIN)).toBeInTheDocument();
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
    render(<SyncStatusInline account={{ type: 'B', countryIso: 'IT', bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} />);
    expect(screen.getByText(SYNCED_1_MIN)).toBeInTheDocument();
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
    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} windowReadOnly />);

    expect(screen.getByText(SYNCED_1_MIN)).toBeInTheDocument();
  });

  it('still reports a pending connection under the read-only tier (ETP-5457)', () => {
    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnectionPending: true }} windowReadOnly />);

    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });

  it('reports the same live / pending states under full access (ETP-5457 twin)', () => {
    const { unmount } = render(
      <SyncStatusInline account={{ ...OFFLINE_ES, bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} windowReadOnly={false} />,
    );
    expect(screen.getByText(SYNCED_1_MIN)).toBeInTheDocument();
    unmount();

    render(<SyncStatusInline account={{ ...OFFLINE_ES, bankConnectionPending: true }} windowReadOnly={false} />);
    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });
});

// ETP-5582 — last sync label for connected accounts.
describe('SyncStatusInline — last sync label', () => {
  it('shows "Nunca sincronizada" for a connected account whose lastSyncDate is null', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: null }} />);

    expect(screen.getByTestId('last-sync-label')).toHaveTextContent('Nunca sincronizada');
    expect(screen.queryByText(/Sincronizado hace/)).not.toBeInTheDocument();
  });

  it('shows nothing for a non-connected account even when it has a lastSyncDate', () => {
    const { container } = render(
      <SyncStatusInline account={{ type: 'B', countryIso: 'IT', lastSyncDate: SIXTY_SECONDS_AGO }} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows nothing for a cash account even when flagged connected', () => {
    const { container } = render(
      <SyncStatusInline account={{ type: 'C', bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('expresses hours and days in the relative text', () => {
    const { unmount } = render(
      <SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: '2026-10-06T09:00:00Z' }} />,
    );
    expect(screen.getByTestId('last-sync-label')).toHaveTextContent('Sincronizado hace 3 horas');
    unmount();

    render(<SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: '2026-10-03T12:00:00Z' }} />);
    expect(screen.getByTestId('last-sync-label')).toHaveTextContent('Sincronizado hace 3 días');
  });

  it('shows the absolute dd/mm/aaaa hh:mm date in the tooltip on hover', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} />);

    await user.hover(screen.getByTestId('last-sync-label'));

    const expected = new Date(SIXTY_SECONDS_AGO);
    const pad = (n) => String(n).padStart(2, '0');
    const text = `${pad(expected.getDate())}/${pad(expected.getMonth() + 1)}/${expected.getFullYear()} ${pad(expected.getHours())}:${pad(expected.getMinutes())}`;
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });
});

// ETP-5582 — tone of the connected line: green only when there is a last sync date.
describe('SyncStatusInline — never-synced tone', () => {
  const lineOf = () => screen.getByTestId('last-sync-label').parentElement;
  const dotOf = () => lineOf().firstElementChild;

  it('renders a gray dot and gray text for a connected account without lastSyncDate', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true }} />);

    expect(screen.getByTestId('last-sync-label')).toHaveTextContent('Nunca sincronizada');
    expect(lineOf().className).toContain('text-[hsl(var(--muted-foreground))]');
    expect(lineOf().className).not.toContain('--status-success-fg');
    expect(dotOf().className).toContain('bg-[hsl(var(--muted-foreground))]');
    expect(dotOf().className).not.toContain('--status-success-fg');
  });

  it('keeps the green dot and text when the connected account has a lastSyncDate', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnected: true, lastSyncDate: SIXTY_SECONDS_AGO }} />);

    expect(lineOf().className).toContain('text-[var(--status-success-fg)]');
    expect(lineOf().className).not.toContain('muted-foreground');
    expect(dotOf().className).toContain('bg-[var(--status-success-fg)]');
  });

  it('does not render the connected line for the pending branch (no gray never-synced text)', () => {
    render(<SyncStatusInline account={{ type: 'B', bankConnectionPending: true }} />);

    expect(screen.queryByTestId('last-sync-label')).not.toBeInTheDocument();
    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });
});

