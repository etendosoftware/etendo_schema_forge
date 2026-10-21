import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      bulkDeleteInProgress: 'Deleting…',
      bulkDeleteInProgressMessage: 'Deleting {count} record(s). This may take a few seconds.',
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

// ETP-5758 — the hook is now the app's single bulk-delete implementation: the dialog stays open and
// locked while the batch runs, a request may carry its own deleteOneFn/onOutcome, and the testid
// scope reaches the shared dialog.
describe('useBatchDeleteDialog — ETP-5758', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Host that exposes the hook's `deleting` flag and lets each button send its own request. */
  function Host({ hookOpts, requests = { Bulk: [['a', 'b']] } }) {
    const { requestBatchDelete, batchDeleteDialog, deleting } = useBatchDeleteDialog(hookOpts);
    return (
      <>
        <span data-testid="deleting-flag">{String(deleting)}</span>
        {Object.entries(requests).map(([label, args]) => (
          <button key={label} onClick={() => requestBatchDelete(...args)}>{label}</button>
        ))}
        {batchDeleteDialog}
      </>
    );
  }

  /** deleteOneFn whose calls stay pending until `resolveAll()` / `rejectAll()`. */
  function deferredDeleteOne() {
    const pending = [];
    const fn = vi.fn((item) => new Promise((resolve, reject) => { pending.push({ item, resolve, reject }); }));
    fn.resolveAll = () => pending.forEach(({ item, resolve }) => resolve(item));
    return fn;
  }

  it('keeps the dialog open and in-progress until the WHOLE batch settles, then closes', async () => {
    const deleteOneFn = deferredDeleteOne();
    const onOutcome = vi.fn();
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn, onOutcome }} />);

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    // Requests in flight: the dialog is still mounted and shows the in-progress state.
    expect(deleteOneFn).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('DialogContent__batch-delete')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('batch-delete-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('batch-delete-confirm')).toHaveTextContent('Deleting…');
    expect(screen.getByText('Deleting 2 record(s). This may take a few seconds.')).toBeInTheDocument();
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('true');
    expect(onOutcome).not.toHaveBeenCalled();

    const { toast } = await import('sonner');
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => { deleteOneFn.resolveAll(); });

    await waitFor(() => expect(screen.queryByTestId('DialogContent__batch-delete')).not.toBeInTheDocument());
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('false');
    expect(toast.success).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    expect(onOutcome).toHaveBeenCalledWith(['a', 'b'], []);
  });

  it('Cancel, Escape and an overlay click cannot dismiss the dialog while the batch runs', async () => {
    const deleteOneFn = deferredDeleteOne();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Host hookOpts={{ deleteOneFn, onOutcome: vi.fn() }} />);

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await user.click(screen.getByTestId('Button__batch-delete-cancel'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('DialogOverlay__6a5928'));

    expect(screen.getByTestId('DialogContent__batch-delete')).toHaveAttribute('aria-busy', 'true');

    await act(async () => { deleteOneFn.resolveAll(); });
    await waitFor(() => expect(screen.queryByTestId('DialogContent__batch-delete')).not.toBeInTheDocument());
  });

  it('per-request deleteOneFn / onOutcome override the hook-level ones for that request only', async () => {
    const hookDelete = vi.fn(async (item) => item);
    const hookOutcome = vi.fn();
    const reqDelete = vi.fn(async (item) => item);
    const reqOutcome = vi.fn();
    const user = userEvent.setup();
    render(
      <Host
        hookOpts={{ deleteOneFn: hookDelete, onOutcome: hookOutcome }}
        requests={{
          Override: [['x'], { deleteOneFn: reqDelete, onOutcome: reqOutcome }],
          Plain: [['y']],
        }}
      />,
    );

    await user.click(screen.getByText('Override'));
    await user.click(screen.getByTestId('batch-delete-confirm'));
    await waitFor(() => expect(reqOutcome).toHaveBeenCalledWith(['x'], []));
    expect(reqDelete).toHaveBeenCalledWith('x');
    expect(hookDelete).not.toHaveBeenCalled();
    expect(hookOutcome).not.toHaveBeenCalled();

    // The override does not stick: the next request without options uses the hook-level fns.
    await user.click(screen.getByText('Plain'));
    await user.click(screen.getByTestId('batch-delete-confirm'));
    await waitFor(() => expect(hookOutcome).toHaveBeenCalledWith(['y'], []));
    expect(hookDelete).toHaveBeenCalledWith('y');
    expect(reqDelete).toHaveBeenCalledTimes(1);
    expect(reqOutcome).toHaveBeenCalledTimes(1);
  });

  it('works with no hook-level deleteOneFn when every request supplies its own', async () => {
    const reqDelete = vi.fn(async (item) => item);
    const reqOutcome = vi.fn();
    const user = userEvent.setup();
    render(<Host hookOpts={undefined} requests={{ Go: [['z'], { deleteOneFn: reqDelete, onOutcome: reqOutcome }] }} />);

    await user.click(screen.getByText('Go'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(reqOutcome).toHaveBeenCalledWith(['z'], []));
    expect(reqDelete).toHaveBeenCalledWith('z');
  });

  it('a second confirm dispatched in the same tick does not start a second batch', async () => {
    const deleteOneFn = deferredDeleteOne();
    const onOutcome = vi.fn();
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn, onOutcome }} />);

    await user.click(screen.getByText('Bulk'));
    const confirmBtn = screen.getByTestId('batch-delete-confirm');
    act(() => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
    });

    // Two items, ONE batch: two calls, not four.
    expect(deleteOneFn).toHaveBeenCalledTimes(2);

    await act(async () => { deleteOneFn.resolveAll(); });
    await waitFor(() => expect(onOutcome).toHaveBeenCalledTimes(1));
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('the hook stays usable for a new request once a batch has settled', async () => {
    const deleteOneFn = vi.fn(async (item) => item);
    const onOutcome = vi.fn();
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn, onOutcome }} />);

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('Bulk'));
    expect(screen.getByTestId('batch-delete-confirm')).not.toBeDisabled();
    await user.click(screen.getByTestId('batch-delete-confirm'));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledTimes(2));
    expect(deleteOneFn).toHaveBeenCalledTimes(4);
  });

  it('a deleteOneFn that throws synchronously still settles the batch and closes the dialog', async () => {
    const deleteOneFn = vi.fn((item) => {
      if (item === 'b') throw new Error('sync boom');
      return Promise.resolve(item);
    });
    const onOutcome = vi.fn();
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn, onOutcome }} />);

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith(['a'], ['b']));
    expect(screen.queryByTestId('DialogContent__batch-delete')).not.toBeInTheDocument();
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('false');
  });

  it('forwards testIdScope to the shared dialog', async () => {
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn: vi.fn(), onOutcome: vi.fn(), testIdScope: 'lines-bulk-delete' }} />);

    await user.click(screen.getByText('Bulk'));

    expect(screen.getByTestId('lines-bulk-delete-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('Button__lines-bulk-delete-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('DialogContent__lines-bulk-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument();
  });

  it('defaults the testid scope to batch-delete', async () => {
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn: vi.fn(), onOutcome: vi.fn() }} />);

    await user.click(screen.getByText('Bulk'));

    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('DialogContent__batch-delete')).toBeInTheDocument();
  });

  it('renderDialog receives the deleting flag, so a custom dialog can show the in-progress state too', async () => {
    const deleteOneFn = deferredDeleteOne();
    const renderDialog = vi.fn(({ open, deleting, onConfirm, count }) => (open ? (
      <div data-testid="custom-dialog" data-deleting={String(deleting)} data-count={count}>
        <button onClick={onConfirm}>go</button>
      </div>
    ) : null));
    const user = userEvent.setup();
    render(<Host hookOpts={{ deleteOneFn, onOutcome: vi.fn(), renderDialog }} />);

    await user.click(screen.getByText('Bulk'));
    expect(screen.getByTestId('custom-dialog')).toHaveAttribute('data-deleting', 'false');
    await user.click(screen.getByText('go'));
    expect(screen.getByTestId('custom-dialog')).toHaveAttribute('data-deleting', 'true');
    expect(screen.getByTestId('custom-dialog')).toHaveAttribute('data-count', '2');

    await act(async () => { deleteOneFn.resolveAll(); });
    await waitFor(() => expect(screen.queryByTestId('custom-dialog')).not.toBeInTheDocument());
  });
});


// ETP-5758 (post-review) — a request arriving mid-batch is refused, and a throwing outcome
// handler no longer leaves an unhandled rejection with the dialog stuck open.
describe('useBatchDeleteDialog — in-flight requests and failing outcome handlers (ETP-5758)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function Host({ hookOpts, requests }) {
    const { requestBatchDelete, batchDeleteDialog, deleting } = useBatchDeleteDialog(hookOpts);
    return (
      <>
        <span data-testid="deleting-flag">{String(deleting)}</span>
        {Object.entries(requests).map(([label, args]) => (
          <button key={label} onClick={() => requestBatchDelete(...args)}>{label}</button>
        ))}
        {batchDeleteDialog}
      </>
    );
  }

  function deferredDeleteOne() {
    const pending = [];
    const fn = vi.fn((item) => new Promise((resolve) => { pending.push({ item, resolve }); }));
    fn.resolveAll = () => pending.splice(0).forEach(({ item, resolve }) => resolve(item));
    return fn;
  }

  it('ignores a requestBatchDelete made while a batch is in flight; the running batch keeps its items', async () => {
    const deleteOneFn = deferredDeleteOne();
    const onOutcome = vi.fn();
    const intruderDelete = vi.fn(async (item) => item);
    const intruderOutcome = vi.fn();
    const user = userEvent.setup();
    render(
      <Host
        hookOpts={{ deleteOneFn, onOutcome }}
        requests={{
          Bulk: [['a', 'b']],
          Intruder: [['x', 'y', 'z'], { deleteOneFn: intruderDelete, onOutcome: intruderOutcome }],
        }}
      />,
    );

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('true');

    // A programmatic caller (the modal covers the page, so fireEvent bypasses pointer-events).
    act(() => { fireEvent.click(screen.getByText('Intruder')); });

    // The pending items were NOT replaced: still 2 records in progress, not 3.
    expect(screen.getByText('Deleting 2 record(s). This may take a few seconds.')).toBeInTheDocument();
    expect(screen.queryByText(/3 record\(s\)/)).not.toBeInTheDocument();

    await act(async () => { deleteOneFn.resolveAll(); });

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith(['a', 'b'], []));
    expect(deleteOneFn).toHaveBeenCalledTimes(2);
    expect(deleteOneFn.mock.calls.map(([item]) => item)).toEqual(['a', 'b']);
    expect(intruderDelete).not.toHaveBeenCalled();
    expect(intruderOutcome).not.toHaveBeenCalled();
    // The refused request did not survive to reopen the dialog once the batch settled.
    await waitFor(() => expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument());
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('false');

    // After the batch, a new request opens the dialog again.
    await user.click(screen.getByText('Intruder'));
    expect(screen.getByText(/delete 3 record\(s\)/)).toBeInTheDocument();
    await user.click(screen.getByTestId('batch-delete-confirm'));
    await waitFor(() => expect(intruderOutcome).toHaveBeenCalledWith(['x', 'y', 'z'], []));
  });

  it.each([
    ['hook-level', (boom) => ({ hookOpts: { deleteOneFn: async (i) => i, onOutcome: boom }, args: [['a', 'b']] })],
    ['per-request', (boom) => ({
      hookOpts: { deleteOneFn: async (i) => i, onOutcome: vi.fn() },
      args: [['a', 'b'], { onOutcome: boom }],
    })],
  ])('a throwing %s onOutcome logs, toasts networkError, closes the dialog and releases the lock', async (_label, setup) => {
    const failure = new Error('cache update on an unmounted hook');
    const boom = vi.fn(() => { throw failure; });
    const { hookOpts, args } = setup(boom);
    const user = userEvent.setup();
    render(<Host hookOpts={hookOpts} requests={{ Bulk: args, Again: [['c']] }} />);

    await user.click(screen.getByText('Bulk'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(boom).toHaveBeenCalledWith(['a', 'b'], []));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls.some((call) => call.includes(failure))).toBe(true);
    // The success toast had already fired before the handler threw.
    expect(toast.success).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    if (hookOpts.onOutcome !== boom) expect(hookOpts.onOutcome).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument());
    expect(screen.getByTestId('deleting-flag')).toHaveTextContent('false');

    // The hook is usable again.
    await user.click(screen.getByText('Again'));
    expect(screen.getByText(/delete 1 record\(s\)/)).toBeInTheDocument();
    expect(screen.getByTestId('batch-delete-confirm')).not.toBeDisabled();
  });
});
