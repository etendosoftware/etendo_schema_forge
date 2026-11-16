// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/lib/dateFieldValidation.js
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
import { numericFieldToastId } from '@/lib/numericValidation.js';
import { dateFieldToastId } from '@/lib/dateFieldValidation.js';

/**
 * ETP-4542 — generic, declarative on-blur numeric validation (min / integer).
 * The behaviour is driven purely by field config, so it must work for ANY window,
 * not just Assets. It must also be backwards-compatible: a field that declares
 * neither `min` nor `integer` keeps the pre-existing behaviour (decimals allowed,
 * no validation toast).
 */
describe('EntityForm — generic numeric blur validation (ETP-4542)', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  const minIntField = { key: 'qty', label: 'Qty', type: 'number', column: 'Qty', min: 1, integer: true };
  const minOnlyField = { key: 'rate', label: 'Rate', type: 'number', column: 'Rate', min: 0 };
  const plainField = { key: 'weight', label: 'Weight', type: 'number', column: 'Weight' };

  it('toasts the min error with the interpolated {min} when a min+integer field is below min', () => {
    // min:1 → "Value must be at least 1" (0 is NOT negative — the point of ETP-4542).
    render(<EntityForm fields={[minIntField]} data={{ qty: 0 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be at least 1', { id: numericFieldToastId('qty') });
  });

  it('interpolates a different min value (min:0 → "at least 0")', () => {
    const minZeroInt = { key: 'qty', label: 'Qty', type: 'number', column: 'Qty', min: 0, integer: true };
    render(<EntityForm fields={[minZeroInt]} data={{ qty: -1 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be at least 0', { id: numericFieldToastId('qty') });
  });

  it('toasts the integer error (no interpolation) when a min+integer field is a decimal', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: 2.5 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be a whole number', { id: numericFieldToastId('qty') });
  });

  it('uses a stable per-field toast id (ETP-4542 dedup) — matches the save-gate id for the same key', () => {
    // Same field key must produce the exact id both call sites (EntityForm blur
    // and useEntity's save gate) pass to toast.error, so sonner can dedupe a
    // near-simultaneous blur+click into a single visible toast.
    render(<EntityForm fields={[minIntField]} data={{ qty: 0 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    const [, options] = toast.error.mock.calls[0];
    expect(options.id).toBe(numericFieldToastId('qty'));
    expect(options.id).toBe('numeric-field-qty');
  });

  it('does NOT toast when a min+integer field holds a valid whole number', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: 3 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('DEFAULT: a min-only field (no integer flag) accepts a decimal — no toast', () => {
    render(<EntityForm fields={[minOnlyField]} data={{ rate: 2.5 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-rate'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a field with neither min nor integer never validates on blur (backwards-compatible)', () => {
    render(<EntityForm fields={[plainField]} data={{ weight: -99.9 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-weight'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does NOT toast on an empty value (required mechanism owns emptiness)', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: '' }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// Stepper refusal hint (`stepperMessages`): a refused keystroke says WHY under the field — the
// format message (the field's stepperRejectedKey, else fieldIntegerError) for a decimal / minus,
// and `qtyMaxAllowed` with the field's {max} for a digit past max's length.
describe('EntityForm — stepper refusal messages', () => {
  const stepper = {
    key: 'days', label: 'Days', type: 'number', column: 'NetDays',
    stepper: true, min: 0, max: 365, integer: true,
  };
  const typeInto = (value) => {
    const input = screen.getByTestId('field-days');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
  };

  it('a digit past the length of max says the interpolated maximum', () => {
    render(<EntityForm fields={[stepper]} data={{ days: '' }} onChange={vi.fn()} />);
    typeInto('1000');
    expect(screen.getByTestId('field-days-rejected')).toHaveTextContent('El máximo permitido es 365');
  });

  it('a decimal says the field format message, from stepperRejectedKey', () => {
    render(<EntityForm fields={[{ ...stepper, stepperRejectedKey: 'paymentTermDaysNotInteger' }]} data={{ days: '10' }} onChange={vi.fn()} />);
    typeInto('10,');
    expect(screen.getByTestId('field-days-rejected')).toHaveTextContent('Whole days only');
  });

  it('the format message falls back to fieldIntegerError', () => {
    render(<EntityForm fields={[stepper]} data={{ days: '10' }} onChange={vi.fn()} />);
    typeInto('-');
    expect(screen.getByTestId('field-days-rejected')).toHaveTextContent('Value must be a whole number');
  });

  it('the range message follows the declared max (99 → 2 digits)', () => {
    render(<EntityForm fields={[{ ...stepper, max: 99 }]} data={{ days: '' }} onChange={vi.fn()} />);
    typeInto('100');
    expect(screen.getByTestId('field-days-rejected')).toHaveTextContent('El máximo permitido es 99');
  });
});

// `minDate` on a date field: EntityForm forwards it to DateField and toasts (stable id shared
// with the useEntity save gate) both a typed date the picker refused and a committed past date.
// Only a NEW value is checked: the date the record was loaded with passes even when past.
describe('EntityForm — date field minDate feedback', () => {
  const PAST = '2000-01-15';
  const FUTURE = '2999-12-31';
  const dueDate = { key: 'dueDate', label: 'Due date', type: 'date', column: 'Duedate', minDate: 'today' };
  const fixedMin = { key: 'startDate', label: 'Start', type: 'date', column: 'StartDate', minDate: '2999-01-01' };
  const plainDate = { key: 'orderDate', label: 'Order date', type: 'date', column: 'DateOrdered' };

  beforeEach(() => {
    toast.error.mockClear();
  });

  const commit = (key, iso) => fireEvent.change(screen.getByTestId(`date-commit-${key}`), { target: { value: iso } });
  const reject = (key, iso) => {
    const button = screen.getByTestId(`date-reject-${key}`);
    button.dataset.iso = iso;
    fireEvent.click(button);
  };

  it('forwards minDate to DateField; a field without it forwards none', () => {
    render(<EntityForm fields={[dueDate, plainDate]} data={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-dueDate')).toHaveAttribute('data-min-date', 'today');
    expect(screen.getByTestId('field-orderDate')).toHaveAttribute('data-min-date', '');
  });

  it('toasts fieldMinDateError when the picker refuses a typed earlier date', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[dueDate]} data={{}} onChange={onChange} />);
    reject('dueDate', PAST);
    expect(toast.error).toHaveBeenCalledWith('The date cannot be earlier than today.', { id: dateFieldToastId('dueDate') });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toasts a committed past date on a new record and still forwards the value', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[dueDate]} data={{}} onChange={onChange} />);
    commit('dueDate', PAST);
    expect(toast.error).toHaveBeenCalledWith('The date cannot be earlier than today.', { id: dateFieldToastId('dueDate') });
    expect(onChange).toHaveBeenCalledWith('dueDate', PAST, 'Duedate');
  });

  it('interpolates {min} for a fixed minDate', () => {
    render(<EntityForm fields={[fixedMin]} data={{}} onChange={vi.fn()} />);
    commit('startDate', PAST);
    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = toast.error.mock.calls[0];
    expect(message).toMatch(/^The date cannot be earlier than .*2999.*\.$/);
    expect(message).not.toContain('{min}');
    expect(options).toEqual({ id: dateFieldToastId('startDate') });
  });

  it('does not toast a committed date on or after the minimum', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[dueDate]} data={{}} onChange={onChange} />);
    commit('dueDate', FUTURE);
    expect(toast.error).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('dueDate', FUTURE, 'Duedate');
  });

  it('does not toast the past date an existing record was loaded with', () => {
    render(<EntityForm fields={[dueDate]} data={{ id: 'R1', dueDate: PAST }} onChange={vi.fn()} />);
    commit('dueDate', PAST);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts when the loaded past date of an existing record is changed to another past date', () => {
    render(<EntityForm fields={[dueDate]} data={{ id: 'R1', dueDate: PAST }} onChange={vi.fn()} />);
    commit('dueDate', '2000-02-20');
    expect(toast.error).toHaveBeenCalledWith('The date cannot be earlier than today.', { id: dateFieldToastId('dueDate') });
  });

  it('the loaded value is the first render of the record: a later re-render with a new past value is not whitelisted', () => {
    const { rerender } = render(<EntityForm fields={[dueDate]} data={{ id: 'R1', dueDate: FUTURE }} onChange={vi.fn()} />);
    // The parent applies the user's edit and re-renders the same record.
    rerender(<EntityForm fields={[dueDate]} data={{ id: 'R1', dueDate: PAST }} onChange={vi.fn()} />);
    commit('dueDate', PAST);
    expect(toast.error).toHaveBeenCalledWith('The date cannot be earlier than today.', { id: dateFieldToastId('dueDate') });
  });

  it('a field without minDate never toasts, whatever date is committed', () => {
    const onChange = vi.fn();
    render(<EntityForm fields={[plainDate]} data={{}} onChange={onChange} />);
    commit('orderDate', PAST);
    expect(toast.error).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('orderDate', PAST, 'DateOrdered');
  });
});
