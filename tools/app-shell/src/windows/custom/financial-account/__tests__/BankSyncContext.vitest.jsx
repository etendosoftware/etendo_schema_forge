// @covers tools/app-shell/src/windows/custom/financial-account/BankSyncContext.jsx
import { act, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockSync = vi.fn();
const mockSyncStatus = vi.fn();
const actions = vi.hoisted(() => ({ withStatus: true }));
vi.mock('@/hooks/useBankConnectionActions.js', () => ({
  useBankConnectionActions: () => ({
    sync: mockSync,
    syncStatus: actions.withStatus ? mockSyncStatus : undefined,
  }),
}));

import {
  BANK_SYNC_POLL_GIVE_UP_MS,
  BANK_SYNC_POLL_INTERVAL_MS,
  BANK_SYNC_POLL_MAX_FAILURES,
  BankSyncProvider,
  resultOfFinishedSync,
  useBankSync,
  useBankSyncController,
  useBankSyncDone,
  useBankSyncStatus,
  useBankSyncTracking,
} from '../BankSyncContext.jsx';

const T0 = Date.parse('2026-11-05T10:00:00Z');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Advances fake time inside act, so the polling effects re-run between ticks. */
async function advance(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

/** One poll interval at a time, `n` times — each tick re-arms the next one through a render. */
async function pollTicks(n) {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await advance(BANK_SYNC_POLL_INTERVAL_MS);
  }
}

function toastCount() {
  return Object.values(toastMock).reduce((n, fn) => n + fn.mock.calls.length, 0);
}

function setDocumentHidden(hidden) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  mockSync.mockReset();
  mockSyncStatus.mockReset();
  mockSyncStatus.mockResolvedValue({});
  actions.withStatus = true;
  Object.values(toastMock).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
  delete document.visibilityState;
});

describe('BankSyncContext constants', () => {
  it('polls every 3 s, gives up after 10 min or 3 consecutive failures', () => {
    expect(BANK_SYNC_POLL_INTERVAL_MS).toBe(3000);
    expect(BANK_SYNC_POLL_GIVE_UP_MS).toBe(10 * 60 * 1000);
    expect(BANK_SYNC_POLL_MAX_FAILURES).toBe(3);
  });
});

describe('resultOfFinishedSync', () => {
  const startedAt = T0;
  const iso = (ms) => new Date(ms).toISOString();

  it('trusts a lastResult at least as recent as the start of the sync', () => {
    expect(resultOfFinishedSync(
      { lastResult: { status: 'ERROR', message: 'Bank down', at: iso(startedAt + 5000) } }, startedAt,
    )).toEqual({ status: 'ERROR', message: 'Bank down' });
  });

  it('trusts a lastResult up to 60 s older than the start (clock skew)', () => {
    expect(resultOfFinishedSync(
      { lastResult: { status: 'OK', at: iso(startedAt - 59_000) } }, startedAt,
    )).toEqual({ status: 'OK', message: undefined });
  });

  it('ignores a stale lastResult (older than the skew) and falls back to a moved lastSyncDate', () => {
    expect(resultOfFinishedSync({
      lastResult: { status: 'ERROR', message: 'old failure', at: iso(startedAt - 61_000) },
      lastSyncDate: iso(startedAt + 1000),
    }, startedAt)).toEqual({ status: 'OK' });
  });

  it('reads a fresh lastSyncDate alone as an OK', () => {
    expect(resultOfFinishedSync({ lastSyncDate: iso(startedAt + 1000) }, startedAt)).toEqual({ status: 'OK' });
  });

  it('cannot tell when both are stale', () => {
    expect(resultOfFinishedSync({
      lastResult: { status: 'OK', at: iso(startedAt - 120_000) },
      lastSyncDate: iso(startedAt - 120_000),
    }, startedAt)).toBeNull();
  });

  it('does not trust a lastResult without a timestamp or without a status', () => {
    expect(resultOfFinishedSync({ lastResult: { status: 'OK' } }, startedAt)).toBeNull();
    expect(resultOfFinishedSync({ lastResult: { at: iso(startedAt + 1) } }, startedAt)).toBeNull();
    expect(resultOfFinishedSync({ lastSyncDate: 'not a date' }, startedAt)).toBeNull();
  });

  it('returns null for a missing state', () => {
    expect(resultOfFinishedSync(null, startedAt)).toBeNull();
    expect(resultOfFinishedSync(undefined, startedAt)).toBeNull();
  });
});

describe('useBankSyncController — startSync', () => {
  function setup() {
    return renderHook(() => useBankSyncController());
  }

  it('ignores a call without an account id', async () => {
    const { result } = setup();
    let out;
    await act(async () => { out = await result.current.startSync(''); });
    expect(out).toBeNull();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('refuses a second, synchronous request for the same account: no request, info toast, joins the first', async () => {
    const pending = deferred();
    mockSync.mockReturnValue(pending.promise);
    const first = vi.fn();
    const second = vi.fn();
    const { result } = setup();

    let joined;
    await act(async () => {
      result.current.startSync('A', { onDone: first });
      joined = await result.current.startSync('A', { onDone: second });
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(joined).toEqual({ status: 'IN_PROGRESS' });
    expect(toastMock.info).toHaveBeenCalledWith('financeAccountsBankSyncInProgress');
    expect(result.current.isSyncing('A')).toBe(true);

    await act(async () => { pending.resolve({ status: 'OK', message: 'Imported 3' }); });

    expect(first).toHaveBeenCalledWith({ status: 'OK', message: 'Imported 3' });
    expect(second).toHaveBeenCalledWith({ status: 'OK', message: 'Imported 3' });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith('Imported 3');
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('runs beforeSync first and sends nothing when it throws, toasting its error', async () => {
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => {
      await result.current.startSync('A', {
        beforeSync: async () => { throw new Error('Save failed'); },
        onDone,
      });
    });

    expect(mockSync).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Save failed');
    expect(toastCount()).toBe(1);
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('does not toast a beforeSync error that was already reported (handled)', async () => {
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => {
      await result.current.startSync('A', {
        beforeSync: () => Promise.reject(Object.assign(new Error('x'), { handled: true })),
        onDone,
      });
    });

    expect(mockSync).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(toastCount()).toBe(0);
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('keeps the account syncing while beforeSync runs', async () => {
    const save = deferred();
    mockSync.mockResolvedValue({ status: 'OK' });
    const { result } = setup();

    await act(async () => { result.current.startSync('A', { beforeSync: () => save.promise }); });
    expect(result.current.isSyncing('A')).toBe(true);
    expect(mockSync).not.toHaveBeenCalled();

    await act(async () => { save.resolve(); });
    expect(mockSync).toHaveBeenCalledWith('A');
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it.each([
    ['OK', 'success'],
    ['WARNING', 'warning'],
    ['ERROR', 'error'],
  ])('a %s answer runs the callbacks, then shows exactly one %s toast', async (status, kind) => {
    const res = { status, message: `msg-${status}` };
    mockSync.mockResolvedValue(res);
    const onDone = vi.fn();
    const { result } = setup();

    let out;
    await act(async () => { out = await result.current.startSync('A', { onDone }); });

    expect(out).toEqual(res);
    expect(onDone).toHaveBeenCalledWith(res);
    expect(toastMock[kind]).toHaveBeenCalledWith(`msg-${status}`);
    expect(toastCount()).toBe(1);
    expect(onDone.mock.invocationCallOrder[0]).toBeLessThan(toastMock[kind].mock.invocationCallOrder[0]);
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('a request that throws (not a timeout) shows an error toast and runs no callbacks', async () => {
    mockSync.mockRejectedValue(new Error('Bank down'));
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => { await result.current.startSync('A', { onDone }); });

    expect(onDone).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Bank down');
    expect(toastCount()).toBe(1);
    expect(result.current.isSyncing('A')).toBe(false);
    await pollTicks(2);
    expect(mockSyncStatus).not.toHaveBeenCalled();
  });

  it('a callback that throws does not break the result toast', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    const { result } = setup();

    await act(async () => {
      await result.current.startSync('A', { onDone: () => { throw new Error('reload failed'); } });
    });

    expect(toastMock.success).toHaveBeenCalledWith('financeAccountsBankConnectionSyncDone');
  });
});

describe('useBankSyncController — polling a sync still running', () => {
  function setup() {
    return renderHook(() => useBankSyncController());
  }

  it('IN_PROGRESS shows the info toast and polls until the sync ends, then reports its result', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS', message: 'locked by someone' });
    mockSyncStatus
      .mockResolvedValueOnce({ A: { inProgress: true } })
      .mockResolvedValueOnce({
        A: { inProgress: false, lastResult: { status: 'ERROR', message: 'Bank down', at: new Date(T0 + 4000).toISOString() } },
      });
    const onDone = vi.fn();
    const { result } = setup();

    let out;
    await act(async () => { out = await result.current.startSync('A', { onDone }); });
    expect(out).toEqual({ status: 'IN_PROGRESS', message: 'locked by someone' });
    expect(toastMock.info).toHaveBeenCalledWith('financeAccountsBankSyncInProgress');
    expect(result.current.isSyncing('A')).toBe(true);
    expect(mockSyncStatus).not.toHaveBeenCalled();

    await pollTicks(1);
    expect(mockSyncStatus).toHaveBeenCalledWith(['A']);
    expect(result.current.isSyncing('A')).toBe(true);
    expect(onDone).not.toHaveBeenCalled();

    await pollTicks(1);
    expect(mockSyncStatus).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledWith({ status: 'ERROR', message: 'Bank down' });
    expect(toastMock.error).toHaveBeenCalledWith('Bank down');
    expect(toastCount()).toBe(2); // the info notice + the result
    expect(result.current.isSyncing('A')).toBe(false);

    await pollTicks(2);
    expect(mockSyncStatus).toHaveBeenCalledTimes(2);
  });

  it('a finished sync whose outcome cannot be told runs the reloads but shows no result toast', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockResolvedValue({ A: { inProgress: false } });
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => { await result.current.startSync('A', { onDone }); });
    await pollTicks(1);

    expect(onDone).toHaveBeenCalledWith(null);
    expect(toastCount()).toBe(1); // only the info notice
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('BANK_CONNECTION_TIMEOUT polls silently and, when the sync ends, shows its real result', async () => {
    mockSync.mockRejectedValue(new Error('BANK_CONNECTION_TIMEOUT'));
    mockSyncStatus
      .mockResolvedValueOnce({ A: { inProgress: true } })
      .mockResolvedValueOnce({ A: { inProgress: false, lastSyncDate: new Date(T0 + 50_000).toISOString() } });
    const onDone = vi.fn();
    const { result } = setup();

    let out;
    await act(async () => { out = await result.current.startSync('A', { onDone }); });
    expect(out).toBeNull();
    expect(toastCount()).toBe(0);
    expect(result.current.isSyncing('A')).toBe(true);

    await pollTicks(2);
    expect(onDone).toHaveBeenCalledWith({ status: 'OK' });
    expect(toastMock.success).toHaveBeenCalledWith('financeAccountsBankConnectionSyncDone');
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('BANK_CONNECTION_TIMEOUT shows the timeout toast only when the polling gives up after 10 minutes', async () => {
    mockSync.mockRejectedValue(new Error('BANK_CONNECTION_TIMEOUT'));
    mockSyncStatus.mockResolvedValue({ A: { inProgress: true } });
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => { await result.current.startSync('A', { onDone }); });

    const ticksToGiveUp = Math.floor(BANK_SYNC_POLL_GIVE_UP_MS / BANK_SYNC_POLL_INTERVAL_MS);
    await pollTicks(ticksToGiveUp);
    expect(toastCount()).toBe(0);
    expect(result.current.isSyncing('A')).toBe(true);

    await pollTicks(1);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith('financeAccountsBankConnectionTimeout');
    expect(onDone).toHaveBeenCalledWith(null);
    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('IN_PROGRESS that never ends stops spinning after 10 minutes without a further toast', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockResolvedValue({ A: { inProgress: true } });
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => { await result.current.startSync('A', { onDone }); });
    await pollTicks(Math.floor(BANK_SYNC_POLL_GIVE_UP_MS / BANK_SYNC_POLL_INTERVAL_MS) + 1);

    expect(result.current.isSyncing('A')).toBe(false);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(toastCount()).toBe(1); // the initial info notice only
  });

  it('gives up after 3 consecutive failed status reads', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockRejectedValue(new Error('network'));
    const onDone = vi.fn();
    const { result } = setup();

    await act(async () => { await result.current.startSync('A', { onDone }); });
    await pollTicks(BANK_SYNC_POLL_MAX_FAILURES - 1);
    expect(result.current.isSyncing('A')).toBe(true);

    await pollTicks(1);
    expect(result.current.isSyncing('A')).toBe(false);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(toastCount()).toBe(1);
  });

  it('counts an account the status omits as a failed read', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockResolvedValue({});
    const { result } = setup();

    await act(async () => { await result.current.startSync('A'); });
    await pollTicks(BANK_SYNC_POLL_MAX_FAILURES);

    expect(result.current.isSyncing('A')).toBe(false);
  });

  it('a good read resets the consecutive-failure count', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ A: { inProgress: true } })
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ A: { inProgress: true } });
    const { result } = setup();

    await act(async () => { await result.current.startSync('A'); });
    await pollTicks(5);

    expect(mockSyncStatus).toHaveBeenCalledTimes(5);
    expect(result.current.isSyncing('A')).toBe(true);
  });

  it('reads every pending account in one status request', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockResolvedValue({ A: { inProgress: true }, B: { inProgress: true } });
    const { result } = setup();

    await act(async () => {
      await result.current.startSync('A');
      await result.current.startSync('B');
    });
    await pollTicks(1);

    expect(mockSyncStatus).toHaveBeenCalledTimes(1);
    expect(mockSyncStatus).toHaveBeenCalledWith(['A', 'B']);
  });

  it('pauses the polling while the browser tab is hidden, and resumes when it is shown', async () => {
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockSyncStatus.mockResolvedValue({ A: { inProgress: true } });
    const { result } = setup();

    await act(async () => { await result.current.startSync('A'); });
    act(() => setDocumentHidden(true));
    await pollTicks(5);
    expect(mockSyncStatus).not.toHaveBeenCalled();
    expect(result.current.isSyncing('A')).toBe(true);

    act(() => setDocumentHidden(false));
    await pollTicks(1);
    expect(mockSyncStatus).toHaveBeenCalledTimes(1);
  });

  it('without a status endpoint, an IN_PROGRESS answer stops spinning instead of polling', async () => {
    actions.withStatus = false;
    mockSync.mockResolvedValue({ status: 'IN_PROGRESS' });
    const { result } = setup();

    await act(async () => { await result.current.startSync('A'); });

    expect(toastMock.info).toHaveBeenCalledWith('financeAccountsBankSyncInProgress');
    expect(result.current.isSyncing('A')).toBe(false);
  });
});

// ── Provider: shared state, discovery, who reloads what ─────────────────────────────────────
function Status({ id }) {
  const { syncing } = useBankSyncStatus(id);
  return <span data-testid={`status-${id}`}>{String(syncing)}</span>;
}

const handles = {};
/** A host: tracks `ids`, listens for `listenTo` (null = every account), exposes its controller. */
function Host({ name, ids = [], listenTo, onListen }) {
  const bankSync = useBankSync();
  handles[name] = bankSync;
  useBankSyncTracking(bankSync, ids);
  useBankSyncDone(bankSync, listenTo ?? null, onListen ?? (() => {}));
  return null;
}

function Toggle({ children }) {
  const [shown, setShown] = useState(true);
  handles.hide = () => setShown(false);
  return shown ? children : null;
}

describe('BankSyncProvider — shared state', () => {
  it('a second consumer of the same window sends no request while the first one syncs', async () => {
    const pending = deferred();
    mockSync.mockReturnValue(pending.promise);
    render(
      <BankSyncProvider>
        <Host name="list" />
        <Host name="tab" />
        <Status id="A" />
      </BankSyncProvider>,
    );

    await act(async () => { handles.list.startSync('A'); });
    expect(screen.getByTestId('status-A')).toHaveTextContent('true');

    await act(async () => { await handles.tab.startSync('A'); });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(toastMock.info).toHaveBeenCalledWith('financeAccountsBankSyncInProgress');

    await act(async () => { pending.resolve({ status: 'OK' }); });
    expect(screen.getByTestId('status-A')).toHaveTextContent('false');
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it('a finished sync with a live onDone runs it and NOT the host listeners', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    const listener = vi.fn();
    const onDone = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" onListen={listener} />
      </BankSyncProvider>,
    );

    await act(async () => { await handles.list.startSync('A', { onDone }); });

    expect(onDone).toHaveBeenCalledWith({ status: 'OK' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('a finished sync with no onDone falls through to the listeners of that account or of every account', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    const all = vi.fn();
    const onlyA = vi.fn();
    const onlyB = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" onListen={all} />
        <Host name="detailA" listenTo="A" onListen={onlyA} />
        <Host name="detailB" listenTo="B" onListen={onlyB} />
      </BankSyncProvider>,
    );

    await act(async () => { await handles.list.startSync('A'); });

    expect(all).toHaveBeenCalledWith('A', { status: 'OK' });
    expect(onlyA).toHaveBeenCalledWith('A', { status: 'OK' });
    expect(onlyB).not.toHaveBeenCalled();
  });

  it('drops the onDone of a component that unmounted, and the listeners take over', async () => {
    const pending = deferred();
    mockSync.mockReturnValue(pending.promise);
    const listener = vi.fn();
    const onDone = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" onListen={listener} />
        <Toggle><Host name="modal" /></Toggle>
      </BankSyncProvider>,
    );

    await act(async () => { handles.modal.startSync('A', { onDone }); });
    act(() => handles.hide());
    await act(async () => { pending.resolve({ status: 'OK' }); });

    expect(onDone).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith('A', { status: 'OK' });
  });

  it('a listener unsubscribes when its host unmounts', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    const listener = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" />
        <Toggle><Host name="detail" onListen={listener} /></Toggle>
      </BankSyncProvider>,
    );

    act(() => handles.hide());
    await act(async () => { await handles.list.startSync('A'); });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('BankSyncProvider — discovery of syncs already running', () => {
  it('reads the status of a newly tracked account once and follows a running sync silently', async () => {
    mockSyncStatus
      .mockResolvedValueOnce({ A: { inProgress: true }, B: { inProgress: false } })
      .mockResolvedValueOnce({ A: { inProgress: false, lastSyncDate: new Date(T0 + 1000).toISOString() } });
    const listener = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" ids={['A', 'B']} onListen={listener} />
        <Status id="A" />
        <Status id="B" />
      </BankSyncProvider>,
    );
    await advance(0);

    expect(mockSyncStatus).toHaveBeenCalledTimes(1);
    expect(mockSyncStatus.mock.calls[0][0].sort()).toEqual(['A', 'B']);
    expect(screen.getByTestId('status-A')).toHaveTextContent('true');
    expect(screen.getByTestId('status-B')).toHaveTextContent('false');

    await pollTicks(1);
    expect(mockSyncStatus).toHaveBeenLastCalledWith(['A']);
    expect(screen.getByTestId('status-A')).toHaveTextContent('false');
    // This tab did not ask for it: the reloads run, no toast is shown.
    expect(listener).toHaveBeenCalledWith('A', { status: 'OK' });
    expect(toastCount()).toBe(0);
  });

  it('a discovered sync becomes this tab\'s once the user asks for it (joins, then gets the toast)', async () => {
    mockSyncStatus
      .mockResolvedValueOnce({ A: { inProgress: true } })
      .mockResolvedValueOnce({ A: { inProgress: false, lastSyncDate: new Date(T0 + 1000).toISOString() } });
    render(
      <BankSyncProvider>
        <Host name="list" ids={['A']} />
      </BankSyncProvider>,
    );
    await advance(0);

    await act(async () => { await handles.list.startSync('A'); });
    expect(mockSync).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalledWith('financeAccountsBankSyncInProgress');

    await pollTicks(1);
    expect(toastMock.success).toHaveBeenCalledWith('financeAccountsBankConnectionSyncDone');
  });

  it('does not read an account twice when a second host tracks it', async () => {
    mockSyncStatus.mockResolvedValue({ A: { inProgress: false } });
    const { rerender } = render(
      <BankSyncProvider>
        <Host name="list" ids={['A']} />
      </BankSyncProvider>,
    );
    await advance(0);
    rerender(
      <BankSyncProvider>
        <Host name="list" ids={['A']} />
        <Host name="detail" ids={['A']} />
      </BankSyncProvider>,
    );
    await advance(0);

    expect(mockSyncStatus).toHaveBeenCalledTimes(1);
  });

  it('retries accounts whose first status read failed on the next tracking change', async () => {
    mockSyncStatus
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ A: { inProgress: true }, B: { inProgress: false } });
    const { rerender } = render(
      <BankSyncProvider>
        <Host name="list" ids={['A']} />
        <Status id="A" />
      </BankSyncProvider>,
    );
    await advance(0);
    expect(mockSyncStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status-A')).toHaveTextContent('false');

    rerender(
      <BankSyncProvider>
        <Host name="list" ids={['A', 'B']} />
        <Status id="A" />
      </BankSyncProvider>,
    );
    await advance(0);

    expect(mockSyncStatus).toHaveBeenCalledTimes(2);
    expect(mockSyncStatus.mock.calls[1][0].sort()).toEqual(['A', 'B']);
    expect(screen.getByTestId('status-A')).toHaveTextContent('true');
  });

  it('does not take over an account this tab is already syncing', async () => {
    const pending = deferred();
    mockSync.mockReturnValue(pending.promise);
    const status = deferred();
    mockSyncStatus.mockReturnValueOnce(status.promise);
    const onDone = vi.fn();
    render(
      <BankSyncProvider>
        <Host name="list" ids={['A']} />
      </BankSyncProvider>,
    );

    await act(async () => { handles.list.startSync('A', { onDone }); });
    await act(async () => { status.resolve({ A: { inProgress: true } }); });
    await act(async () => { pending.resolve({ status: 'OK' }); });

    expect(onDone).toHaveBeenCalledWith({ status: 'OK' });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });
});

describe('without a provider', () => {
  it('useBankSync falls back to a private controller that still syncs', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    const onDone = vi.fn();
    const { result } = renderHook(() => useBankSync());

    await act(async () => { await result.current.startSync('A', { onDone }); });

    expect(mockSync).toHaveBeenCalledWith('A');
    expect(onDone).toHaveBeenCalledWith({ status: 'OK' });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it('two components without a provider do not share their state', async () => {
    const pending = deferred();
    mockSync.mockReturnValue(pending.promise);
    const one = renderHook(() => useBankSync());
    const two = renderHook(() => useBankSync());

    await act(async () => { one.result.current.startSync('A'); });
    expect(one.result.current.isSyncing('A')).toBe(true);
    expect(two.result.current.isSyncing('A')).toBe(false);
  });

  it('useBankSyncStatus reports "not syncing" outside a provider and for a missing id', () => {
    expect(renderHook(() => useBankSyncStatus('A')).result.current).toEqual({ syncing: false });
    render(
      <BankSyncProvider>
        <Status id="" />
      </BankSyncProvider>,
    );
    expect(screen.getByTestId('status-')).toHaveTextContent('false');
  });
});
