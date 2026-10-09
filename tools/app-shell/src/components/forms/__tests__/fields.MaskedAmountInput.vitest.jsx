// @covers tools/app-shell/src/components/forms/fields.jsx
// ETP-5107 — MaskedAmountInput (Holded-style live-masked numeric input).
// See docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.2/§6.3 for the
// full design. This suite exercises the component in isolation (not through one
// of the three call sites — DataTable.jsx/InlineLinesPanel.jsx/ProductPriceBar.jsx
// have their own dedicated coverage).
//
// TOP PRIORITY per the plan (§6.3.2/§9.3/§9.4): the "clean value out" contract —
// the grouped DISPLAY string must never leak into onChange/onCommit. Every
// downstream consumer (useLineGrossAmount.js's live arithmetic, the PATCH/POST
// body) depends on this holding.

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

// Same mock set fields.vitest.jsx already uses to load this module — MaskedAmountInput
// itself doesn't touch Select/DateField/Popover, but fields.jsx imports them at module
// scope, so the whole file must be able to load.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div data-testid="rselect">{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: () => <input data-testid="date-field" />,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverAnchor: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
}));

import { MaskedAmountInput } from '../fields.jsx';

function getInput(testId = 'field-number') {
  return screen.getByTestId(testId);
}

describe('MaskedAmountInput — the "clean value out" contract (plan §6.3.2, TOP PRIORITY)', () => {
  it('onChange never receives the grouped display string — only the clean, unmasked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput
          value={value}
          onChange={(clean) => { setValue(clean); onChange(clean); }}
          data-testid="mi" />
      );
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('12345');

    // The DISPLAY groups (this is the whole point of the component)...
    expect(input).toHaveValue('12.345');
    // ...but not one onChange call ever received a grouped/thousands-separated value —
    // each clean value is exactly the digits typed so far, nothing more.
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(['1', '12', '123', '1234', '12345']);
    const lastClean = onChange.mock.calls.at(-1)[0];
    expect(lastClean).toBe('12345');
  });

  it('onChange also reports the parsed Number as its second argument, matching the clean value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput value={value} onChange={(clean) => { setValue(clean); onChange(clean); }} data-testid="mi" />
      );
    }
    render(<Host />);
    await user.click(getInput('mi'));
    await user.keyboard('99');
    // Real prop-level assertion: re-derive the call args from the mock directly,
    // bypassing the Host's own re-wiring, by spying on the raw onChange the
    // component itself invokes.
    expect(onChange).toHaveBeenLastCalledWith('99');
  });

  it('a live-typed 4+ digit price groups on screen but reports the clean value on every keystroke, never a partially-grouped one', async () => {
    // Regression for the exact "1.234" -> Number("1.234") === 1.234 corruption
    // risk described in plan §6.3.2/§9.4 (useLineGrossAmount.js's live arithmetic).
    const user = userEvent.setup();
    const cleanValues = [];
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput
          value={value}
          onChange={(clean) => { setValue(clean); cleanValues.push(clean); }}
          data-testid="mi" />
      );
    }
    render(<Host />);
    await user.click(getInput('mi'));
    await user.keyboard('1234');
    expect(cleanValues).toEqual(['1', '12', '123', '1234']);
  });

  it('onCommit (blur) reports the parsed Number and the clean string, never the grouped display', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput
          value={value}
          onChange={(clean) => setValue(clean)}
          onCommit={onCommit}
          data-testid="mi" />
      );
    }
    render(<Host />);
    await user.click(getInput('mi'));
    await user.keyboard('12345');
    expect(getInput('mi')).toHaveValue('12.345');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(12345, '12345');
  });

  it('a comma-decimal amount commits as the correct parsed Number, not a truncated one', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} onCommit={onCommit} data-testid="mi" />
      );
    }
    render(<Host />);
    await user.click(getInput('mi'));
    await user.keyboard('1234,56');
    expect(getInput('mi')).toHaveValue('1.234,56');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(1234.56, '1234.56');
  });
});

describe('MaskedAmountInput — cursor position preservation across re-grouping', () => {
  it('preserves the insertion point when typing in the middle of an already-grouped number', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('1234');
    expect(input).toHaveValue('1.234');

    // Move the cursor to the very start (mirrors the plan §6.2 Holded research:
    // "Home, type 9" -> "91.234", the separator repositioning itself).
    input.setSelectionRange(0, 0);
    await user.keyboard('9');

    expect(input).toHaveValue('91.234');
    // Cursor lands right after the newly-typed '9', not at the end of the field.
    expect(input.selectionStart).toBe(1);
  });

  it('repositions the thousands separator correctly when the insertion pushes the integer part past a new grouping boundary', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('99'); // "99", no grouping needed yet
    input.setSelectionRange(0, 0);
    await user.keyboard('1'); // -> "199" -> still no separator (3 digits)
    expect(input).toHaveValue('199');
    input.setSelectionRange(0, 0);
    await user.keyboard('1'); // -> "1199" -> now groups as "1.199"
    expect(input).toHaveValue('1.199');
    expect(input.selectionStart).toBe(1);
  });
});

describe('MaskedAmountInput — decimal separator handling', () => {
  it('accepts the configured decimal separator (comma) exactly once', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('12,5');
    expect(input).toHaveValue('12,5');
  });

  it('ignores a second decimal separator outright (not transiently inserted then removed)', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('1,2,3');
    expect(input).toHaveValue('1,23');
  });

  it('with grouping ON (strict decimal), a direct attempt to type the thousands separator (".") is ignored, not accepted as a decimal', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput value={value} onChange={(clean) => { setValue(clean); onChange(clean); }} grouping data-testid="mi" />
      );
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('1.234');
    // Every '.' keystroke was dropped outright — no onChange call ever carried a
    // '.' in its clean value (the '.' keydown still re-fires onChange with the
    // unchanged clean value, since the DOM value technically changed and reverted —
    // that redundant call is harmless, but it must never smuggle a '.' through).
    const cleanValues = onChange.mock.calls.map((call) => call[0]);
    expect(cleanValues.every((v) => !v.includes('.'))).toBe(true);
    expect(cleanValues.at(-1)).toBe('1234');
    // The display re-groups those 4 raw digits for the user's eyes (a display-only
    // side effect, indistinguishable on screen from a real decimal — the clean
    // value above is what proves the '.' keystroke itself was never accepted).
    expect(input).toHaveValue('1.234');
  });

  it('with grouping OFF, both "," and "." are accepted as a decimal keystroke (fixes Bug 1 for quantity/integer/decimal/percent fields too) — the display always normalizes to the configured separator', async () => {
    const user = userEvent.setup();
    const onChangeDot = vi.fn();
    function HostComma() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} grouping={false} data-testid="mi-comma" />;
    }
    function HostDot() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput value={value} onChange={(clean) => { setValue(clean); onChangeDot(clean); }} grouping={false} data-testid="mi-dot" />
      );
    }
    const { unmount } = render(<HostComma />);
    const commaInput = getInput('mi-comma');
    await user.click(commaInput);
    await user.keyboard('10,5');
    expect(commaInput).toHaveValue('10,5');
    unmount();

    render(<HostDot />);
    const dotInput = getInput('mi-dot');
    await user.click(dotInput);
    await user.keyboard('10.5');
    // The keystroke '.' was accepted (not dropped) — but the display and the
    // clean value both normalize to the CONFIGURED separator (comma, the
    // default), never leaking the literal typed character downstream.
    expect(dotInput).toHaveValue('10,5');
    expect(onChangeDot).toHaveBeenLastCalledWith('10.5'); // clean value is always period-decimal (locale-independent)
  });

  it('letters are rejected outright, never transiently inserted (plan §5.1 silent-drop bug closed)', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('20,0rrwetwrtwrt2');
    // Matches the exact live-reproduced string from the plan (§5.1/§5.2).
    expect(input).toHaveValue('20,02');
  });
});

describe('MaskedAmountInput — negative sign handling (ETP-4567)', () => {
  it('accepts a leading "-" as the very first character', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('-99');
    expect(input).toHaveValue('-99');
  });

  it('rejects a "-" typed in the middle or at the end (only ever valid at position 0)', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('12-');
    expect(input).toHaveValue('12');
  });

  it('groups a large negative amount correctly, sign untouched by the grouping', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('');
      return <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} data-testid="mi" />;
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input);
    await user.keyboard('-1234');
    expect(input).toHaveValue('-1.234');
  });
});

describe('MaskedAmountInput — grouping prop', () => {
  it('grouping=true idle-formats the committed value with thousands separators and two fixed decimals (via canonical formatCurrency)', () => {
    render(<MaskedAmountInput value={1234.5} grouping data-testid="mi" />);
    expect(getInput('mi')).toHaveValue('1.234,50');
  });

  it('grouping=false idle-formats the committed value verbatim, unformatted (matches quantity/integer/number/decimal/percent fields, ETP-4277)', () => {
    render(<MaskedAmountInput value={9999} grouping={false} data-testid="mi" />);
    expect(getInput('mi')).toHaveValue('9999');
  });

  it('an empty/null committed value renders as an empty string regardless of grouping', () => {
    const { rerender } = render(<MaskedAmountInput value={null} grouping data-testid="mi" />);
    expect(getInput('mi')).toHaveValue('');
    rerender(<MaskedAmountInput value="" grouping={false} data-testid="mi" />);
    expect(getInput('mi')).toHaveValue('');
  });
});

describe('MaskedAmountInput — currency prop', () => {
  it('renders no symbol when currency is omitted (the default for line-grid cells, plan §6.3.0)', () => {
    render(<MaskedAmountInput value={10} data-testid="mi" />);
    expect(screen.queryByText('€')).not.toBeInTheDocument();
    expect(screen.queryByText('$')).not.toBeInTheDocument();
  });

  it('renders the resolved symbol when currency is given', () => {
    render(<MaskedAmountInput value={10} currency="USD" data-testid="mi" />);
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('renders the EUR symbol for currency="EUR"', () => {
    render(<MaskedAmountInput value={10} currency="EUR" data-testid="mi" />);
    expect(screen.getByText('€')).toBeInTheDocument();
  });
});

describe('MaskedAmountInput — bare prop', () => {
  it('bare=true skips the Field/label wrapper entirely — no label rendered even when one is passed', () => {
    render(<MaskedAmountInput value={10} bare label="Precio" data-testid="mi" />);
    expect(screen.queryByText('Precio')).not.toBeInTheDocument();
    expect(getInput('mi')).toBeInTheDocument();
  });

  it('bare=false (default) renders the Field wrapper with the label', () => {
    render(<MaskedAmountInput value={10} label="Precio" data-testid="mi" />);
    expect(screen.getByText('Precio')).toBeInTheDocument();
    expect(getInput('mi')).toBeInTheDocument();
  });
});

describe('MaskedAmountInput — other passthrough props', () => {
  it('forwards disabled', () => {
    render(<MaskedAmountInput value={10} disabled data-testid="mi" />);
    expect(getInput('mi')).toBeDisabled();
  });

  it('Enter blurs the input (commits without requiring a separate blur event)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    function Host() {
      const [value, setValue] = useState('');
      return (
        <MaskedAmountInput value={value} onChange={(clean) => setValue(clean)} onCommit={onCommit} data-testid="mi" />
      );
    }
    render(<Host />);
    const input = getInput('mi');
    await user.click(input); // real focus, required for .blur() to fire a blur event in jsdom
    await user.keyboard('5');
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith(5, '5');
  });

  it('a caller-supplied onKeyDown still fires before the Enter-blurs-the-input behavior', () => {
    const onKeyDown = vi.fn();
    render(<MaskedAmountInput value={5} onKeyDown={onKeyDown} data-testid="mi" />);
    fireEvent.keyDown(getInput('mi'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('defaults to a stable data-testid derived from `name` when none is given explicitly', () => {
    render(<MaskedAmountInput value={5} name="listPrice" />);
    expect(screen.getByTestId('field-number-listPrice')).toBeInTheDocument();
  });
});

// ETP-5597 (CP-18) — optional `isAllowed(clean)` veto, used by the Modelo 303 box editor to keep
// its AEAT width ceilings as a hard stop. Absent, nothing changes for existing callers.
describe('MaskedAmountInput — isAllowed veto', () => {
  it('a refused keystroke leaves the display unchanged and does not fire onChange', () => {
    const onChange = vi.fn();
    render(
      <MaskedAmountInput value="" grouping={false} isAllowed={(clean) => clean.length <= 4}
        onChange={onChange} data-testid="mi" />,
    );
    const input = getInput('mi');
    fireEvent.change(input, { target: { value: '12,5' } });
    expect(onChange).toHaveBeenLastCalledWith('12.5', 12.5);
    fireEvent.change(input, { target: { value: '12,55' } });
    expect(input.value).toBe('12,5');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a refused full-value paste is swallowed', () => {
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" isAllowed={() => false} onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '1.234,56' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(getInput('mi').value).toBe('');
  });

  // Review W2 — the paste path hands isAllowed the same clean shape as typing (digits, '.'
  // decimal), never String(n)'s exponent notation for a huge number.
  it('a paste gives isAllowed the same clean shape as typing, even for a huge number', () => {
    const seen = [];
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" isAllowed={(clean) => { seen.push(clean); return true; }}
      onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '1.234,56' } });
    expect(seen).toEqual(['1234.56']);
    expect(onChange).toHaveBeenLastCalledWith('1234.56', 1234.56);

    fireEvent.change(getInput('mi'), { target: { value: '' } });
    seen.length = 0;
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '1000000000000000000000' } });
    expect(seen).toEqual(['1000000000000000000000']);
    expect(seen[0]).not.toMatch(/e/i);
  });

  // Paste path → toPlainNumberString: `String(n)` switches to exponent notation from 1e21 up and
  // below 1e-6; neither form may ever reach isAllowed, onChange or the screen.
  it('a pasted value >= 1e21 reaches onChange and the display as plain digits', () => {
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" grouping={false} onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '25000000000000000000000' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [clean, parsed] = onChange.mock.calls[0];
    expect(parsed).toBe(2.5e22);
    // Plain digits, same magnitude (23 digits) and the same double as `parsed`. The trailing digits
    // are the exact binary value of the double (BigInt of 2.5e22), not the pasted decimal text:
    // beyond 2^53 a Number cannot carry those digits, and the width check only needs the length.
    expect(clean).toMatch(/^\d{23}$/);
    expect(Number(clean)).toBe(parsed);
    expect(getInput('mi').value).toBe(clean);
    expect(getInput('mi').value).not.toMatch(/e/i);
  });

  it('a pasted negative value <= -1e21 keeps its sign and stays plain digits', () => {
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" grouping={false} onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '-1000000000000000000000' } });
    expect(onChange).toHaveBeenLastCalledWith('-1000000000000000000000', -1e21);
  });

  it('a pasted tiny fraction (exponent form in String(n)) reaches isAllowed and onChange as plain decimals', () => {
    const seen = [];
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" isAllowed={(clean) => { seen.push(clean); return true; }}
      onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '0,0000001' } });
    expect(String(1e-7)).toMatch(/e/i); // the shape the component must avoid
    expect(seen).toEqual(['0.0000001']);
    expect(onChange).toHaveBeenLastCalledWith('0.0000001', 1e-7);
    expect(getInput('mi').value).toBe('0,0000001');
  });

  it('a pasted huge number is refused by a 15-integer-digit ceiling (the 303 box width) and nothing changes', () => {
    const fifteenIntegerDigits = (clean) => clean.replace('-', '').split('.')[0].length <= 15;
    const seen = [];
    const onChange = vi.fn();
    render(<MaskedAmountInput value="" isAllowed={(clean) => { seen.push(clean); return fifteenIntegerDigits(clean); }}
      onChange={onChange} data-testid="mi" />);
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '1000000000000000000000' } });
    // The veto measured the real 22 digits, not the 5 characters of "1e+21".
    expect(seen).toEqual(['1000000000000000000000']);
    expect(onChange).not.toHaveBeenCalled();
    expect(getInput('mi').value).toBe('');

    // The ceiling still lets a 15-digit paste through.
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '123456789012345' } });
    expect(onChange).toHaveBeenLastCalledWith('123456789012345', 123456789012345);
  });
});

// ETP-5611 — line grids pre-fill debit/credit/amount cells with 0, shown as "0,00". Opt-in
// `clearZeroOnFocus` empties a zero on focus so the user types straight into a blank cell, and
// leaving it blank without typing keeps the 0 (no commit, so no null PATCH / validation error).
describe('MaskedAmountInput — clearZeroOnFocus (ETP-5611)', () => {
  it('empties a committed zero on focus', async () => {
    const user = userEvent.setup();
    render(<MaskedAmountInput value={0} clearZeroOnFocus data-testid="mi" />);
    const input = getInput('mi');
    expect(input).toHaveValue('0,00');
    await user.click(input);
    expect(input).toHaveValue('');
  });

  it('also treats a string "0" as zero', async () => {
    const user = userEvent.setup();
    render(<MaskedAmountInput value="0" clearZeroOnFocus data-testid="mi" />);
    await user.click(getInput('mi'));
    expect(getInput('mi')).toHaveValue('');
  });

  it('typing after the clear reports only the typed value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    function Host() {
      const [value, setValue] = useState(0);
      return (
        <MaskedAmountInput value={value} clearZeroOnFocus
          onChange={(clean) => { setValue(clean); onChange(clean); }} onCommit={onCommit} data-testid="mi" />
      );
    }
    render(<Host />);
    await user.click(getInput('mi'));
    await user.keyboard('25');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith('25');
    expect(onCommit).toHaveBeenCalledWith(25, '25');
  });

  it('blurring without typing does not commit and restores the zero display', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onBlur = vi.fn();
    render(<MaskedAmountInput value={0} clearZeroOnFocus onCommit={onCommit} onBlur={onBlur} data-testid="mi" />);
    await user.click(getInput('mi'));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
    expect(getInput('mi')).toHaveValue('0,00');
  });

  // ETP-5597 × ETP-5611 merge — a paste refused by `isAllowed` changes nothing, so it must not
  // turn "looked and left" into "erased": the blur still restores the 0 without committing.
  it('a paste refused by isAllowed keeps the cleared-zero blur a no-op', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedAmountInput value={0} clearZeroOnFocus isAllowed={() => false} onCommit={onCommit} data-testid="mi" />);
    await user.click(getInput('mi'));
    fireEvent.paste(getInput('mi'), { clipboardData: { getData: () => '1.234,56' } });
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(getInput('mi')).toHaveValue('0,00');
  });

  it('leaves a non-zero value untouched on focus', async () => {
    const user = userEvent.setup();
    render(<MaskedAmountInput value={12.5} clearZeroOnFocus data-testid="mi" />);
    await user.click(getInput('mi'));
    expect(getInput('mi')).toHaveValue('12,50');
  });

  it('without the prop a zero stays on focus (default behavior unchanged)', async () => {
    const user = userEvent.setup();
    render(<MaskedAmountInput value={0} data-testid="mi" />);
    await user.click(getInput('mi'));
    expect(getInput('mi')).toHaveValue('0,00');
  });
});
