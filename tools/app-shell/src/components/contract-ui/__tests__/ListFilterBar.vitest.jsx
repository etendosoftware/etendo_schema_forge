import { render, screen, act } from '@testing-library/react';
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
vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
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

vi.mock('../AdvancedFilterBuilder.jsx', () => ({
  AdvancedFilterBuilder: (props) => <div data-testid="advanced-filter-builder" />,
}));

const lastDistinctValuesListProps = { current: null };
vi.mock('../DistinctValuesList.jsx', () => ({
  DistinctValuesList: (props) => {
    lastDistinctValuesListProps.current = props;
    return <div data-testid="distinct-values-list" />;
  },
}));

// Mock the Calendar component
vi.mock('@/components/ui/calendar.jsx', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

// Capture-stub for DateRangePopoverContent: records the most recent props it
// was rendered with so tests can invoke onChange directly to exercise the
// adapter functions in ListFilterBar.
const lastDateRangeProps = { current: null };
vi.mock('@/components/ui/date-range-popover.jsx', () => ({
  DateRangePopoverContent: (props) => {
    lastDateRangeProps.current = props;
    return <div data-testid="date-range-popover-content" />;
  },
}));

import { ListFilterBar } from '../ListFilterBar.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'documentStatus', label: 'Status', type: 'status' },
  { key: 'orderDate', label: 'Order Date', type: 'date' },
];

describe('ListFilterBar', () => {
  it('renders without crashing with no columns', () => {
    const { container } = render(<ListFilterBar columns={[]} />);
    expect(container).toBeTruthy();
  });

  it('renders the advanced filter (funnel) button', () => {
    render(<ListFilterBar columns={COLUMNS} />);
    const funnelBtn = screen.getByTestId('filter-advanced');
    expect(funnelBtn).toBeInTheDocument();
  });

  it('renders status filter when a status column exists', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
      />
    );
    // Status button shows ui('allStatuses') by default
    expect(screen.getByText('allStatuses')).toBeInTheDocument();
  });

  it('does not render status filter when no status column exists', () => {
    const cols = [{ key: 'name', label: 'Name', type: 'string' }];
    render(
      <ListFilterBar
        columns={cols}
        columnFilters={{}}
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.queryByText('allStatuses')).not.toBeInTheDocument();
  });

  it('renders date filter when dateFilterKey points to a date column', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );
    // Date filter button shows ui('dateRangeAnyTime')
    expect(screen.getByText('dateRangeAnyTime')).toBeInTheDocument();
  });

  it('does not render date filter when dateFilterKey is null', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        dateFilterKey={null}
      />
    );
    expect(screen.queryByText('dateRangeAnyTime')).not.toBeInTheDocument();
  });

  it('shows active filter badge count when advanced filter is active', () => {
    const advancedFilter = {
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    render(
      <ListFilterBar
        columns={COLUMNS}
        advancedFilter={advancedFilter}
        onAdvancedFilterChange={vi.fn()}
      />
    );
    // Badge shows count of conditions
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show filter badge when no advanced filter is active', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        advancedFilter={null}
        onAdvancedFilterChange={vi.fn()}
      />
    );
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('hides the status filter trigger when hideStatusFilter is true, even if a status column exists', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        hideStatusFilter
      />
    );
    // The status filter button (data-testid="filter-status") must not render
    expect(screen.queryByTestId('filter-status')).not.toBeInTheDocument();
    // The allStatuses label must not appear either
    expect(screen.queryByText('allStatuses')).not.toBeInTheDocument();
  });

  it('still renders the status filter when hideStatusFilter is false (default)', () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        hideStatusFilter={false}
      />
    );
    expect(screen.getByText('allStatuses')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Adapter logic: dateRangeValue + handleDateRangeChange
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar date range adapters', () => {
  beforeEach(() => {
    lastDateRangeProps.current = null;
  });

  /**
   * Opens the date popover by clicking its trigger, which causes
   * DateRangePopoverContent to mount and capture its props into
   * `lastDateRangeProps.current`.
   */
  const openDatePopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-date'));
    // Wait for the captured props to populate. In JSDOM Radix opens
    // synchronously after click, but await one microtask for safety.
    await Promise.resolve();
  };

  it('dateRangeValue is null when no date filter is active', async () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    expect(lastDateRangeProps.current).not.toBeNull();
    expect(lastDateRangeProps.current.value).toBeNull();
  });

  it('dateRangeValue derives {presetId} from a preset:* originalValue', async () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['2026-05-19', '2026-05-25'],
        originalValue: 'preset:last7',
      },
    };

    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={columnFilters}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    expect(lastDateRangeProps.current.value).toEqual({ presetId: 'last7' });
  });

  it('dateRangeValue derives {from,to} from a custom:* originalValue', async () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['2026-05-01', '2026-05-31'],
        originalValue: 'custom:2026-05-01:2026-05-31',
      },
    };

    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={columnFilters}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    const v = lastDateRangeProps.current.value;
    expect(v).not.toBeNull();
    expect(v.from).toBeInstanceOf(Date);
    expect(v.to).toBeInstanceOf(Date);
    expect(v.from.getFullYear()).toBe(2026);
    expect(v.from.getMonth()).toBe(4); // May (0-indexed)
    expect(v.from.getDate()).toBe(1);
    expect(v.to.getDate()).toBe(31);
  });

  it('handleDateRangeChange(null) emits a null filter via onFilterChange', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    act(() => {
      lastDateRangeProps.current.onChange(null);
    });

    expect(onFilterChange).toHaveBeenCalledWith('orderDate', null);
  });

  it('handleDateRangeChange({presetId:"today"}) emits a range filter with preset:today originalValue', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    act(() => {
      lastDateRangeProps.current.onChange({ presetId: 'today' });
    });

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const [key, payload] = onFilterChange.mock.calls[0];
    expect(key).toBe('orderDate');
    expect(payload.mode).toBe('date');
    expect(payload.op).toBe('range');
    expect(payload.originalValue).toBe('preset:today');
    expect(payload.value).toHaveLength(2);
    // today preset: from === to (same day)
    expect(payload.value[0]).toBe(payload.value[1]);
    expect(payload.value[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handleDateRangeChange({from,to}) emits a range filter with custom:from:to originalValue', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    const from = new Date(2026, 4, 1); // 2026-05-01 (local time)
    const to = new Date(2026, 4, 31);  // 2026-05-31 (local time)
    act(() => {
      lastDateRangeProps.current.onChange({ from, to });
    });

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const [key, payload] = onFilterChange.mock.calls[0];
    expect(key).toBe('orderDate');
    expect(payload.mode).toBe('date');
    expect(payload.op).toBe('range');
    expect(payload.value).toEqual(['2026-05-01', '2026-05-31']);
    expect(payload.originalValue).toBe('custom:2026-05-01:2026-05-31');
  });

  it('handleDateRangeChange({presetId:"allTime"}) emits null (unsupported preset clears filter)', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    act(() => {
      lastDateRangeProps.current.onChange({ presetId: 'allTime' });
    });

    expect(onFilterChange).toHaveBeenCalledWith('orderDate', null);
  });

  it('renders the trigger with a localized preset label when preset filter is active', () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['2026-05-19', '2026-05-25'],
        originalValue: 'preset:last7',
      },
    };
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={columnFilters}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    // The trigger label should reflect the preset, not "anyTime"
    expect(screen.getByText('dateRangeLast7Days')).toBeInTheDocument();
  });

  it('renders the trigger with the "custom" label when a custom range filter is active', () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['2026-05-01', '2026-05-31'],
        originalValue: 'custom:2026-05-01:2026-05-31',
      },
    };
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={columnFilters}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    expect(screen.getByText('dateRangeCustom')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type filter: isTypeFilter column flag, labelForType, handleTypeSelect,
// mergedTypeCodes deduplication
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar type filter', () => {
  const TYPE_COLUMNS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'docType', label: 'Document Type', type: 'string', isTypeFilter: true },
  ];

  beforeEach(() => {
    lastDistinctValuesListProps.current = null;
  });

  const openTypePopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-type'));
    await Promise.resolve();
  };

  it('renders type filter button when a column has isTypeFilter: true', () => {
    render(
      <ListFilterBar columns={TYPE_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />
    );
    expect(screen.getByTestId('filter-type')).toBeInTheDocument();
  });

  it('does not render type filter when no column has isTypeFilter', () => {
    const cols = [{ key: 'name', label: 'Name', type: 'string' }];
    render(
      <ListFilterBar columns={cols} columnFilters={{}} onFilterChange={vi.fn()} />
    );
    expect(screen.queryByTestId('filter-type')).not.toBeInTheDocument();
  });

  it('shows allTypes label when no type filter is active', () => {
    render(
      <ListFilterBar columns={TYPE_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />
    );
    expect(screen.getByTestId('filter-type')).toHaveTextContent('allTypes');
  });

  it('shows the active type code as label when a type filter is active', () => {
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{ docType: { mode: 'enumLabel', value: ['AP'], originalValue: 'AP' } }}
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('filter-type')).toHaveTextContent('AP');
  });

  it('uses enumLabels to resolve the active type label via ui()', () => {
    const colsWithLabels = [
      { key: 'name', label: 'Name', type: 'string' },
      {
        key: 'docType',
        label: 'Document Type',
        type: 'string',
        isTypeFilter: true,
        enumLabels: { AP: 'invoice.type.ap' },
      },
    ];
    render(
      <ListFilterBar
        columns={colsWithLabels}
        columnFilters={{ docType: { mode: 'enumLabel', value: ['AP'], originalValue: 'AP' } }}
        onFilterChange={vi.fn()}
      />
    );
    // Mocked ui() returns the key as-is
    expect(screen.getByTestId('filter-type')).toHaveTextContent('invoice.type.ap');
  });

  it('handleTypeSelect emits an enumLabel filter for a selected code', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
      />
    );

    await openTypePopover();
    expect(lastDistinctValuesListProps.current).not.toBeNull();
    act(() => {
      lastDistinctValuesListProps.current.onSelect('AP');
    });

    expect(onFilterChange).toHaveBeenCalledWith('docType', {
      mode: 'enumLabel',
      value: ['AP'],
      originalValue: 'AP',
    });
  });

  it('handleTypeSelect(null) clears the type filter', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{ docType: { mode: 'enumLabel', value: ['AP'], originalValue: 'AP' } }}
        onFilterChange={onFilterChange}
      />
    );

    await openTypePopover();
    act(() => {
      lastDistinctValuesListProps.current.onSelect(null);
    });

    expect(onFilterChange).toHaveBeenCalledWith('docType', null);
  });

  it('mergedTypeCodes includes codes from in-memory rows, deduplicated', async () => {
    const rows = [
      { docType: 'AP' },
      { docType: 'AR' },
      { docType: 'AP' },
    ];
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={rows}
      />
    );

    await openTypePopover();
    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes).toContain('AP');
    expect(codes).toContain('AR');
    expect(codes.filter(c => c === 'AP').length).toBe(1);
  });

  it('mergedTypeCodes appends the active code when absent from rows and backend', async () => {
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{ docType: { mode: 'enumLabel', value: ['GL'], originalValue: 'GL' } }}
        onFilterChange={vi.fn()}
        rows={[]}
      />
    );

    await openTypePopover();
    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes).toContain('GL');
  });

  it('uses backendFilterKey to read type code from row when specified', async () => {
    const colsWithBackendKey = [
      { key: 'name', label: 'Name', type: 'string' },
      {
        key: 'docType',
        label: 'Document Type',
        type: 'string',
        isTypeFilter: true,
        backendFilterKey: 'docType$_identifier',
      },
    ];
    const rows = [{ 'docType$_identifier': 'AP' }, { 'docType$_identifier': 'AR' }];
    render(
      <ListFilterBar
        columns={colsWithBackendKey}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={rows}
      />
    );

    await openTypePopover();
    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes).toContain('AP');
    expect(codes).toContain('AR');
  });
});