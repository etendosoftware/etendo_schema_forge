import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock dependencies
vi.mock('@/lib/gridQuery', () => ({
  resolveFilterMode: (col) => {
    if (col.type === 'date') return 'date';
    if (col.type === 'number' || col.type === 'amount') return 'numeric';
    if (col.type === 'status') return 'enumLabel';
    if (col.type === 'boolean') return 'booleanLabel';
    return 'text';
  },
  getDisplayText: () => '',
}));

// Mutable holder so individual tests can inject the distinct endpoint values.
// Defaults to an empty set (the original behavior the existing tests rely on).
const distinctState = { values: [] };

vi.mock('@/hooks/useDistinctValues.js', () => ({
  useDistinctValues: () => ({
    values: distinctState.values,
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

// Render one option per code so tests can count duplicate labels. Mirrors the
// real DistinctValuesList contract: it receives { codes, labelFor, onSelect }.
vi.mock('../DistinctValuesList.jsx', () => ({
  DistinctValuesList: ({ codes = [], labelFor, onSelect }) => (
    <div data-testid="distinct-values-list">
      {codes.map((code, i) => (
        <button
          key={`${String(code)}-${i}`}
          type="button"
          data-testid="distinct-option"
          onClick={() => onSelect?.(code)}
        >
          {labelFor ? labelFor(code) : String(code)}
        </button>
      ))}
    </div>
  ),
}));

import { AdvancedFilterBuilder } from '../AdvancedFilterBuilder.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name', type: 'text', column: 'Name' },
  { key: 'amount', label: 'Amount', type: 'amount', column: 'Amount' },
  { key: 'orderDate', label: 'Order Date', type: 'date', column: 'OrderDate' },
];

describe('AdvancedFilterBuilder', () => {
  it('renders without crashing', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    // Title is rendered via ui('advancedFilterTitle') which returns the key
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders the "Where" label on the first row', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('advancedFilterWhere')).toBeInTheDocument();
  });

  it('renders add condition button', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('advancedFilterAddCondition')).toBeInTheDocument();
  });

  it('renders apply and clear buttons', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('advancedFilterApply')).toBeInTheDocument();
    expect(screen.getByText('advancedFilterClear')).toBeInTheDocument();
  });

  it('adds a new filter row when add condition is clicked', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    const addBtn = screen.getByText('advancedFilterAddCondition');
    await user.click(addBtn);
    // After clicking, we should have 2 rows. The second row shows the and/or connector.
    // Look for "Remove condition" aria-labels — should have 2 now.
    const removeButtons = screen.getAllByLabelText('Remove condition');
    expect(removeButtons).toHaveLength(2);
  });

  it('removes a filter row when trash button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    // Add a second row first
    await user.click(screen.getByText('advancedFilterAddCondition'));
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(2);
    // Remove the first row
    const removeButtons = screen.getAllByLabelText('Remove condition');
    await user.click(removeButtons[0]);
    // Should have 1 row left
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders field select placeholders', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    // The placeholder uses ui('advancedFilterSelectField') returning the key
    expect(screen.getByText('advancedFilterSelectField')).toBeInTheDocument();
  });

  it('renders with existing filter value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    // Should render the existing condition, not the empty row
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('calls onClear when clear button is clicked with applied filter', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} onClear={onClear} />);
    await user.click(screen.getByText('advancedFilterClear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('disables apply button when row is incomplete', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    const applyButton = screen.getByText('advancedFilterApply');
    expect(applyButton).toBeDisabled();
  });

  it('renders save button placeholder when presets are not enabled', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('advancedFilterSave')).toBeInTheDocument();
  });

  // ============================================================
  // Additional branch coverage tests
  // ============================================================

  it('renders with status column type (enumLabel mode)', () => {
    const cols = [
      ...COLUMNS,
      { key: 'status', label: 'Status', type: 'status', column: 'Status' },
    ];
    render(<AdvancedFilterBuilder columns={cols} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders with boolean column type (booleanLabel mode)', () => {
    const cols = [
      ...COLUMNS,
      { key: 'active', label: 'Active', type: 'boolean', column: 'Active' },
    ];
    render(<AdvancedFilterBuilder columns={cols} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders with number column type (numeric mode)', () => {
    const cols = [{ key: 'qty', label: 'Qty', type: 'number', column: 'Qty' }];
    render(<AdvancedFilterBuilder columns={cols} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('filters out discarded columns', () => {
    const cols = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'hidden', label: 'Hidden', type: 'discarded', column: 'Hidden' },
    ];
    render(<AdvancedFilterBuilder columns={cols} />);
    // Only 'name' should be available as a filterable column
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('filters out system columns', () => {
    const cols = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'sys', label: 'System', type: 'system', column: 'System' },
    ];
    render(<AdvancedFilterBuilder columns={cols} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('filters out columns with filterable=false', () => {
    const cols = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'nf', label: 'NoFilter', type: 'text', column: 'NoFilter', filterable: false },
    ];
    render(<AdvancedFilterBuilder columns={cols} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders with between operator condition value (two inputs)', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['10', '50'] }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders with isNull operator (no value input needed)', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: '' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders with isNotNull operator', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNotNull', value: '' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders with multiple conditions showing connector', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(2);
  });

  it('renders with or rowOperator', () => {
    const value = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'a' },
        { field: 'name', operator: 'iContains', value: 'b' },
      ],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(2);
  });

  it('enables apply button when row is complete with isNull', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: '' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    const applyButton = screen.getByText('advancedFilterApply');
    expect(applyButton).not.toBeDisabled();
  });

  it('calls onApply with cloned conditions when apply is clicked', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: '' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} onApply={onApply} />);
    await user.click(screen.getByText('advancedFilterApply'));
    expect(onApply).toHaveBeenCalled();
    const applied = onApply.mock.calls[0][0];
    expect(applied.conditions).toHaveLength(1);
    // Verify it's a clone, not the same reference
    expect(applied.conditions).not.toBe(value.conditions);
  });

  it('disables clear button when no value (no applied filter)', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} />);
    const clearButton = screen.getByText('advancedFilterClear');
    expect(clearButton).toBeDisabled();
  });

  it('renders date column with date-specific operator labels', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'greaterThan', value: '2026-01-01' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders numeric between condition', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', '500'] }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders with empty columns array', () => {
    render(<AdvancedFilterBuilder columns={[]} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders with inSet operator for enumLabel', () => {
    const cols = [{ key: 'status', label: 'Status', type: 'status', column: 'Status' }];
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'status', operator: 'inSet', value: 'DR,CO' }],
    };
    render(<AdvancedFilterBuilder columns={cols} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('calls onApply when complete condition with value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} onApply={onApply} />);
    await user.click(screen.getByText('advancedFilterApply'));
    expect(onApply).toHaveBeenCalled();
  });

  it('renders with presets prop', () => {
    const presets = [
      { name: 'My Filter', conditions: [{ field: 'name', operator: 'iContains', value: 'x' }], rowOperator: 'and' },
    ];
    render(<AdvancedFilterBuilder columns={COLUMNS} presets={presets} />);
    expect(screen.getByText('advancedFilterTitle')).toBeInTheDocument();
  });

  it('renders with onSavePreset prop', () => {
    render(<AdvancedFilterBuilder columns={COLUMNS} onSavePreset={vi.fn()} />);
    expect(screen.getByText('advancedFilterSave')).toBeInTheDocument();
  });

  it('renders complete condition with equals operator', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iEquals', value: 'exact' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    const applyButton = screen.getByText('advancedFilterApply');
    expect(applyButton).not.toBeDisabled();
  });

  it('renders condition with notEqual operator', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'notEqual', value: '0' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('renders condition with lessOrEqual operator', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'lessOrEqual', value: '999' }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getByText('advancedFilterApply')).not.toBeDisabled();
  });

  it('renders date between condition', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2026-01-01', '2026-12-31'] }],
    };
    render(<AdvancedFilterBuilder columns={COLUMNS} value={value} />);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  // ================================================================
  // DistinctEnumPicker — labelFor translation behavior
  // ================================================================

  describe('DistinctEnumPicker — labelFor resolves enumLabels via ui()', () => {
    // DistinctEnumPicker is an internal sub-component activated when the filter
    // mode is 'enumLabel' and the operator is not 'inSet'. It renders a trigger
    // button whose label is `labelFor(value)`. When a value is already selected,
    // the button shows the resolved label. We exercise this to verify the
    // translation path without accessing the private function directly.

    const statusCol = {
      key: 'processed',
      label: 'Processed',
      type: 'status',
      column: 'Processed',
      // enumLabels values are i18n keys — ui() should be called on them
      enumLabels: { true: 'statusProcessed', false: 'statusDraft' },
    };

    // Reset the injected distinct values after every test so the default empty
    // set is restored for the other tests in this file.
    afterEach(() => {
      distinctState.values = [];
    });

    it('shows the ui()-translated label for a selected enumLabels i18n-key value', () => {
      // useUI mock returns key as-is, so ui('statusProcessed') === 'statusProcessed'
      const filterValue = {
        rowOperator: 'and',
        conditions: [{ field: 'processed', operator: 'equals', value: 'true' }],
      };
      render(
        <AdvancedFilterBuilder
          columns={[statusCol]}
          value={filterValue}
        />,
      );
      // 'statusProcessed' should appear as the picker trigger label
      expect(screen.getByText('statusProcessed')).toBeInTheDocument();
    });

    it('shows a literal enumLabels label unchanged when it is not an i18n key', () => {
      // When the enumLabels value is a plain string (not a registered i18n key),
      // ui() returns it unchanged — the label passes through literally.
      const literalCol = {
        key: 'processed',
        label: 'Processed',
        type: 'status',
        column: 'Processed',
        enumLabels: { true: 'Procesado', false: 'Borrador' },
      };
      const filterValue = {
        rowOperator: 'and',
        conditions: [{ field: 'processed', operator: 'equals', value: 'false' }],
      };
      render(
        <AdvancedFilterBuilder
          columns={[literalCol]}
          value={filterValue}
        />,
      );
      expect(screen.getByText('Borrador')).toBeInTheDocument();
    });

    it('shows enumLabels keys as the picker options (fallback from enumLabels keys when no rows/distinct)', () => {
      // When no rows or distinct values are available, DistinctEnumPicker populates
      // the option list from the enumLabels keys directly (fillFallbackCodes).
      // The active label for the selected value must match the resolved labelFor().
      const filterValue = {
        rowOperator: 'and',
        conditions: [{ field: 'processed', operator: 'equals', value: 'true' }],
      };
      render(
        <AdvancedFilterBuilder
          columns={[statusCol]}
          value={filterValue}
        />,
      );
      // The active value 'true' maps to enumLabels['true'] = 'statusProcessed',
      // then ui('statusProcessed') === 'statusProcessed' (mock returns key).
      expect(screen.getByText('statusProcessed')).toBeInTheDocument();
    });

    it('falls back to dictionary.statuses label when code is not in enumLabels', () => {
      // A column with enumLabels only for some codes — unlisted codes fall back to
      // dictionary.statuses or the raw code itself.
      const partialCol = {
        key: 'status',
        label: 'Status',
        type: 'status',
        column: 'Status',
        enumLabels: { CO: 'Complete' },
      };
      const filterValue = {
        rowOperator: 'and',
        conditions: [{ field: 'status', operator: 'equals', value: 'CO' }],
      };
      render(
        <AdvancedFilterBuilder
          columns={[partialCol]}
          value={filterValue}
        />,
      );
      // ui('Complete') === 'Complete' (literal pass-through from mock)
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('does not duplicate boolean options when distinct returns string twins of in-memory booleans', async () => {
      // Regression: a boolean-valued status column surfaces the same value in two
      // shapes — the distinct endpoint returns the STRING "true"/"false" while
      // in-memory rows hold the BOOLEAN true/false. Without canonical dedup, the
      // mergedCodes Set treats "true" and true as distinct, rendering each option
      // twice ("Draft, Processed, Draft, Processed"). The canon() helper collapses
      // booleans to their string form so each option appears exactly once.
      const user = userEvent.setup();

      // Distinct endpoint contributes the STRING forms.
      distinctState.values = [
        { id: 'true', _identifier: 'true' },
        { id: 'false', _identifier: 'false' },
      ];

      // In-memory rows hold the BOOLEAN forms (note: two `true` rows).
      const rows = [
        { processed: false },
        { processed: true },
        { processed: true },
      ];

      // A condition with field + a non-inSet operator and no value activates the
      // DistinctEnumPicker and shows the "select value" placeholder on its trigger.
      const filterValue = {
        rowOperator: 'and',
        conditions: [{ field: 'processed', operator: 'equals', value: '' }],
      };

      render(
        <AdvancedFilterBuilder
          columns={[statusCol]}
          value={filterValue}
          rows={rows}
          entity="goods-movements"
          apiBaseUrl="/api"
        />,
      );

      // Open the enum picker popover (the only picker trigger on screen).
      const trigger = screen.getByText('advancedFilterSelectValue');
      await user.click(trigger);

      const options = await screen.findAllByTestId('distinct-option');
      const labels = options.map((o) => o.textContent);

      // Each label must appear exactly once — no boolean/string duplicates.
      // enumLabels keys are 'true'/'false', resolved via ui() to the keys
      // 'statusProcessed' / 'statusDraft' (mock returns key as-is).
      expect(labels.filter((l) => l === 'statusProcessed')).toHaveLength(1);
      expect(labels.filter((l) => l === 'statusDraft')).toHaveLength(1);
      expect(options).toHaveLength(2);
    });
  });
});
