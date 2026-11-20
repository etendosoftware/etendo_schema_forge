// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/lib/coreValidation.js
import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n hooks. useUI resolves a tiny dictionary and interpolates `{param}`
// placeholders exactly like the real hook, so the tests assert the interpolated
// text and prove the `{min}` value flows through the component's call site.
// The dictionary is inlined here because vi.mock factories are hoisted above
// module-level declarations.
vi.mock('@/i18n', () => {
  const dict = {
    fieldMinValueError: 'Value must be at least {min}',
    fieldIntegerError: 'Value must be a whole number',
    fieldMinDateError: 'The date cannot be earlier than today.',
    fieldMinDateBeforeError: 'The date cannot be earlier than {min}.',
    qtyMaxAllowed: 'El máximo permitido es {max}',
    paymentTermDaysNotInteger: 'Whole days only',
    sendModalInvalidEmail: 'Enter a valid email address',
    fieldMaxLengthError: 'Maximum length is {maxLength} characters',
  };
  return {
    useLabel: () => (key) => key,
    useMenuLabel: () => (key) => key,
    useUI: () => (key, params = {}) => {
      let text = dict[key] ?? key;
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
      return text;
    },
    useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Heavy children stubbed (same convention as the other EntityForm specs).
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div /> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

// DateField (app-shell-core) is stubbed so the suite drives exactly the two callbacks EntityForm
// wires — a committed value (onChange) and a typed value refused by the picker
// (onMinDateRejected) — and can read the `minDate` it forwards. The picker's own minDate
// behaviour is covered in schema_forge_core (date-field.test.js).
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ name, value, minDate, onChange, onMinDateRejected, disabled }) => (
    <div data-testid={`field-${name}`} data-value={value} data-min-date={minDate ?? ''} data-disabled={String(!!disabled)}>
      <input
        data-testid={`date-commit-${name}`}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <button
        type="button"
        data-testid={`date-reject-${name}`}
        onClick={(e) => onMinDateRejected?.(e.currentTarget.dataset.iso)}
      />
    </div>
  ),
}));

import { toast } from 'sonner';
import { EntityForm } from '../EntityForm.jsx';

describe('EntityForm — shared core validator (ETP-4557)', () => {
  beforeEach(() => toast.error.mockClear());
  const email = { key: 'etgoEmail', label: 'Email', type: 'text', column: 'EM_Etgo_Email', maxLength: 60 };
  const code = { key: 'code', label: 'Code', type: 'text', column: 'Code', validation: { maxLength: 5 } };

  it('renders the declared maxLength and the inferred inputMode on the control', () => {
    render(<EntityForm fields={[email, code]} data={{}} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-etgoEmail');
    expect(input).toHaveAttribute('maxlength', '60');
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(screen.getByTestId('field-code')).toHaveAttribute('maxlength', '5');
  });

  it('does not render constraint attributes the contract does not declare', () => {
    render(<EntityForm fields={[{ key: 'note', label: 'Note', type: 'text', column: 'Note' }]} data={{}} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-note');
    expect(input).not.toHaveAttribute('maxlength');
    expect(input).not.toHaveAttribute('inputmode');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('associates an inline error with its own input only (aria-invalid + aria-describedby)', () => {
    render(<EntityForm fields={[email, code]} data={{}} onChange={vi.fn()} fieldErrors={{ etgoEmail: 'Enter a valid email address' }} />);
    const input = screen.getByTestId('field-etgoEmail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy)).toHaveTextContent('Enter a valid email address');
    expect(screen.getByTestId('field-code')).not.toHaveAttribute('aria-invalid');
  });

  it('blur with an invalid value sets the inline error through onFieldError', () => {
    const onFieldError = vi.fn();
    render(<EntityForm fields={[email]} data={{ etgoEmail: 'nope' }} onChange={vi.fn()} onFieldError={onFieldError} />);
    fireEvent.blur(screen.getByTestId('field-etgoEmail'));
    expect(onFieldError).toHaveBeenCalledWith('etgoEmail', 'Enter a valid email address');
  });

  it('blur with a valid correction clears the inline error, and an empty value does not clear it', () => {
    const onFieldError = vi.fn();
    const { rerender } = render(<EntityForm fields={[email]} data={{ etgoEmail: 'ok@acme.com' }} onChange={vi.fn()} onFieldError={onFieldError} />);
    fireEvent.blur(screen.getByTestId('field-etgoEmail'));
    expect(onFieldError).toHaveBeenCalledWith('etgoEmail', null);
    onFieldError.mockClear();
    rerender(<EntityForm fields={[email]} data={{ etgoEmail: '' }} onChange={vi.fn()} onFieldError={onFieldError} />);
    fireEvent.blur(screen.getByTestId('field-etgoEmail'));
    expect(onFieldError).not.toHaveBeenCalled();
  });

  it('blur on an untouched legacy-invalid value of an existing record does not flag it (compatibility policy)', () => {
    const onFieldError = vi.fn();
    render(<EntityForm fields={[email]} data={{ id: 'R1', etgoEmail: 'legacy-bad' }} loadedData={{ id: 'R1', etgoEmail: 'legacy-bad' }}
      onChange={vi.fn()} onFieldError={onFieldError} />);
    fireEvent.blur(screen.getByTestId('field-etgoEmail'));
    expect(onFieldError).not.toHaveBeenCalledWith('etgoEmail', expect.stringContaining('valid'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('blur on a CHANGED invalid value of an existing record flags it', () => {
    const onFieldError = vi.fn();
    render(<EntityForm fields={[email]} data={{ id: 'R1', etgoEmail: 'new-bad' }} loadedData={{ id: 'R1', etgoEmail: 'old@acme.com' }}
      onChange={vi.fn()} onFieldError={onFieldError} />);
    fireEvent.blur(screen.getByTestId('field-etgoEmail'));
    expect(onFieldError).toHaveBeenCalledWith('etgoEmail', 'Enter a valid email address');
  });
});
