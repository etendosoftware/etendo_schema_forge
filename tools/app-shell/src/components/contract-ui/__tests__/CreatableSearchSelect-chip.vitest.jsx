import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks — return the key as-is
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

const FIELD = {
  key: 'address',
  label: 'Address',
  required: false,
};

/**
 * Wrapper that keeps `value` / `displayValue` in state so clearing actually
 * removes the selection on the next render (mirrors how DetailView/EntityForm
 * call CreatableSearchSelect in production).
 */
function Harness({ initialValue = '', initialDisplay = '', onChangeSpy }) {
  const [value, setValue] = React.useState(initialValue);
  const [displayValue, setDisplayValue] = React.useState(initialDisplay);
  const onChange = (id, label) => {
    onChangeSpy?.(id, label);
    setValue(id ?? '');
    setDisplayValue(label ?? '');
  };
  return (
    <CreatableSearchSelect
      field={FIELD}
      value={value}
      displayValue={displayValue}
      onChange={onChange}
      formData={{}}
      resolvedLabel="Address"
      selectorUrl="/api/addresses"
      selectorContext={{}}
      token="test-token"
    />
  );
}

describe('CreatableSearchSelect chip mode (ETP-4000)', () => {
  beforeEach(() => {
    // Lazy options load — return empty list so chip mode behavior does not depend on server data.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the chip (and hides the input) when value and displayValue are both set', () => {
    render(<Harness initialValue="ADDR-1" initialDisplay="123 Main St" />);
    const chip = screen.getByTestId('field-address-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('123 Main St');
    expect(screen.queryByTestId('field-address')).not.toBeInTheDocument();
  });

  it('renders the input with the placeholder when no value is selected', () => {
    render(<Harness initialValue="" initialDisplay="" />);
    expect(screen.queryByTestId('field-address-chip')).not.toBeInTheDocument();
    const input = screen.getByTestId('field-address');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('placeholder')).toMatch(/searchLabelPrefix/);
  });

  it('clicking the chip switches to typing mode and focuses the input', async () => {
    const user = userEvent.setup();
    render(<Harness initialValue="ADDR-1" initialDisplay="123 Main St" />);

    const chip = screen.getByTestId('field-address-chip');
    await user.click(chip);

    const input = await screen.findByTestId('field-address');
    expect(input).toBeInTheDocument();
    expect(screen.queryByTestId('field-address-chip')).not.toBeInTheDocument();

    // requestAnimationFrame defers the focus; wait for it before asserting.
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('clicking the X inside the chip clears the selection (onChange("", ""))', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initialValue="ADDR-1"
        initialDisplay="123 Main St"
        onChangeSpy={onChangeSpy}
      />
    );
    const chip = screen.getByTestId('field-address-chip');
    const clearBtn = chip.querySelector('[aria-label="clear"]');
    expect(clearBtn).not.toBeNull();
    await user.click(clearBtn);

    expect(onChangeSpy).toHaveBeenCalledWith('', '');
  });

  it('renders the ChevronDown icon with ml-auto (right-anchored, parity with SearchInput)', async () => {
    const { container } = render(<Harness />);
    // The component fires a lazy fetch on mount → loading=true initially (renders Loader2).
    // Wait for the fetch to resolve so ChevronDown takes over.
    await waitFor(() => {
      const chevron = container.querySelector('svg.lucide-chevron-down');
      expect(chevron).not.toBeNull();
    });
    const chevron = container.querySelector('svg.lucide-chevron-down');
    expect(chevron.parentElement.getAttribute('class')).toMatch(/(^|\s)ml-auto(\s|$)/);
  });

  it('chevron stays right-anchored when the chip is shown', async () => {
    const { container } = render(
      <Harness initialValue="ADDR-1" initialDisplay="123 Main St" />
    );
    await waitFor(() => {
      const chevron = container.querySelector('svg.lucide-chevron-down');
      expect(chevron).not.toBeNull();
    });
    const chevron = container.querySelector('svg.lucide-chevron-down');
    expect(chevron.parentElement.getAttribute('class')).toMatch(/(^|\s)ml-auto(\s|$)/);
  });
});
