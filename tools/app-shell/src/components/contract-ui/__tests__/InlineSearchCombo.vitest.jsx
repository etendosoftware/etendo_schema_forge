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
