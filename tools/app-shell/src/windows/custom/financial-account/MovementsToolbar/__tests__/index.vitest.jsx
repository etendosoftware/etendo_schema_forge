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
    // Primary "Nuevo movimiento" split-button is present.
    expect(screen.getByTestId('new-movement-button')).toBeInTheDocument();
    expect(screen.getByTestId('new-movement-split')).toBeInTheDocument();
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

  it('fires onNewMovement from the primary split-button action', async () => {
    const user = userEvent.setup();
    const onNewMovement = vi.fn();
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onNewMovement={onNewMovement}
      />,
    );

    await user.click(screen.getByTestId('new-movement-button'));
    expect(onNewMovement).toHaveBeenCalledTimes(1);
  });

  it('opens the split menu and fires onTransfer from the "Transferir fondos" item', async () => {
    const user = userEvent.setup();
    const onTransfer = vi.fn();
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onTransfer={onTransfer}
      />,
    );

    // Transfer moved into the split-button dropdown; standalone button is gone.
    expect(screen.queryByTestId('transfer-funds-button')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('new-movement-split'));
    const item = screen.getByTestId('movements-transfer-menu-item');
    expect(item).toBeInTheDocument();
    await user.click(item);
    expect(onTransfer).toHaveBeenCalledTimes(1);
  });

  // The movements tab draws its own toolbar, so it never picked up ListView's generic
  // refresh button — RefreshButton reproduces it and is wired to the tab's reload.
  it('renders the refresh button with an i18n accessible name', () => {
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onRefresh={vi.fn()}
      />,
    );

    const button = screen.getByTestId('finance-refresh-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'refresh');
  });

  it('fires onRefresh when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByTestId('finance-refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the refresh button after the sort control', () => {
    render(
      <MovementsToolbar
        filters={defaultFilters}
        onFiltersChange={() => () => {}}
        onRefresh={vi.fn()}
        sortControl={<button type="button" data-testid="sort-control">sort</button>}
      />,
    );

    const sort = screen.getByTestId('sort-control');
    const refresh = screen.getByTestId('finance-refresh-button');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(sort.compareDocumentPosition(refresh) & 4).toBeTruthy();
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
