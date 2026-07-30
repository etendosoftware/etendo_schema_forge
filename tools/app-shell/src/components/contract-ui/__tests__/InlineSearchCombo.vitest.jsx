import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

// createPortal renders into document.body — keep as-is (JSDOM supports it).

import InlineSearchCombo from '../InlineSearchCombo.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // With a committed value the combo renders a chip (not the plain input) when closed —
  // `input` is only present here for the common (no-value) case; chip tests query it fresh
  // after entering edit mode.
  const input = screen.queryByTestId('inline-add-field-tax');
  return { ...result, input, onChange, onKeyDown };
}

// ---------------------------------------------------------------------------
// 1. Render
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — render', () => {
  it('renders the input with the correct testid', () => {
    renderCombo();
    expect(screen.getByTestId('inline-add-field-tax')).toBeInTheDocument();
  });

  it('renders the toggle button', () => {
    renderCombo();
    expect(screen.getByTestId('inline-add-field-tax-toggle')).toBeInTheDocument();
  });

  it('uses placeholder prop', () => {
    renderCombo();
    expect(screen.getByPlaceholderText('Search tax')).toBeInTheDocument();
  });

  it('does not show dropdown initially', () => {
    renderCombo();
    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Dropdown opens
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — dropdown open', () => {
  it('opens the dropdown on focus', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-options-tax')).toBeInTheDocument();
    });
  });

  it('opens the dropdown when toggle button is clicked', async () => {
    const user = userEvent.setup();
    renderCombo();
    await user.click(screen.getByTestId('inline-add-field-tax-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-options-tax')).toBeInTheDocument();
    });
  });

  it('shows all options when no query is typed', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-iva21')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Filtering
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — filtering', () => {
  it('filters options by typed text (case-insensitive)', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    await user.type(input, 'iva');
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-iva21')).toBeInTheDocument();
      expect(screen.queryByTestId('inline-add-option-tax-exento')).not.toBeInTheDocument();
    });
  });

  it('hides dropdown when no options match', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    await user.type(input, 'zzznomatch');
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Selection
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — selection', () => {
  it('calls onChange with id and name when option is clicked', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderCombo();
    await user.click(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva21'));
    await user.pointer({ target: screen.getByTestId('inline-add-option-tax-iva21'), keys: '[MouseLeft>]' });
    expect(onChange).toHaveBeenCalledWith('iva21', 'IVA 21%', expect.objectContaining({ id: 'iva21' }));
  });

  it('closes the dropdown after selection', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));
    await user.pointer({ target: screen.getByTestId('inline-add-option-tax-iva10'), keys: '[MouseLeft>]' });
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
    });
  });

  it('selects the first filtered option on Enter', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderCombo();
    await user.click(input);
    await user.type(input, 'iva');
    await waitFor(() => screen.getByTestId('inline-add-option-tax-iva10'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('iva10', 'IVA 10%', expect.objectContaining({ id: 'iva10' }));
  });

  it('propagates Enter to onKeyDown when dropdown is closed', async () => {
    const user = userEvent.setup();
    const { input, onKeyDown } = renderCombo();
    await user.click(input);
    // Close dropdown first by typing something that yields no results
    await user.type(input, 'zzz');
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument());
    await user.keyboard('{Enter}');
    expect(onKeyDown).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. clearOnType behaviour
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — clearOnType', () => {
  it('calls onChange("", "") while typing when clearOnType=true and value is set', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva10', clearOnType: true });
    // A committed value renders as a chip when closed — enter edit mode via the chip first.
    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await user.type(input, 'x');
    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('does NOT call onChange while typing when clearOnType=false', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva10', clearOnType: false });
    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await user.type(input, 'x');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Display sync
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — display sync', () => {
  it('shows the label of the selected option when value matches static options', () => {
    renderCombo({ value: 'exento', options: OPTIONS });
    // Closed + committed value now renders as a chip, not a plain input.
    expect(screen.getByTestId('inline-add-field-tax-chip')).toHaveTextContent('Exento');
  });

  it('shows displayLabel as fallback when value is not in options', () => {
    renderCombo({ value: 'other-id', options: OPTIONS, displayLabel: 'External Label' });
    expect(screen.getByTestId('inline-add-field-tax-chip')).toHaveTextContent('External Label');
  });
});

// ---------------------------------------------------------------------------
// 6b. ETP-4600 — reopening a committed value shows an empty search box + full list
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — ETP-4600 empty-search-on-open parity with the header selector', () => {
  it('shows the committed label when closed, then an EMPTY input + full option list on entering edit mode', async () => {
    const user = userEvent.setup();
    renderCombo({ value: 'iva10', options: OPTIONS });

    // Closed: cell shows the committed value's label as a chip, not a plain input.
    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip).toHaveTextContent('IVA 10%');

    await user.click(chip);

    // Open: search box goes EMPTY (not pre-filled with "IVA 10%")...
    const input = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => expect(input).toHaveValue(''));
    // ...and the full option list is shown, not pre-filtered down to the one match.
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-iva21')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
    });
  });

  it('retains the committed value and restores its chip label if closed without selecting', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva10', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => expect(input).toHaveValue(''));

    // Close without picking anything (blur).
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument());

    // No onChange('', '') should ever have been fired — the committed value survives.
    expect(onChange).not.toHaveBeenCalled();
    // The chip is restored once the combo is closed again.
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-field-tax-chip')).toHaveTextContent('IVA 10%');
    });
  });

  it('does not leak a previously typed search term into the next reopen', async () => {
    const user = userEvent.setup();
    renderCombo({ value: 'iva10', options: OPTIONS, clearOnType: false });

    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const input = await screen.findByTestId('inline-add-field-tax');
    await user.type(input, 'exen');
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
      expect(screen.queryByTestId('inline-add-option-tax-iva10')).not.toBeInTheDocument();
    });

    // Close without selecting.
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument());

    // Reopen via the chip: must show an empty box + full list again, not the stale "exen" filter.
    await user.click(screen.getByTestId('inline-add-field-tax-chip'));
    const reopenedInput = await screen.findByTestId('inline-add-field-tax');
    await waitFor(() => expect(reopenedInput).toHaveValue(''));
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 7. onWheel avoids double-scroll outside a Dialog (review fix)
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — onWheel avoids double-scroll outside a Dialog', () => {
  function dispatchWheel(el, { deltaY, defaultPrevented }) {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    if (defaultPrevented) event.preventDefault();
    el.dispatchEvent(event);
  }

  it('does NOT manually adjust scrollTop when native scroll was not blocked (no Dialog present)', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    const panel = await waitFor(() => screen.getByTestId('inline-add-options-tax'));
    panel.scrollTop = 0;

    dispatchWheel(panel, { deltaY: 40, defaultPrevented: false });

    expect(panel.scrollTop).toBe(0);
  });

  it('manually adjusts scrollTop when native scroll WAS blocked (e.g. inside a Radix Dialog)', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);
    const panel = await waitFor(() => screen.getByTestId('inline-add-options-tax'));
    panel.scrollTop = 0;

    dispatchWheel(panel, { deltaY: 40, defaultPrevented: true });

    expect(panel.scrollTop).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 8. ETP-4600 Gap C — auto-width, non-truncating dropdown panel
// ---------------------------------------------------------------------------
//
// JSDOM zeroes getBoundingClientRect/scrollWidth, so a precise "the panel grew
// to fit its longest option" assertion isn't feasible here (see
// CreatableSearchSelect's identical panel for the same constraint). This is a
// lightweight shape-check instead: the open panel's inline style must describe
// a content-sized box (`width: 'max-content'` + a `minWidth`/`maxWidth` pair),
// never a fixed pixel `width`. That's the one invariant a revert to a fixed-width
// dropdown would break, and it's enough to catch that regression.
describe('InlineSearchCombo — ETP-4600 Gap C auto-width dropdown (shape check)', () => {
  it('opens with width: max-content plus minWidth/maxWidth, never a fixed pixel width', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo();
    await user.click(input);

    const panel = await waitFor(() => screen.getByTestId('inline-add-options-tax'));
    const style = panel.style;

    expect(style.width).toBe('max-content');
    expect(style.minWidth).not.toBe('');
    expect(style.maxWidth).not.toBe('');
    // A plain numeric/px width (e.g. "240px") would mean the fixed-width dropdown
    // regressed back in — the panel must never carry one alongside max-content.
    expect(style.width).not.toMatch(/^\d/);
  });
});

describe('InlineSearchCombo — toggle button clears query on close (ETP-4600)', () => {
  it('clears the typed query immediately when closing via the toggle, without waiting for blur', async () => {
    const { input } = renderCombo();
    const toggle = screen.getByTestId('inline-add-field-tax-toggle');

    // Open via the toggle.
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId('inline-add-options-tax')).toBeInTheDocument());

    // Type a query without selecting anything.
    fireEvent.change(input, { target: { value: 'IVA' } });
    expect(input.value).toBe('IVA');

    // Close via the toggle (the `else` branch) — its onMouseDown preventDefault keeps focus
    // on the input, so no blur/blur-timeout fires from this click; only the toggle's own
    // setQuery('') can explain an immediate reset.
    fireEvent.click(toggle);

    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();
    expect(input.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 9. ETP-4600 — hover-revealed chip + clear (X), parity with the header's
// CreatableSearchSelect chip (SelectorChip.jsx reused as-is).
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — chip mode (ETP-4600)', () => {
  it('renders a chip (not the plain input) when a value is committed and the combo is closed, with the X hidden until hover/focus-within', () => {
    renderCombo({ value: 'iva10', options: OPTIONS });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('IVA 10%');
    expect(screen.queryByTestId('inline-add-field-tax')).not.toBeInTheDocument();

    // The X is present but relies on group-hover/group-focus-within opacity classes —
    // check the class shape rather than simulating real CSS :hover.
    const clearBtn = chip.querySelector('[aria-label="clear"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn.className).toMatch(/opacity-0/);
    expect(clearBtn.className).toMatch(/group-hover:opacity-100/);
    expect(clearBtn.className).toMatch(/group-focus-within:opacity-100/);
  });

  it('clicking the chip body enters edit mode: input appears, focused, empty query, full option list', async () => {
    const user = userEvent.setup();
    renderCombo({ value: 'iva10', options: OPTIONS });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    await user.click(chip);

    const input = await screen.findByTestId('inline-add-field-tax');
    expect(screen.queryByTestId('inline-add-field-tax-chip')).not.toBeInTheDocument();
    expect(input).toHaveValue('');

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-iva21')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
    });
  });

  it('clicking X commits an immediate clear (onChange called with empty value)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombo({ value: 'iva10', options: OPTIONS });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    const clearBtn = chip.querySelector('[aria-label="clear"]');
    await user.click(clearBtn);

    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('clicking X reopens the combo with focus on the input, so a later outside click closes it (regression guard, mirrors the header fix)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderCombo({ value: 'iva10', options: OPTIONS });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    const clearBtn = chip.querySelector('[aria-label="clear"]');
    await user.click(clearBtn);

    // Chip unmounts and the input mounts (setOpen(true) in handleClear signals reopen intent).
    const input = await screen.findByTestId('inline-add-field-tax');

    // Without the fix, focus never moves to the input after clear — this assertion is
    // exactly what was broken on the header selector and must not regress here either.
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // Simulate the user clicking a different field entirely (outside click) — should fire
    // onBlur on the now-focused input, which closes the dropdown after its own timeout.
    input.blur();
    await vi.advanceTimersByTimeAsync(200);

    expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('hides the X when field.clearable === false, while still showing the chip', () => {
    renderCombo({ value: 'iva10', options: OPTIONS, field: { key: 'tax', clearable: false } });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('IVA 10%');
    expect(chip.querySelector('[aria-label="clear"]')).toBeNull();
  });

  // Follow-up: clearing a NOT-NULL/required line field (e.g. Sales Order line's "Impuesto")
  // always round-trips through a generic backend validation toast — the grid can't turn it
  // into a field-level message. Default to hiding the X on required fields so the user is
  // never handed a clear action that's guaranteed to fail; `field.clearable` still wins when
  // set explicitly, in either direction.
  it('hides the X by default when field.required === true, even without an explicit clearable flag', () => {
    renderCombo({ value: 'iva10', options: OPTIONS, field: { key: 'tax', required: true } });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip).toBeInTheDocument();
    expect(chip.querySelector('[aria-label="clear"]')).toBeNull();
  });

  it('shows the X on a required field when clearable is explicitly set to true (opt back into the risk)', () => {
    renderCombo({ value: 'iva10', options: OPTIONS, field: { key: 'tax', required: true, clearable: true } });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip.querySelector('[aria-label="clear"]')).not.toBeNull();
  });

  it('shows the X by default on a non-required field (baseline, unaffected by the required guard)', () => {
    renderCombo({ value: 'iva10', options: OPTIONS, field: { key: 'tax', required: false } });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    expect(chip.querySelector('[aria-label="clear"]')).not.toBeNull();
  });
});
