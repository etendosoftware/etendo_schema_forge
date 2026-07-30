/**
 * ETP-4656 — direct unit coverage for the shared batch-delete core
 * (`runBatchDelete` / `toastBatchDeleteOutcome`), extracted out of
 * `useBulkRowDelete.jsx` once Financial Accounts / Movements / Statements /
 * Contacts secondary tabs / DetailView's primary+secondary line deletes all
 * needed the same "Promise.allSettled triage + single-toast-per-outcome"
 * logic. Previously only exercised transitively via consumers.
 */
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';
import { runBatchDelete, toastBatchDeleteOutcome } from '../batchDelete.js';

function interpolatingUi() {
  return (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runBatchDelete', () => {
  it('all succeed: every item lands in succeeded, in input order, failed is empty', async () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deleteOneFn = vi.fn(async (item) => item);

    const { succeeded, failed } = await runBatchDelete(items, deleteOneFn);

    expect(succeeded).toEqual(items);
    expect(failed).toEqual([]);
    expect(deleteOneFn).toHaveBeenCalledTimes(3);
  });

  it('all fail: every item lands in failed, in input order, succeeded is empty', async () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const deleteOneFn = vi.fn(async () => { throw new Error('boom'); });

    const { succeeded, failed } = await runBatchDelete(items, deleteOneFn);

    expect(succeeded).toEqual([]);
    expect(failed).toEqual(items);
  });

  it('mixed: partitions correctly by outcome, not by call order', async () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deleteOneFn = vi.fn(async (item) => {
      if (item.id === 'b') throw new Error('boom');
      return item;
    });

    const { succeeded, failed } = await runBatchDelete(items, deleteOneFn);

    expect(succeeded).toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(failed).toEqual([{ id: 'b' }]);
  });

  it('preserves input order in the succeeded/failed partition even when requests settle out of order', async () => {
    // 'a' is deliberately the slowest to resolve — Promise.allSettled must
    // still map each outcome back to the correct original item by index, not
    // by resolution order (mirrors useBulkRowDelete.vitest.jsx's equivalent
    // regression test for the pre-extraction inline logic).
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deleteOneFn = vi.fn((item) => {
      if (item.id === 'a') {
        return Promise.resolve().then(() => Promise.resolve()).then(() => {
          throw new Error('slow failure');
        });
      }
      return Promise.resolve(item);
    });

    const { succeeded, failed } = await runBatchDelete(items, deleteOneFn);

    expect(succeeded).toEqual([{ id: 'b' }, { id: 'c' }]);
    expect(failed).toEqual([{ id: 'a' }]);
  });

  it('empty input: resolves with two empty arrays, deleteOneFn never called', async () => {
    const deleteOneFn = vi.fn();

    const { succeeded, failed } = await runBatchDelete([], deleteOneFn);

    expect(succeeded).toEqual([]);
    expect(failed).toEqual([]);
    expect(deleteOneFn).not.toHaveBeenCalled();
  });
});

describe('toastBatchDeleteOutcome', () => {
  it('all succeeded (failed.length === 0): fires ONE success toast with the succeeded count', () => {
    const ui = interpolatingUi();
    toastBatchDeleteOutcome(ui, { succeeded: [{ id: 'a' }, { id: 'b' }], failed: [], total: 2 });

    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":2}');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('all failed (succeeded.length === 0): fires ONE error toast with the total attempted count', () => {
    const ui = interpolatingUi();
    toastBatchDeleteOutcome(ui, { succeeded: [], failed: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], total: 3 });

    expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed:{"count":3}');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('partial failure: fires exactly ONE combined warning toast (not stacked success+error)', () => {
    const ui = interpolatingUi();
    toastBatchDeleteOutcome(ui, { succeeded: [{ id: 'a' }], failed: [{ id: 'b' }, { id: 'c' }], total: 3 });

    expect(toast.warning).toHaveBeenCalledWith(
      'bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}',
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('empty batch (nothing attempted): treated as the all-succeeded branch (0 succeeded, 0 failed)', () => {
    const ui = interpolatingUi();
    toastBatchDeleteOutcome(ui, { succeeded: [], failed: [], total: 0 });

    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":0}');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
