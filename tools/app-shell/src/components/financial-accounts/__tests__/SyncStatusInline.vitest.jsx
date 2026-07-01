import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountsSyncedJustNow: 'Sincronizado',
      financeAccountsSyncPending: 'Sincronización pendiente',
      financeAccountsConnectPsd2: 'Conectar PSD2',
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

  it('renders the pending warning when psd2Pending is true', () => {
    render(<SyncStatusInline account={{ type: 'B', psd2Pending: true }} />);
    expect(screen.getByText('Sincronización pendiente')).toBeInTheDocument();
  });

  it('renders the green "Sincronizado" pill when psd2Connected is true', () => {
    render(<SyncStatusInline account={{ type: 'B', psd2Connected: true }} />);
    expect(screen.getByText('Sincronizado')).toBeInTheDocument();
  });

  it('renders the "Conectar PSD2" link by default for bank accounts', () => {
    render(<SyncStatusInline account={{ type: 'B' }} />);
    expect(screen.getByText('Conectar PSD2')).toBeInTheDocument();
  });

  it('renders the "Conectar PSD2" link by default for card accounts', () => {
    render(<SyncStatusInline account={{ type: 'CA' }} />);
    expect(screen.getByText('Conectar PSD2')).toBeInTheDocument();
  });
});
