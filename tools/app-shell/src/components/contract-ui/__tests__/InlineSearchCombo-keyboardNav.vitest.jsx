import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// ETP-4600 Gap A parity for the LINE-GRID selector — keyboard navigation
// (ArrowUp/Down/Home/End/Enter) plus the ARIA wiring that ships alongside it.
// Mirrors CreatableSearchSelect-etp4600.vitest.jsx's equivalent header-selector
// coverage; see InlineSearchCombo.jsx's onKeyDown handler for the source.
//
// ETP-5846 rewrote the per-row assertions in the first four cases: they used to
// assert `aria-selected` to follow the keyboard highlight, which is precisely
// the conflation the issue reports — one attribute was doing two jobs (current
// value AND focus), so neither was readable. The highlight now has its own
// `data-highlighted` marker, `aria-selected` means "this is your committed value",
// and `aria-activedescendant` on the input is what exposes the highlight.
// The behavior under test (which option Enter selects) is unchanged and still
// asserted in full.
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron" />,
  X: () => <span data-testid="x-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import InlineSearchCombo from '../InlineSearchCombo.jsx';

const FIELD = { key: 'tax' };

const OPTIONS = [
  { id: 'iva10', name: 'IVA 10%' },
  { id: 'iva21', name: 'IVA 21%' },
  { id: 'exento', name: 'Exento' },
];

function renderCombo(overrides = {}) {
  const onChange = vi.fn();
  const onKeyDown = vi.fn();
  const props = {
    field: FIELD,
    value: '',
    options: OPTIONS,
    onChange,
    onKeyDown,
    placeholder: 'Search tax',
    clearOnType: true,
    ...overrides,
  };
  const result = render(<InlineSearchCombo {...props} />);
  const input = screen.queryByTestId('inline-add-field-tax');
  return { ...result, input, onChange, onKeyDown };
}

describe('InlineSearchCombo — keyboard navigation (ETP-4600 Gap A parity, line grid)', () => {
  it('ArrowDown highlights the first option, then the next, and Enter selects the highlighted (2nd) option', async () => {
    const { input, onChange } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('data-highlighted', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('inline-add-option-tax-iva21')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).not.toHaveAttribute('data-highlighted');

    fireEvent.keyDown(input, { key: 'Enter' });
    // Selects the SECOND option (iva21), not the first — confirms activeIndex, not
    // the filtered[0] fallback, drove this selection.
    expect(onChange).toHaveBeenCalledWith('iva21', 'IVA 21%', expect.objectContaining({ id: 'iva21' }));
  });

  it('ArrowUp clamps at the first option (does not go negative / wrap)', async () => {
    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('data-highlighted', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('data-highlighted', 'true');
  });

  it('Home jumps to the first option, End jumps to the last option', async () => {
    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    fireEvent.keyDown(input, { key: 'End' });
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('data-highlighted', 'true');

    fireEvent.keyDown(input, { key: 'Home' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('inline-add-option-tax-exento')).not.toHaveAttribute('data-highlighted');
  });

  it('mouse hover over an option moves the same highlight state keyboard uses', async () => {
    const { input, onChange } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-exento'));

    fireEvent.mouseEnter(screen.getByTestId('inline-add-option-tax-exento'));
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).not.toHaveAttribute('data-highlighted');

    // Enter now selects the hovered option, not filtered[0] — proves hover and
    // keyboard share the same activeIndex state.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('exento', 'Exento', expect.objectContaining({ id: 'exento' }));
  });

  it('exposes combobox ARIA wiring: role, aria-expanded, aria-activedescendant, listbox/option roles', async () => {
    const { input } = renderCombo();
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'tax-inline-option-iva10');
    expect(screen.getByTestId('inline-add-options-tax')).toHaveAttribute('role', 'listbox');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('role', 'option');
  });

  it('Enter with no arrow key pressed still selects filtered[0] (regression guard for the fallback)', async () => {
    const { input, onChange } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    // No ArrowUp/Down/Home/End at all — activeIndex stays -1.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('iva10', 'IVA 10%', expect.objectContaining({ id: 'iva10' }));
  });

  it('ArrowDown/ArrowUp on a CLOSED combo do not throw, do not open it, and fall through to onKeyDown', () => {
    const { input, onKeyDown } = renderCombo();
    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();

    expect(() => fireEvent.keyDown(input, { key: 'ArrowDown' })).not.toThrow();
    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    expect(() => fireEvent.keyDown(input, { key: 'ArrowUp' })).not.toThrow();
    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// ETP-5846 — Enter must not silently replace a committed value with the first
// option, while the validated empty-field "Enter picks the first match" flow
// keeps working. `activeIndex` is -1 in the first case, so the old
// `activeIndex >= 0 ? filtered[activeIndex] : filtered[0]` fallback fired and
// rewrote the user's own selection (measured on the unmodified component:
// committed "iva21" -> Enter -> onChange("iva10", ...)).
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — ETP-5846 Enter never overwrites the committed value', () => {
  it('Enter on an untouched reopen of a value at index > 0 keeps the value (no onChange)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva21', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva21'));

    // No arrow key, no typed query: nothing to pick, and definitely not row 0.
    fireEvent.keyDown(screen.getByTestId('inline-add-field-tax'), { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    // The panel closed and the committed value is untouched, so the cell goes back to its chip
    // with the committed label (the parent still holds `value: 'iva21'`).
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-field-tax-chip')).toHaveTextContent('IVA 21%');
    });
  });

  it('Enter on an untouched reopen does not select the first row even when the value is at index 0', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva10', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    await user.keyboard('{Enter}');
    // Idempotent here, but it must still be a no-op write — reopening is not a commit.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still selects the first match on Enter on an EMPTY field (the validated grid-entry flow)', async () => {
    const { input, onChange } = renderCombo({ value: '', options: OPTIONS });
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('iva10', 'IVA 10%', expect.objectContaining({ id: 'iva10' }));
  });

  it('still selects the first match on Enter AFTER a typed query, even with a committed value', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva21', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    // Typing is explicit intent: the user is choosing among matches now.
    fireEvent.change(input, { target: { value: 'exen' } });
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(1));

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('exento', 'Exento', expect.objectContaining({ id: 'exento' }));
  });

  it('still selects the navigated row on Enter when a value is committed (arrow = explicit intent)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva21', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    // From index -1: ArrowDown -> iva10, ArrowDown -> iva21, ArrowDown -> exento.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('data-highlighted', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('exento', 'Exento', expect.objectContaining({ id: 'exento' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps selection (aria-selected) and keyboard highlight (data-highlighted) as independent states', async () => {
    const user = userEvent.setup();
    renderCombo({ value: 'iva21', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    // Opening: selected but not highlighted.
    expect(screen.getByTestId('inline-add-option-tax-iva21')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva21')).not.toHaveAttribute('data-highlighted');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Now the first row is highlighted AND not selected; the committed row is selected AND not highlighted.
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('inline-add-option-tax-iva21')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva21')).not.toHaveAttribute('data-highlighted');
  });
});
