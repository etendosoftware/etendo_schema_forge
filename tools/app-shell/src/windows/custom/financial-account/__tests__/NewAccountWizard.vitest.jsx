import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Return a STABLE translator reference: NewAccountWizard's effect depends on
// `ui`, so a fresh function each render would re-fire the effect and reset the
// wizard back to the type-picker step.
const translate = (key) => key;
vi.mock('@/i18n', () => ({
  useUI: () => translate,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
  },
}));

const createAccount = vi.fn();
const fetchDefaults = vi.fn();
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({ createAccount, fetchDefaults }),
}));

// usePsd2Actions calls useAuth internally. The BankPicker fetches the Salt Edge
// catalog via fetchProviders; returning [] makes it fall back to the static
// bank catalog (searchBanks), which is what these tests assert against.
const fetchProviders = vi.fn();
vi.mock('@/hooks/usePsd2Actions', () => ({
  usePsd2Actions: () => ({ fetchProviders, connect: vi.fn() }),
}));

import { NewAccountWizard } from '../NewAccountWizard.jsx';

const DEFAULTS = {
  currencies: [{ id: '102', iso: 'EUR' }],
  defaultCurrencyId: '102',
};

function renderWizard(props = {}) {
  return render(
    <NewAccountWizard open onClose={vi.fn()} onCreated={vi.fn()} {...props} />,
  );
}

describe('NewAccountWizard', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    createAccount.mockReset();
    fetchDefaults.mockReset();
    fetchProviders.mockReset();
    // Empty catalog → BankPicker falls back to the static bank list.
    fetchProviders.mockResolvedValue([]);
    fetchDefaults.mockResolvedValue(DEFAULTS);
    createAccount.mockResolvedValue({ id: 'acc-new', name: 'BBVA' });
  });

  it('opens on the type picker step', () => {
    renderWizard();
    expect(screen.getByTestId('new-account-type-B')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-type-C')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-type-CA')).toBeInTheDocument();
  });

  it('walks Bank → connection → bank picker → institution → form', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-B'));
    // connection options visible
    expect(screen.getByTestId('account-connection-options')).toBeInTheDocument();

    // picking "Sin conexión" advances to the bank picker
    await user.click(screen.getByTestId('account-connection-offline'));
    expect(screen.getByTestId('new-account-bank-search')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-bank-santander')).toBeInTheDocument();

    // picking a bank shows the institution list
    await user.click(screen.getByTestId('new-account-bank-santander'));
    expect(screen.getByTestId('new-account-institution-santander-default')).toBeInTheDocument();

    // proceeding lands on the form
    await user.click(screen.getByTestId('new-account-institution-santander-default'));
    expect(screen.getByTestId('account-form')).toBeInTheDocument();
  });

  it('filters banks via the search box', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByTestId('new-account-type-B'));
    await user.click(screen.getByTestId('account-connection-offline'));

    await user.type(screen.getByTestId('new-account-bank-search'), 'bbva');
    expect(screen.getByTestId('new-account-bank-bbva')).toBeInTheDocument();
    expect(screen.queryByTestId('new-account-bank-santander')).not.toBeInTheDocument();
  });

  it('takes the back button one step back', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-B'));
    expect(screen.getByTestId('account-connection-options')).toBeInTheDocument();

    await user.click(screen.getByTestId('new-account-back'));
    // back to the type picker
    expect(screen.getByTestId('new-account-type-B')).toBeInTheDocument();
    expect(screen.queryByTestId('account-connection-options')).not.toBeInTheDocument();
  });

  it('goes straight to the cash form when Caja is picked', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-C'));
    expect(screen.getByTestId('account-form')).toBeInTheDocument();
    // cash form hides IBAN
    expect(screen.queryByTestId('account-form-iban')).not.toBeInTheDocument();
  });

  it('walks Card → connection → bank skip → form (Name + Currency, no IBAN)', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-CA'));
    // Card reuses the bank flow: connection step first.
    expect(screen.getByTestId('account-connection-options')).toBeInTheDocument();

    await user.click(screen.getByTestId('account-connection-offline'));
    expect(screen.getByTestId('new-account-bank-search')).toBeInTheDocument();

    // Skipping the bank lands on the card form, which has no IBAN/BIC.
    await user.click(screen.getByTestId('new-account-bank-skip'));
    expect(screen.getByTestId('account-form')).toBeInTheDocument();
    expect(screen.queryByTestId('account-form-iban')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-form-bic')).not.toBeInTheDocument();
  });

  it('creates a Card account with type=CA on submit', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-CA'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());
    await user.click(screen.getByTestId('account-connection-offline'));
    await user.click(screen.getByTestId('new-account-bank-skip'));

    await user.type(screen.getByTestId('account-form-name'), 'Visa Oro');
    await user.click(screen.getByTestId('account-form-submit'));

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0]).toMatchObject({
      name: 'Visa Oro',
      type: 'CA',
      currencyId: '102',
    });
  });

  it('creates the account on submit and calls onCreated + onClose', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderWizard({ onCreated, onClose });

    // navigate to the cash form (simplest path to the form)
    await user.click(screen.getByTestId('new-account-type-C'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());

    await user.type(screen.getByTestId('account-form-name'), 'Caja');
    await user.click(screen.getByTestId('account-form-submit'));

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0]).toMatchObject({
      name: 'Caja',
      type: 'C',
      currencyId: '102',
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountsNewCreateSuccess');
  });

  it('shows the inline name-exists error when create rejects with 409', async () => {
    const user = userEvent.setup();
    const err = new Error('duplicate');
    err.status = 409;
    createAccount.mockRejectedValueOnce(err);
    const onCreated = vi.fn();
    renderWizard({ onCreated });

    await user.click(screen.getByTestId('new-account-type-C'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());

    await user.type(screen.getByTestId('account-form-name'), 'Caja');
    await user.click(screen.getByTestId('account-form-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('account-form-error')).toHaveTextContent(
        'financeAccountsNewNameExists',
      ),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('toasts an error for a non-409 create failure', async () => {
    const user = userEvent.setup();
    const err = new Error('server down');
    err.status = 500;
    createAccount.mockRejectedValueOnce(err);
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-C'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());

    await user.type(screen.getByTestId('account-form-name'), 'Caja');
    await user.click(screen.getByTestId('account-form-submit'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('server down'));
  });
});
