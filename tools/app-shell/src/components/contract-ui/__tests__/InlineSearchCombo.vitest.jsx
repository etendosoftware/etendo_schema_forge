import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('lucide-react', () => ({ ChevronDown: () => <span data-testid="chevron" /> }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
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
  const input = screen.getByTestId('inline-add-field-tax');
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
    const { input, onChange } = renderCombo({ value: 'iva10', clearOnType: true });
    await user.click(input);
    await user.type(input, 'x');
    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('does NOT call onChange while typing when clearOnType=false', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderCombo({ value: 'iva10', clearOnType: false });
    await user.click(input);
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
    expect(screen.getByTestId('inline-add-field-tax')).toHaveValue('Exento');
  });

  it('shows displayLabel as fallback when value is not in options', () => {
    renderCombo({ value: 'other-id', options: OPTIONS, displayLabel: 'External Label' });
    expect(screen.getByTestId('inline-add-field-tax')).toHaveValue('External Label');
  });
});

// ---------------------------------------------------------------------------
// 6b. ETP-4600 — reopening a committed value shows an empty search box + full list
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — ETP-4600 empty-search-on-open parity with the header selector', () => {
  it('shows the committed label when closed, then an EMPTY input + full option list on focus', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ value: 'iva10', options: OPTIONS });

    // Closed: cell shows the committed value's label, not blank.
    expect(input).toHaveValue('IVA 10%');

    await user.click(input);

    // Open: search box goes EMPTY (not pre-filled with "IVA 10%")...
    await waitFor(() => expect(input).toHaveValue(''));
    // ...and the full option list is shown, not pre-filtered down to the one match.
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-iva10')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-iva21')).toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
    });
  });

  it('retains the committed value and restores its label if closed without selecting', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderCombo({ value: 'iva10', options: OPTIONS, clearOnType: false });

    await user.click(input);
    await waitFor(() => expect(input).toHaveValue(''));

    // Close without picking anything (blur).
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument());

    // No onChange('', '') should ever have been fired — the committed value survives.
    expect(onChange).not.toHaveBeenCalled();
    // Label is restored once the combo is closed again.
    expect(input).toHaveValue('IVA 10%');
  });

  it('does not leak a previously typed search term into the next reopen', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ value: 'iva10', options: OPTIONS, clearOnType: false });

    await user.click(input);
    await user.type(input, 'exen');
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-tax-exento')).toBeInTheDocument();
      expect(screen.queryByTestId('inline-add-option-tax-iva10')).not.toBeInTheDocument();
    });

    // Close without selecting.
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument());

    // Reopen: must show an empty box + full list again, not the stale "exen" filter.
    await user.click(input);
    await waitFor(() => expect(input).toHaveValue(''));
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
