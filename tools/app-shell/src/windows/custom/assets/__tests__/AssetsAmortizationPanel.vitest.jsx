import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ETP-5414 — QA rejection, two bugs fixed on this panel:
//  1) the "Porcentaje" column printed the raw dot-decimal percentage
//     (`1.67%`) instead of the localized comma-decimal value (`1,67%`).
//  2) the plan total was compared against the FULL `depreciationAmt`
//     instead of `depreciationAmt - previouslyDepreciatedAmt`, so a
//     perfectly correct plan (lines summing to exactly what's left to
//     schedule) was flagged red (`text-destructive`).
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Checkbox re-exports from @etendosoftware/app-shell-core which is not
// available in this test environment — same mock convention already used by
// AmortizationLinesTable.vitest.jsx for the sibling amortization window.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate, disabled, onChange, 'aria-label': ariaLabel }) => (
    <button
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : Boolean(checked)}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
    />
  ),
}));

// ETP-5758 — the bulk delete's outcome toast is asserted below.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import AssetsAmortizationPanel from '../AssetsAmortizationPanel.jsx';

function mockFetchReturning(rows) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: rows } }),
  });
}

const renderInRouter = (ui, options) =>
  render(ui, { wrapper: MemoryRouter, ...options });

const BASE_PROPS = {
  recordId: 'asset-1',
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetsAmortizationPanel — "Porcentaje" column formatting (ETP-5414)', () => {
  beforeEach(() => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationPercentage: 1.6666666, amortizationAmount: 100, 'amortization$_identifier': 'Period 1' },
    ]);
  });

  it('renders the line percentage with a comma decimal separator, not a raw dot', async () => {
    renderInRouter(<AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />);
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    expect(screen.getByText('1,67%')).toBeInTheDocument();
    expect(screen.queryByText('1.67%')).not.toBeInTheDocument();
  });
});

describe('AssetsAmortizationPanel — plan total vs. previouslyDepreciatedAmt (ETP-5414)', () => {
  it('does NOT mark the total red when lines correctly sum to (depreciationAmt - previouslyDepreciatedAmt)', async () => {
    // QA's exact repro: 2000 total to amortize, 200 already amortized before this
    // plan existed -> lines only need to cover the remaining 1800.
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 900, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 900, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000, previouslyDepreciatedAmt: 200 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell).not.toBeNull();
    expect(totalCell.className).not.toContain('text-destructive');
    expect(totalCell.className).toContain('text-foreground');
  });

  it('still marks the total red when lines do NOT sum to (depreciationAmt - previouslyDepreciatedAmt)', async () => {
    // Same depreciationAmt/previouslyDepreciatedAmt as above, but lines sum to
    // 1700 instead of the expected 1800 — a genuine mismatch must still be caught.
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 900, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 800, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000, previouslyDepreciatedAmt: 200 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).toContain('text-destructive');
  });

  it('treats a missing previouslyDepreciatedAmt as 0 (compares against the full depreciationAmt)', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 1000, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).not.toContain('text-destructive');
  });

  it('marks the total red when a plan without previouslyDepreciatedAmt does not sum to the full depreciationAmt', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 500, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).toContain('text-destructive');
  });

  it('never marks the total red when depreciationAmt itself is absent (no expected value to compare)', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).not.toContain('text-destructive');
  });
});

// ETP-5758 — the panel's bulk trash goes through the generic useBatchDeleteDialog: it asks for
// confirmation first (it used to delete straight away), the dialog stays open and locked while the
// DELETEs run, and a one-line 4xx refusal toasts the backend's own reason.
describe('AssetsAmortizationPanel — bulk delete confirmation (ETP-5758)', () => {
  const ROWS = [
    { id: 'line-1', sEQNoAsset: 1, amortizationPercentage: 50, amortizationAmount: 100, 'amortization$_identifier': 'Period 1' },
    { id: 'line-2', sEQNoAsset: 2, amortizationPercentage: 50, amortizationAmount: 100, 'amortization$_identifier': 'Period 2' },
  ];

  /** GETs return ROWS; DELETEs follow `onDelete(id)` (default: pending until released). */
  function mockFetch(onDelete) {
    const pending = [];
    const fn = vi.fn((url, opts) => {
      if (opts?.method === 'DELETE') {
        const id = String(url).match(/\/amortizationLine\/([^/?]+)$/)?.[1];
        if (onDelete) return onDelete(id);
        return new Promise((resolve) => { pending.push(resolve); });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: ROWS } }) });
    });
    fn.release = () => pending.forEach((r) => r({ ok: true }));
    return fn;
  }
  const deleteCalls = () => global.fetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
  const getCalls = () => global.fetch.mock.calls.filter(([, opts]) => !opts?.method || opts.method === 'GET');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderAndSelect(which = 'all') {
    renderInRouter(<AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />);
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());
    if (which === 'all') fireEvent.click(screen.getByRole('checkbox', { name: 'selectAll' }));
    else fireEvent.click(screen.getAllByRole('checkbox', { name: 'selectRow' })[0]);
    await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());
  }

  it('the trash opens the shared confirmation and sends no DELETE yet', async () => {
    global.fetch = mockFetch();
    await renderAndSelect();

    fireEvent.click(screen.getByTitle('delete'));

    expect(await screen.findByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('DialogTitle__batch-delete')).toHaveTextContent('bulkDeleteConfirmTitle');
    expect(screen.getByTestId('DialogDescription__batch-delete')).toHaveTextContent('bulkDeleteConfirmMessage');
    expect(deleteCalls()).toHaveLength(0);
  });

  it('Cancel closes the confirmation without sending any DELETE or refetching', async () => {
    global.fetch = mockFetch();
    await renderAndSelect();
    const getsBefore = getCalls().length;

    fireEvent.click(screen.getByTitle('delete'));
    fireEvent.click(await screen.findByTestId('Button__batch-delete-cancel'));

    await waitFor(() => expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument());
    expect(deleteCalls()).toHaveLength(0);
    expect(getCalls()).toHaveLength(getsBefore);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('stays open and locked (spinner, in-progress wording, aria-busy, disabled trash) until the batch settles', async () => {
    global.fetch = mockFetch();
    await renderAndSelect();

    fireEvent.click(screen.getByTitle('delete'));
    fireEvent.click(await screen.findByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteCalls()).toHaveLength(2));
    expect(deleteCalls().map(([url]) => String(url))).toEqual([
      expect.stringContaining('/amortizationLine/line-1'),
      expect.stringContaining('/amortizationLine/line-2'),
    ]);
    expect(screen.getByTestId('batch-delete-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('batch-delete-confirm')).toHaveTextContent('bulkDeleteInProgress');
    expect(screen.getByTestId('batch-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__batch-delete-cancel')).toBeDisabled();
    expect(screen.getByTestId('DialogDescription__batch-delete')).toHaveTextContent('bulkDeleteInProgressMessage');
    expect(screen.getByTestId('DialogContent__batch-delete')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTitle('delete')).toBeDisabled();

    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();

    const getsBefore = getCalls().length;
    await act(async () => { global.fetch.release(); });

    await waitFor(() => expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded');
    // At least one line went: the panel refetches.
    await waitFor(() => expect(getCalls().length).toBeGreaterThan(getsBefore));
  });

  it('a ONE-line 4xx refusal toasts the backend reason (not the counter) and does not refetch', async () => {
    const reason = 'The amortization of this line is already processed.';
    global.fetch = mockFetch(() => Promise.resolve({
      ok: false,
      status: 409,
      json: async () => ({ message: reason }),
    }));
    await renderAndSelect('one');
    const getsBefore = getCalls().length;

    fireEvent.click(screen.getByTitle('delete'));
    fireEvent.click(await screen.findByTestId('batch-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(reason);
    expect(toast.error).not.toHaveBeenCalledWith('bulkDeleteAllFailed');
    expect(deleteCalls()).toHaveLength(1);
    expect(getCalls()).toHaveLength(getsBefore);
    await waitFor(() => expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument());
    expect(screen.getAllByRole('checkbox', { name: 'selectRow' })[0]).toHaveAttribute('aria-checked', 'true');
  });
});

