import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const navigateFn = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateFn,
}));

// Stub the date range popover and the status filter to keep this test focused
// on toolbar wiring.
vi.mock('@/components/ui/date-range-popover', () => ({
  DateRangePopover: ({ value, onChange, placeholder }) => (
    <button
      type="button"
      data-testid="date-range-popover"
      data-value={value === null ? 'null' : 'set'}
      onClick={() => onChange({ presetId: 'last7' })}
    >
      {placeholder}
    </button>
  ),
}));

vi.mock('../StatementStatusFilter', () => ({
  StatementStatusFilter: ({ value, onChange }) => (
    <button
      type="button"
      data-testid="status-filter"
      data-value={value ?? '__null__'}
      onClick={() => onChange('PENDING')}
    >
      status-filter
    </button>
  ),
}));

import { StatementsToolbar } from '../StatementsToolbar.jsx';

function renderToolbar(overrides = {}) {
  const props = {
    search: '',
    onSearchChange: vi.fn(),
    dateRange: null,
    onDateRangeChange: vi.fn(),
    status: null,
    onStatusChange: vi.fn(),
    onImportClick: vi.fn(),
    ...overrides,
  };
  return { ...render(<StatementsToolbar {...props} />), props };
}

describe('StatementsToolbar', () => {
  beforeEach(() => {
    navigateFn.mockReset();
  });

  it('renders the back, date-range, status-filter, search and import controls', () => {
    renderToolbar();
    expect(screen.getByTestId('statements-toolbar-back')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-popover')).toBeInTheDocument();
    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('statements-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('statements-import-button')).toBeInTheDocument();
  });

  it('navigates back when the back button is clicked', async () => {
    const user = userEvent.setup();
    renderToolbar();
    await user.click(screen.getByTestId('statements-toolbar-back'));
    expect(navigateFn).toHaveBeenCalledWith(-1);
  });

  it('passes the current search value through to the input', () => {
    renderToolbar({ search: 'mayo' });
    expect(screen.getByTestId('statements-search-input')).toHaveValue('mayo');
  });

  it('emits onSearchChange as the user types', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.type(screen.getByTestId('statements-search-input'), 'a');
    expect(props.onSearchChange).toHaveBeenCalledWith('a');
  });

  it('emits onImportClick when the import button is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.click(screen.getByTestId('statements-import-button'));
    expect(props.onImportClick).toHaveBeenCalledTimes(1);
  });

  it('emits onDateRangeChange when the date range stub triggers a change', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.click(screen.getByTestId('date-range-popover'));
    expect(props.onDateRangeChange).toHaveBeenCalledWith({ presetId: 'last7' });
  });

  it('emits onStatusChange when the status filter stub triggers a change', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.click(screen.getByTestId('status-filter'));
    expect(props.onStatusChange).toHaveBeenCalledWith('PENDING');
  });

  it('forwards the current dateRange / status to the children', () => {
    renderToolbar({ dateRange: { presetId: 'today' }, status: 'PARTIAL' });
    expect(screen.getByTestId('date-range-popover')).toHaveAttribute('data-value', 'set');
    expect(screen.getByTestId('status-filter')).toHaveAttribute('data-value', 'PARTIAL');
  });

  // The imported-statements tab draws its own toolbar, so it never picked up ListView's
  // generic refresh button — RefreshButton reproduces it and is wired to the tab's reload.
  it('renders the refresh button with an i18n accessible name', () => {
    renderToolbar({ onRefresh: vi.fn() });
    const button = screen.getByTestId('finance-refresh-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'refresh');
    expect(button).toHaveAttribute('title', 'refresh');
  });

  it('emits onRefresh when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderToolbar({ onRefresh });
    await user.click(screen.getByTestId('finance-refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the refresh button after the sort control', () => {
    renderToolbar({
      onRefresh: vi.fn(),
      sortControl: <button type="button" data-testid="sort-control">sort</button>,
    });
    const sort = screen.getByTestId('sort-control');
    const refresh = screen.getByTestId('finance-refresh-button');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(sort.compareDocumentPosition(refresh) & 4).toBeTruthy();
  });

  it('keeps the "Create manually" menu closed until the split arrow is clicked', () => {
    renderToolbar({ onManualClick: vi.fn() });
    expect(screen.queryByTestId('statements-manual-create')).not.toBeInTheDocument();
  });

  it('opens the split menu and calls onManualClick on "Create manually"', async () => {
    const user = userEvent.setup();
    const onManualClick = vi.fn();
    renderToolbar({ onManualClick });

    await user.click(screen.getByTestId('statements-import-split'));
    const item = screen.getByTestId('statements-manual-create');
    expect(item).toBeInTheDocument();

    await user.click(item);
    expect(onManualClick).toHaveBeenCalledTimes(1);
    // Menu closes after choosing an item.
    expect(screen.queryByTestId('statements-manual-create')).not.toBeInTheDocument();
  });
});
