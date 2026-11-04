// @covers tools/app-shell/src/windows/custom/calendar/YearTableWithCloseStatus.jsx
// The existing status-cell suite stubs DataTable; this integration needs the real grid.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useGridView } from '@/hooks/useGridView.js';
import YearTableWithCloseStatus, { CurrentFiscalYearContext } from '../YearTableWithCloseStatus.jsx';

const boundary = vi.hoisted(() => ({ enabled: false, apiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => boundary.apiFetch }));
vi.mock('@/lib/flags', () => ({
  GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.enabled,
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));
vi.mock('../useYearCloseStatus.js', () => ({ useYearCloseStatus: () => false }));

const rows = [{ id: 'year-1', fiscalYear: '2026', description: 'FY26' }];
const columns = [
  { key: 'fiscalYear', column: 'Year', label: 'fiscalYear', type: 'string', required: true },
  { key: 'description', column: 'Description', label: 'description', type: 'string' },
];

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
beforeEach(() => {
  boundary.enabled = false;
  boundary.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 204 });
});

describe('YearTableWithCloseStatus personal grid views', () => {
  it('keeps default columns and the guided-tour marker without preference requests when disabled', () => {
    render(<CurrentFiscalYearContext.Provider value="2026">
      <YearTableWithCloseStatus data={rows} apiBaseUrl="/sws/neo/fiscal-calendar" />
    </CurrentFiscalYearContext.Provider>);
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(boundary.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-year-1')).toHaveTextContent('FY26');
    expect(screen.getByTestId('row-year-1').querySelector('[data-current-fiscal-year]')).not.toBeNull();
  });

  it('saves visibility explicitly and preserves selection, sort callbacks and the required year column', async () => {
    boundary.enabled = true;
    const user = userEvent.setup();
    const onSort = vi.fn();
    const onSelectionChange = vi.fn();
    render(<YearTableWithCloseStatus data={rows} apiBaseUrl="/sws/neo/fiscal-calendar"
      selectable onSort={onSort} onSelectionChange={onSelectionChange} />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/fiscal-calendar/year', { baseUrl: '' });
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    expect(screen.getByTestId('grid-view-column-fiscalYear')).toHaveAttribute('data-disabled');
    await user.click(screen.getByTestId('grid-view-column-description'));
    expect(screen.queryByTestId('column-header-description')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('row-year-1')).getByRole('checkbox'));
    expect(onSelectionChange).toHaveBeenCalledWith(rows);
    fireEvent.click(within(screen.getByTestId('column-header-fiscalYear')).getAllByRole('button')[0]);
    expect(onSort).toHaveBeenCalledWith('fiscalYear');
    expect(boundary.apiFetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(boundary.apiFetch).toHaveBeenCalledTimes(2));
    const [url, request] = boundary.apiFetch.mock.calls[1];
    expect(url).toBe('/sws/neo/grid-views/fiscal-calendar/year');
    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body).columns).toContainEqual(expect.objectContaining({
      id: 'list:ad:Description:field:description', visible: false,
    }));
  });

  it('uses an inherited controller without a duplicate toolbar or preference load', async () => {
    boundary.enabled = true;
    boundary.apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({
      version: 1, surface: 'list', columns: [
        { id: 'list:ad:Year:field:fiscalYear', visible: true, order: 0 },
        { id: 'list:ad:Description:field:description', visible: false, order: 1 },
      ],
    }) });
    function Host() {
      const gridView = useGridView({ spec: 'fiscal-calendar', entity: 'year', columns, data: rows, enabled: true });
      return <YearTableWithCloseStatus data={rows} columns={columns} gridView={gridView} />;
    }
    render(<Host />);
    // Parent metadata is available before its asynchronous view load completes.
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(boundary.apiFetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('column-header-description')).not.toBeInTheDocument());
    expect(screen.getByTestId('column-header-fiscalYear')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(boundary.apiFetch).toHaveBeenCalledTimes(1);
  });
});
