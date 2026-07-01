import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckboxGroup, { isCheckedYN } from '../CheckboxGroup.jsx';

// ---------------------------------------------------------------------------
// isCheckedYN — pure function truth table
// ---------------------------------------------------------------------------

describe('isCheckedYN', () => {
  describe('truthy values', () => {
    it('returns true for boolean true', () => {
      expect(isCheckedYN(true)).toBe(true);
    });

    it('returns true for the string "Y"', () => {
      expect(isCheckedYN('Y')).toBe(true);
    });

    it('returns true for the string "true"', () => {
      expect(isCheckedYN('true')).toBe(true);
    });
  });

  describe('falsy values', () => {
    it('returns false for boolean false', () => {
      expect(isCheckedYN(false)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isCheckedYN(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isCheckedYN(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isCheckedYN('')).toBe(false);
    });

    it('returns false for lowercase "y" (not in the accepted set)', () => {
      expect(isCheckedYN('y')).toBe(false);
    });

    it('returns false for lowercase "true" is truthy — actually it IS truthy per source', () => {
      // Source: v === true || v === 'Y' || v === 'true'
      // "true" (lowercase) IS truthy per source — this confirms exact source behavior
      expect(isCheckedYN('true')).toBe(true);
    });

    it('returns false for string "1"', () => {
      expect(isCheckedYN('1')).toBe(false);
    });

    it('returns false for string "N"', () => {
      expect(isCheckedYN('N')).toBe(false);
    });

    it('returns false for number 1', () => {
      expect(isCheckedYN(1)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// CheckboxGroup — rendering
// ---------------------------------------------------------------------------

const ITEMS = [
  { key: 'active', label: 'Active', column: 'isActive' },
  { key: 'featured', label: 'Featured', column: 'isFeatured' },
];

function renderGroup(overrides = {}) {
  const defaults = {
    label: 'Options',
    items: ITEMS,
    data: {},
    readOnly: false,
    onChange: vi.fn(),
  };
  return render(<CheckboxGroup {...defaults} {...overrides} />);
}

describe('CheckboxGroup', () => {
  // ---- Rendering ----

  it('renders the group label', () => {
    renderGroup();
    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('renders a button per item', () => {
    renderGroup();
    expect(screen.getByTestId('field-active')).toBeInTheDocument();
    expect(screen.getByTestId('field-featured')).toBeInTheDocument();
  });

  it('renders item labels next to buttons', () => {
    renderGroup();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  // ---- aria-checked reflects data ----

  it('sets aria-checked="false" when data value is falsy', () => {
    renderGroup({ data: { active: false, featured: null } });
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('field-featured')).toHaveAttribute('aria-checked', 'false');
  });

  it('sets aria-checked="true" when data value is boolean true', () => {
    renderGroup({ data: { active: true } });
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'true');
  });

  it('sets aria-checked="true" when data value is "Y"', () => {
    renderGroup({ data: { active: 'Y' } });
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'true');
  });

  it('sets aria-checked="true" when data value is "true"', () => {
    renderGroup({ data: { featured: 'true' } });
    expect(screen.getByTestId('field-featured')).toHaveAttribute('aria-checked', 'true');
  });

  it('sets aria-checked="false" when data is empty object', () => {
    renderGroup({ data: {} });
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('field-featured')).toHaveAttribute('aria-checked', 'false');
  });

  it('handles null data without crashing', () => {
    renderGroup({ data: null });
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'false');
  });

  // ---- Click — not readOnly ----

  it('calls onChange with (key, true, column) when clicking an unchecked box', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderGroup({ data: { active: false }, onChange });

    await user.click(screen.getByTestId('field-active'));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('active', true, 'isActive');
  });

  it('calls onChange with (key, false, column) when clicking a checked box', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderGroup({ data: { active: true }, onChange });

    await user.click(screen.getByTestId('field-active'));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('active', false, 'isActive');
  });

  it('does NOT call onChange for a different item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderGroup({ data: {}, onChange });

    await user.click(screen.getByTestId('field-active'));

    // onChange called once, for 'active' only
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith('featured', expect.anything(), expect.anything());
  });

  // ---- readOnly — disabled, no onChange ----

  it('disables all buttons when readOnly is true', () => {
    renderGroup({ readOnly: true });
    expect(screen.getByTestId('field-active')).toBeDisabled();
    expect(screen.getByTestId('field-featured')).toBeDisabled();
  });

  it('does NOT call onChange when clicking a readOnly button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderGroup({ readOnly: true, onChange });

    // userEvent.click on a disabled button should not trigger the handler
    await user.click(screen.getByTestId('field-active'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not crash when onChange is undefined and button is clicked', async () => {
    const user = userEvent.setup();
    // No onChange provided
    renderGroup({ data: {}, onChange: undefined });

    // Should not throw
    await user.click(screen.getByTestId('field-active'));
  });

  // ---- Checked state renders checkmark SVG ----

  it('renders a checkmark SVG inside a checked button', () => {
    const { container } = renderGroup({ data: { active: true } });
    const button = screen.getByTestId('field-active');
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('does not render a checkmark SVG inside an unchecked button', () => {
    const { container } = renderGroup({ data: { active: false } });
    const button = screen.getByTestId('field-active');
    const svg = button.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  // ---- Empty items list ----

  it('renders no buttons when items array is empty', () => {
    renderGroup({ items: [] });
    expect(screen.getByText('Options')).toBeInTheDocument();
    // No checkbox buttons
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
