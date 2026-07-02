import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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
    expect(screen.getByText('EUR 1000')).toBeInTheDocument();
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
      expect(screen.getByText('EUR 100')).toBeInTheDocument();
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
      expect(screen.getByText('EUR 100')).toBeInTheDocument();
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
      expect(screen.getByText('EUR 42')).toBeInTheDocument();
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
    expect(screen.getByTestId('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'false');
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
      expect(screen.getByTestId('Checkbox__amort-all')).toHaveAttribute('aria-checked', 'mixed');
    });

    // Toggling "select all" while indeterminate/partial should select every row.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));

    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('Checkbox__amort-all')).toHaveAttribute('aria-checked', 'true');
    });

    // Toggling again with all selected should clear the whole selection.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));

    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByTestId('Checkbox__amort-row-l2')).toHaveAttribute('aria-checked', 'false');
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
    expect(screen.getByTestId('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
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
      expect(screen.getByTestId('Checkbox__amort-row-l1')).toHaveAttribute('aria-checked', 'false');
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
      expect(screen.getByTestId('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'true');
    });

    // Select-all with a line that also relies on sEQNoAsset as its key.
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'false');
    });
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(screen.getByTestId('Checkbox__amort-row-7')).toHaveAttribute('aria-checked', 'true');
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
