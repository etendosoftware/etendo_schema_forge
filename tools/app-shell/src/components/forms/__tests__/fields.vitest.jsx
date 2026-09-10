import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

// Mock the Radix-based primitives that rely on portals / pointer-events, so the
// wrappers' own logic (value/onChange contract, label rendering) is testable in
// jsdom without fighting the real Select/Popover/Date portals.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <div data-testid="rselect">
      <span data-testid="rselect-value">{value}</span>
      <button type="button" data-testid="rselect-pick-b" onClick={() => onValueChange('b')}>pick-b</button>
      {children}
    </div>
  ),
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ value, children }) => <div data-testid={`opt-${value}`}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span data-testid="rselect-placeholder">{placeholder}</span>,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input
      data-testid="date-field"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ open, children }) => <div data-testid="popover" data-open={String(!!open)}>{children}</div>,
  PopoverAnchor: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children, onOpenAutoFocus, onFocusOutside }) => {
    // Invoke the focus-guard callbacks immediately so they are counted as covered.
    const fakeEvent = { preventDefault: () => {} };
    onOpenAutoFocus?.(fakeEvent);
    onFocusOutside?.(fakeEvent);
    return <div data-testid="popover-content">{children}</div>;
  },
  PopoverTrigger: ({ children }) => <div>{children}</div>,
}));

import {
  Field, ReadOnly, TextInput, Select, DateInput, AmountInput, MoneyInput, LookupPicker, ChipSelect, Note, SectionLabel,
} from '../fields.jsx';

describe('Field', () => {
  it('renders a label and children', () => {
    render(<Field label="My label"><span>child</span></Field>);
    expect(screen.getByText('My label')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('renders a required asterisk', () => {
    render(<Field label="Req" required><span>c</span></Field>);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('omits the label wrapper when no label given', () => {
    render(<Field><span>only-child</span></Field>);
    expect(screen.getByText('only-child')).toBeInTheDocument();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});

describe('ReadOnly', () => {
  it('renders a disabled input with the text value', () => {
    render(<ReadOnly>hello</ReadOnly>);
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeDisabled();
  });

  it('joins array children', () => {
    render(<ReadOnly>{['a', 'b', 'c']}</ReadOnly>);
    expect(screen.getByDisplayValue('abc')).toBeInTheDocument();
  });

  it('renders empty for nullish children', () => {
    render(<ReadOnly>{null}</ReadOnly>);
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
  });
});

describe('TextInput', () => {
  it('forwards value and onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} placeholder="type here" />);
    await user.type(screen.getByPlaceholderText('type here'), 'x');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Select', () => {
  it('renders the placeholder and options (string options)', () => {
    render(<Select label="Method" options={['a', 'b']} placeholder="Pick…" />);
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByTestId('rselect-placeholder')).toHaveTextContent('Pick…');
    expect(screen.getByTestId('opt-a')).toBeInTheDocument();
    expect(screen.getByTestId('opt-b')).toBeInTheDocument();
  });

  it('maps {id,name} option objects', () => {
    render(<Select options={[{ id: 'x', name: 'X label' }]} />);
    expect(screen.getByTestId('opt-x')).toHaveTextContent('X label');
  });

  it('maps {value,label} option objects', () => {
    render(<Select options={[{ value: 'y', label: 'Y label' }]} />);
    expect(screen.getByTestId('opt-y')).toHaveTextContent('Y label');
  });

  it('emits the selected value through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={['a', 'b']} onChange={onChange} />);
    await user.click(screen.getByTestId('rselect-pick-b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('reflects the current value', () => {
    render(<Select value="b" options={['a', 'b']} />);
    expect(screen.getByTestId('rselect-value')).toHaveTextContent('b');
  });
});

describe('DateInput', () => {
  it('renders the label and forwards the ISO value/onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput label="Fecha" value="2026-01-01" onChange={onChange} />);
    expect(screen.getByText('Fecha')).toBeInTheDocument();
    const input = screen.getByTestId('date-field');
    expect(input).toHaveValue('2026-01-01');
    await user.clear(input);
    expect(onChange).toHaveBeenCalled();
  });
});

describe('AmountInput', () => {
  it('shows the formatted value when not focused', () => {
    render(<AmountInput label="Importe" value="1250.00" />);
    expect(screen.getByDisplayValue('1250.00')).toBeInTheDocument();
  });

  it('keeps the typed buffer while focused and reverts on blur', async () => {
    const user = userEvent.setup();

    // Parent re-formats the value on every change, like the payment form does.
    function Host() {
      const [v, setV] = useState('0.00');
      return <AmountInput value={v} onChange={() => setV('99.99')} />;
    }
    render(<Host />);
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.type(input, '5');
    // While focused, the buffer keeps the literal keystroke "0.005".
    expect(input).toHaveValue('0.005');
    await user.tab(); // blur → falls back to the formatted parent value
    expect(input).toHaveValue('99.99');
  });

  it('is disabled when readOnly', () => {
    render(<AmountInput value="10.00" readOnly />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ETP-4314 — AmountInput used to hardcode a literal '€' suffix regardless of
  // the actual account/document currency (visually confirmed on a real USD
  // financial account). It now resolves the real symbol from the `currency`
  // prop via getCurrencySymbol(), with '€' kept only as the backward-compatible
  // default when no `currency` prop is passed at all.
  describe('currency symbol (ETP-4314)', () => {
    it('falls back to the literal € when no currency prop is given', () => {
      render(<AmountInput value="10.00" />);
      expect(screen.getByText('€')).toBeInTheDocument();
    });

    it('shows $ for currency="USD" (not the hardcoded €)', () => {
      render(<AmountInput value="10.00" currency="USD" />);
      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.queryByText('€')).not.toBeInTheDocument();
    });

    it('shows £ for currency="GBP"', () => {
      render(<AmountInput value="10.00" currency="GBP" />);
      expect(screen.getByText('£')).toBeInTheDocument();
      expect(screen.queryByText('€')).not.toBeInTheDocument();
    });
  });
});

describe('MoneyInput', () => {
  it('shows the value when not focused', () => {
    render(<MoneyInput value="42.00" />);
    expect(screen.getByDisplayValue('42.00')).toBeInTheDocument();
  });

  it('keeps the typed buffer while focused, reverts to value on blur', async () => {
    const user = userEvent.setup();
    function Host() {
      const [v] = useState('0.00');
      return <MoneyInput value={v} onChange={() => {}} placeholder="0.00" />;
    }
    render(<Host />);
    const input = screen.getByPlaceholderText('0.00');
    await user.click(input);
    await user.type(input, '7');
    expect(input).toHaveValue('0.007');
    await user.tab();
    expect(input).toHaveValue('0.00');
  });

  it('calls onChange on each keystroke', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MoneyInput value="" onChange={onChange} placeholder="amt" />);
    await user.type(screen.getByPlaceholderText('amt'), '12');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('respects disabled', () => {
    render(<MoneyInput value="1" disabled placeholder="amt" />);
    expect(screen.getByPlaceholderText('amt')).toBeDisabled();
  });
});

describe('LookupPicker', () => {
  const makeHook = (results, loading = false) => () => ({ results, loading });

  it('seeds the query from value.name', () => {
    render(<LookupPicker value={{ id: '1', name: 'Acme' }} onChange={vi.fn()} useLookup={makeHook([])} />);
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
  });

  it('opens results and calls onChange with the picked row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rows = [{ id: '1', name: 'Acme' }, { id: '2', name: 'Globex' }];
    render(<LookupPicker value={null} onChange={onChange} useLookup={makeHook(rows)} placeholder="Buscar…" />);

    await user.click(screen.getByPlaceholderText('Buscar…'));
    expect(screen.getByTestId('popover')).toHaveAttribute('data-open', 'true');
    await user.click(screen.getByText('Globex'));
    expect(onChange).toHaveBeenCalledWith({ id: '2', name: 'Globex' });
  });

  it('clears a selected value when the user types over it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LookupPicker value={{ id: '1', name: 'Acme' }} onChange={onChange} useLookup={makeHook([{ id: '9', name: 'New' }])} />);
    await user.type(screen.getByDisplayValue('Acme'), 'z');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the loading placeholder when loading with no results', async () => {
    const user = userEvent.setup();
    render(<LookupPicker value={null} onChange={vi.fn()} useLookup={makeHook([], true)} placeholder="Buscar…" />);
    await user.click(screen.getByPlaceholderText('Buscar…'));
    expect(screen.getByText('…')).toBeInTheDocument();
  });
});

// ETP-4924 follow-up — ChipSelect had no keyboard handling at all (mouse-only
// option selection). handleInputKeyDown was ported from CreatableSearchSelect's
// handleInputKeyDown, so these mirror that reference component's arrow/Home/End/
// Enter/Escape behavior, including its stricter Enter guard (no fallback to the
// first result when nothing is highlighted, unlike InlineSearchCombo).
describe('ChipSelect keyboard navigation', () => {
  const FAKE_RESULTS = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Gamma' },
  ];
  // Static lookup that ignores the query arg — real search isn't the point here,
  // matching LookupPicker's own makeHook convention above.
  const makeHook = (results, loading = false) => () => ({ results, loading });

  function renderChipSelect(onChange) {
    render(
      <ChipSelect
        value={null}
        onChange={onChange}
        useLookup={makeHook(FAKE_RESULTS)}
        placeholder="Buscar…"
        testId="test-chip"
      />,
    );
    return screen.getByTestId('test-chip-search');
  }

  it('ArrowDown twice then Enter selects the second result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input); // focus opens the popover (onFocus -> setOpen(true))
    // activeIndex starts at -1. Math.min(i + 1, results.length - 1) with
    // results.length === 3: press 1 -> min(0, 2) = 0; press 2 -> min(1, 2) = 1.
    // Index 1 is Beta.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[1]);
  });

  it('ArrowDown past the last result clamps the highlight at the last item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    // 5 ArrowDowns with only 3 results: 0, 1, 2, 2, 2 (clamped by
    // Math.min(i + 1, results.length - 1) — never wraps, never throws).
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[2]);
  });

  it('ArrowUp with nothing highlighted clamps at the first result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    // From activeIndex -1: Math.max(i - 1, 0) = Math.max(-2, 0) = 0 — the first
    // ArrowUp already lands on the first result, it doesn't go negative.
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[0]);
  });

  it('Enter with no prior arrow key press does not select anything', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    // activeIndex is still -1 — the `case 'Enter':` guard requires
    // `activeIndex >= 0 && results[activeIndex]`, so this is a deliberate no-op
    // (ChipSelect matches CreatableSearchSelect's stricter behavior, not
    // InlineSearchCombo's fallback-to-first-result).
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape closes the dropdown without selecting anything', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    expect(screen.getByTestId('popover')).toHaveAttribute('data-open', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('test-chip-option-a')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('popover')).toHaveAttribute('data-open', 'false');
    expect(onChange).not.toHaveBeenCalled();
    // close() flips `open`, and the activeIndex-reset effect is keyed on `open`,
    // so the highlight is gone too — even though the mocked PopoverContent (unlike
    // the real Radix one) keeps rendering the option list regardless of `open`.
    expect(screen.getByTestId('test-chip-option-a')).toHaveAttribute('aria-selected', 'false');
  });

  it('Home jumps the highlight back to the first result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    // Two ArrowDowns land on index 1 (Beta, see arithmetic above) — so Home
    // moving it back to 0 is an observable change, not a no-op.
    await user.keyboard('{ArrowDown}{ArrowDown}{Home}{Enter}');
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[0]);
  });

  it('End jumps the highlight to the last result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    await user.click(input);
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[2]);
  });

  it('a cold ArrowDown (dropdown not yet open) only opens it, it does not move the highlight', () => {
    const onChange = vi.fn();
    const input = renderChipSelect(onChange);
    // NOTE: ChipSelect's input already calls setOpen(true) on focus, so a real
    // user.click()/user.keyboard() flow always has `open === true` by the time a
    // key is pressed — the `if (!open && ...)` early-return branch in
    // handleInputKeyDown is unreachable through a normal focus-then-type flow.
    // Dispatch the keydown directly on the un-focused node with fireEvent
    // (not userEvent, which would focus it first) to exercise that branch.
    expect(screen.getByTestId('popover')).toHaveAttribute('data-open', 'false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('popover')).toHaveAttribute('data-open', 'true');
    expect(onChange).not.toHaveBeenCalled();
    // Enter right after the opening ArrowDown must not select anything —
    // activeIndex is still -1, that first press only opened the popover.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    // A SECOND ArrowDown (now that `open` is already true) is what actually
    // highlights index 0.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(FAKE_RESULTS[0]);
  });
});

describe('Note & SectionLabel', () => {
  it('Note renders its children', () => {
    render(<Note><b>bold</b> rest</Note>);
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('SectionLabel renders its children', () => {
    render(<SectionLabel>Section A</SectionLabel>);
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });
});
