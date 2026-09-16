import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useBulkActionToast, persistBulkActionResult, showBulkActionToast } from '../useBulkActionToast';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      processExecuted: '{ok} processed, {failed} failed',
    };
    return map[key] || key;
  },
}));

describe('useBulkActionToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('showResult calls toast.success when all ok and no failures', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 5, failed: [] });
    });
    expect(toast.success).toHaveBeenCalledWith('5 processed, 0 failed');
  });

  it('showResult calls toast.warning when some ok and some failures', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 3, failed: ['err1', 'err2'] });
    });
    expect(toast.warning).toHaveBeenCalledWith('3 processed, 2 failed');
  });

  it('showResult calls toast.error when all failed', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 0, failed: ['err1'] });
    });
    expect(toast.error).toHaveBeenCalledWith('0 processed, 1 failed');
  });

  it('showResult with persist=true stores in sessionStorage', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 2, failed: [] }, { persist: true });
    });
    const stored = JSON.parse(sessionStorage.getItem('bulkActionResult'));
    expect(stored.ok).toBe(2);
    expect(stored.failed).toEqual([]);
  });

  it('reads and clears persisted result on mount', () => {
    persistBulkActionResult({ ok: 4, failed: ['x'] });
    renderHook(() => useBulkActionToast());
    // Should have shown toast from persisted result
    expect(toast.warning).toHaveBeenCalledWith('4 processed, 1 failed');
    // Should have cleared storage
    expect(sessionStorage.getItem('bulkActionResult')).toBeNull();
  });

  it('handles null/undefined result gracefully', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult(null);
    });
    expect(toast.success).toHaveBeenCalledWith('0 processed, 0 failed');
  });

  it('showResult with persist=false (explicit) does not store in sessionStorage', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 3, failed: [] }, { persist: false });
    });
    expect(sessionStorage.getItem('bulkActionResult')).toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });

  it('handles invalid stored JSON in sessionStorage', () => {
    sessionStorage.setItem('bulkActionResult', 'NOT_VALID_JSON{{{');
    renderHook(() => useBulkActionToast());
    // Should not crash and should clear the invalid entry
    expect(sessionStorage.getItem('bulkActionResult')).toBeNull();
    // No toast should be called for invalid JSON
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('showResult with undefined failed array normalizes to empty', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 2, failed: undefined });
    });
    expect(toast.success).toHaveBeenCalledWith('2 processed, 0 failed');
  });

  it('showResult with failed as non-array normalizes to empty', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 1, failed: 'not-an-array' });
    });
    expect(toast.success).toHaveBeenCalledWith('1 processed, 0 failed');
  });

  it('showResult with undefined result (not null)', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult(undefined);
    });
    expect(toast.success).toHaveBeenCalledWith('0 processed, 0 failed');
  });

  it('persistBulkActionResult normalizes before storing', () => {
    persistBulkActionResult({ ok: 5, failed: ['err1'] });
    const stored = JSON.parse(sessionStorage.getItem('bulkActionResult'));
    expect(stored.ok).toBe(5);
    expect(stored.failed).toEqual(['err1']);
  });
});

// ETP-5302 — `showBulkActionToast` went from module-private to EXPORTED so a caller
// that already holds a `useUI()` result can show the toast WITHOUT mounting the hook.
// That matters because mounting the hook only to reach `showResult` also installs its
// sessionStorage-DRAINING effect, which re-runs on every `ui` identity change and eats
// the caller's own persisted result before a fallback reload can hand it to the next
// mount (tried and reverted while fixing the bulk-action full-page reload).
//
// Called with an explicit `ui` here — no renderHook — which IS the contract
// BulkDocumentAction, BulkOrderMoreMenu and BulkPurchaseOrderMoreMenu rely on.
describe('showBulkActionToast — exported pure helper (ETP-5302)', () => {
  const ui = (key) => ({
    processExecuted: '{ok} ok, {failed} failed',
    processExecutedWithOmitted: '{ok} ok, {omitted} omitted, {failed} failed',
  }[key] ?? key);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows a success toast and writes nothing to sessionStorage', () => {
    showBulkActionToast(ui, { ok: 3, failed: [] });
    expect(toast.success).toHaveBeenCalledWith('3 ok, 0 failed');
    expect(sessionStorage.getItem('bulkActionResult')).toBeNull();
  });

  it('shows an error toast when every attempted row failed', () => {
    showBulkActionToast(ui, { ok: 0, failed: ['e1', 'e2'] });
    expect(toast.error).toHaveBeenCalledWith('0 ok, 2 failed');
  });

  it('shows a warning toast on a partial failure', () => {
    showBulkActionToast(ui, { ok: 2, failed: ['e1'] });
    expect(toast.warning).toHaveBeenCalledWith('2 ok, 1 failed');
  });

  it('switches to the 3-count message when rows were omitted', () => {
    showBulkActionToast(ui, { ok: 1, omitted: ['skipped'], failed: [] });
    expect(toast.warning).toHaveBeenCalledWith('1 ok, 1 omitted, 0 failed');
  });

  it('normalizes a null result instead of throwing', () => {
    showBulkActionToast(ui, null);
    expect(toast.success).toHaveBeenCalledWith('0 ok, 0 failed');
  });

  it('has no side effect: it never consumes a result persisted by another run', () => {
    persistBulkActionResult({ ok: 9, failed: [] });

    showBulkActionToast(ui, { ok: 1, failed: [] });

    // The other (fallback-path) run's persisted result must survive untouched —
    // this is the exact regression that made mounting the hook here unusable.
    expect(JSON.parse(sessionStorage.getItem('bulkActionResult')).ok).toBe(9);
  });
});
