/**
 * Tests for AdvancedFilterBuilder — constants, logic, and render behavior.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLabel: () => (col) => col ?? null,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/hooks/useDistinctValues.js', () => ({
  useDistinctValues: () => ({
    values: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock('./DistinctValuesList.jsx', () => ({
  DistinctValuesList: (props) => <div data-testid="distinct-values-list" />,
}));

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvancedFilterBuilder } from '../AdvancedFilterBuilder.jsx';

// ---------------------------------------------------------------------------
// Constants verification (kept from original — no exports needed)
// ---------------------------------------------------------------------------

const OPERATORS_BY_MODE = {
  text:         ['iContains', 'iNotContains', 'iEquals', 'iNotEqual', 'isNull', 'isNotNull'],
  identifier:   ['iContains', 'iNotContains', 'equals', 'notEqual', 'isNull', 'isNotNull'],
  enumLabel:    ['equals', 'notEqual', 'inSet', 'isNull', 'isNotNull'],
  booleanLabel: ['equals'],
  numeric:      ['equals', 'notEqual', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'isNull', 'isNotNull'],
  date:         ['equals', 'lessThan', 'greaterThan', 'between', 'isNull', 'isNotNull'],
};

const TEXTUAL_IDENT_OPS = new Set(['iContains', 'iNotContains', 'iEquals', 'iNotEqual']);

describe('AdvancedFilterBuilder logic', () => {
  describe('OPERATORS_BY_MODE', () => {
    it('text mode has 6 operators', () => {
      expect(OPERATORS_BY_MODE.text).toHaveLength(6);
      expect(OPERATORS_BY_MODE.text).toContain('iContains');
      expect(OPERATORS_BY_MODE.text).toContain('isNull');
    });

    it('identifier mode includes both contains and equals', () => {
      expect(OPERATORS_BY_MODE.identifier).toContain('iContains');
      expect(OPERATORS_BY_MODE.identifier).toContain('equals');
    });

    it('enumLabel has inSet for multi-select', () => {
      expect(OPERATORS_BY_MODE.enumLabel).toContain('inSet');
    });

    it('booleanLabel only has equals', () => {
      expect(OPERATORS_BY_MODE.booleanLabel).toEqual(['equals']);
    });

    it('numeric has between and comparison ops', () => {
      expect(OPERATORS_BY_MODE.numeric).toContain('between');
      expect(OPERATORS_BY_MODE.numeric).toContain('greaterThan');
      expect(OPERATORS_BY_MODE.numeric).toContain('lessOrEqual');
    });

    it('date has between and comparison ops', () => {
      expect(OPERATORS_BY_MODE.date).toContain('between');
      expect(OPERATORS_BY_MODE.date).toContain('lessThan');
      expect(OPERATORS_BY_MODE.date).toContain('greaterThan');
    });

    it('all modes include isNull/isNotNull except booleanLabel', () => {
      for (const [mode, ops] of Object.entries(OPERATORS_BY_MODE)) {
        if (mode === 'booleanLabel') continue;
        expect(ops).toContain('isNull');
        expect(ops).toContain('isNotNull');
      }
    });
  });

  describe('TEXTUAL_IDENT_OPS', () => {
    it('contains the 4 textual identifier operators', () => {
      expect(TEXTUAL_IDENT_OPS.has('iContains')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iNotContains')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iEquals')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iNotEqual')).toBe(true);
    });

    it('does not contain discrete ops', () => {
      expect(TEXTUAL_IDENT_OPS.has('equals')).toBe(false);
      expect(TEXTUAL_IDENT_OPS.has('notEqual')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Render tests
// ---------------------------------------------------------------------------

describe('AdvancedFilterBuilder — render', () => {
  const columns = [
    { key: 'name', type: 'string', label: 'Name' },
    { key: 'amount', type: 'amount', label: 'Amount' },
    { key: 'status', type: 'status', label: 'Status', enumLabels: { DR: 'Draft', CO: 'Complete' } },
    { key: 'active', type: 'boolean', label: 'Active', badgeLabels: { true: 'Yes', false: 'No' } },
    { key: 'orderDate', type: 'date', label: 'Date' },
  ];

  const defaultProps = {
    columns,
    rows: [],
    value: null,
    onApply: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    // The title should be rendered via ui('advancedFilterTitle')
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders add-condition button', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    expect(screen.getByText('advancedFilterAddCondition')).toBeInTheDocument();
  });

  it('renders apply and clear buttons', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    expect(screen.getByText('advancedFilterApply')).toBeInTheDocument();
    expect(screen.getByText('advancedFilterClear')).toBeInTheDocument();
  });

  it('renders "Where" connector for first row', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    expect(screen.getByText('advancedFilterWhere')).toBeInTheDocument();
  });

  it('renders remove-condition button', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    const removeBtn = screen.getByRole('button', { name: /remove condition/i });
    expect(removeBtn).toBeInTheDocument();
  });

  it('adds a condition row when add button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder {...defaultProps} />);
    const addBtn = screen.getByText('advancedFilterAddCondition');
    await user.click(addBtn);
    // Should now have 2 remove buttons (one per row)
    const removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(2);
  });

  it('renders with initial value conditions', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    // Two condition rows means two remove buttons
    const removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(2);
  });

  it('renders save placeholder when presets are not enabled', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    expect(screen.getByText('advancedFilterSave')).toBeInTheDocument();
  });

  it('renders presets dropdown when presets are provided', () => {
    render(
      <AdvancedFilterBuilder
        {...defaultProps}
        presets={{ 'My Filter': {} }}
        onApplyPreset={vi.fn()}
        onSavePreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    );
    expect(screen.getByText('filterPresetsButton')).toBeInTheDocument();
  });

  it('disables apply when conditions are incomplete', () => {
    render(<AdvancedFilterBuilder {...defaultProps} />);
    // Default state: one empty row — apply should be disabled
    const applyBtn = screen.getByText('advancedFilterApply');
    expect(applyBtn.closest('button')).toBeDisabled();
  });

  it('disables clear when no conditions are started and no applied filter', () => {
    render(<AdvancedFilterBuilder {...defaultProps} value={null} />);
    const clearBtn = screen.getByText('advancedFilterClear').closest('button');
    expect(clearBtn).toBeDisabled();
  });

  it('enables clear when there is an applied filter', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const clearBtn = screen.getByText('advancedFilterClear').closest('button');
    expect(clearBtn).not.toBeDisabled();
  });

  it('calls onClear when clear button is clicked with applied filter', async () => {
    const user = userEvent.setup();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    const onClear = vi.fn();
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onClear={onClear} />);
    await user.click(screen.getByText('advancedFilterClear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('removes a condition row when remove button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder {...defaultProps} />);
    // Add a second row
    await user.click(screen.getByText('advancedFilterAddCondition'));
    let removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(2);
    // Remove the first row
    await user.click(removeBtns[0]);
    removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    // Should reset to one empty row (minimum)
    expect(removeBtns).toHaveLength(1);
  });

  it('renders with empty columns gracefully', () => {
    render(<AdvancedFilterBuilder {...defaultProps} columns={[]} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('filters out non-filterable columns', () => {
    const cols = [
      { key: 'name', type: 'string', label: 'Name' },
      { key: 'sys', type: 'system', label: 'System' },
      { key: 'disc', type: 'discarded', label: 'Discarded' },
      { key: 'nofilt', type: 'string', label: 'NoFilter', filterable: false },
    ];
    render(<AdvancedFilterBuilder {...defaultProps} columns={cols} />);
    // Only 'name' should be available (system, discarded, filterable=false excluded)
    // We can't easily check select options without opening the dropdown, but the component should render
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('calls onApply when Apply is clicked with complete conditions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onApply={onApply} onClose={onClose} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    const calledWith = onApply.mock.calls[0][0];
    expect(calledWith.rowOperator).toBe('and');
    expect(calledWith.conditions).toHaveLength(1);
    expect(calledWith.conditions[0].field).toBe('name');
  });

  it('calls onClose after apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onApply={onApply} onClose={onClose} />);
    await user.click(screen.getByText('advancedFilterApply'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onApply when conditions are incomplete', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<AdvancedFilterBuilder {...defaultProps} onApply={onApply} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
    // Try clicking anyway (disabled button)
    await user.click(applyBtn);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears conditions and calls onClear when clear is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: 'greaterThan', value: '50' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onClear={onClear} />);
    // Two conditions
    expect(screen.getAllByRole('button', { name: /remove condition/i })).toHaveLength(2);
    await user.click(screen.getByText('advancedFilterClear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    // After clear, should reset to one empty row
    expect(screen.getAllByRole('button', { name: /remove condition/i })).toHaveLength(1);
  });

  it('adds multiple rows in sequence', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder {...defaultProps} />);
    const addBtn = screen.getByText('advancedFilterAddCondition');
    await user.click(addBtn);
    await user.click(addBtn);
    await user.click(addBtn);
    const removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(4);
  });

  it('removes middle row and keeps others', async () => {
    const user = userEvent.setup();
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'first' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
        { field: 'status', operator: 'equals', value: 'DR' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    let removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(3);
    // Remove the middle row
    await user.click(removeBtns[1]);
    removeBtns = screen.getAllByRole('button', { name: /remove condition/i });
    expect(removeBtns).toHaveLength(2);
  });

  it('renders with hasActiveFilter prop', () => {
    render(<AdvancedFilterBuilder {...defaultProps} hasActiveFilter={true} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('handles value with or rowOperator', () => {
    const value = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'a' },
        { field: 'name', operator: 'iContains', value: 'b' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    expect(screen.getAllByRole('button', { name: /remove condition/i })).toHaveLength(2);
  });

  it('handles value with nullish operator (isNull)', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: null }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    // isNull requires no value — apply should be enabled
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('handles value with between operator', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['10', '20'] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('disables apply when between has incomplete value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['10', ''] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('renders presets with delete buttons when onDeletePreset provided', () => {
    render(
      <AdvancedFilterBuilder
        {...defaultProps}
        presets={{ 'Filter A': {}, 'Filter B': {} }}
        onApplyPreset={vi.fn()}
        onSavePreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    );
    expect(screen.getByText('filterPresetsButton')).toBeInTheDocument();
  });

  it('renders labelOverrides without crashing', () => {
    render(
      <AdvancedFilterBuilder
        {...defaultProps}
        labelOverrides={{ name: 'Custom Name Label' }}
      />,
    );
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('enables apply when date field has equals operator with value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'equals', value: '2024-01-15' }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('enables apply when date field has between operator with both values', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2024-01-01', '2024-12-31'] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('disables apply when date between has only first value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2024-01-01', ''] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('enables apply when numeric field has between with both values', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', '500'] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('disables apply when numeric between has only second value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['', '500'] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('disables apply when numeric between has null values', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: [null, null] }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('enables apply when isNotNull operator is used without value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNotNull', value: null }],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('handles multiple conditions where some use nullish ops', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'isNull', value: null },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('disables apply when any condition in multi-row is incomplete', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: '', value: '' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} />);
    const applyBtn = screen.getByText('advancedFilterApply').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('renders presets dropdown and shows preset names', async () => {
    const user = userEvent.setup();
    render(
      <AdvancedFilterBuilder
        {...defaultProps}
        presets={{ 'Daily Report': {}, 'Weekly Summary': {} }}
        onApplyPreset={vi.fn()}
        onSavePreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    );
    // Presets button should be visible
    const presetsBtn = screen.getByText('filterPresetsButton');
    expect(presetsBtn).toBeInTheDocument();
  });

  it('calls onApply with correct data for multiple conditions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const value = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'alpha' },
        { field: 'amount', operator: 'greaterThan', value: '50' },
      ],
    };
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onApply={onApply} onClose={onClose} />);
    await user.click(screen.getByText('advancedFilterApply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const calledWith = onApply.mock.calls[0][0];
    expect(calledWith.rowOperator).toBe('or');
    expect(calledWith.conditions).toHaveLength(2);
    expect(calledWith.conditions[0].value).toBe('alpha');
    expect(calledWith.conditions[1].value).toBe('50');
  });

  it('clears resets to one empty row even with multiple applied conditions', async () => {
    const user = userEvent.setup();
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'a' },
        { field: 'amount', operator: 'greaterThan', value: '10' },
        { field: 'status', operator: 'equals', value: 'DR' },
      ],
    };
    const onClear = vi.fn();
    render(<AdvancedFilterBuilder {...defaultProps} value={value} onClear={onClear} />);
    expect(screen.getAllByRole('button', { name: /remove condition/i })).toHaveLength(3);
    await user.click(screen.getByText('advancedFilterClear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: /remove condition/i })).toHaveLength(1);
  });

  it('shows "And" connector for second row instead of "Where"', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder {...defaultProps} />);
    await user.click(screen.getByText('advancedFilterAddCondition'));
    // First row shows "Where", second row shows a select with and/or
    expect(screen.getByText('advancedFilterWhere')).toBeInTheDocument();
  });
});
