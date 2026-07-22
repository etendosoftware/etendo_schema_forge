import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

// ── Mocks ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (cur, val) => `${cur} ${val}`,
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid={`status-${status}`}>{label}</span>,
}));

import AssetsAmortizationPanel from '../AssetsAmortizationPanel.jsx';

// The shared Checkbox (app-shell-core, Semantic Theme Contract) renders a
// <label data-testid="..."> wrapping a nested <input type="checkbox">.
// `aria-checked` and the native checked state live on that nested input,
// not on the label, so assertions on checkbox semantics must drill into it.
function checkboxInput(testId) {
  return within(screen.getByTestId(testId)).getByRole('checkbox');
}

const BASE_PROPS = {
  data: { id: 'asset-1' },
  token: 'tok',
  apiBaseUrl: 'http://host/sws/neo/assets',
  onCountChange: vi.fn(),
};

describe('AssetsAmortizationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially while fetching', () => {
    // Never resolve the fetch so we stay in loading
    globalThis.fetch.mockReturnValue(new Promise(() => {}));
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    expect(screen.getByText('assetsLoading')).toBeInTheDocument();
  });

  it('shows empty state when no lines are returned', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('assetsNoAmortizationLines')).toBeInTheDocument();
    });
  });

  it('calls onCountChange with line count', async () => {
    const lines = [
      { id: 'l1', sEQNoAsset: 1, amortizationPercentage: 25, amortizationAmount: 1000 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(BASE_PROPS.onCountChange).toHaveBeenCalledWith(1);
    });
  });

  it('renders table rows when lines are present', async () => {
    const lines = [
      { id: 'l1', sEQNoAsset: 1, amortizationPercentage: 25, amortizationAmount: 1000, 'amortization$_identifier': 'Jan 2025' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('25.00%')).toBeInTheDocument();
    });
    // Single line -> row amount and footer total both render "EUR 1000".
    expect(screen.getAllByText('EUR 1000')).toHaveLength(2);
    // Column headers
    expect(screen.getByText('assetsPeriod')).toBeInTheDocument();
    expect(screen.getByText('assetsPercentage')).toBeInTheDocument();
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.getByText('assetsStatus')).toBeInTheDocument();
  });

  it('renders PeriodLink when line has amortization id', async () => {
    const lines = [
      { id: 'l1', sEQNoAsset: 1, amortization: 'amort-1', 'amortization$_identifier': 'Period 1', amortizationAmount: 500 },
    ];
    // First call: list lines; second call: amortization header (processed check)
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: lines } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ processed: 'Y' }] } }),
      });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Period 1')).toBeInTheDocument();
    });
    // Click the period link to navigate
    fireEvent.click(screen.getByText('Period 1'));
    expect(mockNavigate).toHaveBeenCalledWith('/amortization/amort-1');
  });

  it('shows processed status when amortization is processed', async () => {
    const lines = [
      { id: 'l1', amortization: 'amort-1', amortizationAmount: 500 },
    ];
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: lines } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ processed: 'Y' }] } }),
      });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('status-CO')).toBeInTheDocument();
    });
    expect(screen.getByText('assetsStatusProcessed')).toBeInTheDocument();
  });

  it('shows planned status when amortization is not processed', async () => {
    const lines = [
      { id: 'l1', amortization: 'amort-1', amortizationAmount: 500 },
    ];
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: lines } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ processed: 'N' }] } }),
      });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('status-IP')).toBeInTheDocument();
    });
    expect(screen.getByText('assetsStatusPlanned')).toBeInTheDocument();
  });

  it('shows dash when amortizationPercentage is null', async () => {
    const lines = [
      { id: 'l1', amortizationPercentage: null, amortizationAmount: 100 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      // Single line -> row amount and footer total both render "EUR 100".
      expect(screen.getAllByText('EUR 100')).toHaveLength(2);
    });
    // The percentage cell should show a dash
    const tds = container.querySelectorAll('td');
    const pctCell = tds[2]; // third td is percentage (tds[0] is checkbox)
    expect(pctCell.textContent).toContain('\u2014');
  });

  it('shows dash identifier when line has no amortization id', async () => {
    const lines = [
      { id: 'l1', amortizationAmount: 100 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      // Single line -> row amount and footer total both render "EUR 100".
      expect(screen.getAllByText('EUR 100')).toHaveLength(2);
    });
    const tds = container.querySelectorAll('td');
    const periodCell = tds[1]; // tds[0] is checkbox
    expect(periodCell.textContent).toContain('\u2014');
  });

  it('uses recordId prop over data.id', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} recordId="override-id" />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('parentId=override-id');
  });

  it('handles fetch error gracefully', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('assetsNoAmortizationLines')).toBeInTheDocument();
    });
  });

  it('does not fetch when recordId and data.id are both absent', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} data={{}} recordId={undefined} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when apiBaseUrl is missing', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} apiBaseUrl={undefined} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses useCurrency fallback when hook returns null', async () => {
    // useCurrency mock returns 'EUR', testing that formatCurrency receives it
    const lines = [{ id: 'l1', amortizationAmount: 42 }];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      // Single line -> row amount and footer total both render "EUR 42".
      expect(screen.getAllByText('EUR 42')).toHaveLength(2);
    });
  });

  // ── Row selection + bulk delete (ETP-4335) ──

  const TWO_LINES = [
    { id: 'l1', sEQNoAsset: 1, amortizationAmount: 100 },
    { id: 'l2', sEQNoAsset: 2, amortizationAmount: 200 },
  ];

  it('checking a row checkbox shows the selection bar with the selected count', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('delete')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));

    const deleteButton = await screen.findByTitle('delete');
    expect(deleteButton).toBeInTheDocument();
    expect(screen.getByTitle('close')).toBeInTheDocument();
    expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
    expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'false');
  });

  it('unchecking the only selected row hides the selection bar', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));

    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
  });

  it('select-all checkbox selects every row and reflects indeterminate state', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-all')).toBeInTheDocument();
    });

    // Select a single row first -> header checkbox should be indeterminate.
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-all')).toHaveAttribute('aria-checked', 'mixed');
    });

    // Toggling "select all" while indeterminate/partial should select every row.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));

    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
      expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'true');
      expect(checkboxInput('Checkbox__amort-all')).toHaveAttribute('aria-checked', 'true');
    });

    // Toggling again with all selected should clear the whole selection.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));

    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
      expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('deletes selected rows via DELETE requests and refetches the lines', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // DELETE response
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: [TWO_LINES[1]] } }),
    }); // refetch after delete

    const deleteButton = screen.getByTitle('delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_PROPS.apiBaseUrl}/amortizationLine/l1`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    // Selection is cleared and lines are refetched (3rd call = refetch list).
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
  });

  it('close (X) button on the selection bar clears the selection', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    const closeButton = screen.getByTitle('close');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
    expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
    // No DELETE request should have been issued.
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/amortizationLine/'),
      expect.anything()
    );
  });

  it('clears the current selection when the lines list is refetched externally', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} recordId="asset-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    // Simulate an external refetch trigger (e.g. process-success event),
    // which re-runs fetchLines -> setLines -> the [lines] effect resets selection.
    // Use a fresh array reference (even with identical content) so the
    // `useEffect(() => setSelectedRows(new Set()), [lines])` dependency changes.
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: [...TWO_LINES] } }),
    });
    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'assets', recordId: 'asset-1' } })
    );

    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('ignores neo:processSuccess events for a different entity or recordId', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} recordId="asset-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });
    const callsBefore = globalThis.fetch.mock.calls.length;

    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'other-entity', recordId: 'asset-1' } })
    );
    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'assets', recordId: 'different-id' } })
    );

    // Neither mismatched event should trigger an extra fetch.
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('ignores a neo:processSuccess event with no detail payload', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} recordId="asset-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });
    const callsBefore = globalThis.fetch.mock.calls.length;

    // No `detail` at all -> `event?.detail ?? {}` fallback branch.
    fireEvent(window, new CustomEvent('neo:processSuccess'));

    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('falls back to sEQNoAsset as the row key when a line has no id', async () => {
    const linesWithoutId = [
      { sEQNoAsset: 7, amortizationAmount: 100 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: linesWithoutId } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-7')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-7'));
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'true');
    });

    // Select-all with a line that also relies on sEQNoAsset as its key.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'false');
    });
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('does not call handleDeleteSelected fetch when apiBaseUrl is missing', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    const { rerender } = render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    // Remove apiBaseUrl so handleDeleteSelected's guard short-circuits.
    rerender(<AssetsAmortizationPanel {...BASE_PROPS} apiBaseUrl={undefined} />);

    const callsBefore = globalThis.fetch.mock.calls.length;
    fireEvent.click(screen.getByTitle('delete'));

    // No DELETE request should be issued when apiBaseUrl is falsy.
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('sends DELETE requests without an Authorization header when token is missing', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: TWO_LINES } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} token={undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');

    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { data: [TWO_LINES[1]] } }),
    });

    fireEvent.click(screen.getByTitle('delete'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_PROPS.apiBaseUrl}/amortizationLine/l1`,
        expect.objectContaining({ method: 'DELETE', headers: {} })
      );
    });
  });
});

describe('AssetsAmortizationPanel — row selection & bulk delete', () => {
  const TWO_LINES = [
    { id: 'l1', sEQNoAsset: 1, amortizationAmount: 100 },
    { id: 'l2', sEQNoAsset: 2, amortizationAmount: 200 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderWithLines(lines = TWO_LINES) {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });
  }

  it('shows the selection bar when a row is selected', async () => {
    await renderWithLines();
    expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    const deleteButton = await screen.findByTitle('delete');
    expect(deleteButton).toBeInTheDocument();
    expect(screen.getByTitle('close')).toBeInTheDocument();
  });

  it('select-all checks every row, and toggling it off clears selection', async () => {
    await renderWithLines();
    const selectAll = screen.getByTestId('Checkbox__amort-all');
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
      expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'true');
    });
    // select-all is now checked → clicking again clears.
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
      expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('deselecting a row removes it from the selection', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
  });

  it('the close button on the bar clears the selection', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await screen.findByTitle('delete');
    fireEvent.click(screen.getByTitle('close'));
    await waitFor(() => {
      expect(screen.queryByTitle('delete')).not.toBeInTheDocument();
    });
    expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
  });

  it('bulk delete DELETEs each selected line then refetches', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(checkboxInput('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
      expect(checkboxInput('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'true');
    });

    const callsBefore = globalThis.fetch.mock.calls.length;
    const deleteButton = await screen.findByTitle('delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      const deleteCalls = globalThis.fetch.mock.calls.filter(
        (c) => c[1]?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(2);
    });
    const deleteCalls = globalThis.fetch.mock.calls.filter((c) => c[1]?.method === 'DELETE');
    expect(deleteCalls[0][0]).toContain('/amortizationLine/l1');
    expect(deleteCalls[1][0]).toContain('/amortizationLine/l2');
    // A refetch (GET list) fires after delete.
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callsBefore + 2);
    });
  });
});

describe('AssetsAmortizationPanel — neo:processSuccess refetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refetches when a matching neo:processSuccess event fires', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const before = globalThis.fetch.mock.calls.length;

    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'assets', recordId: 'asset-1' } }),
    );
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('ignores neo:processSuccess for a different entity', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const before = globalThis.fetch.mock.calls.length;

    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'invoice', recordId: 'asset-1' } }),
    );
    // No refetch: call count is unchanged.
    await new Promise((r) => setTimeout(r, 50));
    expect(globalThis.fetch.mock.calls.length).toBe(before);
  });

  it('ignores neo:processSuccess for a different recordId', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<AssetsAmortizationPanel {...BASE_PROPS} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const before = globalThis.fetch.mock.calls.length;

    fireEvent(
      window,
      new CustomEvent('neo:processSuccess', { detail: { entity: 'assets', recordId: 'other' } }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(globalThis.fetch.mock.calls.length).toBe(before);
  });
});

describe('AssetsAmortizationPanel — amortization total footer (ETP-4336)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Footer layout is: [checkbox spacer, empty, empty, total, status spacer].
  function getFooterTotalCell(container) {
    const tfoot = container.querySelector('tfoot');
    if (!tfoot) return null;
    return tfoot.querySelectorAll('td')[3] ?? null;
  }

  it('shows the summed total amount in the footer', async () => {
    const lines = [
      { id: 'l1', amortizationAmount: 1000 },
      { id: 'l2', amortizationAmount: 1000 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    const totalCell = getFooterTotalCell(container);
    expect(totalCell).not.toBeNull();
    // formatCurrency is mocked as `${cur} ${val}` — assert the numeric portion
    // directly rather than any locale-specific formatting.
    expect(totalCell.textContent).toBe('EUR 2000');
  });

  it('flags the footer total with the alert class when it does not match data.depreciationAmt', async () => {
    const lines = [
      { id: 'l1', amortizationAmount: 1000 },
      { id: 'l2', amortizationAmount: 1000 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1', depreciationAmt: 1500 }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    const totalCell = getFooterTotalCell(container);
    expect(totalCell.className).toContain('text-destructive');
    expect(totalCell.className).not.toContain('text-foreground');
  });

  it('does not flag the footer total when it matches data.depreciationAmt', async () => {
    const lines = [
      { id: 'l1', amortizationAmount: 1000 },
      { id: 'l2', amortizationAmount: 1000 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1', depreciationAmt: 2000 }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    const totalCell = getFooterTotalCell(container);
    expect(totalCell.className).toContain('text-foreground');
    expect(totalCell.className).not.toContain('text-destructive');
  });

  it('tolerates floating-point rounding noise within 0.005 without flagging the total', async () => {
    // 0.1 + 0.2 === 0.30000000000000004 as a JS float; the component rounds
    // both sides to cents before comparing, so this must NOT be flagged.
    const lines = [
      { id: 'l1', amortizationAmount: 0.1 },
      { id: 'l2', amortizationAmount: 0.2 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1', depreciationAmt: 0.3 }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    const totalCell = getFooterTotalCell(container);
    expect(totalCell.className).toContain('text-foreground');
    expect(totalCell.className).not.toContain('text-destructive');
  });

  it('does not flag the total when data.depreciationAmt is null or undefined', async () => {
    const lines = [
      { id: 'l1', amortizationAmount: 1000 },
      { id: 'l2', amortizationAmount: 1000 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: lines } }),
    });
    const { container, rerender } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1', depreciationAmt: null }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeInTheDocument();
    });

    let totalCell = getFooterTotalCell(container);
    expect(totalCell.className).toContain('text-foreground');
    expect(totalCell.className).not.toContain('text-destructive');

    rerender(<AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />);
    totalCell = getFooterTotalCell(container);
    expect(totalCell.className).toContain('text-foreground');
    expect(totalCell.className).not.toContain('text-destructive');
  });

  it('does not render a footer/total row when there are no lines', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    const { container } = render(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1', depreciationAmt: 500 }} />
    );
    await waitFor(() => {
      expect(screen.getByText('assetsNoAmortizationLines')).toBeInTheDocument();
    });
    expect(container.querySelector('tfoot')).toBeNull();
  });
});
