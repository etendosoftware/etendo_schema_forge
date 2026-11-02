// @covers tools/app-shell/src/components/forms/fields.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the date picker portal so the wrappers' own logic is testable in jsdom.
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input
      data-testid="date-field"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import {
  Field, DateInput, ChipSelect,
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
  // keeping the stub hook trivial.
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
    return screen.getByTestId('field-test-chip');
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
    expect(screen.getByTestId('options-test-chip')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('option-test-chip-a')).toHaveAttribute('data-highlighted', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('options-test-chip')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
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
    // ChipSelect is a thin wrapper over CreatableSearchSelect (ETP-5728), whose input opens on
    // focus, so a real click/keyboard flow always has `open === true` by the time a key is
    // pressed. Dispatch the keydown on the un-focused node with fireEvent (userEvent would focus
    // it first) to exercise the cold-open branch.
    expect(screen.queryByTestId('options-test-chip')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('options-test-chip')).toBeInTheDocument();
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

// ETP-5479 — ChipSelect draws the same field shell as CreatableSearchSelect, so it must
// share the unified hover fill and the disabled fill/border (no opacity dimming).
describe('ChipSelect unified field states (ETP-5479)', () => {
  const noResults = () => ({ results: [], loading: false });

  function shellOf(props) {
    render(
      <ChipSelect value={null} onChange={vi.fn()} useLookup={noResults} testId="state-chip" {...props} />,
    );
    return screen.getByTestId('field-state-chip').closest('.group.relative');
  }

  it('enabled: control border, card fill and the shared --field-hover hover', () => {
    const cls = shellOf().className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining([
      'border-[hsl(var(--border-control))]', 'bg-card', 'hover:bg-[hsl(var(--field-hover))]',
    ]));
    expect(cls).not.toContain('hover:bg-[hsl(var(--muted))]');
  });

  it('disabled: shared disabled fill/border and text, no hover, no opacity', () => {
    const shell = shellOf({ disabled: true });
    const cls = shell.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining([
      'bg-[hsl(var(--field-hover))]', 'border-[hsl(var(--field-disabled-border))]',
      'text-text-disabled', 'cursor-not-allowed',
    ]));
    expect(cls).not.toContain('border-[hsl(var(--border-control))]');
    expect(shell.className).not.toMatch(/opacity-|hover:bg-/);
  });
});

// ETP-5728 — ChipSelect is a THIN WRAPPER over CreatableSearchSelect (the system-wide selector of
// "País"): {id,name} adapter, disabled, lookup mode, and the chevron TOGGLES the list.
describe('ChipSelect wrapper over CreatableSearchSelect (ETP-5728)', () => {
  const rows = [{ id: 'a', name: 'Alpha', extra: 1 }, { id: 'b', name: 'Beta' }];
  const lookup = () => ({ results: rows, loading: false });
  const isOpen = () => !!screen.queryByTestId('options-cv');

  function setup(props = {}) {
    const onChange = props.onChange ?? vi.fn();
    render(<ChipSelect value={null} onChange={onChange} useLookup={lookup} testId="cv" {...props} />);
    return onChange;
  }

  it('lookup mode: rows come from useLookup and are rendered under the shared testids', () => {
    setup();
    fireEvent.click(screen.getByTestId('ChevronDown__cv'));
    expect(screen.getByTestId('option-cv-a')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('option-cv-b')).toHaveTextContent('Beta');
  });

  it('adapter: picking a row calls onChange with the whole lookup row', () => {
    const onChange = setup();
    fireEvent.click(screen.getByTestId('ChevronDown__cv'));
    fireEvent.mouseDown(screen.getByTestId('option-cv-a'));
    expect(onChange).toHaveBeenCalledWith(rows[0]);
  });

  it('adapter: {id,name} value renders as a chip and the X clears with null', () => {
    const onChange = setup({ value: { id: 'a', name: 'Alpha' } });
    expect(screen.getByTestId('field-cv-chip')).toHaveTextContent('Alpha');
    fireEvent.mouseDown(screen.getByLabelText('clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('passes the placeholder through to the input', () => {
    setup({ placeholder: 'Pick one' });
    expect(screen.getByTestId('field-cv')).toHaveAttribute('placeholder', 'Pick one');
  });

  it('chevron click opens the list, a second click CLOSES it (toggle)', () => {
    setup();
    expect(isOpen()).toBe(false);
    fireEvent.click(screen.getByTestId('ChevronDown__cv'));
    expect(isOpen()).toBe(true);
    fireEvent.click(screen.getByTestId('ChevronDown__cv'));
    expect(isOpen()).toBe(false);
  });

  it('chevron click with a value enters editing mode (input shown, list open)', async () => {
    setup({ value: { id: 'a', name: 'Alpha' } });
    expect(screen.queryByTestId('field-cv')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ChevronDown__cv'));
    expect(screen.getByTestId('field-cv')).toBeInTheDocument();
    // the input is focused on the next animation frame, which is what opens the list
    expect(await screen.findByTestId('options-cv')).toBeInTheDocument();
  });

  it('disabled: input and chevron are disabled and clicks do not open the list', () => {
    setup({ disabled: true });
    expect(screen.getByTestId('field-cv')).toBeDisabled();
    expect(screen.getByTestId('ChevronDown__cv').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('field-cv').closest('.group.relative'));
    expect(isOpen()).toBe(false);
  });

  it('disabled with a value keeps the chip read-only (no clear X)', () => {
    setup({ disabled: true, value: { id: 'a', name: 'Alpha' } });
    expect(screen.getByTestId('field-cv-chip')).toBeDisabled();
    expect(screen.queryByLabelText('clear')).not.toBeInTheDocument();
  });
});

describe('ChipSelect — never shows a raw id', () => {
  it('a value with an id but no name does not render the id as the chip label', () => {
    render(
      <ChipSelect
        value={{ id: 'RAW-ID-123' }}
        onChange={vi.fn()}
        useLookup={() => ({ results: [], loading: false })}
        testId="raw-chip"
      />,
    );
    expect(screen.queryByText('RAW-ID-123')).not.toBeInTheDocument();
  });
});
