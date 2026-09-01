/**
 * ETP-5073 / DOC-04 — unit coverage for `useLineSaveConflict.js`, extracted from DetailView.jsx.
 *
 * `openSaveConflict`/`dismissSaveConflict` and `rememberRecordVersion` are mocked here on purpose:
 * their real wiring is already exercised end-to-end by
 * `DetailView.lineSidebarSaveConflict.vitest.jsx`. This file's job is the module's OWN logic —
 * URL building, the reload/discard flows, and the two `raise*SaveConflict` gates — in isolation.
 */
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { openSaveConflict, dismissSaveConflict } from '@/lib/saveConflict.js';
import { rememberRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import { isStaleRecordResponse, useLineSaveConflict } from '../useLineSaveConflict.js';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/saveConflict.js', () => ({
  openSaveConflict: vi.fn(() => true),
  dismissSaveConflict: vi.fn(),
}));

vi.mock('@etendosoftware/app-shell-core/lib/recordVersions.js', () => ({
  rememberRecordVersion: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  openSaveConflict.mockReturnValue(true);
});

function jsonResponse(body, { ok = false, status = 409 } = {}) {
  return {
    ok,
    status,
    clone: () => ({ json: async () => body }),
    json: async () => body,
  };
}

function nonJsonResponse(status = 500) {
  const boom = async () => { throw new SyntaxError('Unexpected token < in JSON'); };
  return { ok: false, status, clone: () => ({ json: boom }), json: boom };
}

const FRESH_LINE = { id: 'L1', unitPrice: 42, updated: '2026-08-28T00:00:00Z' };

function freshLineResponse(line = FRESH_LINE) {
  return { ok: true, status: 200, json: async () => ({ response: { data: [line] } }) };
}

describe('isStaleRecordResponse', () => {
  it('is true when the body carries error: "stale_record"', async () => {
    const res = jsonResponse({ status: 409, error: 'stale_record', message: 'OBJSON_StaleDate' });
    expect(await isStaleRecordResponse(res)).toBe(true);
  });

  it('is false for a different error discriminator on the same 409 status', async () => {
    const res = jsonResponse({ status: 409, error: 'conflict', message: 'Duplicate record' });
    expect(await isStaleRecordResponse(res)).toBe(false);
  });

  it('is false when the body is not JSON', async () => {
    expect(await isStaleRecordResponse(nonJsonResponse())).toBe(false);
  });

  it('is false when the response has no clone()', async () => {
    const res = { json: async () => ({ error: 'stale_record' }) };
    expect(await isStaleRecordResponse(res)).toBe(false);
  });

  it('reads a CLONE — the original body is still consumable by the caller afterwards', async () => {
    const res = jsonResponse({ status: 409, error: 'stale_record', message: 'OBJSON_StaleDate' });
    await isStaleRecordResponse(res);
    // The module under test only ever calls res.clone().json(); the original json() must still
    // resolve normally for extractErrorMessage to read it next.
    await expect(res.json()).resolves.toEqual({
      status: 409, error: 'stale_record', message: 'OBJSON_StaleDate',
    });
  });
});

function setup(overrides = {}) {
  const hook = { handleUpdateChild: vi.fn(), ...overrides.hook };
  const setSelectedLine = vi.fn();
  const setLineEdits = vi.fn();
  const setLineEditColumns = vi.fn();
  const apiFetch = overrides.apiFetch ?? vi.fn();
  const props = {
    api: overrides.api ?? { crud: { lines: { detailUrl: '/custom/lines/{id}' } } },
    detailEntity: 'lines',
    apiBaseUrl: '/api/sales-order',
    apiFetch,
    token: 'TKN',
    hook,
    ui: (key) => key,
    selectedLine: overrides.selectedLine !== undefined ? overrides.selectedLine : { id: 'L1' },
    setSelectedLine,
    setLineEdits,
    setLineEditColumns,
  };
  const { result } = renderHook(() => useLineSaveConflict(props));
  return { result, hook, setSelectedLine, setLineEdits, setLineEditColumns, apiFetch };
}

describe('useLineSaveConflict — buildSelectedLineUrl', () => {
  it('uses the configured detailUrl with {id} replaced by the selected line id', () => {
    const { result } = setup();
    expect(result.current.buildSelectedLineUrl()).toBe('/custom/lines/L1');
  });

  it('falls back to apiBaseUrl/detailEntity/id when no crud override is configured', () => {
    const { result } = setup({ api: {} });
    expect(result.current.buildSelectedLineUrl()).toBe('/api/sales-order/lines/L1');
  });
});

describe('useLineSaveConflict — discardLineChangesAndReload (sidebar)', () => {
  it('does nothing when no line is selected', async () => {
    const { result, apiFetch } = setup({ selectedLine: null });
    await act(async () => { await result.current.discardLineChangesAndReload(); });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('on success: re-reads the line, remembers its version, updates the parent list, merges into the sidebar, clears edits, dismisses the dialog and toasts info', async () => {
    const apiFetch = vi.fn().mockResolvedValue(freshLineResponse());
    const { result, hook, setSelectedLine, setLineEdits, setLineEditColumns } = setup({ apiFetch });

    await act(async () => { await result.current.discardLineChangesAndReload(); });

    expect(apiFetch).toHaveBeenCalledWith('/custom/lines/L1', { token: 'TKN', baseUrl: '' });
    expect(rememberRecordVersion).toHaveBeenCalledWith(FRESH_LINE);
    expect(hook.handleUpdateChild).toHaveBeenCalledWith('L1', FRESH_LINE);

    // setSelectedLine is a functional updater — invoke it against a snapshot to assert the merge.
    const updater = setSelectedLine.mock.calls[0][0];
    expect(updater({ id: 'L1', unitPrice: 10 })).toEqual({ id: 'L1', unitPrice: 42, updated: FRESH_LINE.updated });

    expect(setLineEdits).toHaveBeenCalledWith(null);
    expect(setLineEditColumns).toHaveBeenCalledWith({});
    expect(dismissSaveConflict).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('saveConflictReloaded');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('on a failed GET: toasts the failure and leaves edits/selection untouched', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { result, hook, setSelectedLine, setLineEdits, setLineEditColumns } = setup({ apiFetch });

    await act(async () => { await result.current.discardLineChangesAndReload(); });

    expect(toast.error).toHaveBeenCalledWith('saveConflictReloadFailed');
    expect(toast.info).not.toHaveBeenCalled();
    expect(hook.handleUpdateChild).not.toHaveBeenCalled();
    expect(setSelectedLine).not.toHaveBeenCalled();
    expect(setLineEdits).not.toHaveBeenCalled();
    expect(setLineEditColumns).not.toHaveBeenCalled();
    expect(dismissSaveConflict).not.toHaveBeenCalled();
  });

  it('on a rejected fetch: toasts the failure without throwing', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('Network down'));
    const { result } = setup({ apiFetch });

    await expect(act(async () => { await result.current.discardLineChangesAndReload(); })).resolves.not.toThrow();
    expect(toast.error).toHaveBeenCalledWith('saveConflictReloadFailed');
  });
});

describe('useLineSaveConflict — discardRowChangesAndReload (inline grid)', () => {
  it('on success: re-reads the row, remembers its version, updates the parent list, dismisses and toasts info — WITHOUT touching sidebar state', async () => {
    const apiFetch = vi.fn().mockResolvedValue(freshLineResponse());
    const { result, hook, setSelectedLine, setLineEdits, setLineEditColumns } = setup({ apiFetch });

    await act(async () => { await result.current.discardRowChangesAndReload('L1'); });

    expect(rememberRecordVersion).toHaveBeenCalledWith(FRESH_LINE);
    expect(hook.handleUpdateChild).toHaveBeenCalledWith('L1', FRESH_LINE);
    expect(dismissSaveConflict).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('saveConflictReloaded');
    expect(setSelectedLine).not.toHaveBeenCalled();
    expect(setLineEdits).not.toHaveBeenCalled();
    expect(setLineEditColumns).not.toHaveBeenCalled();
  });

  it('on a failed GET: toasts the failure', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const { result } = setup({ apiFetch });

    await act(async () => { await result.current.discardRowChangesAndReload('L2'); });

    expect(toast.error).toHaveBeenCalledWith('saveConflictReloadFailed');
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('reloads a row different from the one selected in the sidebar (independent of selectedLine)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(freshLineResponse({ id: 'L2', updated: 'x' }));
    const { result } = setup({ apiFetch, selectedLine: { id: 'L1' } });

    await act(async () => { await result.current.discardRowChangesAndReload('L2'); });

    expect(apiFetch).toHaveBeenCalledWith('/custom/lines/L2', { token: 'TKN', baseUrl: '' });
  });
});

describe('useLineSaveConflict — raiseLineSaveConflict (sidebar gate)', () => {
  it('opens the dialog with an onRefresh that discards and reloads the sidebar line, for a stale record', async () => {
    const { result } = setup();
    const res = jsonResponse({ error: 'stale_record', message: 'OBJSON_StaleDate' });

    const raised = await result.current.raiseLineSaveConflict(res);

    expect(raised).toBe(true);
    expect(openSaveConflict).toHaveBeenCalledTimes(1);
    expect(typeof openSaveConflict.mock.calls[0][0].onRefresh).toBe('function');
  });

  it('does not open the dialog for a non-stale error, even on a 409', async () => {
    const { result } = setup();
    const res = jsonResponse({ status: 409, error: 'conflict', message: 'Duplicate record' });

    const raised = await result.current.raiseLineSaveConflict(res);

    expect(raised).toBe(false);
    expect(openSaveConflict).not.toHaveBeenCalled();
  });

  it('reports what openSaveConflict itself returns (no dialog host mounted)', async () => {
    openSaveConflict.mockReturnValueOnce(false);
    const { result } = setup();
    const res = jsonResponse({ error: 'stale_record' });

    expect(await result.current.raiseLineSaveConflict(res)).toBe(false);
  });
});

describe('useLineSaveConflict — raiseRowSaveConflict (inline grid gate)', () => {
  it('opens the dialog with an onRefresh bound to the given row id, for a stale record', async () => {
    const { result } = setup();
    const res = jsonResponse({ error: 'stale_record', message: 'OBJSON_StaleDate' });

    const raised = await result.current.raiseRowSaveConflict(res, 'L7');

    expect(raised).toBe(true);
    expect(openSaveConflict).toHaveBeenCalledTimes(1);
    expect(typeof openSaveConflict.mock.calls[0][0].onRefresh).toBe('function');
  });

  it('does not open the dialog and returns false when no lineId is given', async () => {
    const { result } = setup();
    const res = jsonResponse({ error: 'stale_record' });

    const raised = await result.current.raiseRowSaveConflict(res, undefined);

    expect(raised).toBe(false);
    expect(openSaveConflict).not.toHaveBeenCalled();
  });

  it('does not open the dialog for a non-stale error', async () => {
    const { result } = setup();
    const res = jsonResponse({ status: 409, error: 'conflict', message: 'Duplicate record' });

    const raised = await result.current.raiseRowSaveConflict(res, 'L7');

    expect(raised).toBe(false);
    expect(openSaveConflict).not.toHaveBeenCalled();
  });

  it('reports false when openSaveConflict itself refuses (no dialog host mounted)', async () => {
    openSaveConflict.mockReturnValueOnce(false);
    const { result } = setup();
    const res = jsonResponse({ error: 'stale_record' });

    expect(await result.current.raiseRowSaveConflict(res, 'L7')).toBe(false);
  });

  it('the bound onRefresh reloads exactly the row it was raised for, independent of any sidebar selection', async () => {
    const apiFetch = vi.fn().mockResolvedValue(freshLineResponse({ id: 'L7', updated: 'y' }));
    const { result } = setup({ apiFetch, selectedLine: { id: 'L1' } });
    const res = jsonResponse({ error: 'stale_record' });

    await result.current.raiseRowSaveConflict(res, 'L7');
    const onRefresh = openSaveConflict.mock.calls[0][0].onRefresh;
    await act(async () => { await onRefresh(); });

    expect(apiFetch).toHaveBeenCalledWith('/custom/lines/L7', { token: 'TKN', baseUrl: '' });
  });
});
