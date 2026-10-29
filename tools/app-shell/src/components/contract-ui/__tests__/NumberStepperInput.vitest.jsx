// @covers tools/app-shell/src/components/contract-ui/NumberStepperInput.jsx
//
// The bounded integer input with − / + buttons inside the box. The arithmetic
// (`nextStepperValue`) is exercised directly; the component is rendered with the
// real MaskedAmountInput so the label association and the typed-value path are real.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { NumberStepperInput, nextStepperValue, integerInputGuard, integerInputRefusal } from '../NumberStepperInput.jsx';

describe('nextStepperValue', () => {
  it('starts an empty value at the lower bound instead of min + delta', () => {
    expect(nextStepperValue('', 1, { min: 1, max: 10 })).toBe(1);
    expect(nextStepperValue(null, -1, { min: 3 })).toBe(3);
  });

  it('starts an empty value at 0 when there is no lower bound', () => {
    expect(nextStepperValue(undefined, 1, {})).toBe(0);
    expect(nextStepperValue('')).toBe(0);
  });

  it('clamps the empty-value start to max when 0 is above it', () => {
    expect(nextStepperValue('', 1, { max: -5 })).toBe(-5);
  });

  it('treats a non-numeric value as empty', () => {
    expect(nextStepperValue('abc', 1, { min: 2 })).toBe(2);
  });

  it('moves by delta inside the bounds', () => {
    expect(nextStepperValue('5', 1, { min: 0, max: 10 })).toBe(6);
    expect(nextStepperValue(5, -1, { min: 0, max: 10 })).toBe(4);
    expect(nextStepperValue('5', 5)).toBe(10);
  });

  it('clamps to max and to min', () => {
    expect(nextStepperValue('365', 1, { min: 0, max: 365 })).toBe(365);
    expect(nextStepperValue('0', -1, { min: 0, max: 365 })).toBe(0);
    // An out-of-range typed value is pulled back into range by the next click.
    expect(nextStepperValue('400', -1, { min: 0, max: 365 })).toBe(365);
  });
});

function renderStepper(props = {}) {
  const onChange = vi.fn();
  const onStep = vi.fn();
  const utils = render(
    <>
      <label htmlFor="days">Days</label>
      <NumberStepperInput
        id="days"
        data-testid="field-days"
        value=""
        min={0}
        max={365}
        onChange={onChange}
        onStep={onStep}
        {...props}
      />
    </>,
  );
  return { ...utils, onChange, onStep };
}

describe('NumberStepperInput — bounds', () => {
  it('disables − at the lower bound and keeps + enabled', () => {
    renderStepper({ value: 0 });
    expect(screen.getByTestId('field-days-decrement')).toBeDisabled();
    expect(screen.getByTestId('field-days-increment')).toBeEnabled();
  });

  it('disables + at the upper bound and keeps − enabled', () => {
    renderStepper({ value: '365' });
    expect(screen.getByTestId('field-days-increment')).toBeDisabled();
    expect(screen.getByTestId('field-days-decrement')).toBeEnabled();
  });

  it('keeps + disabled for a typed value above max, and − brings it back to max', () => {
    const { onChange } = renderStepper({ value: '400' });
    expect(screen.getByTestId('field-days-increment')).toBeDisabled();
    fireEvent.click(screen.getByTestId('field-days-decrement'));
    expect(onChange).toHaveBeenCalledWith('365');
  });

  it('enables both buttons for an empty value', () => {
    renderStepper({ value: '' });
    expect(screen.getByTestId('field-days-decrement')).toBeEnabled();
    expect(screen.getByTestId('field-days-increment')).toBeEnabled();
  });

  it('never disables a button for a missing bound', () => {
    renderStepper({ value: '-50', min: undefined, max: undefined });
    expect(screen.getByTestId('field-days-decrement')).toBeEnabled();
    expect(screen.getByTestId('field-days-increment')).toBeEnabled();
  });
});

describe('NumberStepperInput — clicks', () => {
  it('starts an empty value at min on the first click', () => {
    const { onChange, onStep } = renderStepper({ value: '', min: 1 });
    fireEvent.click(screen.getByTestId('field-days-increment'));
    expect(onChange).toHaveBeenCalledWith('1');
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('increments and decrements by one and reports a string value', () => {
    const { onChange, onStep } = renderStepper({ value: 5 });
    fireEvent.click(screen.getByTestId('field-days-increment'));
    expect(onChange).toHaveBeenLastCalledWith('6');
    fireEvent.click(screen.getByTestId('field-days-decrement'));
    expect(onChange).toHaveBeenLastCalledWith('4');
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('moves by the configured step', () => {
    const { onChange } = renderStepper({ value: '5', step: 5 });
    fireEvent.click(screen.getByTestId('field-days-increment'));
    expect(onChange).toHaveBeenCalledWith('10');
  });

  it('does not fire onChange or onStep when the click would not change the value', () => {
    // A zero step leaves the value where it is: the guard must swallow the click.
    const { onChange, onStep } = renderStepper({ value: '5', step: 0 });
    fireEvent.click(screen.getByTestId('field-days-increment'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
  });

  it('disables the input and both buttons when disabled', () => {
    const { onChange } = renderStepper({ value: '5', disabled: true });
    expect(screen.getByTestId('field-days')).toBeDisabled();
    expect(screen.getByTestId('field-days-decrement')).toBeDisabled();
    expect(screen.getByTestId('field-days-increment')).toBeDisabled();
    fireEvent.click(screen.getByTestId('field-days-increment'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('NumberStepperInput — text box', () => {
  it('associates an external label with the input through its id', () => {
    renderStepper({ value: '7' });
    const input = screen.getByLabelText('Days');
    expect(input).toBe(screen.getByTestId('field-days'));
    expect(input).toHaveAttribute('id', 'days');
    expect(input).toHaveValue('7');
  });

  it('points both buttons at the input and labels them through useUI', () => {
    renderStepper({ value: '7' });
    const dec = screen.getByRole('button', { name: 'stepperDecrease' });
    const inc = screen.getByRole('button', { name: 'stepperIncrease' });
    expect(dec).toHaveAttribute('aria-controls', 'days');
    expect(inc).toHaveAttribute('aria-controls', 'days');
  });

  it('reports typed keystrokes through onChange and the left value through onCommit/onBlur', () => {
    const onCommit = vi.fn();
    const onBlur = vi.fn();
    const { onChange, onStep } = renderStepper({ value: '', onCommit, onBlur });
    const input = screen.getByTestId('field-days');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith('12');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('12');
    expect(onBlur).toHaveBeenCalled();
    // Typing is not a click: the immediate-save hook is the blur, not onStep.
    expect(onStep).not.toHaveBeenCalled();
  });

  it('omits the derived test ids when no data-testid is given', () => {
    render(<NumberStepperInput id="qty" value="1" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('undefined-increment')).toBeNull();
    expect(document.querySelector('[data-testid$="-stepper"]')).toBeNull();
  });
});

// An integer stepper (the payment-term "Días" case) accepted "10,5" on typing: the box is a
// MaskedAmountInput, which takes a decimal separator by default, so a fractional value reached
// the form and only the backend refused it.
describe('NumberStepperInput — integer stepper refuses non-integer input', () => {
  function renderInteger(props = {}) {
    const onChange = vi.fn();
    render(
      <NumberStepperInput id="days" value="10" integer min={0} max={365} onChange={onChange} data-testid="days" {...props} />,
    );
    return { onChange, input: screen.getByTestId('days') };
  }

  it('drops a typed decimal comma or point', () => {
    const { onChange, input } = renderInteger();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10,5' } });
    fireEvent.change(input, { target: { value: '10.5' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('10');
  });

  it('drops a typed minus sign when min is 0 or more', () => {
    const { onChange, input } = renderInteger({ value: '' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-3' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses a pasted decimal value', () => {
    const { onChange, input } = renderInteger({ value: '' });
    fireEvent.focus(input);
    fireEvent.paste(input, { clipboardData: { getData: () => '7,5' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still accepts whole digits', () => {
    const { onChange, input } = renderInteger({ value: '' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith('12');
  });
});

// A refused keystroke used to vanish silently: the user typed "," and nothing happened, with no
// reason given. Same UX as the payment-term selector's create modal (InlineCreateModal): keep the
// value, say why under the field, clear it on the next accepted keystroke.
describe('NumberStepperInput — says why a character was refused', () => {
  function renderHinted(props = {}) {
    const onChange = vi.fn();
    render(
      <NumberStepperInput id="days" value="10" integer min={0} max={365} onChange={onChange}
        rejectedMessage="Whole days only" data-testid="days" {...props} />,
    );
    return { onChange, input: screen.getByTestId('days') };
  }

  it('shows the message under the field when a decimal separator is refused', () => {
    const { input } = renderHinted();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10,' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Whole days only');
  });

  it('clears it on the next accepted keystroke', () => {
    const { input } = renderHinted();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10.' } });
    fireEvent.change(input, { target: { value: '105' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears it on blur', () => {
    const { input } = renderHinted();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses a digit beyond the length of max (365 → 3 digits) and says so', () => {
    const { onChange, input } = renderHinted({ value: '' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1000' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows nothing when no refusal happened', () => {
    renderHinted();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so for a refused paste, and ties the message to the field id / test id', () => {
    const { onChange, input } = renderHinted({ value: '' });
    fireEvent.focus(input);
    fireEvent.paste(input, { clipboardData: { getData: () => '7.5' } });
    expect(onChange).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Whole days only');
    expect(alert).toHaveAttribute('id', 'days-rejected');
    expect(alert).toHaveAttribute('data-testid', 'days-rejected');
  });

  it('a stepper click does not raise or clear anything by itself', () => {
    renderHinted({ value: '10' });
    fireEvent.click(screen.getByTestId('days-increment'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses silently when no rejectedMessage is given', () => {
    const { onChange, input } = renderHinted({ rejectedMessage: undefined });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10,' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('never vetoes nor hints on a non-integer stepper', () => {
    const { onChange, input } = renderHinted({ integer: false });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10,5' } });
    expect(onChange).toHaveBeenCalledWith('10.5');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts a minus sign when min is negative', () => {
    const { onChange, input } = renderHinted({ value: '', min: -10, max: 10 });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-3' } });
    expect(onChange).toHaveBeenCalledWith('-3');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('integerInputGuard', () => {
  it('accepts digits only when min is 0 or more', () => {
    const guard = integerInputGuard(0, 365);
    expect(guard('')).toBe(true);
    expect(guard('365')).toBe(true);
    expect(guard('10.5')).toBe(false);
    expect(guard('-1')).toBe(false);
  });

  it('caps the digit count at the length of max (365 → 3)', () => {
    const guard = integerInputGuard(0, 365);
    expect(guard('999')).toBe(true);
    expect(guard('1000')).toBe(false);
  });

  it('allows a leading minus when min is negative or absent, without counting it as a digit', () => {
    expect(integerInputGuard(-10, 10)('-10')).toBe(true);
    expect(integerInputGuard(undefined, 99)('-99')).toBe(true);
    expect(integerInputGuard(-10, 10)('1-')).toBe(false);
  });

  it('has no digit cap without a positive max', () => {
    expect(integerInputGuard(0)('123456789')).toBe(true);
    expect(integerInputGuard(0, 0)('12345')).toBe(true);
  });

  it('truncates a fractional max before counting its digits', () => {
    expect(integerInputGuard(0, 99.9)('99')).toBe(true);
    expect(integerInputGuard(0, 99.9)('100')).toBe(false);
  });
});

// A digit past the length of max (a 4th digit for 365) was refused with the FORMAT message
// ("sin decimales, letras ni porcentajes"), which does not describe it. The payment-term
// selector's create modal says the value is out of range instead; the stepper now does too.
describe('NumberStepperInput — the refusal message matches the reason', () => {
  function renderBoth(props = {}) {
    render(
      <NumberStepperInput id="days" value="" integer min={0} max={365} onChange={vi.fn()}
        rejectedMessage="FORMAT" rangeMessage="RANGE" data-testid="days" {...props} />,
    );
    const input = screen.getByTestId('days');
    fireEvent.focus(input);
    return input;
  }

  it('a digit beyond the length of max shows the range message', () => {
    const input = renderBoth();
    fireEvent.change(input, { target: { value: '1000' } });
    expect(screen.getByRole('alert')).toHaveTextContent('RANGE');
  });

  it('a decimal separator or a minus sign keeps the format message', () => {
    const input = renderBoth({ value: '10' });
    fireEvent.change(input, { target: { value: '10,' } });
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
    fireEvent.change(input, { target: { value: '-10' } });
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
  });

  it('falls back to the format message when no range message is given', () => {
    const input = renderBoth({ rangeMessage: undefined });
    fireEvent.change(input, { target: { value: '1000' } });
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
  });

  it('points the input at the message while it is shown', () => {
    const input = renderBoth();
    expect(input).not.toHaveAttribute('aria-describedby');
    fireEvent.change(input, { target: { value: '1000' } });
    expect(input).toHaveAttribute('aria-describedby', 'days-rejected');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(input);
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('the describedby target is the shown message', () => {
    const input = renderBoth({ value: '10' });
    fireEvent.change(input, { target: { value: '10,' } });
    expect(document.getElementById(input.getAttribute('aria-describedby'))).toBe(screen.getByRole('alert'));
  });

  it('drops aria-describedby / aria-invalid on the next accepted keystroke', () => {
    const input = renderBoth();
    fireEvent.change(input, { target: { value: '1000' } });
    fireEvent.change(input, { target: { value: '100' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('switches from the range to the format message when the next refusal is a format one', () => {
    const input = renderBoth();
    fireEvent.change(input, { target: { value: '1000' } });
    expect(screen.getByRole('alert')).toHaveTextContent('RANGE');
    fireEvent.change(input, { target: { value: '1.' } });
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
  });

  it('a pasted value too long for max shows the range message', () => {
    const input = renderBoth();
    fireEvent.paste(input, { clipboardData: { getData: () => '4000' } });
    expect(screen.getByRole('alert')).toHaveTextContent('RANGE');
  });

  it('marks nothing invalid when there is no message to point at', () => {
    const input = renderBoth({ rejectedMessage: undefined, rangeMessage: undefined });
    fireEvent.change(input, { target: { value: '1000' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('integerInputRefusal', () => {
  const refusal = integerInputRefusal(0, 365);

  it("answers 'format' for a decimal separator, a minus sign when min >= 0, or any non-digit", () => {
    expect(refusal('10.5')).toBe('format');
    expect(refusal('10.')).toBe('format');
    expect(refusal('-1')).toBe('format');
    expect(refusal('1e2')).toBe('format');
    expect(refusal('12%')).toBe('format');
  });

  it("answers 'range' for a digit past the length of max", () => {
    expect(refusal('1000')).toBe('range');
  });

  it('answers null when the value is accepted (empty included)', () => {
    expect(refusal('')).toBeNull();
    expect(refusal('365')).toBeNull();
    // Within the digit count but above max: not a keystroke refusal, the blur validation owns it.
    expect(refusal('999')).toBeNull();
  });

  it('checks the format before the length', () => {
    expect(refusal('1000.5')).toBe('format');
  });

  it('with a negative min, a minus is fine and does not count as a digit', () => {
    const signed = integerInputRefusal(-10, 10);
    expect(signed('-10')).toBeNull();
    expect(signed('-100')).toBe('range');
    expect(signed('1-')).toBe('format');
  });

  it('integerInputGuard accepts exactly what integerInputRefusal does not refuse', () => {
    const guard = integerInputGuard(0, 365);
    for (const v of ['', '7', '365', '999', '1000', '10.5', '-1', 'a']) {
      expect(guard(v)).toBe(refusal(v) === null);
    }
  });
});

// A letter ("7a") or a "-" after a digit ("7-") was stripped silently by the amount mask before
// the stepper's guard ran, so no reason was shown — the payment-term selector shows its format
// message for those too.
describe('NumberStepperInput — any refused non-digit shows the format message', () => {
  function renderFormat(value = '7') {
    const onChange = vi.fn();
    render(
      <NumberStepperInput id="days" value={value} integer min={0} max={365} onChange={onChange}
        rejectedMessage="FORMAT" rangeMessage="RANGE" data-testid="days" />,
    );
    const input = screen.getByTestId('days');
    fireEvent.focus(input);
    return { input, onChange };
  }

  it.each(['7a', '7-', '7%', '7 '])('refuses %j and says why', (typed) => {
    const { input, onChange } = renderFormat();
    fireEvent.change(input, { target: { value: typed } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
  });

  it('refuses a pasted value with letters and says why', () => {
    const { input, onChange } = renderFormat('');
    fireEvent.paste(input, { clipboardData: { getData: () => '12abc' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('FORMAT');
  });
});
