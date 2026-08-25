import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// ETP-4600 Gap A parity for the LINE-GRID selector — keyboard navigation
// (ArrowUp/Down/Home/End/Enter) plus the ARIA wiring that ships alongside it.
// Mirrors CreatableSearchSelect-etp4600.vitest.jsx's equivalent header-selector
// coverage; see InlineSearchCombo.jsx's onKeyDown handler for the source.
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron" />,
  X: () => <span data-testid="x-icon" />,
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
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('inline-add-option-tax-iva21')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'false');

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
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'true');
  });

  it('Home jumps to the first option, End jumps to the last option', async () => {
    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));

    fireEvent.keyDown(input, { key: 'End' });
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Home' });
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('aria-selected', 'false');
  });

  it('mouse hover over an option moves the same highlight state keyboard uses', async () => {
    const { input, onChange } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-exento'));

    fireEvent.mouseEnter(screen.getByTestId('inline-add-option-tax-exento'));
    expect(screen.getByTestId('inline-add-option-tax-exento')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('inline-add-option-tax-iva10')).toHaveAttribute('aria-selected', 'false');

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
