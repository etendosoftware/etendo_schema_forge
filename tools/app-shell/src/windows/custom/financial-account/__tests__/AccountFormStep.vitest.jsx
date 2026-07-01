import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountFormStep } from '../AccountFormStep.jsx';

const CURRENCIES = [
  { id: '102', iso: 'EUR' },
  { id: '100', iso: 'USD' },
];

function renderForm(props = {}) {
  return render(
    <AccountFormStep
      mode="bank"
      currencies={CURRENCIES}
      defaultCurrencyId="102"
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

describe('AccountFormStep', () => {
  it('renders the form with the name field', () => {
    renderForm();
    expect(screen.getByTestId('account-form')).toBeInTheDocument();
    expect(screen.getByTestId('account-form-name')).toBeInTheDocument();
  });

  it('keeps submit disabled until the name is filled', async () => {
    const user = userEvent.setup();
    renderForm();

    // currency is pre-selected via defaultCurrencyId; only name is missing
    expect(screen.getByTestId('account-form-submit')).toBeDisabled();

    await user.type(screen.getByTestId('account-form-name'), 'BBVA');
    expect(screen.getByTestId('account-form-submit')).toBeEnabled();
  });

  it('shows an IBAN error after blur and blocks submit when the IBAN is invalid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    await user.type(screen.getByTestId('account-form-name'), 'BBVA');
    await user.type(screen.getByTestId('account-form-iban'), 'ES00INVALID');
    // error only appears after the field is touched (blur)
    expect(screen.queryByTestId('account-form-iban-error')).not.toBeInTheDocument();

    await user.tab(); // blur the IBAN field
    expect(screen.getByTestId('account-form-iban-error')).toBeInTheDocument();
    expect(screen.getByTestId('account-form-submit')).toBeDisabled();

    await user.click(screen.getByTestId('account-form-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides IBAN and BIC in cash mode', () => {
    renderForm({ mode: 'cash' });
    expect(screen.queryByTestId('account-form-iban')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-form-bic')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-form-name')).toBeInTheDocument();
  });

  it('hides the BIC field and omits swiftCode from the payload when showBic is false', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ showBic: false, onSubmit });

    expect(screen.queryByTestId('account-form-bic')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('account-form-name'), 'BBVA');
    await user.type(screen.getByTestId('account-form-iban'), 'ES9121000418450200051332');
    await user.click(screen.getByTestId('account-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).not.toHaveProperty('swiftCode');
    expect(payload.iban).toBe('ES9121000418450200051332');
  });

  it('submits a valid bank account with name, type B, currency, iban and swiftCode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    await user.type(screen.getByTestId('account-form-name'), '  BBVA Main  ');
    await user.type(screen.getByTestId('account-form-iban'), 'es91 2100 0418 4502 0005 1332');
    await user.type(screen.getByTestId('account-form-bic'), 'bbvaesmm');
    await user.click(screen.getByTestId('account-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'BBVA Main',
      type: 'B',
      currencyId: '102',
      iban: 'ES9121000418450200051332',
      swiftCode: 'BBVAESMM',
    });
  });

  it('submits a cash account with type C and no iban/swiftCode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: 'cash', onSubmit });

    await user.type(screen.getByTestId('account-form-name'), 'Caja');
    await user.click(screen.getByTestId('account-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Caja',
      type: 'C',
      currencyId: '102',
    });
  });

  it('submits a card account with type CA and no iban/swiftCode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: 'card', onSubmit });

    // Card form is minimal: Name + Currency, no IBAN/BIC.
    expect(screen.queryByTestId('account-form-iban')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-form-bic')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('account-form-name'), 'Visa Oro');
    await user.click(screen.getByTestId('account-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Visa Oro',
      type: 'CA',
      currencyId: '102',
    });
  });

  it('renders the inline error block when an error prop is supplied', () => {
    renderForm({ error: 'something went wrong' });
    expect(screen.getByTestId('account-form-error')).toHaveTextContent('something went wrong');
  });

  it('disables submit while submitting', async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await user.type(screen.getByTestId('account-form-name'), 'BBVA');
    expect(screen.getByTestId('account-form-submit')).toBeEnabled();

    rerender(
      <AccountFormStep
        mode="bank"
        currencies={CURRENCIES}
        defaultCurrencyId="102"
        submitting
        onSubmit={vi.fn()}
        initialValues={{ name: 'BBVA' }}
      />,
    );
    expect(screen.getByTestId('account-form-submit')).toBeDisabled();
  });

  it('prefills name and iban from initialValues', () => {
    renderForm({ initialValues: { name: 'Existing', iban: 'ES9121000418450200051332' } });
    expect(screen.getByTestId('account-form-name')).toHaveValue('Existing');
    expect(screen.getByTestId('account-form-iban')).toHaveValue('ES9121000418450200051332');
  });
});
