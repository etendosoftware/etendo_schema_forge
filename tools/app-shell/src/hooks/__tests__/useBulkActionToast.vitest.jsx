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

// 'backendError.countryIban' is a REAL key from BACKEND_ERROR_MAP (lib/backendErrors.js),
// mapping the exact backend literal 'Country needed in an IBAN account.'. Mapping it here to
// a string that differs from the key itself is what lets translateBackendError's "did this
// actually translate" guard (`translated !== key`) succeed, exercising the real mapped path.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      processExecuted: '{ok} processed, {failed} failed',
      processExecutedWithOmitted: '{ok} processed, {omitted} omitted, {failed} failed',
      actionFailed: 'Action failed',
      'backendError.countryIban': 'País necesario en una cuenta IBAN.',
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

  // ETP-5316 QA rejection: a mass/multi-record action must NEVER surface per-row backend
  // errors as toast description — ok > 0 with 2+ failed rows takes the generic mixed-summary
  // branch, which now calls toast.warning with ONLY the templated count message, no second arg.
  it('showResult calls toast.warning when some ok and some failures', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 3, failed: ['err1', 'err2'] });
    });
    expect(toast.warning).toHaveBeenCalledWith('3 processed, 2 failed');
    expect(toast.warning.mock.calls[0]).toHaveLength(1);
  });

  // ETP-5316: rewritten from the original "toast.error when all failed" test. A SINGLE failed
  // record with ok===0 and nothing omitted now takes the new fast-path branch — it shows the
  // record's own backend message instead of the generic "0 processed, N failed" template. The
  // fixture is updated to the realistic { documentNo, message } shape (see BulkDocumentAction.jsx)
  // with a message that matches NO entry in BACKEND_ERROR_MAP, so it is passed through verbatim.
  it('showResult calls toast.error with the raw backend message for a single unmapped failure', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 0,
        failed: [{ documentNo: 'INV-01', message: 'Some unmapped backend error' }],
      });
    });
    expect(toast.error).toHaveBeenCalledWith('Some unmapped backend error');
  });

  // ETP-5316: same single-failure fast path, but the message DOES match a real entry in
  // BACKEND_ERROR_MAP ('Country needed in an IBAN account.' -> backendError.countryIban), so it
  // is translated instead of shown verbatim.
  it('showResult calls toast.error with the translated message for a single mapped failure', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 0,
        failed: [{ documentNo: 'FIN-01', message: 'Country needed in an IBAN account.' }],
      });
    });
    expect(toast.error).toHaveBeenCalledWith('País necesario en una cuenta IBAN.');
  });

  // ETP-5316: single failed record with NO `message` property at all. translateBackendError
  // receives `undefined` and returns it unchanged (falsy), so showBulkActionToast falls back to
  // ui('actionFailed') instead of showing "undefined" or a blank toast.
  it('showResult falls back to the generic actionFailed label when the single failure has no message', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 0, failed: [{ documentNo: 'X' }] });
    });
    expect(toast.error).toHaveBeenCalledWith('Action failed');
  });

  // ETP-5316 QA rejection: 2+ failed records with ok===0 must NOT take the single-failure fast
  // path — it stays on the generic "all failed" summary branch (failed.length>0, ok===0,
  // omitted===0), calling toast.error with ONLY the templated count message, no per-row
  // description. This is distinct branch coverage from the single-failure fast-path tests above
  // (which require failed.length===1) and from the mixed ok/failed warning branch above.
  it('showResult calls toast.error with the generic summary for an all-failed multi-record result', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 0,
        failed: [
          { documentNo: 'DOC-3', message: 'err3' },
          { documentNo: 'DOC-4', message: 'err4' },
        ],
      });
    });
    expect(toast.error).toHaveBeenCalledWith('0 processed, 2 failed');
    expect(toast.error.mock.calls[0]).toHaveLength(1);
  });

  // ETP-5316 regression: an all-succeed result must stay a plain toast.success with no second
  // (description) argument at all — not even `undefined` — since `failed` never reaches
  // buildFailureDetail on that branch.
  it('all-succeed result stays a plain toast.success with no description arg', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 5, failed: [] });
    });
    expect(toast.success).toHaveBeenCalledWith('5 processed, 0 failed');
    expect(toast.success.mock.calls[0]).toHaveLength(1);
  });

  // ETP-5316: an omitted-only result (failed: [], omitted.length > 0, even a single omitted row)
  // must NOT be mistaken for the single-failure case — `failed.length === 1` is required for that
  // branch, and here `failed.length === 0`. Also verifies the QA-mandated "no second arg at all"
  // rule: the call must have exactly ONE argument, not `(msg, undefined)` — an explicit
  // `undefined` second arg is a distinct call shape from omitting it entirely.
  it('omitted-only result does not trigger the single-failure branch', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 0, failed: [], omitted: ['ROW-1'] });
    });
    expect(toast.warning).toHaveBeenCalledWith('0 processed, 1 omitted, 0 failed');
    expect(toast.warning.mock.calls[0]).toHaveLength(1);
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

  // ETP-5316: same multi-record "mixed" case as above, but replayed through the mount-time
  // useEffect (persistBulkActionResult + reload), since that is the actual code path bulk
  // actions use in production (BulkDocumentAction.jsx writes to sessionStorage, then the page
  // reloads and this hook's effect reads it back). Per the QA rejection, this generic branch
  // now calls toast.warning with ONLY the templated count message, no description.
  it('reads and clears persisted result on mount', () => {
    persistBulkActionResult({ ok: 4, failed: ['x'] });
    renderHook(() => useBulkActionToast());
    // Should have shown toast from persisted result
    expect(toast.warning).toHaveBeenCalledWith('4 processed, 1 failed');
    expect(toast.warning.mock.calls[0]).toHaveLength(1);
    // Should have cleared storage
    expect(sessionStorage.getItem('bulkActionResult')).toBeNull();
  });

  // ETP-5316 regression: the persisted-result replay path (mount-time useEffect) must apply the
  // SAME single-failure fast path as the direct showResult() call — this is the actual reload
  // flow bulk actions use in production, so it needs its own explicit coverage rather than
  // relying on the direct-call test above to imply it.
  it('applies the single-failure fast path on the persisted-result replay (reload) flow', () => {
    persistBulkActionResult({
      ok: 0,
      failed: [{ documentNo: 'DOC-9', message: 'Some backend failure' }],
    });
    renderHook(() => useBulkActionToast());
    expect(toast.error).toHaveBeenCalledWith('Some backend failure');
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
