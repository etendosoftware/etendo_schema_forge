import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountFormStep } from '../AccountFormStep.jsx';

const CURRENCIES = [
  { id: '102', iso: 'EUR' },
  { id: '100', iso: 'USD' },
];

// Spain, the only country these tests need metadata for — real ES IBAN prefix/length so the
// default-country path (mirroring the currency default) exercises the actual validation rule.
const COUNTRY_RULES = [
  { id: '106', iso: 'ES', name: 'Spain', ibanPrefix: 'ES', ibanLength: 24 },
  { id: '107', iso: 'IT', name: 'Italy', ibanPrefix: 'IT', ibanLength: 27 },
];

// The Country field (ETP-4896) is also a CreatableSearchSelect chip and, once a default
// country resolves, carries its own "clear" (X) button — so `getByRole('button', {name:
// 'clear'})` alone is ambiguous whenever both chips are filled. Scope to the currency chip's
// own wrapper to disambiguate.
function currencyClearButton() {
  const chip = screen.getByTestId('field-account-form-currency-chip');
  return within(chip.parentElement).getByRole('button', { name: 'clear' });
}

function renderForm(props = {}) {
  return render(
    <AccountFormStep
      mode="bank"
      currencies={CURRENCIES}
      defaultCurrencyId="102"
      countryIbanRules={COUNTRY_RULES}
      defaultCountryId="106"
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
      countryId: '106',
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
      countryId: '106',
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
      countryId: '106',
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

  describe('currency selector (chip)', () => {
    // The currency field is a CreatableSearchSelect over a static (client-side) options list —
    // the same shared component EditAccountModal's "statementGrouping" field already uses.
    // When a value is selected it renders a SelectorChip (data-testid
    // `field-${field.key}-chip`) instead of an always-visible input; the plain text input
    // (data-testid `field-${field.key}`) only appears while there is no selection, or while the
    // user is actively re-searching after clicking the chip / clearing it.

    it('renders the currency field as a chip (not a native select) when defaultCurrencyId provides a value', () => {
      renderForm();
      const chip = screen.getByTestId('field-account-form-currency-chip');
      expect(chip).toHaveTextContent('EUR');
      expect(screen.queryByTestId('field-account-form-currency')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    // These cases render with defaultCurrencyId=undefined: whenever currencyId is empty and a
    // defaultCurrencyId is provided, the component's own effect immediately re-selects the
    // default — starting from an unset currency isolates the search/select/clear behavior from
    // that (separate, pre-existing) default-currency re-selection effect. With no selection the
    // field renders as a plain text input rather than a chip.

    it('renders the currency field as a searchable text input when nothing is selected', () => {
      renderForm({ defaultCurrencyId: undefined });
      const input = screen.getByTestId('field-account-form-currency');
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('text');
      expect(screen.queryByTestId('field-account-form-currency-chip')).not.toBeInTheDocument();
    });

    it('filters the dropdown to currencies matching the typed query', async () => {
      const user = userEvent.setup();
      renderForm({ defaultCurrencyId: undefined });
      const input = screen.getByTestId('field-account-form-currency');

      await user.type(input, 'USD');

      expect(await screen.findByTestId('option-account-form-currency-100')).toHaveTextContent('USD');
      expect(screen.queryByTestId('option-account-form-currency-102')).not.toBeInTheDocument();
    });

    it('shows no dropdown options when the query matches no currency', async () => {
      const user = userEvent.setup();
      renderForm({ defaultCurrencyId: undefined });
      const input = screen.getByTestId('field-account-form-currency');

      await user.type(input, 'zzz');

      await waitFor(() => {
        expect(screen.queryByTestId('option-account-form-currency-102')).not.toBeInTheDocument();
        expect(screen.queryByTestId('option-account-form-currency-100')).not.toBeInTheDocument();
      });
    });

    it('selects a searched currency and submits its id', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ defaultCurrencyId: undefined, onSubmit });

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      const input = screen.getByTestId('field-account-form-currency');
      await user.type(input, 'USD');
      await user.click(await screen.findByTestId('option-account-form-currency-100'));
      expect(screen.getByTestId('field-account-form-currency-chip')).toHaveTextContent('USD');

      await user.click(screen.getByTestId('account-form-submit'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].currencyId).toBe('100');
    });

    it('clicking the chip re-opens search mode, allowing a different currency to be picked (not stuck)', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      // defaultCurrencyId="102" (EUR) pre-selects the chip.
      renderForm({ onSubmit });
      await user.type(screen.getByTestId('account-form-name'), 'BBVA');

      expect(screen.getByTestId('field-account-form-currency-chip')).toHaveTextContent('EUR');

      // Clicking the chip body (not the X) flips back to search mode, pre-filled with "EUR".
      await user.click(screen.getByTestId('field-account-form-currency-chip'));
      const input = await screen.findByTestId('field-account-form-currency');
      await user.clear(input);
      await user.type(input, 'USD');
      await user.click(await screen.findByTestId('option-account-form-currency-100'));

      expect(screen.getByTestId('field-account-form-currency-chip')).toHaveTextContent('USD');

      await user.click(screen.getByTestId('account-form-submit'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].currencyId).toBe('100');
    });

    it('does not snap back to the default currency after clearing the chip to pick another one', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      // Real-world scenario: defaultCurrencyId IS present (e.g. fetchDefaults() prefilled
      // EUR for the org). Regression: CreatableSearchSelect's handleClear (the chip's X)
      // briefly resets currencyId to '' — which, without the currencyDefaultedRef guard,
      // would let the auto-default effect see an empty currencyId + a defaultCurrencyId and
      // snap straight back to EUR, making it impossible to ever pick a different currency.
      renderForm({ onSubmit });

      expect(screen.getByTestId('field-account-form-currency-chip')).toHaveTextContent('EUR');

      // Clear via the chip's X — reopens the dropdown with all options visible (empty query).
      await user.click(currencyClearButton());
      await user.click(await screen.findByTestId('option-account-form-currency-100'));

      expect(screen.getByTestId('field-account-form-currency-chip')).toHaveTextContent('USD');

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.click(screen.getByTestId('account-form-submit'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].currencyId).toBe('100');
    });

    it('leaves currencyId empty after clearing the chip with no re-selection, disabling submit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });
      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      expect(screen.getByTestId('account-form-submit')).toBeEnabled();

      await user.click(currencyClearButton());

      expect(screen.queryByTestId('field-account-form-currency-chip')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-form-submit')).toBeDisabled();
    });
  });

  describe('country field (ETP-4896)', () => {
    it('renders Country as a required chip, pre-filled from defaultCountryId, in all three modes', () => {
      ['bank', 'cash', 'card'].forEach((mode) => {
        const { unmount } = renderForm({ mode });
        expect(screen.getByTestId('field-account-form-country-chip')).toHaveTextContent('Spain');
        unmount();
      });
    });

    it('does not snap back to the default country after clearing the chip (one-shot guard)', async () => {
      const user = userEvent.setup();
      renderForm();

      const chip = screen.getByTestId('field-account-form-country-chip');
      await user.click(within(chip.parentElement).getByRole('button', { name: 'clear' }));

      expect(screen.queryByTestId('field-account-form-country-chip')).not.toBeInTheDocument();
      // Country required in every mode: clearing it disables submit even with everything else filled.
      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      expect(screen.getByTestId('account-form-submit')).toBeDisabled();
    });

    it('requires a country to submit, independent of the IBAN', async () => {
      renderForm({ defaultCountryId: undefined, mode: 'cash' });
      const user = userEvent.setup();
      await user.type(screen.getByTestId('account-form-name'), 'Caja');
      expect(screen.getByTestId('account-form-submit')).toBeDisabled();
    });

    it('shows a country-mismatch error for a Spanish IBAN when Italy is selected', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: { countryId: '107' } }); // Italy, seeded without a UI interaction

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.type(screen.getByTestId('account-form-iban'), 'ES9121000418450200051332');
      await user.tab();

      expect(screen.getByTestId('account-form-iban-error'))
        .toHaveTextContent('financeAccountsNewIbanCountryMismatch');
      expect(screen.getByTestId('account-form-submit')).toBeDisabled();
    });

    it('shows a length-mismatch error when the IBAN prefix matches but the length does not', async () => {
      const user = userEvent.setup();
      // The real, mod-97-valid Spanish IBAN against a Spain row misconfigured to expect 20
      // characters — prefix still matches, so only the length check can fire.
      const wrongLength = COUNTRY_RULES.map((c) => (c.id === '106' ? { ...c, ibanLength: 20 } : c));
      renderForm({ countryIbanRules: wrongLength });

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.type(screen.getByTestId('account-form-iban'), 'ES9121000418450200051332');
      await user.tab();

      expect(screen.getByTestId('account-form-iban-error'))
        .toHaveTextContent('financeAccountsNewIbanLengthMismatch');
    });

    // ETP-4896 QA follow-up: this previously asserted the OPPOSITE (no error, submit enabled).
    // That was the bug — a country absent from countryIbanRules has no IBAN metadata, which
    // C_GET_IBAN_DISPLAYED_ACCOUNT rejects outright, so the "valid" save came back as an
    // untranslated English 400 toast. Caught inline now.
    it('rejects an IBAN when the selected country has no IBAN configuration', async () => {
      const user = userEvent.setup();
      // Argentina: reachable through the picker (it searches the full 243-country selector) but
      // absent from countryIbanRules (only ~45 countries carry IBAN metadata).
      renderForm({ initialValues: { countryId: 'ar-no-metadata' } });

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.type(screen.getByTestId('account-form-iban'), 'GB82WEST12345698765432');
      await user.tab();

      expect(screen.getByTestId('account-form-iban-error'))
        .toHaveTextContent('financeAccountsNewIbanCountryNoConfig');
      expect(screen.getByTestId('account-form-submit')).toBeDisabled();
    });

    // The empty-catalog guard: /defaults can fail or still be in flight, and both consumers start
    // from []. Blocking then would break every valid save for a transient reason.
    it('does not block when the IBAN rules catalog is empty (unknown, defer to the backend)', async () => {
      const user = userEvent.setup();
      renderForm({ countryIbanRules: [], initialValues: { countryId: 'ar-no-metadata' } });

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.type(screen.getByTestId('account-form-iban'), 'GB82WEST12345698765432');
      await user.tab();

      expect(screen.queryByTestId('account-form-iban-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-form-submit')).toBeEnabled();
    });

    // A country that IS in the catalog keeps behaving as before — the new check must not fire.
    it('still accepts a matching IBAN for a country present in the catalog', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByTestId('account-form-name'), 'BBVA');
      await user.type(screen.getByTestId('account-form-iban'), 'ES9121000418450200051332');
      await user.tab();

      expect(screen.queryByTestId('account-form-iban-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-form-submit')).toBeEnabled();
    });
  });
});
