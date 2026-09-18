import { renderHook, act } from '@testing-library/react';

// ETP-5034 (review cycle) — the three OTHER readers of GET /{entity}/{id}.
//
// fetchById was not the only caller of the get-by-id route, and the route answers an unknown /
// invisible / malformed id with HTTP 200 + `{"response":{"data":[],"status":0}}` for every one of
// them. Each caller used to unwrap it with `data?.response?.data?.[0] ?? data`, so the ENVELOPE
// fell through the `??` and was treated as the record:
//
//   * refreshHeaderTotals  — merged the envelope into `selected`/`editing`, i.e. the ETP-5034 bug
//                            through a second door and with no recordError to expose it.
//   * discardChangesAndReload — reloaded the envelope over the form, blanking it.
//   * refreshRecordVersion — remembered the envelope's (non-existent) `updated` token, so the
//                            next write replayed a version that was not the row's.
//
// All three now go through `extractSingleRow` and bail out on a non-answer. These tests pin the
// bail-out, and — for each one — that the populated-envelope path still behaves as before.

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { toast } from 'sonner';
import { useEntity } from '../useEntity';

const EMPTY_ENVELOPE = { response: { data: [], status: 0 } };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    // handleSaveErrorResponse reads the error body off a clone before the legacy extractor.
    clone: () => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }),
    text: async () => JSON.stringify(body),
  };
}

const defaultOpts = {
  token: 'test-token',
  apiBaseUrl: 'http://localhost/api',
  skipListFetch: true,
};

function renderEntity(opts = {}) {
  return renderHook(() => useEntity('header', null, { ...defaultOpts, ...opts }));
}

/** Let the hook's promise chains run to completion. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
}

const RECORD = { id: 'rec-1', documentNo: 'DOC-1', grandTotal: '100.00' };

describe('refreshHeaderTotals — empty envelope (ETP-5034)', () => {
  beforeEach(() => {
    // The `sonner` module mock is created once for the whole file, so its call history would
    // otherwise leak across cases — and this suite reads the remedy callback OUT of a toast call.
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves selected and editing untouched when the header is no longer visible', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    const selectedBefore = result.current.selected;
    const editingBefore = result.current.editing;

    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    act(() => { result.current.refreshHeaderTotals('rec-1'); });
    await flush();

    expect(globalThis.fetch, 'the refresh GET must still have been issued').toHaveBeenCalledTimes(1);
    // Identity, not deep equality: both setters build a NEW object, so an unchanged reference is
    // proof that neither setSelected nor setEditing was called at all.
    expect(
      result.current.selected,
      'reinjecting the envelope as the record is the ETP-5034 bug through a second door'
    ).toBe(selectedBefore);
    expect(
      result.current.editing,
      'nothing to refresh means the form stays exactly as the user left it'
    ).toBe(editingBefore);
    expect(result.current.recordError, 'this path never publishes recordError').toBeNull();
  });

  it('does not surface an error state or a toast for the empty envelope', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    act(() => { result.current.refreshHeaderTotals('rec-1'); });
    await flush();

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still merges server-computed fields from a populated envelope (regression guard)', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ response: { data: [{ ...RECORD, grandTotal: '250.00' }], status: 0 } })
    );
    act(() => { result.current.refreshHeaderTotals('rec-1'); });
    await flush();

    expect(result.current.selected?.grandTotal).toBe('250.00');
    expect(result.current.editing?.grandTotal).toBe('250.00');
  });

  it('does nothing at all without an id', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    act(() => { result.current.refreshHeaderTotals(undefined); });
    await flush();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('discardChangesAndReload — empty envelope (ETP-5034)', () => {
  beforeEach(() => {
    // The `sonner` module mock is created once for the whole file, so its call history would
    // otherwise leak across cases — and this suite reads the remedy callback OUT of a toast call.
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Drive the hook to the point where the save-conflict remedy is available.
   *
   * `discardChangesAndReload` is not part of the hook's public surface — it is handed to
   * `handleSaveErrorResponse` as the stale-record remedy. With no save-conflict dialog host
   * mounted, `openSaveConflict` returns false and the remedy is exposed as the toast's action,
   * which is the handle this test clicks.
   *
   * @param {object} result renderHook result
   * @returns {Function} the remedy callback
   */
  async function reachDiscardRemedy(result) {
    act(() => { result.current.handleSelect({ ...RECORD }); });
    act(() => { result.current.handleChange('documentNo', 'DOC-1-EDITED'); });

    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ error: 'stale_record' }, { ok: false, status: 409 })
    );
    await act(async () => { await result.current.handleSave(); });

    const conflictCall = toast.error.mock.calls.find(([, opts]) => opts?.action?.onClick);
    expect(conflictCall, 'expected the stale-record conflict remedy to be offered').toBeTruthy();
    return conflictCall[1].action.onClick;
  }

  it('reports the reload failure and keeps the form when the record came back empty', async () => {
    const { result } = renderEntity();
    const discardAndReload = await reachDiscardRemedy(result);

    const editingBefore = result.current.editing;
    expect(editingBefore?.documentNo).toBe('DOC-1-EDITED');

    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    await act(async () => { await discardAndReload(); });

    expect(
      toast.error,
      'an empty envelope is a failed reload, not a successful reload of nothing'
    ).toHaveBeenCalledWith('saveConflictReloadFailed');
    expect(toast.info).not.toHaveBeenCalledWith('saveConflictReloaded');
    expect(
      result.current.editing,
      'blanking the form would destroy the very edits the user was asked about'
    ).toBe(editingBefore);
    expect(result.current.editing?.documentNo).toBe('DOC-1-EDITED');
  });

  it('reloads the record and drops the pending edits on a populated envelope', async () => {
    const { result } = renderEntity();
    const discardAndReload = await reachDiscardRemedy(result);

    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ response: { data: [{ ...RECORD, documentNo: 'DOC-1-SERVER' }], status: 0 } })
    );
    await act(async () => { await discardAndReload(); });

    expect(result.current.editing?.documentNo).toBe('DOC-1-SERVER');
    expect(result.current.selected?.documentNo).toBe('DOC-1-SERVER');
    expect(toast.info).toHaveBeenCalledWith('saveConflictReloaded');
    expect(toast.error).not.toHaveBeenCalledWith('saveConflictReloadFailed');
  });
});

describe('refreshRecordVersion — empty envelope (ETP-5034)', () => {
  const PROCESS = { columnName: 'processDocument', name: 'processDocument', params: [] };

  beforeEach(() => {
    // The `sonner` module mock is created once for the whole file, so its call history would
    // otherwise leak across cases — and this suite reads the remedy callback OUT of a toast call.
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * `refreshRecordVersion` is internal too: a refused process is the path that reaches it
   * (a refusal may still have bumped `updated`, so the remembered version must be re-read).
   *
   * @param {object} result renderHook result
   * @param {object} versionResponse the body the follow-up GET answers with
   */
  async function runRefusedProcess(result, versionResponse) {
    globalThis.fetch
      // POST /header/rec-1/action/processDocument — refused.
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Refused' } }, { ok: false, status: 400 }))
      // GET /header/rec-1 — the version re-read.
      .mockResolvedValueOnce(versionResponse);

    await act(async () => { await result.current.handleProcess(PROCESS); });
    await flush();
  }

  it('survives the empty envelope without touching selected or editing', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    const selectedBefore = result.current.selected;
    const editingBefore = result.current.editing;

    await runRefusedProcess(result, jsonResponse(EMPTY_ENVELOPE));

    // Two calls: the refused action, then the version re-read that got the non-answer.
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(
      result.current.selected,
      'the version re-read deliberately never touches the form'
    ).toBe(selectedBefore);
    expect(result.current.editing).toBe(editingBefore);
    expect(result.current.recordError).toBeNull();
    expect(result.current.runningProcess, 'the process button must be released again').toBeNull();
  });

  it('leaves the form alone on a populated envelope too (it only re-remembers the version)', async () => {
    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ ...RECORD }); });

    const editingBefore = result.current.editing;

    await runRefusedProcess(
      result,
      jsonResponse({ response: { data: [{ ...RECORD, updated: '2026-01-01T00:00:00Z' }], status: 0 } })
    );

    expect(result.current.editing).toBe(editingBefore);
    expect(result.current.runningProcess).toBeNull();
  });

  it('does not issue the version re-read when there is no id', async () => {
    const { result } = renderEntity();
    // No record selected — handleProcess returns before doing anything at all.
    await act(async () => { await result.current.handleProcess(PROCESS); });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
