import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountDetailKpiBalance: 'Saldo total',
      financeAccountDetailKpiInflows: 'Entradas',
      financeAccountDetailKpiOutflows: 'Salidas',
      financeAccountDetailIbanCopied: 'IBAN copiado',
    };
    return map[key] ?? key;
  },
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args) => toastSuccess(...args) },
}));

// Stub AccountLogoAvatar so its dependency tree (icons) doesn't matter
vi.mock('@/components/financial-accounts/AccountLogoAvatar', () => ({
  AccountLogoAvatar: () => <div data-testid="avatar" />,
}));

import { AccountSummaryStrip } from '../AccountSummaryStrip.jsx';

const TOTALS = { balance: 1000, inflows: 500, outflows: -200, currency: 'EUR' };

describe('AccountSummaryStrip', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
  });

  it('renders skeletons when loading=true', () => {
    const { container } = render(
      <AccountSummaryStrip account={null} totals={TOTALS} loading={true} />,
    );
    // No KPI labels rendered while loading
    expect(screen.queryByText('Saldo total')).not.toBeInTheDocument();
    // Skeletons appear (animate-pulse class from Skeleton)
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders the three KPI labels and the IBAN row when not loading', () => {
    render(
      <AccountSummaryStrip
        account={{ iban: 'ES7012341234123412341234', name: 'BBVA' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByText('Saldo total')).toBeInTheDocument();
    expect(screen.getByText('Entradas')).toBeInTheDocument();
    expect(screen.getByText('Salidas')).toBeInTheDocument();
    expect(screen.getByText('IBAN')).toBeInTheDocument();
  });

  it('formats the IBAN into 4-character groups', () => {
    render(
      <AccountSummaryStrip
        account={{ iban: 'ES7012341234123412341234' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByText('ES70 1234 1234 1234 1234 1234')).toBeInTheDocument();
  });

  it('strips inner whitespace from the IBAN before chunking', () => {
    render(
      <AccountSummaryStrip
        account={{ iban: 'ES70 1234 1234 1234' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByText('ES70 1234 1234 1234')).toBeInTheDocument();
  });

  it('renders an em dash when the account has no IBAN, and hides the copy button', () => {
    render(
      <AccountSummaryStrip
        account={{ name: 'Cash' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy IBAN')).not.toBeInTheDocument();
  });

  it('renders the copy button when the IBAN is present', () => {
    render(
      <AccountSummaryStrip
        account={{ iban: 'ES7000000000000000000000' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByTestId('iban-copy-button')).toBeInTheDocument();
  });

  it('hides the IBAN block for a cash account but still renders the three KPIs', () => {
    render(
      <AccountSummaryStrip
        account={{ type: 'C', iban: null, name: 'Caja' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.queryByTestId('iban-text')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-balance')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-inflows')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-outflows')).toBeInTheDocument();
  });

  it('shows the IBAN field with an em dash for a bank account without IBAN, and hides the copy button', () => {
    render(
      <AccountSummaryStrip
        account={{ type: 'B', iban: null, name: 'BBVA' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    const ibanText = screen.getByTestId('iban-text');
    expect(ibanText).toBeInTheDocument();
    expect(ibanText).toHaveTextContent('—');
    expect(screen.queryByTestId('iban-copy-button')).not.toBeInTheDocument();
  });

  it('shows the formatted IBAN and the copy button for a bank account with IBAN', () => {
    render(
      <AccountSummaryStrip
        account={{ type: 'B', iban: 'ES7012341234123412341234', name: 'BBVA' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByTestId('iban-text')).toHaveTextContent(
      'ES70 1234 1234 1234 1234 1234',
    );
    expect(screen.getByTestId('iban-copy-button')).toBeInTheDocument();
  });

  it('shows the masked card number (not an IBAN) for a card account, with no copy button', () => {
    render(
      <AccountSummaryStrip
        account={{ type: 'CA', iban: null, maskedPan: '**** **** **** 1234', name: 'Tarjeta' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.getByTestId('iban-text')).toHaveTextContent('**** **** **** 1234');
    // The label is the card-number key, not "IBAN", and there is no copy button.
    expect(screen.getByText('financeAccountDetailCardNumber')).toBeInTheDocument();
    expect(screen.queryByTestId('iban-copy-button')).not.toBeInTheDocument();
  });

  it('hides the identifier block for a card account without a masked PAN', () => {
    render(
      <AccountSummaryStrip
        account={{ type: 'CA', iban: null, maskedPan: '', name: 'Tarjeta' }}
        totals={TOTALS}
        loading={false}
      />,
    );
    expect(screen.queryByTestId('iban-text')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-balance')).toBeInTheDocument();
  });

  it('copies the IBAN to the clipboard and toasts on success', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <AccountSummaryStrip
        account={{ iban: 'ES7012341234123412341234' }}
        totals={TOTALS}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByTestId('iban-copy-button'));
    expect(writeText).toHaveBeenCalledWith('ES7012341234123412341234');

    // Wait for the .then() microtask
    await Promise.resolve();
    expect(toastSuccess).toHaveBeenCalledWith('IBAN copiado');
  });
});
