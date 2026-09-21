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

  // ETP-5316: ok > 0 with 2+ failed rows takes the multi-record path, which now ALSO carries
  // a `{description}` second arg (buildFailureDetail) alongside the unchanged generic summary.
  // buildFailureDetail now ALWAYS runs each row's message through translateBackendError — these
  // fixtures are plain strings with no `.message` property at all, so there is nothing to
  // translate and each row falls back to `ui('actionFailed')`, giving a populated (not empty)
  // description. See the dedicated 'mixed ok/failed' test below for the case with realistic
  // {documentNo, message} rows, and the 'translated message among the rows' test for a row whose
  // message IS a real BACKEND_ERROR_MAP entry.
  it('showResult calls toast.warning when some ok and some failures', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 3, failed: ['err1', 'err2'] });
    });
    expect(toast.warning).toHaveBeenCalledWith('3 processed, 2 failed', {
      description: 'Action failed\nAction failed',
    });
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

  // ETP-5316: multiple records, mixed ok/failed (ok > 0) — the generic count summary stays the
  // main message, but the toast now ALSO carries a `{description}` with each failed row's
  // `documentNo: message`, newline-joined.
  it('showResult builds a per-row description for a mixed ok/failed result', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 2,
        failed: [
          { documentNo: 'DOC-1', message: 'err1' },
          { documentNo: 'DOC-2', message: 'err2' },
        ],
      });
    });
    expect(toast.warning).toHaveBeenCalledWith('2 processed, 2 failed', {
      description: 'DOC-1: err1\nDOC-2: err2',
    });
  });

  // ETP-5316: 2+ failed records with ok===0 must NOT take the single-failure fast path — it stays
  // on the generic "all failed" summary, now with the same per-row description as the mixed case.
  it('showResult builds a per-row description for an all-failed multi-record result', () => {
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
    expect(toast.error).toHaveBeenCalledWith('0 processed, 2 failed', {
      description: 'DOC-3: err3\nDOC-4: err4',
    });
  });

  // ETP-5316: multi-row description where one failed row's message DOES match a real
  // BACKEND_ERROR_MAP entry ('Country needed in an IBAN account.' -> backendError.countryIban,
  // the same mapping the single-record 'translated message' test above exercises). The
  // translated Spanish text must appear in the joined description for that row, while the
  // sibling row with an unmapped message stays passed through verbatim.
  it('showResult builds a per-row description with a translated message among the rows', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 1,
        failed: [
          { documentNo: 'FIN-01', message: 'Country needed in an IBAN account.' },
          { documentNo: 'DOC-2', message: 'err2' },
        ],
      });
    });
    expect(toast.warning).toHaveBeenCalledWith('1 processed, 2 failed', {
      description: 'FIN-01: País necesario en una cuenta IBAN.\nDOC-2: err2',
    });
  });

  // ETP-5316: a failed row with `documentNo` but no `message` at all, inside a MULTI-row result
  // (so the single-failure fast path does not apply), must render 'documentNo: <actionFailed
  // translation>' — not the literal string 'DOC-1: undefined' the old raw-join implementation
  // would have produced for a missing message.
  it('showResult renders the actionFailed fallback for a multi-row entry with documentNo but no message', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({
        ok: 0,
        failed: [
          { documentNo: 'DOC-1' },
          { documentNo: 'DOC-2', message: 'err2' },
        ],
      });
    });
    expect(toast.error).toHaveBeenCalledWith('0 processed, 2 failed', {
      description: 'DOC-1: Action failed\nDOC-2: err2',
    });
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
  // branch, and here `failed.length === 0`.
  it('omitted-only result does not trigger the single-failure branch', () => {
    const { result } = renderHook(() => useBulkActionToast());
    act(() => {
      result.current.showResult({ ok: 0, failed: [], omitted: ['ROW-1'] });
    });
    expect(toast.warning).toHaveBeenCalledWith('0 processed, 1 omitted, 0 failed', undefined);
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
  // reloads and this hook's effect reads it back). The fixture is a plain string with no
  // `.message`, so — same as the direct showResult() equivalent above — it falls back to
  // `ui('actionFailed')` and produces a populated description, not `undefined`.
  it('reads and clears persisted result on mount', () => {
    persistBulkActionResult({ ok: 4, failed: ['x'] });
    renderHook(() => useBulkActionToast());
    // Should have shown toast from persisted result
    expect(toast.warning).toHaveBeenCalledWith('4 processed, 1 failed', {
      description: 'Action failed',
    });
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

// ================================================================
// ETP-4994 — sessionStorage must never escalate to a broken render
// ================================================================
// This hook runs inside ListView's render tree. With site data blocked (strict
// private mode, corporate policy) the accessor itself throws — an unguarded
// access there unmounts the whole grid instead of losing one toast.
describe('useBulkActionToast — storage unavailable', () => {
  const realDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

  const installSessionStorage = (descriptor) => {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, ...descriptor });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (realDescriptor) {
      Object.defineProperty(globalThis, 'sessionStorage', realDescriptor);
    } else {
      delete globalThis.sessionStorage;
    }
  });

  it('mounts without throwing when reading the accessor throws', () => {
    installSessionStorage({
      get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    });

    expect(() => renderHook(() => useBulkActionToast())).not.toThrow();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('mounts without throwing when getItem throws', () => {
    installSessionStorage({
      value: {
        getItem: () => { throw new DOMException('denied', 'SecurityError'); },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });

    expect(() => renderHook(() => useBulkActionToast())).not.toThrow();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('still shows the toast when persisting hits the quota', () => {
    installSessionStorage({
      value: {
        getItem: () => null,
        setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
        removeItem: vi.fn(),
      },
      writable: true,
    });

    const { result } = renderHook(() => useBulkActionToast());
    expect(() => {
      act(() => {
        result.current.showResult({ ok: 2, failed: [] }, { persist: true });
      });
    }).not.toThrow();
    expect(toast.success).toHaveBeenCalledWith('2 processed, 0 failed');
  });

  it('persistBulkActionResult swallows a throwing accessor', () => {
    installSessionStorage({
      get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    });

    expect(() => persistBulkActionResult({ ok: 1, failed: [] })).not.toThrow();
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
    expect(toast.error).toHaveBeenCalledWith('0 ok, 2 failed', {
      description: 'actionFailed\nactionFailed',
    });
  });

  it('shows a warning toast on a partial failure', () => {
    showBulkActionToast(ui, { ok: 2, failed: ['e1'] });
    expect(toast.warning).toHaveBeenCalledWith('2 ok, 1 failed', {
      description: 'actionFailed',
    });
  });

  it('switches to the 3-count message when rows were omitted', () => {
    showBulkActionToast(ui, { ok: 1, omitted: ['skipped'], failed: [] });
    expect(toast.warning).toHaveBeenCalledWith('1 ok, 1 omitted, 0 failed', undefined);
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
