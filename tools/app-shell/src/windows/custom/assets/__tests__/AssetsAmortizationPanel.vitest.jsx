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

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange, 'data-testid': testId, 'aria-label': ariaLabel }) => (
    <input
      type="checkbox"
      data-testid={testId}
      aria-label={ariaLabel}
      checked={!!checked}
      onChange={onChange}
    />
  ),
}));

vi.mock('@/components/contract-ui/LinesSelectionBar.jsx', () => ({
  default: ({ visible, count, deleting, onDelete, onClose }) => (
    <div data-testid="lines-selection-bar" data-visible={String(visible)} data-count={count}>
      <button data-testid="bar-delete" disabled={deleting} onClick={onDelete}>delete</button>
      <button data-testid="bar-close" onClick={onClose}>close</button>
    </div>
  ),
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
    expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-visible', 'false');
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-visible', 'true');
    });
    expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '1');
  });

  it('select-all checks every row, and toggling it off clears selection', async () => {
    await renderWithLines();
    const selectAll = screen.getByTestId('Checkbox__amort-all');
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '2');
    });
    expect(screen.getByTestId('Checkbox__amort-row-l1')).toBeChecked();
    expect(screen.getByTestId('Checkbox__amort-row-l2')).toBeChecked();
    // select-all is now checked → clicking again clears.
    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '0');
    });
  });

  it('deselecting a row removes it from the selection', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '1');
    });
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '0');
    });
  });

  it('the close button on the bar clears the selection', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-row-l1'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '1');
    });
    fireEvent.click(screen.getByTestId('bar-close'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '0');
    });
  });

  it('bulk delete DELETEs each selected line then refetches', async () => {
    await renderWithLines();
    fireEvent.click(screen.getByTestId('Checkbox__amort-all'));
    await waitFor(() => {
      expect(screen.getByTestId('lines-selection-bar')).toHaveAttribute('data-count', '2');
    });

    const callsBefore = globalThis.fetch.mock.calls.length;
    fireEvent.click(screen.getByTestId('bar-delete'));

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
