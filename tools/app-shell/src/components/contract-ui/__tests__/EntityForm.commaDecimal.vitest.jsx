import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks (return keys as-is so no hardcoded strings are asserted).
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Heavy children stubbed (same convention as EntityForm.vitest.jsx).
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div data-testid="partner-address-picker" /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div data-testid="creatable-search-select" /> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';
import { NUMERIC_FIELD_TYPES } from '@/lib/numericFieldTypes.js';

/**
 * ETP-5107 (reopened) — comma-decimal input on editable numeric form fields.
 *
 * THE DEFECT: numeric fields rendered a native `<input type="number">`. A browser REJECTS the
 * comma keystroke on such an input, so a Spanish user typing `1234,56` had the comma swallowed
 * and the digits concatenated into `123456` — a silent 100x corruption with no error anywhere.
 *
 * WHY THIS FILE ASSERTS SHAPE, NOT KEYSTROKES: the rejection is a BROWSER behavior. jsdom does
 * not emulate it — `fireEvent.change` (and userEvent's own value setter) will happily put
 * `1234,56` into a `type="number"` element, so a keystroke-level test against the OLD code
 * would have PASSED and caught nothing. It is therefore not expressible here, and a test that
 * pretended otherwise would be vacuous. The two things that ARE faithfully testable in jsdom,
 * and together pin the regression, are:
 *   1. the SHAPE that made the defect possible — an editable numeric field must not be a native
 *      number input (that element type is the whole bug); and
 *   2. the CONTRACT of what replaced it — MaskedAmountInput accepts a comma decimal and reports
 *      the CLEAN dot-decimal value outward, so downstream arithmetic/PATCH bodies are unchanged.
 * The true end-to-end keystroke path is covered in a real browser by the Playwright specs
 * `e2e/tests/flows/price-input-locale.mocked.spec.js`.
 *
 * Default separators in tests are the es-ES-style `.`/`,` (currencyFormatConfig falls back to
 * these when the NEO config endpoint was never fetched).
 */
describe('EntityForm — comma-decimal numeric input (ETP-5107)', () => {
  // --- 1. The defect shape: no editable numeric field may be a native number input ---

  for (const type of NUMERIC_FIELD_TYPES) {
    it(`editable "${type}" field does not render a native number input`, () => {
      const fields = [{ key: 'v', label: 'V', type, column: 'V' }];
      render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
      const input = screen.getByTestId('field-v');
      expect(input).not.toHaveAttribute('type', 'number');
      expect(input).toHaveAttribute('inputMode', 'decimal');
    });
  }

  it('an editable numeric field with calloutOn blur is not a native number input either', () => {
    const fields = [{ key: 'v', label: 'V', type: 'number', column: 'V', calloutOn: 'blur' }];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-v');
    expect(input).not.toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('inputMode', 'decimal');
  });

  // --- 2. The replacement's contract: comma in, clean dot-decimal out ---

  it('accepts a typed comma decimal and reports the CLEAN dot-decimal value to onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [{ key: 'v', label: 'V', type: 'number', column: 'V' }];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);
    const input = screen.getByTestId('field-v');

    await user.type(input, '1234,56');

    // The comma survives on screen (this is what the user sees and what the native number
    // input destroyed) …
    expect(input).toHaveValue('1234,56');
    // … while the value handed outward is the clean, locale-independent one — 1234.56, NOT
    // the 123456 the defect produced, and NOT the display string '1234,56'.
    expect(onChange).toHaveBeenLastCalledWith('v', '1234.56', 'V');
  });

  it('commits the clean dot-decimal value on blur for a calloutOn blur numeric field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [{ key: 'v', label: 'V', type: 'number', column: 'V', calloutOn: 'blur' }];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);
    const input = screen.getByTestId('field-v');

    await user.type(input, '1234,56');
    // DeferredInput buffers while focused: nothing is committed until blur (ETP-4333).
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('v', '1234.56', 'V');
  });

  it('groups an amount-shaped field on screen while still reporting the clean value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [{ key: 'v', label: 'V', type: 'amount', column: 'V' }];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);
    const input = screen.getByTestId('field-v');

    await user.type(input, '1234,56');

    expect(input).toHaveValue('1.234,56');
    expect(onChange).toHaveBeenLastCalledWith('v', '1234.56', 'V');
  });

  it('never reports the grouped display string outward (no 1.234 misread as 1.234)', () => {
    const onChange = vi.fn();
    const fields = [{ key: 'v', label: 'V', type: 'amount', column: 'V' }];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);
    const input = screen.getByTestId('field-v');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1234' } });

    expect(input).toHaveValue('1.234');
    expect(onChange).toHaveBeenLastCalledWith('v', '1234', 'V');
  });

  // --- 3. The deliberate exclusion: read-only numerics keep the plain input ---

  it('leaves a read-only numeric field as a plain disabled input (no mask, no keystrokes)', () => {
    const fields = [{ key: 'v', label: 'V', type: 'number', column: 'V', readOnly: true }];
    render(<EntityForm fields={fields} data={{ v: 42 }} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-v');
    expect(input).toBeDisabled();
  });
});
