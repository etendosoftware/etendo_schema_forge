import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useBulkActionToast, persistBulkActionResult } from '../useBulkActionToast';

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
