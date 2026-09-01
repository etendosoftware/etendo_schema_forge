import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBatchDeleteDialog } from '../useBatchDeleteDialog.jsx';

/**
 * ETP-4656 — generic batch-delete dialog hook, extracted out of
 * `useBulkRowDelete.jsx` so Financial Accounts / Movements / Statements can
 * reuse the same "select → confirm-with-count → batch delete → 3-outcome
 * toast" dialog with their own `deleteOneFn` (an `archiveAccount()`-style
 * mutation, a plain REST DELETE, etc.) instead of assuming a NEO entity URL
 * pattern the way `useBulkRowDelete` does. Mirrors
 * useBulkRowDelete.vitest.jsx's conventions/coverage shape.
 */
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      bulkDeleteConfirmTitle: 'Delete records',
      bulkDeleteConfirmMessage: 'Are you sure you want to delete {count} record(s)? This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
      bulkDeleteAllSucceeded: '{count} record(s) deleted successfully.',
      bulkDeletePartialFailure: '{succeeded} of {total} record(s) deleted. {failed} could not be deleted.',
      bulkDeleteAllFailed: 'None of the {count} selected record(s) could be deleted.',
    };
    let text = map[key] || key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  },
}));

describe('useBatchDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns requestBatchDelete, batchDeleteDialog and deleting', () => {
    const { result } = renderHook(() => useBatchDeleteDialog({ deleteOneFn: vi.fn(), onOutcome: vi.fn() }));
    expect(typeof result.current.requestBatchDelete).toBe('function');
    expect(result.current.batchDeleteDialog).toBeDefined();
    expect(result.current.deleting).toBe(false);
  });

  it('ignores an empty/falsy-only selection', () => {
    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn: vi.fn(), onOutcome: vi.fn() });
      return (
        <>
          <button onClick={() => requestBatchDelete([null, undefined])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('shows the confirm dialog with the item count interpolated', () => {
    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn: vi.fn(), onOutcome: vi.fn() });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a', 'b', 'c'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.getByText('Delete records')).toBeInTheDocument();
    expect(screen.getByText(/delete 3 record\(s\)/)).toBeInTheDocument();
  });

  it('all succeed: calls deleteOneFn per item, toasts success, reports onOutcome(items, [])', async () => {
    const deleteOneFn = vi.fn(async (item) => item);
    const onOutcome = vi.fn();

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a', 'b'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('batch-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(deleteOneFn).toHaveBeenCalledWith('a');
    expect(deleteOneFn).toHaveBeenCalledWith('b');
    expect(toast.success).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    expect(onOutcome).toHaveBeenCalledWith(['a', 'b'], []);
    // Dialog closes after a fully-successful batch.
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('partial failure: fires ONE warning toast and reports succeeded/failed separately', async () => {
    const deleteOneFn = vi.fn(async (item) => {
      if (item === 'b') throw new Error('boom');
      return item;
    });
    const onOutcome = vi.fn();

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a', 'b'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('batch-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.warning).toHaveBeenCalledWith('1 of 2 record(s) deleted. 1 could not be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith(['a'], ['b']);
  });

  it('all fail: fires ONE error toast and reports onOutcome([], items)', async () => {
    const deleteOneFn = vi.fn(async () => { throw new Error('boom'); });
    const onOutcome = vi.fn();

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a', 'b'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('batch-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('None of the 2 selected record(s) could be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith([], ['a', 'b']);
  });

  // ETP-5085 — the hook now forwards `runBatchDelete`'s `errors` to `toastBatchDeleteOutcome`, so a
  // batch whose failures all state one 4xx business reason is toasted with that reason. For a single
  // selected record the reason REPLACES the counter entirely: "None of the 1 selected record(s) could
  // be deleted." is a worse way of saying a sentence the backend already wrote. The three tests above
  // reject with a plain `new Error('boom')` (no `status`), so they keep exercising the old branch.
  it('all fail on ONE item with a 4xx business reason: the toast IS that message, not the counter', async () => {
    const reason = 'This movement is linked to a payment and cannot be deleted.';
    const rejection = new Error(reason);
    rejection.status = 409;
    const deleteOneFn = vi.fn(async () => { throw rejection; });
    const onOutcome = vi.fn();

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('batch-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith(reason);
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('None of the'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    // Outcome reporting is unchanged: nothing succeeded, so the host keeps its selection.
    expect(onOutcome).toHaveBeenCalledWith([], ['a']);
  });

  it('disables the confirm/cancel buttons while the batch is in flight', async () => {
    let resolveDelete;
    const deleteOneFn = vi.fn(() => new Promise((resolve) => { resolveDelete = resolve; }));

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome: vi.fn() });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('batch-delete-confirm')); });

    expect(screen.getByTestId('batch-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__batch-delete-cancel')).toBeDisabled();

    await act(async () => { resolveDelete('a'); });
  });

  it('closing the dialog without confirming does not call deleteOneFn', async () => {
    const deleteOneFn = vi.fn();

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome: vi.fn() });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('Button__batch-delete-cancel')); });

    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
    expect(deleteOneFn).not.toHaveBeenCalled();
  });

  it('a rapid double-click on confirm while in flight only runs the batch once', async () => {
    let resolveDelete;
    const deleteOneFn = vi.fn(() => new Promise((resolve) => { resolveDelete = resolve; }));

    function TestComponent() {
      const { requestBatchDelete, batchDeleteDialog } = useBatchDeleteDialog({ deleteOneFn, onOutcome: vi.fn() });
      return (
        <>
          <button onClick={() => requestBatchDelete(['a'])}>Bulk</button>
          {batchDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    const confirmBtn = screen.getByTestId('batch-delete-confirm');
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(deleteOneFn).toHaveBeenCalledTimes(1);

    await act(async () => { resolveDelete('a'); });
  });
});
