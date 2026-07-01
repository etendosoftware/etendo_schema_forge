import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../DateRangeFilter', () => ({
  DateRangeFilter: ({ value, onChange }) => (
    <button
      type="button"
      data-testid="date-range-filter"
      data-value={String(value)}
      onClick={() => onChange('preset:last7')}
    >
      date-range-filter
    </button>
  ),
}));

vi.mock('../TypeFilter', () => ({
  TypeFilter: ({ value, onChange }) => (
    <button
      type="button"
      data-testid="type-filter"
      data-value={String(value)}
      onClick={() => onChange('IN')}
    >
      type-filter
    </button>
  ),
}));

// AdvancedFilterBuilder is lazy inside a closed Popover, but mock it minimally
// so the real import never breaks the render.
vi.mock('@/components/contract-ui/AdvancedFilterBuilder.jsx', () => ({
  AdvancedFilterBuilder: () => <div data-testid="advanced-filter-builder" />,
}));

import { MovementsToolbar } from '../index.jsx';

const defaultFilters = {
  dateRange: '',
  type: null,
  search: '',
};

const makeOnFiltersChange = () => {
  const calls = {};
  const fn = vi.fn((key) => {
    const handler = vi.fn();
    calls[key] = handler;
    return handler;
  });
  fn.calls = calls;
  return fn;
};

describe('MovementsToolbar', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the back button, filter triggers, search and new-movement button', () => {
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onAdvancedFilterChange={() => {}}
      />,
    );

    expect(screen.getByTestId('movements-toolbar-back')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-filter')).toBeInTheDocument();
    expect(screen.getByTestId('type-filter')).toBeInTheDocument();
    expect(screen.getByTestId('movements-advanced-filter')).toBeInTheDocument();
    expect(screen.getByTestId('movements-search-input')).toBeInTheDocument();
    // Manual movement creation is feature-flagged off in this release.
    expect(screen.queryByTestId('new-movement-button')).not.toBeInTheDocument();
  });

  it('renders the search input using i18n keys', () => {
    render(
      <MovementsToolbar filters={defaultFilters} onFiltersChange={() => () => {}} />,
    );

    const searchInput = screen.getByTestId('movements-search-input');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('placeholder', 'financeAccountMovementsSearch');
  });

  it('navigates back when back button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MovementsToolbar filters={defaultFilters} onFiltersChange={() => () => {}} />,
    );

    await user.click(screen.getByTestId('movements-toolbar-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('forwards search input changes through onFiltersChange("search")', async () => {
    const user = userEvent.setup();
    const onFiltersChange = makeOnFiltersChange();

    render(
      <MovementsToolbar filters={defaultFilters} onFiltersChange={onFiltersChange} />,
    );

    const input = screen.getByTestId('movements-search-input');
    await user.type(input, 'abc');

    expect(onFiltersChange).toHaveBeenCalledWith('search');
    // Each typed character creates a change event; the per-key handler should
    // have been invoked at least once with one of the intermediate values.
    const handler = onFiltersChange.calls.search;
    expect(handler).toHaveBeenCalled();
    // Last call should reflect the latest character typed
    const lastCall = handler.mock.calls.at(-1);
    expect(lastCall[0]).toBe('c');
  });

  it('renders the Transfer funds button (in the former New-movement slot) and fires onTransfer', async () => {
    const user = userEvent.setup();
    const onTransfer = vi.fn();
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onTransfer={onTransfer}
      />,
    );

    // The feature-flagged "New movement" button is gone; its slot now holds Transfer funds.
    expect(screen.queryByTestId('new-movement-button')).not.toBeInTheDocument();
    const btn = screen.getByTestId('transfer-funds-button');
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onTransfer).toHaveBeenCalledTimes(1);
  });

  it('passes the active filter values to child filter components', () => {
    const filters = {
      dateRange: 'preset:last7',
      type: 'IN',
      search: 'hello',
    };
    render(
      <MovementsToolbar filters={filters} onFiltersChange={() => () => {}} />,
    );

    expect(screen.getByTestId('date-range-filter')).toHaveAttribute('data-value', 'preset:last7');
    expect(screen.getByTestId('type-filter')).toHaveAttribute('data-value', 'IN');
    expect(screen.getByTestId('movements-search-input')).toHaveValue('hello');
  });

  it('forwards filter child onChange through the curried onFiltersChange(key)', async () => {
    const user = userEvent.setup();
    const onFiltersChange = makeOnFiltersChange();

    render(
      <MovementsToolbar filters={defaultFilters} onFiltersChange={onFiltersChange} />,
    );

    await user.click(screen.getByTestId('date-range-filter'));
    await user.click(screen.getByTestId('type-filter'));

    expect(onFiltersChange.calls.dateRange).toHaveBeenCalledWith('preset:last7');
    expect(onFiltersChange.calls.type).toHaveBeenCalledWith('IN');
  });

  it('shows the active-conditions count badge on the advanced filter trigger', () => {
    const advancedFilter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'greaterThan', value: 0 }],
    };
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onAdvancedFilterChange={() => {}}
        advancedFilter={advancedFilter}
      />,
    );

    const trigger = screen.getByTestId('movements-advanced-filter');
    expect(trigger).toHaveTextContent('1');
  });

  it('renders no count badge when there are no advanced conditions', () => {
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onAdvancedFilterChange={() => {}}
        advancedFilter={{ rowOperator: 'and', conditions: [] }}
      />,
    );

    const trigger = screen.getByTestId('movements-advanced-filter');
    expect(trigger).not.toHaveTextContent(/\d/);
  });

  it('renders no count badge when advancedFilter is null', () => {
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onAdvancedFilterChange={() => {}}
        advancedFilter={null}
      />,
    );

    const trigger = screen.getByTestId('movements-advanced-filter');
    expect(trigger).not.toHaveTextContent(/\d/);
  });
});
