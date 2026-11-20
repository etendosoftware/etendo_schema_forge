// @covers tools/app-shell/src/hooks/useEntity.js
import { renderHook, act } from '@testing-library/react';
import { useEntity, nextInflightForSaving, nextInflightAfterProcess } from '../useEntity';

/**
 * ETP-6233 — saving and running a header process are ONE in-flight status, never both.
 *
 * Rules under test: a process starts only from idle (otherwise no POST), a save requested while
 * a process runs waits for it and then tracks its own POST, and each finish clears only its own
 * state.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const baseOpts = { token: 'test-token', apiBaseUrl: 'http://localhost/api', skipListFetch: true };
const record = { id: 'rec-1', name: 'Original', updated: '2026-08-31T19:28:22+00:00' };
const procA = { name: 'A', columnName: 'procA', params: [] };
const procB = { name: 'B', columnName: 'procB', params: [] };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const ok = (data = [record]) => ({ ok: true, json: async () => ({ response: { data } }) });

describe('useEntity — single in-flight status (ETP-6233)', () => {
  let gates;
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    gates = { save: deferred(), procA: deferred() };
    calls = [];
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (url.includes('/action/procA')) {
        calls.push('procA');
        await gates.procA.promise;
        return ok();
      }
      if (url.includes('/action/procB')) {
        calls.push('procB');
        return ok();
      }
      if (opts?.method === 'PATCH' || opts?.method === 'PUT') {
        calls.push('save');
        await gates.save.promise;
        return ok();
      }
      return ok([record]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderSelected() {
    const rendered = renderHook(() => useEntity('header', null, baseOpts));
    act(() => { rendered.result.current.handleSelect(record); });
    act(() => { rendered.result.current.handleChange('name', 'Edited'); });
    return rendered;
  }

  it('save: isSaving while the POST is pending, idle afterwards', async () => {
    const { result } = renderSelected();
    let p;
    await act(async () => { p = result.current.handleSave({ silent: true }); });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.runningProcess).toBeNull();
    await act(async () => { gates.save.resolve(); await p; });
    expect(result.current.isSaving).toBe(false);
    expect(result.current.runningProcess).toBeNull();
  });

  it('process: runningProcess while pending, idle afterwards', async () => {
    const { result } = renderSelected();
    let p;
    await act(async () => { p = result.current.handleProcess(procA); });
    expect(result.current.runningProcess).toBe('procA');
    expect(result.current.isSaving).toBe(false);
    await act(async () => { gates.procA.resolve(); await p; });
    expect(result.current.runningProcess).toBeNull();
  });

  it('a process requested while saving issues no POST and does not clear isSaving', async () => {
    const { result } = renderSelected();
    let p;
    await act(async () => { p = result.current.handleSave({ silent: true }); });
    await act(async () => { await result.current.handleProcess(procA); });
    expect(calls).toEqual(['save']);
    expect(result.current.isSaving).toBe(true);
    expect(result.current.runningProcess).toBeNull();
    await act(async () => { gates.save.resolve(); await p; });
    expect(result.current.isSaving).toBe(false);
  });

  it('a save requested while a process runs waits for it, then tracks its own POST', async () => {
    const { result } = renderSelected();
    let proc;
    let save;
    await act(async () => { proc = result.current.handleProcess(procA); });
    await act(async () => { save = result.current.handleSave({ silent: true }); });
    expect(calls).toEqual(['procA']);
    expect(result.current.runningProcess).toBe('procA');
    expect(result.current.isSaving).toBe(false);

    await act(async () => { gates.procA.resolve(); await proc; });
    await vi.waitFor(() => expect(calls).toEqual(['procA', 'save']));
    expect(result.current.isSaving).toBe(true);
    expect(result.current.runningProcess).toBeNull();

    await act(async () => { gates.save.resolve(); await save; });
    expect(result.current.isSaving).toBe(false);
  });

  it('a second process while one runs is rejected and the first stays shown', async () => {
    const { result } = renderSelected();
    let p;
    await act(async () => { p = result.current.handleProcess(procA); });
    await act(async () => { await result.current.handleProcess(procB); });
    expect(calls).toEqual(['procA']);
    expect(result.current.runningProcess).toBe('procA');
    await act(async () => { gates.procA.resolve(); await p; });
    expect(result.current.runningProcess).toBeNull();
  });

  it('two process starts in the same tick issue one POST', async () => {
    const { result } = renderSelected();
    let a;
    let b;
    await act(async () => {
      a = result.current.handleProcess(procA);
      b = result.current.handleProcess(procA);
    });
    expect(calls).toEqual(['procA']);
    await act(async () => { gates.procA.resolve(); await Promise.all([a, b]); });
    expect(result.current.runningProcess).toBeNull();
  });
});

describe('nextInflightForSaving (ETP-6233)', () => {
  const idle = { status: 'idle', processId: null };
  const saving = { status: 'saving', processId: null };
  const process = { status: 'process', processId: 'procA' };

  it('starts saving only from idle and never replaces a running process', () => {
    expect(nextInflightForSaving(idle, true).status).toBe('saving');
    expect(nextInflightForSaving(process, true)).toBe(process);
  });

  it('finishing clears only a saving status — setIsSaving(false) during a process is a no-op', () => {
    expect(nextInflightForSaving(saving, false).status).toBe('idle');
    expect(nextInflightForSaving(process, false)).toBe(process);
    expect(nextInflightForSaving(idle, false)).toBe(idle);
  });
});

describe('nextInflightAfterProcess (ETP-6233)', () => {
  const running = { status: 'process', processId: 'procA' };

  it('clears only the process that finished', () => {
    expect(nextInflightAfterProcess(running, 'procA').status).toBe('idle');
    expect(nextInflightAfterProcess(running, 'procB')).toBe(running);
  });

  it('never clears a saving status', () => {
    const saving = { status: 'saving', processId: null };
    expect(nextInflightAfterProcess(saving, 'procA')).toBe(saving);
  });
});
