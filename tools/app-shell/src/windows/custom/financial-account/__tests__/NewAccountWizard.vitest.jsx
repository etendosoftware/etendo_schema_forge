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

// NewAccountWizard reads the token directly (ETP-4896) to pass down to AccountFormStep's
// CreatableSearchSelect for the Country field.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// useBankConnectionActions calls useAuth internally. The BankPicker fetches the Salt Edge
// catalog via fetchProviders; returning [] makes it fall back to the static
// bank catalog (searchBanks), which is what these tests assert against.
const fetchProviders = vi.fn();
vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ fetchProviders, connect: vi.fn() }),
}));

// Radix dropdown — passthrough wrappers so the BankPicker's country menu items render
// immediately, same convention as MovementRowKebab.vitest.jsx.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, 'data-testid': dtid, ...rest }) => (
    <button type="button" role="menuitem" onClick={onClick} data-testid={dtid} {...rest}>
      {children}
    </button>
  ),
}));

import { NewAccountWizard } from '../NewAccountWizard.jsx';

// ES/IT mirror the two BANK_COUNTRIES codes exercised below; both carry real IBAN metadata so
// the seeded-country path (BankPicker choice → AccountFormStep default) exercises real ids.
const DEFAULTS = {
  currencies: [{ id: '102', iso: 'EUR' }],
  defaultCurrencyId: '102',
  defaultCountryId: '106',
  countryIbanRules: [
    { id: '106', iso: 'ES', name: 'Spain', ibanPrefix: 'ES', ibanLength: 24 },
    { id: '107', iso: 'IT', name: 'Italy', ibanPrefix: 'IT', ibanLength: 27 },
  ],
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
      countryId: '106',
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
      countryId: '106',
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

  it('shows Spain as a label, not a country selector', async () => {
    // Only Spain is supported, so the picker used to put a ten-country dropdown in front of every
    // user for a choice that had one valid answer. The flag stays visible as a label; the dropdown
    // returns on its own if BANK_COUNTRIES ever holds more than one entry.
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-B'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());
    await user.click(screen.getByTestId('account-connection-offline'));

    const country = screen.getByTestId('new-account-bank-country');
    expect(country).toBeInTheDocument();
    // Not a button, so there is nothing to open.
    expect(country.tagName).not.toBe('BUTTON');
    await user.click(country);
    expect(screen.queryByTestId('new-account-bank-country-ES')).not.toBeInTheDocument();
  });

  it('seeds the form country from the BankPicker choice (ETP-4896, Flujo A)', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-B'));
    await waitFor(() => expect(fetchDefaults).toHaveBeenCalled());
    await user.click(screen.getByTestId('account-connection-offline'));

    // The BankPicker offers Spain only, so its country is not chosen but taken as given, and the
    // flag renders as a label rather than a dropdown.
    expect(screen.getByTestId('new-account-bank-country')).toBeInTheDocument();
    expect(screen.queryByTestId('new-account-bank-country-IT')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('new-account-bank-skip'));

    await user.type(screen.getByTestId('account-form-name'), 'Cuenta española');
    await user.type(screen.getByTestId('account-form-iban'), 'ES9121000418450200051332');
    await user.click(screen.getByTestId('account-form-submit'));

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    // '106' is Spain in countryIbanRules — seeded from the BankPicker, not left unset.
    expect(createAccount.mock.calls[0][0]).toMatchObject({ countryId: '106' });
  });

  it('does not lose progress when the country catalog resolves after the form is already open', async () => {
    const user = userEvent.setup();
    let resolveDefaults;
    fetchDefaults.mockReset();
    fetchDefaults.mockReturnValue(new Promise((resolve) => { resolveDefaults = resolve; }));
    renderWizard();

    await user.click(screen.getByTestId('new-account-type-C'));
    expect(screen.getByTestId('account-form')).toBeInTheDocument();
    await user.type(screen.getByTestId('account-form-name'), 'Caja tardía');

    // The catalog/defaults arrive only now — the one-shot guard inside AccountFormStep must still
    // apply the org default without disturbing what the user already typed.
    resolveDefaults(DEFAULTS);
    await waitFor(() => expect(screen.getByTestId('account-form-submit')).toBeEnabled());

    await user.click(screen.getByTestId('account-form-submit'));
    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    expect(createAccount.mock.calls[0][0]).toMatchObject({
      name: 'Caja tardía',
      countryId: '106',
    });
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
