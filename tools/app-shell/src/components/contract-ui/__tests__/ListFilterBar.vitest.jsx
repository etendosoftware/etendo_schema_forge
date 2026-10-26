// @covers tools/app-shell/src/components/contract-ui/ListFilterBar.jsx
import { render, screen, act, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Not mocked: the real fixed-order catalog, so the expected order is derived
// from the same source the component sorts with (ETP-4913).
import { STATUS_ORDER } from '@/lib/statusBadge.js';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock dependencies
// ListFilterBar reads its dictionary from the core package: pass the real one through unless a
// test installs a dictionary (e.g. translated status labels with accents).
vi.mock('@etendosoftware/app-shell-core', async () => {
  const actual = await vi.importActual('@etendosoftware/app-shell-core');
  return { ...actual, useLocale: () => localeOverride.current ?? actual.useLocale() };
});

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

// Hoisted mutable state so individual tests can override the distinct-values
// payload (e.g. to populate the backend-sourced `values` array and exercise
// the merge loops in mergedTypeCodes/mergedStatusCodes, which the default
// empty-array mock below never reaches).
const { distinctValuesOverride, realListFlag, distinctCalls, localeOverride } = vi.hoisted(() => ({
  // Stable dictionary object returned by the core useLocale (status labels come from `statuses`).
  localeOverride: { current: null },
  distinctValuesOverride: { current: null },
  // Every (entity, field, options) the component passed to useDistinctValues, in call order.
  distinctCalls: [],
  // When true, the REAL DistinctValuesList renders and the distinct hook keeps its own
  // search state (like the production hook), so menus can be driven end to end.
  realListFlag: { current: false },
}));

vi.mock('@/hooks/useDistinctValues.js', async () => {
  const { useState } = await import('react');
  return {
    useDistinctValues: (entity, field, opts) => {
      distinctCalls.push({ entity, field, opts });
      const [search, setSearch] = useState('');
      const base = distinctValuesOverride.current || {
        values: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        search: '',
        setSearch: () => {},
        loadMore: () => {},
      };
      return realListFlag.current ? { ...base, search, setSearch } : base;
    },
  };
});

const lastAdvancedFilterBuilderProps = { current: null };
vi.mock('../AdvancedFilterBuilder.jsx', () => ({
  AdvancedFilterBuilder: (props) => {
    lastAdvancedFilterBuilderProps.current = props;
    return <div data-testid="advanced-filter-builder" />;
  },
}));

const lastDistinctValuesListProps = { current: null };
vi.mock('../DistinctValuesList.jsx', async () => {
  const actual = await vi.importActual('../DistinctValuesList.jsx');
  return {
    DistinctValuesList: (props) => {
      lastDistinctValuesListProps.current = props;
      if (realListFlag.current) return <actual.DistinctValuesList {...props} />;
      return <div data-testid="distinct-values-list" />;
    },
  };
});

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

afterEach(() => {
  distinctCalls.length = 0;
  distinctValuesOverride.current = null;
  realListFlag.current = false;
  localeOverride.current = null;
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Status filter label resolution (ETP-4696 Problem 2 regression)
//
// The dropdown must resolve labels through the SAME statusLabel() pipeline
// used by the grid cells (DataTable.cellRenderers.jsx), instead of a local
// enumLabel-or-literal shortcut. Before this fix, any status code without a
// fortuitous plain-English i18n key (e.g. "Booked", "Voided", "Not Accepted")
// leaked its raw AD_Ref_List literal into the dropdown even though the same
// code translated correctly in the grid column.
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar status filter label resolution', () => {
  const STATUS_COLUMNS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
  ];

  beforeEach(() => {
    lastDistinctValuesListProps.current = null;
  });

  const openStatusPopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-status'));
    await Promise.resolve();
  };

  it('resolves a code with no dictionary translation via the shared statusLabel MAP, not the raw literal', async () => {
    // 'PWNC' has no fortuitous plain-English i18n key collision and no
    // dictionary.statuses entry (mocked useLocale returns { statuses: {} }).
    // It must still humanize via statusLabel's MAP ('statusWithdrawnNotCleared'),
    // matching exactly what DataTable.cellRenderers.jsx would render for the
    // same code — never the bare code 'PWNC'.
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={[{ documentStatus: 'PWNC' }]}
      />
    );

    await openStatusPopover();
    expect(lastDistinctValuesListProps.current).not.toBeNull();
    const label = lastDistinctValuesListProps.current.labelFor('PWNC');
    expect(label).not.toBe('PWNC');
    expect(label).toBe('Withdrawn Not Cleared');
  });

  it('resolves several documented problem codes (Booked/Voided/Not-Accepted family) consistently', async () => {
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
      />
    );

    await openStatusPopover();
    const labelFor = lastDistinctValuesListProps.current.labelFor;
    // RPVOID -> statusVoid -> humanized 'Void'
    expect(labelFor('RPVOID')).toBe('Void');
    // RDNC -> statusDepositedNotCleared -> humanized 'Deposited Not Cleared'
    expect(labelFor('RDNC')).toBe('Deposited Not Cleared');
    // ETGO_CI -> statusInvoiceCreated -> humanized 'Invoice Created'
    expect(labelFor('ETGO_CI')).toBe('Invoice Created');
    // A truly unknown code (no MAP entry, no dictionary entry) falls back to
    // the raw code itself — this is the documented last-resort behavior, not
    // a regression.
    expect(labelFor('UNKNOWN_XYZ')).toBe('UNKNOWN_XYZ');
  });

  it('a literal (non-i18n-key) enumLabels value still falls through to the shared MAP translation', async () => {
    // Some columns declare enumLabels with the raw AD_Ref_List English name
    // (a literal), not an i18n key. statusLabel()'s resolveEnumLabel() must
    // discard non-key literals and fall through to the MAP/dictionary path
    // exactly like the grid cell does — the dropdown must not special-case
    // this differently.
    const colsWithLiteralEnumLabels = [
      { key: 'name', label: 'Name', type: 'string' },
      {
        key: 'documentStatus',
        label: 'Status',
        type: 'status',
        enumLabels: { CJ: 'Rejected' }, // literal AD name, not an i18n key
      },
    ];
    render(
      <ListFilterBar
        columns={colsWithLiteralEnumLabels}
        columnFilters={{}}
        onFilterChange={vi.fn()}
      />
    );

    await openStatusPopover();
    const label = lastDistinctValuesListProps.current.labelFor('CJ');
    // Falls through to the MAP ('statusRejected' -> humanized 'Rejected'),
    // same end result here, but via the shared resolution path, not by
    // trusting the literal directly.
    expect(label).toBe('Rejected');
  });

  it('a genuine i18n-key enumLabels value resolves via ui() same as the grid', async () => {
    const colsWithKeyEnumLabels = [
      { key: 'name', label: 'Name', type: 'string' },
      {
        key: 'documentStatus',
        label: 'Status',
        type: 'status',
        enumLabels: { CJ: 'statusRejected' },
      },
    ];
    render(
      <ListFilterBar
        columns={colsWithKeyEnumLabels}
        columnFilters={{}}
        onFilterChange={vi.fn()}
      />
    );

    await openStatusPopover();
    const label = lastDistinctValuesListProps.current.labelFor('CJ');
    // Mocked ui()/translate() returns the key unchanged, and dictionary has
    // no genericLabels, so resolveEnumLabel's own short-circuit doesn't fire
    // here either — it still lands on the humanized fallback, proving the
    // dropdown and the grid share the exact same resolution ladder.
    expect(label).toBe('Rejected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Active status filter flow: activeStatusCode truthy path (trigger label,
// mergedStatusCodes appends it when absent from the other two sources) and
// handleStatusSelect (the status-column counterpart of handleTypeSelect,
// wired through the status DistinctValuesList's onSelect).
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar active status filter + handleStatusSelect', () => {
  const STATUS_COLUMNS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
  ];

  beforeEach(() => {
    lastDistinctValuesListProps.current = null;
  });

  const openStatusPopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-status'));
    await Promise.resolve();
  };

  it('shows the resolved label for the active status code instead of "allStatuses"', () => {
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{ documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } }}
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.queryByText('allStatuses')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-status')).toHaveTextContent('Complete');
  });

  it('keeps the idle text color when a status filter is active; only the border changes', () => {
    const { rerender } = render(<ListFilterBar columns={STATUS_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />);
    const idle = screen.getByTestId('filter-status');
    expect(idle).toHaveClass('text-[#121217]');
    expect(idle).not.toHaveClass('border-primary/40');

    rerender(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{ documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } }}
        onFilterChange={vi.fn()}
      />
    );
    const active = screen.getByTestId('filter-status');
    expect(active).toHaveClass('text-[#121217]');
    expect(active).toHaveClass('border-primary/40');
  });

  it('mergedStatusCodes appends the active code when it is absent from rows and backend', async () => {
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{ documentStatus: { mode: 'enumLabel', value: ['VO'], originalValue: 'VO' } }}
        onFilterChange={vi.fn()}
        rows={[]}
      />
    );

    await openStatusPopover();
    expect(lastDistinctValuesListProps.current.codes).toContain('VO');
    expect(lastDistinctValuesListProps.current.activeCode).toBe('VO');
  });

  it('handleStatusSelect emits an enumLabel filter for the selected status code and closes the menu', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{}}
        onFilterChange={onFilterChange}
      />
    );

    await openStatusPopover();
    expect(lastDistinctValuesListProps.current).not.toBeNull();
    act(() => {
      lastDistinctValuesListProps.current.onSelect('IP');
    });

    expect(onFilterChange).toHaveBeenCalledWith('documentStatus', {
      mode: 'enumLabel',
      value: ['IP'],
      originalValue: 'IP',
    });
    // The onSelect handler also calls setStatusMenuOpen(false); the popover
    // trigger button must still be present (no crash) after the state update.
    expect(screen.getByTestId('filter-status')).toBeInTheDocument();
  });

  it('handleStatusSelect(null) clears the status filter', async () => {
    const onFilterChange = vi.fn();
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{ documentStatus: { mode: 'enumLabel', value: ['IP'], originalValue: 'IP' } }}
        onFilterChange={onFilterChange}
      />
    );

    await openStatusPopover();
    act(() => {
      lastDistinctValuesListProps.current.onSelect(null);
    });

    expect(onFilterChange).toHaveBeenCalledWith('documentStatus', null);
  });

  it('inMemoryStatusCodes normalizes a boolean false row value to the string "false"', async () => {
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={[{ documentStatus: false }, { documentStatus: true }]}
      />
    );

    await openStatusPopover();
    expect(lastDistinctValuesListProps.current.codes).toEqual(
      expect.arrayContaining(['false', 'true']),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Backend-sourced distinct values: exercises the merge loops in
// mergedTypeCodes/mergedStatusCodes (including normalizeCode's boolean
// handling) that the default empty-array useDistinctValues mock never
// reaches, since `statusDistinct.values`/`typeDistinct.values` are always [].
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar merged codes from backend distinct values', () => {
  const STATUS_COLUMNS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
  ];
  const TYPE_COLUMNS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'docType', label: 'Document Type', type: 'string', isTypeFilter: true },
  ];

  beforeEach(() => {
    lastDistinctValuesListProps.current = null;
    distinctValuesOverride.current = null;
  });

  it('mergedTypeCodes reads codes from the backend-sourced typeDistinct.values entries', async () => {
    distinctValuesOverride.current = {
      values: [{ id: 'AP' }, { id: 'AR' }, { id: null }, { id: '' }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: () => {},
      loadMore: () => {},
    };
    render(
      <ListFilterBar columns={TYPE_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-type'));
    await Promise.resolve();

    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes).toContain('AP');
    expect(codes).toContain('AR');
    // Backend entries with a null/empty id are skipped, not pushed as codes.
    expect(codes).not.toContain(null);
    expect(codes).not.toContain('');
  });

  it('mergedTypeCodes deduplicates a backend code that also appears in-memory', async () => {
    distinctValuesOverride.current = {
      values: [{ id: 'AP' }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: () => {},
      loadMore: () => {},
    };
    render(
      <ListFilterBar
        columns={TYPE_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={[{ docType: 'AP' }]}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-type'));
    await Promise.resolve();

    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes.filter((c) => c === 'AP').length).toBe(1);
  });

  it('mergedStatusCodes normalizes boolean true/false backend ids via normalizeCode and orders them by STATUS_ORDER', async () => {
    distinctValuesOverride.current = {
      values: [{ id: true }, { id: false }, { id: null }, { id: '' }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: () => {},
      loadMore: () => {},
    };
    render(
      <ListFilterBar columns={STATUS_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-status'));
    await Promise.resolve();

    const codes = lastDistinctValuesListProps.current.codes;
    // normalizeCode maps boolean true/false to the strings 'true'/'false',
    // and compareStatusCodes places 'false' (Draft bucket) before 'true'
    // (Completed bucket) in the fixed business-flow order.
    expect(codes).toEqual(['false', 'true']);
  });

  it('orders a full warehouse docstatus set by document flow (ETP-4913)', async () => {
    // The 10 active values of AD reference 131 "All_Document Status" (M_InOut /
    // C_Invoice), delivered in the alphabetical-by-code order the backend's
    // `order by <code> asc` produces. Before ETP-4913 extended STATUS_ORDER,
    // the codes it did not know (??, NA, RE, TEMP, WP) were alphabetized into a
    // tail — the illogical order reported in the ticket.
    const backendCodes = ['??', 'CL', 'CO', 'DR', 'IP', 'NA', 'RE', 'TEMP', 'VO', 'WP'];
    distinctValuesOverride.current = {
      values: backendCodes.map((id) => ({ id })),
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: () => {},
      loadMore: () => {},
    };
    render(
      <ListFilterBar columns={STATUS_COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-status'));
    await Promise.resolve();

    // Derived from STATUS_ORDER rather than hand-written, so a catalog change
    // cannot silently disagree with a stale literal here. The pill and the
    // advanced filter's value picker sort with the very same comparator.
    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes).toEqual(STATUS_ORDER.filter((c) => backendCodes.includes(c)));
    expect(codes).toEqual(['TEMP', 'DR', 'IP', 'WP', 'CO', 'RE', 'CL', 'NA', 'VO', '??']);
  });

  it('mergedStatusCodes deduplicates a backend code that also appears in-memory', async () => {
    distinctValuesOverride.current = {
      values: [{ id: 'CO' }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: () => {},
      loadMore: () => {},
    };
    render(
      <ListFilterBar
        columns={STATUS_COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        rows={[{ documentStatus: 'CO' }]}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-status'));
    await Promise.resolve();

    const codes = lastDistinctValuesListProps.current.codes;
    expect(codes.filter((c) => c === 'CO').length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computePresetRange('last12m') + date range edge cases not covered by the
// existing 'today'/'allTime'/preset-from-columnFilters tests: the malformed
// activeDateRange fallback and the dateRangeValue final fallback when the
// stored originalValue matches neither the "preset:" nor "custom:" shape.
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar date range — remaining branches', () => {
  const openDatePopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-date'));
    await Promise.resolve();
  };

  beforeEach(() => {
    lastDateRangeProps.current = null;
  });

  it('handleDateRangeChange({presetId:"last12m"}) emits a range filter with preset:last12m originalValue', async () => {
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
      lastDateRangeProps.current.onChange({ presetId: 'last12m' });
    });

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const [key, payload] = onFilterChange.mock.calls[0];
    expect(key).toBe('orderDate');
    expect(payload.originalValue).toBe('preset:last12m');
    expect(payload.value).toHaveLength(2);
  });

  it('dateRangeValue falls back to null when originalValue matches neither "preset:" nor "custom:"', async () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['2026-05-01', '2026-05-02'],
        originalValue: 'legacy-unrecognized-value',
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
    expect(lastDateRangeProps.current.value).toBeNull();
  });

  it('activeDateRange resolves to null (and dateRangeValue falls back to null) when the stored custom range has an invalid date', async () => {
    const columnFilters = {
      orderDate: {
        mode: 'date',
        op: 'range',
        value: ['not-a-date', '2026-05-02'],
        originalValue: 'custom:not-a-date:2026-05-02',
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
    expect(lastDateRangeProps.current.value).toBeNull();
  });

  it('DateRangePopoverContent onClose closes the date menu', async () => {
    render(
      <ListFilterBar
        columns={COLUMNS}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        dateFilterKey="orderDate"
      />
    );

    await openDatePopover();
    expect(screen.getByTestId('date-range-popover-content')).toBeInTheDocument();
    act(() => {
      lastDateRangeProps.current.onClose();
    });
    // No crash after closing; the trigger button remains rendered.
    expect(screen.getByTestId('filter-date')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdvancedFilterBuilder wiring: onApply/onClear/onClose handlers passed from
// ListFilterBar (never invoked by any prior test, since the mock stub never
// called back into the props it received).
// ─────────────────────────────────────────────────────────────────────────────
describe('ListFilterBar advanced filter builder wiring', () => {
  beforeEach(() => {
    lastAdvancedFilterBuilderProps.current = null;
  });

  const openAdvancedPopover = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('filter-advanced'));
    await Promise.resolve();
  };

  it('onApply forwards the next advanced filter via onAdvancedFilterChange', async () => {
    const onAdvancedFilterChange = vi.fn();
    render(
      <ListFilterBar columns={COLUMNS} onAdvancedFilterChange={onAdvancedFilterChange} />
    );

    await openAdvancedPopover();
    const nextFilter = { conditions: [{ field: 'name', operator: 'iContains', value: 'x' }] };
    act(() => {
      lastAdvancedFilterBuilderProps.current.onApply(nextFilter);
    });

    expect(onAdvancedFilterChange).toHaveBeenCalledWith(nextFilter);
  });

  it('onClear forwards null via onAdvancedFilterChange', async () => {
    const onAdvancedFilterChange = vi.fn();
    render(
      <ListFilterBar columns={COLUMNS} onAdvancedFilterChange={onAdvancedFilterChange} />
    );

    await openAdvancedPopover();
    act(() => {
      lastAdvancedFilterBuilderProps.current.onClear();
    });

    expect(onAdvancedFilterChange).toHaveBeenCalledWith(null);
  });

  it('onClose closes the advanced filter popover without crashing', async () => {
    render(<ListFilterBar columns={COLUMNS} onAdvancedFilterChange={vi.fn()} />);

    await openAdvancedPopover();
    act(() => {
      lastAdvancedFilterBuilderProps.current.onClose();
    });

    expect(screen.getByTestId('filter-advanced')).toBeInTheDocument();
  });
});
describe('ListFilterBar root — flowInParent', () => {
  const renderBar = (props) => render(
    <ListFilterBar columns={COLUMNS} columnFilters={{}} onFilterChange={vi.fn()} {...props} />,
  );

  it('keeps its own flex row by default', () => {
    const { container } = renderBar();
    const root = container.firstChild;
    expect(root).toHaveClass('flex', 'items-center', 'gap-2');
    expect(root).not.toHaveClass('contents');
  });

  it('keeps its own flex row when flowInParent is false', () => {
    const { container } = renderBar({ flowInParent: false });
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'gap-2');
  });

  it('renders a display: contents root when flowInParent is true, so its controls flow in the parent row', () => {
    const { container } = renderBar({ flowInParent: true });
    const root = container.firstChild;
    expect(root).toHaveClass('contents');
    expect(root).not.toHaveClass('flex');
    expect(root).not.toHaveClass('gap-2');
    // The controls are still rendered, as direct children of the contents root.
    expect(root).toContainElement(screen.getByTestId('filter-advanced'));
    expect(screen.getByText('allStatuses')).toBeInTheDocument();
  });
});


// Real DistinctValuesList + real Radix popovers: the status/type menus are driven the way a
// user drives them (mouse and keyboard), instead of through the captured-props stub.
describe('ListFilterBar status and type menus (real list)', () => {
  const STATUS_COLS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
  ];
  const TYPE_COLS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'docType', label: 'Document Type', type: 'string', isTypeFilter: true },
  ];
  const rowsOf = (...codes) => codes.map((c, i) => ({ id: `r${i}`, documentStatus: c }));
  const distinctOf = (...ids) => ({
    values: ids.map((id) => ({ id })),
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: () => {},
    loadMore: () => {},
  });

  beforeEach(() => {
    realListFlag.current = true;
  });

  const renderStatus = (props = {}) => render(
    <ListFilterBar columns={STATUS_COLS} columnFilters={{}} onFilterChange={vi.fn()} {...props} />,
  );
  const openStatus = async (user) => {
    await user.click(screen.getByTestId('filter-status'));
    return screen.findByRole('listbox');
  };
  const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);

  describe('trigger and popover chrome', () => {
    it('declares aria-haspopup="listbox" on both the status and type triggers', () => {
      render(<ListFilterBar columns={[...STATUS_COLS, TYPE_COLS[1]]} columnFilters={{}} onFilterChange={vi.fn()} />);
      expect(screen.getByTestId('filter-status')).toHaveAttribute('aria-haspopup', 'listbox');
      expect(screen.getByTestId('filter-type')).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('reflects the open state on the trigger (dark border while open, closed afterwards)', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('DR') });
      const trigger = screen.getByTestId('filter-status');
      expect(trigger).toHaveAttribute('data-state', 'closed');
      expect(trigger.className).toContain('data-[state=open]:border-[hsl(var(--foreground))]');
      await openStatus(user);
      expect(trigger).toHaveAttribute('data-state', 'open');
      await user.keyboard('{Escape}');
      expect(trigger).toHaveAttribute('data-state', 'closed');
    });

    it('renders both the status and type popover content at w-60', async () => {
      const user = userEvent.setup();
      render(<ListFilterBar columns={[...STATUS_COLS, TYPE_COLS[1]]} rows={rowsOf('DR')} columnFilters={{}} onFilterChange={vi.fn()} />);
      await openStatus(user);
      expect(screen.getByRole('listbox').closest('[data-testid="PopoverContent__6d5e90"]')).toHaveClass('w-60');
      await user.keyboard('{Escape}');
      await user.click(screen.getByTestId('filter-type'));
      const typeList = await screen.findByRole('listbox');
      expect(typeList.closest('[data-testid="PopoverContent__6d5e90"]')).toHaveClass('w-60');
    });
  });

  describe('blank status codes', () => {
    it('adds no row for blank backend codes, whitespace in-memory codes or a whitespace active code', async () => {
      const user = userEvent.setup();
      distinctValuesOverride.current = distinctOf('', ' ', '\t', 'DR', 'CO');
      renderStatus({
        rows: rowsOf('  ', 'DR'),
        columnFilters: { documentStatus: { mode: 'enumLabel', value: ['   '], originalValue: '   ' } },
      });
      await openStatus(user);
      expect(optionTexts()).toEqual(['allStatuses', 'Draft', 'Complete']);
    });

    it('shows only the all-statuses row with empty rows and an empty backend list', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: [] });
      await openStatus(user);
      expect(optionTexts()).toEqual(['allStatuses']);
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
    });

    it('still lists valid codes (including booleans), deduped, in the fixed business order', async () => {
      const user = userEvent.setup();
      distinctValuesOverride.current = distinctOf('CO', 'DR', true, false, 'DR');
      renderStatus({ rows: rowsOf('CO', 'VO') });
      await openStatus(user);
      const rowsInOrder = screen.getAllByRole('option').slice(1);
      const tones = rowsInOrder.map((o) => o.querySelector('.status-tag').className.match(/status-tag--(\w+)/)[1]);
      // false/DR (neutral) precede true/CO (success); VO (destructive) closes the list.
      expect(tones).toEqual(['neutral', 'neutral', 'success', 'success', 'destructive']);
      expect(rowsInOrder).toHaveLength(5);
    });

    it('sorts the same code set identically whatever the arrival order of backend and in-memory codes', async () => {
      const user = userEvent.setup();
      distinctValuesOverride.current = distinctOf('VO', 'CO');
      const first = renderStatus({ rows: rowsOf('DR', 'UE') });
      await openStatus(user);
      const a = optionTexts();
      first.unmount();
      distinctValuesOverride.current = distinctOf('DR', 'UE');
      renderStatus({ rows: rowsOf('CO', 'VO') });
      await openStatus(user);
      expect(optionTexts()).toEqual(a);
      expect(a).toHaveLength(5);
    });
  });

  describe('search inside the status menu', () => {
    it('shows only "no results" when the search matches nothing', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('DR', 'CO') });
      await openStatus(user);
      await user.type(screen.getByRole('combobox'), 'zzzz');
      expect(await screen.findByTestId('distinct-values-no-results')).toHaveTextContent('noResults');
      expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('reopens with an empty search box and the full list after closing mid-search', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('DR', 'CO') });
      await openStatus(user);
      await user.type(screen.getByRole('combobox'), 'zzzz');
      await screen.findByTestId('distinct-values-no-results');
      await user.keyboard('{Escape}');
      await openStatus(user);
      expect(screen.getByRole('combobox')).toHaveValue('');
      expect(optionTexts()).toEqual(['allStatuses', 'Draft', 'Complete']);
    });
  });

  describe('status tags', () => {
    const toneCases = [['CO', 'success'], ['DR', 'neutral'], ['UE', 'warning'], ['VO', 'destructive'], ['true', 'success'], ['false', 'neutral']];

    it.each(toneCases)('renders code %s as a %s tag matching getStatusTone', async (code, tone) => {
      const user = userEvent.setup();
      const { getStatusTone } = await import('@/lib/statusBadge.js');
      expect(getStatusTone(code)).toBe(tone);
      distinctValuesOverride.current = distinctOf(code);
      renderStatus();
      await openStatus(user);
      const tag = screen.getAllByRole('option')[1].querySelector('.status-tag');
      expect(tag).toHaveClass(`status-tag--${tone}`);
      expect(screen.getAllByTestId('StatusTag__filter-option')).toHaveLength(1);
      expect(screen.getAllByRole('option')[0].querySelector('[data-testid="StatusTag__filter-option"]')).toBeNull();
    });

    it('selects the code and closes the menu when a tag is clicked', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      renderStatus({ rows: rowsOf('CO'), onFilterChange });
      await openStatus(user);
      await user.click(screen.getByText('Complete'));
      expect(onFilterChange).toHaveBeenCalledWith('documentStatus', { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('keeps the check and the coloured tag on the selected row', async () => {
      const user = userEvent.setup();
      renderStatus({
        rows: rowsOf('CO', 'DR'),
        columnFilters: { documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } },
      });
      await openStatus(user);
      const selected = screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');
      expect(within(selected).getByTestId('Check__55c679')).toBeInTheDocument();
      expect(selected.querySelector('.status-tag')).toHaveClass('status-tag--success');
    });

    it('renders no tag on the all-statuses row', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('CO') });
      await openStatus(user);
      expect(screen.getAllByRole('option')[0].querySelector('.status-tag')).toBeNull();
    });

    it('renders no status tag in the type menu', async () => {
      const user = userEvent.setup();
      distinctValuesOverride.current = distinctOf('AP', 'AR');
      render(<ListFilterBar columns={TYPE_COLS} columnFilters={{}} onFilterChange={vi.fn()} />);
      await user.click(screen.getByTestId('filter-type'));
      await screen.findByRole('listbox');
      expect(screen.getAllByRole('option')).toHaveLength(3);
      expect(document.querySelector('.status-tag')).toBeNull();
      expect(screen.queryByTestId('StatusTag__filter-option')).not.toBeInTheDocument();
    });

    it('keeps the trigger label as plain text, not a tag', async () => {
      renderStatus({
        rows: rowsOf('CO'),
        columnFilters: { documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } },
      });
      const trigger = screen.getByTestId('filter-status');
      expect(trigger).toHaveTextContent('Complete');
      expect(trigger.querySelector('.status-tag')).toBeNull();
    });

    it('truncates a long label and exposes it as the wrapper title', async () => {
      const user = userEvent.setup();
      // An unmapped code is its own label, so a long code stands in for a long label.
      const longLabel = 'A_VERY_LONG_UNMAPPED_STATUS_LABEL_THAT_CANNOT_FIT';
      renderStatus({ rows: rowsOf(longLabel) });
      await openStatus(user);
      const row = screen.getAllByRole('option')[1];
      const tag = row.querySelector('.status-tag');
      expect(tag).toHaveClass('truncate', 'max-w-full');
      expect(tag).toHaveTextContent(longLabel);
      expect(row.querySelector(`[title="${longLabel}"]`)).not.toBeNull();
    });
  });

  describe('keyboard flow', () => {
    it.each([['{Enter}'], [' ']])('Tab to the trigger then %j opens the menu and focuses the combobox input', async (key) => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('DR') });
      await user.tab();
      // Advanced-filter funnel may precede the status trigger; tab until the trigger has focus.
      for (let i = 0; i < 5 && document.activeElement !== screen.getByTestId('filter-status'); i += 1) {
        await user.tab();
      }
      expect(screen.getByTestId('filter-status')).toHaveFocus();
      await user.keyboard(key);
      expect(await screen.findByRole('combobox')).toHaveFocus();
    });

    it('ArrowDown twice then Enter selects the option, closes the menu and returns focus to the trigger', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      renderStatus({ rows: rowsOf('DR', 'CO'), onFilterChange });
      const trigger = screen.getByTestId('filter-status');
      trigger.focus();
      await user.keyboard('{Enter}');
      await screen.findByRole('combobox');
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      expect(onFilterChange).toHaveBeenCalledWith('documentStatus', { mode: 'enumLabel', value: ['DR'], originalValue: 'DR' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('Escape on a reopened menu closes it and returns focus to the trigger', async () => {
      const user = userEvent.setup();
      renderStatus({ rows: rowsOf('DR') });
      const trigger = screen.getByTestId('filter-status');
      trigger.focus();
      await user.keyboard('{Enter}');
      await screen.findByRole('combobox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      await user.keyboard('{Enter}');
      await screen.findByRole('combobox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});

describe('ListFilterBar status options follow the current view', () => {
  const COLS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
    { key: 'docType', label: 'Document Type', type: 'string', isTypeFilter: true },
  ];
  const lastCallFor = (field) => [...distinctCalls].reverse().find((c) => c.field === field);
  const baseProps = { columns: COLS, columnFilters: {}, onFilterChange: vi.fn(), entity: 'header', apiBaseUrl: '/api' };

  it('builds the status extraParams with the status column key excluded', () => {
    const buildDistinctQuery = vi.fn(() => 'criteria=abc&active=true');
    render(<ListFilterBar {...baseProps} buildDistinctQuery={buildDistinctQuery} />);
    expect(buildDistinctQuery).toHaveBeenCalledWith(['documentStatus']);
    expect(lastCallFor('documentStatus').opts.extraParams).toBe('criteria=abc&active=true');
  });

  it('gives the type dropdown no extraParams', () => {
    render(<ListFilterBar {...baseProps} buildDistinctQuery={() => 'criteria=abc'} />);
    expect(lastCallFor('docType').opts.extraParams).toBeUndefined();
  });

  it('passes an empty extraParams when buildDistinctQuery is not provided', () => {
    render(<ListFilterBar {...baseProps} />);
    expect(lastCallFor('documentStatus').opts.extraParams).toBe('');
  });

  it('passes the updated extraParams when buildDistinctQuery output changes', () => {
    const { rerender } = render(<ListFilterBar {...baseProps} buildDistinctQuery={() => 'active=true'} />);
    expect(lastCallFor('documentStatus').opts.extraParams).toBe('active=true');
    rerender(<ListFilterBar {...baseProps} buildDistinctQuery={() => 'active=false'} />);
    expect(lastCallFor('documentStatus').opts.extraParams).toBe('active=false');
  });

  it('keeps the active status listed and selected when the narrowed options omit it', async () => {
    realListFlag.current = true;
    const user = userEvent.setup();
    distinctValuesOverride.current = {
      values: [{ id: 'DR' }], loading: false, loadingMore: false, hasMore: false,
      search: '', setSearch: () => {}, loadMore: () => {},
    };
    render(
      <ListFilterBar
        {...baseProps}
        columnFilters={{ documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } }}
        buildDistinctQuery={() => 'active=true'}
      />,
    );
    await user.click(screen.getByTestId('filter-status'));
    await screen.findByRole('listbox');
    const options = screen.getAllByRole('option');
    const complete = options.find((o) => o.textContent === 'Complete');
    expect(complete).toBeTruthy();
    expect(complete).toHaveAttribute('aria-selected', 'true');
    expect(options.map((o) => o.textContent)).toContain('Draft');
  });
});

// The status search is client-side: typed text filters the merged option set by its displayed
// label only (raw codes are never shown to the user) and is never sent to the backend.
describe('ListFilterBar status menu client-side label search', () => {
  const COLS = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'documentStatus', label: 'Status', type: 'status' },
    { key: 'docType', label: 'Document Type', type: 'string', isTypeFilter: true },
  ];
  const rowsOf = (...codes) => codes.map((c, i) => ({ id: `r${i}`, documentStatus: c }));
  const distinctOf = (...ids) => ({
    values: ids.map((id) => ({ id })),
    loading: false, loadingMore: false, hasMore: false,
    search: '', setSearch: () => {}, loadMore: () => {},
  });
  const renderBar = (props = {}) => render(
    <ListFilterBar columns={COLS} columnFilters={{}} onFilterChange={vi.fn()} entity="header" apiBaseUrl="/api" {...props} />,
  );
  const openStatus = async (user) => {
    await user.click(screen.getByTestId('filter-status'));
    return screen.findByRole('listbox');
  };
  const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);
  const search = async (user, text) => {
    const box = screen.getByRole('combobox');
    await user.clear(box);
    await user.type(box, text);
  };
  const waitForOptions = (expected) => waitFor(() => expect(optionTexts()).toEqual(expected));

  // Spanish status dictionary: the displayed labels differ from the raw codes.
  beforeEach(() => {
    realListFlag.current = true;
    localeOverride.current = {
      statuses: { DR: { label: 'Borrador' }, CO: { label: 'Completado' }, VO: { label: 'Anulado' } },
    };
  });

  it.each([['borr'], ['BORR'], ['bórr']])(
    'finds a backend-only code by its label for the query %s (case and accent insensitive)',
    async (query) => {
      const user = userEvent.setup();
      distinctValuesOverride.current = distinctOf('DR', 'CO');
      renderBar({ rows: [] });
      await openStatus(user);
      await search(user, query);
      await waitForOptions(['allStatuses', 'Borrador']);
    },
  );

  it('ignores leading and trailing spaces in the query', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO');
    renderBar({ rows: [] });
    await openStatus(user);
    await search(user, '  borr  ');
    await waitForOptions(['allStatuses', 'Borrador']);
  });

  it('filters backend values by label: "anul" keeps only VO (Anulado) and hides the other codes', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('VO', 'DR', 'CO');
    renderBar({ rows: [] });
    await openStatus(user);
    await search(user, 'anul');
    await waitForOptions(['allStatuses', 'Anulado']);
  });

  it('does not match the raw code when the label does not contain the query ("vo" -> no Anulado)', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('VO', 'DR');
    renderBar({ rows: [] });
    await openStatus(user);
    // No displayed label (Anulado, Borrador) contains "vo": only the raw code VO does.
    await search(user, 'vo');
    expect(await screen.findByTestId('distinct-values-no-results')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Anulado' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('does not list an option for a code-only query: "dr" does not list Borrador', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO', 'VO');
    renderBar({ rows: [] });
    await openStatus(user);
    await search(user, 'dr');
    expect(await screen.findByTestId('distinct-values-no-results')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('matches "co" through the label Completado only, not through the code CO of other options', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO', 'VO');
    renderBar({ rows: [] });
    await openStatus(user);
    await search(user, 'co');
    await waitForOptions(['allStatuses', 'Completado']);
  });

  it('hides the active code when the query does not match it and lists it again when the query is cleared', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO');
    renderBar({
      rows: [],
      columnFilters: { documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } },
    });
    await openStatus(user);
    expect(optionTexts()).toContain('Completado');
    expect(screen.getAllByRole('option').find((o) => o.textContent === 'Completado')).toHaveAttribute('aria-selected', 'true');
    await search(user, 'borr');
    await waitForOptions(['allStatuses', 'Borrador']);
    await user.clear(screen.getByRole('combobox'));
    await waitFor(() => expect(optionTexts()).toContain('Completado'));
    expect(screen.getAllByRole('option').find((o) => o.textContent === 'Completado')).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the active code, still selected, when the query matches it', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR');
    renderBar({
      rows: [],
      columnFilters: { documentStatus: { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' } },
    });
    await openStatus(user);
    await search(user, 'comp');
    await waitForOptions(['allStatuses', 'Completado']);
    expect(screen.getAllByRole('option').find((o) => o.textContent === 'Completado')).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the fixed business order after filtering', async () => {
    const user = userEvent.setup();
    // Arrival order is the reverse of the business order; "o" is in every label.
    distinctValuesOverride.current = distinctOf('VO', 'CO', 'DR');
    renderBar({ rows: [] });
    await openStatus(user);
    const full = optionTexts();
    expect(full).toEqual(['allStatuses', 'Borrador', 'Completado', 'Anulado']);
    await search(user, 'o');
    await waitFor(() => expect(optionTexts()).toEqual(full));
    // "l" is in Completado and Anulado only: they stay in business order, not arrival order.
    await search(user, 'l');
    await waitFor(() => expect(optionTexts()).toEqual(['allStatuses', 'Completado', 'Anulado']));
  });

  it('shows the no-results message and no option rows when nothing matches', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO');
    renderBar({ rows: rowsOf('DR') });
    await openStatus(user);
    await search(user, 'zzzz');
    expect(await screen.findByTestId('distinct-values-no-results')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('reopens with an empty search box and the full list after closing mid-search with a partial match', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO');
    renderBar({ rows: [] });
    await openStatus(user);
    const full = optionTexts();
    await search(user, 'borr');
    await waitForOptions(['allStatuses', 'Borrador']);
    await user.keyboard('{Escape}');
    await openStatus(user);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(optionTexts()).toEqual(full);
  });

  it('never sends the typed text to the backend: the status hook options carry no search and keep the same extraParams', async () => {
    const user = userEvent.setup();
    distinctValuesOverride.current = distinctOf('DR', 'CO');
    renderBar({ rows: [], buildDistinctQuery: () => 'active=true' });
    await openStatus(user);
    await search(user, 'borr');
    await waitForOptions(['allStatuses', 'Borrador']);
    const statusCalls = distinctCalls.filter((c) => c.field === 'documentStatus');
    expect(statusCalls.length).toBeGreaterThan(1);
    for (const call of statusCalls) {
      expect(call.opts).not.toHaveProperty('search');
      expect(call.opts.extraParams).toBe('active=true');
    }
  });

  describe('against the captured list props (stubbed list)', () => {
    beforeEach(() => {
      realListFlag.current = false;
    });

    it('binds the list search box to local state and leaves the hook setSearch untouched', () => {
      const hookSetSearch = vi.fn();
      distinctValuesOverride.current = { ...distinctOf('DR', 'CO'), setSearch: hookSetSearch };
      renderBar({ rows: [] });
      fireEvent.click(screen.getByTestId('filter-status'));
      const view = lastDistinctValuesListProps.current.distinct;
      expect(view.search).toBe('');
      act(() => view.setSearch('borr'));
      expect(hookSetSearch).not.toHaveBeenCalled();
      expect(lastDistinctValuesListProps.current.distinct.search).toBe('borr');
      expect(lastDistinctValuesListProps.current.codes).toEqual(['DR']);
    });

    it('resets the local search when the list unmount cleanup calls setSearch with an empty string', () => {
      distinctValuesOverride.current = distinctOf('DR', 'CO');
      renderBar({ rows: [] });
      fireEvent.click(screen.getByTestId('filter-status'));
      act(() => lastDistinctValuesListProps.current.distinct.setSearch('borr'));
      expect(lastDistinctValuesListProps.current.codes).toEqual(['DR']);
      act(() => lastDistinctValuesListProps.current.distinct.setSearch(''));
      expect(lastDistinctValuesListProps.current.distinct.search).toBe('');
      expect(lastDistinctValuesListProps.current.codes).toHaveLength(2);
    });

    it('routes typing in the type menu through the type hook setSearch and leaves the status codes untouched', () => {
      const hookSetSearch = vi.fn();
      distinctValuesOverride.current = { ...distinctOf('AP', 'AR'), setSearch: hookSetSearch };
      renderBar({ rows: rowsOf('DR', 'CO') });
      fireEvent.click(screen.getByTestId('filter-type'));
      act(() => lastDistinctValuesListProps.current.distinct.setSearch('ap'));
      expect(hookSetSearch).toHaveBeenCalledWith('ap');
      // Status menu opened afterwards starts with an empty local search and the full list.
      fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
      fireEvent.click(screen.getByTestId('filter-status'));
      expect(lastDistinctValuesListProps.current.distinct.search).toBe('');
    });
  });
});
