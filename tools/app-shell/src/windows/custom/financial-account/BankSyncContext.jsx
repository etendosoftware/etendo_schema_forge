import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useUI } from '@/i18n';
import { useBankConnectionActions } from '@/hooks/useBankConnectionActions.js';
import { notifyBankSyncError, notifyBankSyncResult } from './bankSyncNotify.js';

/**
 * ETP-6154 — shared PSD2 bank-sync state for the Financial Account window.
 *
 * WHY IT EXISTS. A sync can be started from four places — the list row's sync button, the row
 * kebab's "Sincronizar ahora", the Imported statements toolbar and the Edit account modal — and
 * each one used to fire its own request with no idea the others existed (two of them had no busy
 * state at all). Double clicks and a second entry point launched concurrent syncs of the same
 * account, which the backend now refuses with a per-account lock (IN_PROGRESS). This provider is
 * the single client-side owner of "is this account syncing?", so every entry point disables and
 * spins together, and a second request never leaves the browser.
 *
 * LIFECYCLE of one account:
 *   startSync → [beforeSync] → POST ?action=sync
 *     ├─ OK / WARNING / ERROR → finish: callbacks + one result toast
 *     ├─ IN_PROGRESS (another user, tab or the scheduled process holds the lock) → info toast, poll
 *     └─ BANK_CONNECTION_TIMEOUT (45 s, the bridge kept working) → poll silently
 *   poll: GET ?action=syncStatus every 3 s, paused while the browser tab is hidden, abandoned after
 *   10 minutes → finish with what `resultOfFinishedSync` can tell (or no toast when it cannot).
 *
 * DISCOVERY. Hosts declare the bank-connected accounts on screen (`useBankSyncTracking`); the first
 * time an id is seen its status is read, so a page reload in the middle of a sync still shows it
 * as running and resumes the polling. A sync discovered that way finishes SILENTLY (no toast — this
 * tab did not ask for it), but its reloads still run.
 *
 * WHO RELOADS WHAT. When a sync finishes, the per-call `onDone` callbacks of the components that
 * asked for it (or joined it) and are still mounted run; only when there is none do the host
 * listeners (`useBankSyncDone`) run instead. So each reload runs once: the modal refreshes itself
 * and calls its own `onSaved`, the statements tab refreshes its statements and the account, and a
 * row click — which passes no `onDone` — falls through to the list's own reload.
 *
 * WITHOUT A PROVIDER (a component rendered on its own, as unit tests do), `useBankSync()` falls
 * back to a private controller owned by the calling component: the same behaviour, only not shared
 * with siblings. Read-only consumers (`useBankSyncStatus`) report "not syncing".
 */

/** Delay between two status polls of a pending sync. */
export const BANK_SYNC_POLL_INTERVAL_MS = 3000;
/** A pending sync stops being polled (and stops spinning) after this long. */
export const BANK_SYNC_POLL_GIVE_UP_MS = 10 * 60 * 1000;
/** Consecutive failed status reads after which a pending sync is abandoned. */
export const BANK_SYNC_POLL_MAX_FAILURES = 3;

const BANK_CONNECTION_TIMEOUT = 'BANK_CONNECTION_TIMEOUT';

const BankSyncContext = createContext(null);

const NOT_SYNCING = Object.freeze({ syncing: false });

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function useDocumentHidden() {
  const [hidden, setHidden] = useState(isDocumentHidden);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setHidden(isDocumentHidden());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

/** Calls `fn` and swallows whatever it throws or rejects with: a reload must not break the rest. */
function runSafely(fn, ...args) {
  try {
    const out = fn(...args);
    if (out && typeof out.catch === 'function') out.catch(() => {});
  } catch {
    // ignored on purpose — see above
  }
}

/** Tolerance for the clock difference between this browser and the server. */
const CLOCK_SKEW_MS = 60 * 1000;

function isAtOrAfter(timestamp, startedAt) {
  const t = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(t) && t >= startedAt - CLOCK_SKEW_MS;
}

/**
 * What a polled sync ended with, as a `notifyBankSyncResult` input — or null when it cannot be told.
 *
 * `lastResult` is NOT the outcome of our import: the bridge reads it from the Salt Edge
 * connection's fetch health (its last success / last failure), so it may describe an older fetch.
 * It is trusted only when it is at least as recent as the start of this sync; otherwise a
 * `lastSyncDate` that moved since then means the import ran. Neither → unknown: no toast, and the
 * reloads that follow show whatever did land. Instants, not calendar days — no timezone pitfall.
 *
 * @param {{lastSyncDate?: string, lastResult?: {status?: string, message?: string, at?: string}}} state
 * @param {number} startedAt epoch ms this tab started (or discovered) the sync
 * @returns {{status: string, message?: string}|null}
 */
export function resultOfFinishedSync(state, startedAt) {
  const last = state?.lastResult;
  if (last?.status && isAtOrAfter(last.at, startedAt)) return { status: last.status, message: last.message };
  if (isAtOrAfter(state?.lastSyncDate, startedAt)) return { status: 'OK' };
  return null;
}

function withId(list, id) {
  return list.includes(id) ? list : [...list, id];
}

function withoutId(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : list;
}

/**
 * The state machine behind the provider (and behind the provider-less fallback). Exported for the
 * tests; components use `BankSyncProvider` / `useBankSync`.
 */
export function useBankSyncController() {
  const ui = useUI();
  const { sync, syncStatus } = useBankConnectionActions();
  // Refs, so the callbacks below stay stable across renders (the list builds its row actions once).
  const depsRef = useRef({ ui, sync, syncStatus });
  depsRef.current = { ui, sync, syncStatus };

  // id → { requested, startedAt, failures, timedOut, waiters: [{ fn, isAlive }] }
  const entriesRef = useRef(new Map());
  const listenersRef = useRef(new Set());
  const trackedRef = useRef(new Map()); // id → number of hosts tracking it
  const checkedRef = useRef(new Set()); // ids whose status was already read once
  const [syncingIds, setSyncingIds] = useState([]);
  const [pollIds, setPollIds] = useState([]);
  const [trackVersion, setTrackVersion] = useState(0);
  const [pollTick, setPollTick] = useState(0);
  const hidden = useDocumentHidden();

  const canPoll = () => typeof depsRef.current.syncStatus === 'function';

  const begin = useCallback((id, entry) => {
    entriesRef.current.set(id, entry);
    setSyncingIds((prev) => withId(prev, id));
  }, []);

  const drop = useCallback((id) => {
    const entry = entriesRef.current.get(id);
    entriesRef.current.delete(id);
    setSyncingIds((prev) => withoutId(prev, id));
    setPollIds((prev) => withoutId(prev, id));
    return entry;
  }, []);

  /**
   * Ends a sync: clears its state, runs its callbacks, then (when this tab asked for it) shows the
   * one result toast. `result: null` means "ended without a result worth announcing".
   */
  const finish = useCallback((id, result, { runCallbacks = true, error = null } = {}) => {
    const entry = drop(id);
    if (!entry) return;
    if (runCallbacks) {
      const waiters = entry.waiters.filter((w) => w.isAlive());
      if (waiters.length > 0) {
        waiters.forEach((w) => runSafely(w.fn, result));
      } else {
        listenersRef.current.forEach((l) => {
          if (!l.accountId || l.accountId === id) runSafely(l.cb, id, result);
        });
      }
    }
    if (!entry.requested) return;
    if (error) notifyBankSyncError(error, depsRef.current.ui);
    else if (result) notifyBankSyncResult(result, depsRef.current.ui);
  }, [drop]);

  const startPolling = useCallback((id) => {
    setPollIds((prev) => withId(prev, id));
  }, []);

  /**
   * Starts a sync of `accountId`, unless one is already running for it — in which case no request
   * is sent: the caller's `onDone` joins the running one and an info toast says so.
   *
   * @param {string} accountId
   * @param {{
   *   beforeSync?: () => Promise<void>,
   *   onDone?: (result: object|null) => void,
   *   isAlive?: () => boolean,
   * }} [options] `beforeSync` runs first and aborts the sync by throwing (an error carrying
   *   `handled: true` was already reported, so it is not toasted again); `onDone` runs when the
   *   sync finishes, however long that takes; `isAlive` drops `onDone` once its owner unmounted
   * @returns {Promise<object|null>} the bridge's answer to THIS request (`IN_PROGRESS` while it keeps
   *   running in the background), or null when no answer came
   */
  const startSync = useCallback(async (accountId, { beforeSync, onDone, isAlive } = {}) => {
    if (!accountId) return null;
    const waiter = onDone ? { fn: onDone, isAlive: isAlive ?? (() => true) } : null;
    const running = entriesRef.current.get(accountId);
    if (running) {
      if (waiter) running.waiters.push(waiter);
      running.requested = true;
      notifyBankSyncResult({ status: 'IN_PROGRESS' }, depsRef.current.ui);
      return { status: 'IN_PROGRESS' };
    }
    const entry = {
      requested: true, startedAt: Date.now(), failures: 0, timedOut: false,
      waiters: waiter ? [waiter] : [],
    };
    begin(accountId, entry);

    try {
      await beforeSync?.();
    } catch (err) {
      // Nothing was sent: no callbacks (nothing changed on the bank side).
      drop(accountId);
      if (!err?.handled) notifyBankSyncError(err, depsRef.current.ui);
      return null;
    }

    let res;
    try {
      res = await depsRef.current.sync(accountId);
    } catch (err) {
      // The 45 s client timeout does not stop the bridge: the sync keeps running server side, so
      // keep the account "in progress" and learn the outcome from the status endpoint.
      if (err?.message === BANK_CONNECTION_TIMEOUT && canPoll()) {
        entry.timedOut = true;
        startPolling(accountId);
        return null;
      }
      finish(accountId, null, { runCallbacks: false, error: err });
      return null;
    }

    if (res?.status === 'IN_PROGRESS') {
      notifyBankSyncResult(res, depsRef.current.ui);
      if (canPoll()) {
        startPolling(accountId);
      } else {
        drop(accountId);
      }
      return res;
    }
    finish(accountId, res);
    return res;
  }, [begin, drop, finish, startPolling]);

  // ── Polling ────────────────────────────────────────────────────────────────────────────────
  const pollKey = pollIds.join(',');
  useEffect(() => {
    if (!pollKey || hidden) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ids = pollKey.split(',');
      let accounts = null;
      try {
        accounts = await depsRef.current.syncStatus(ids);
      } catch {
        accounts = null;
      }
      if (cancelled) return;
      const now = Date.now();
      ids.forEach((id) => {
        const entry = entriesRef.current.get(id);
        if (!entry) return;
        const state = accounts ? accounts[id] : undefined;
        if (accounts && state && state.inProgress !== true) {
          finish(id, resultOfFinishedSync(state, entry.startedAt));
          return;
        }
        // Unreadable (omitted) or a failed read: give it a few tries before letting go.
        if (!accounts || !state) entry.failures += 1;
        else entry.failures = 0;
        const gaveUp = now - entry.startedAt > BANK_SYNC_POLL_GIVE_UP_MS
          || entry.failures >= BANK_SYNC_POLL_MAX_FAILURES;
        if (!gaveUp) return;
        // The outcome is unknown. A request that timed out keeps the timeout message it always
        // had; anything else just stops spinning. Reloads still run: something may have landed.
        if (entry.timedOut) {
          finish(id, null, { error: new Error(BANK_CONNECTION_TIMEOUT) });
        } else {
          finish(id, null);
        }
      });
      setPollTick((n) => n + 1);
    }, BANK_SYNC_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollKey, hidden, pollTick, finish]);

  // ── Discovery of syncs already running (page reload, another user, the scheduled process) ──
  useEffect(() => {
    if (!canPoll()) return undefined;
    const fresh = [...trackedRef.current.keys()].filter((id) => !checkedRef.current.has(id));
    if (fresh.length === 0) return undefined;
    fresh.forEach((id) => checkedRef.current.add(id));
    // No cancellation on purpose: these ids are already marked as checked, so dropping the answer
    // because another host started tracking meanwhile would lose them for good. Applying it late
    // is harmless — `begin` skips an account this tab is already syncing.
    depsRef.current.syncStatus(fresh).then((accounts) => {
      if (!accounts) return;
      fresh.forEach((id) => {
        if (accounts[id]?.inProgress !== true || entriesRef.current.has(id)) return;
        begin(id, {
          requested: false, startedAt: Date.now(), failures: 0, timedOut: false, waiters: [],
        });
        startPolling(id);
      });
    }).catch(() => {
      // Let a later tracking change retry these ids.
      fresh.forEach((id) => checkedRef.current.delete(id));
    });
    return undefined;
  }, [trackVersion, begin, startPolling]);

  // id → display name, as the hosts declared it through `track` (the provider only sees ids
  // otherwise). Kept after a host stops tracking: a sync can outlive the screen that started it.
  const [names, setNames] = useState({});

  const track = useCallback((entries) => {
    const normalized = (entries || [])
      .map((e) => (typeof e === 'string' ? { id: e, name: null } : { id: e?.id, name: e?.name ?? null }))
      .filter((e) => e.id);
    const named = normalized.filter((e) => e.name);
    if (named.length > 0) {
      setNames((prev) => (named.every((e) => prev[e.id] === e.name)
        ? prev
        : { ...prev, ...Object.fromEntries(named.map((e) => [e.id, e.name])) }));
    }
    const list = normalized.map((e) => e.id);
    let added = false;
    list.forEach((id) => {
      const n = trackedRef.current.get(id) ?? 0;
      if (n === 0) added = true;
      trackedRef.current.set(id, n + 1);
    });
    if (added) setTrackVersion((v) => v + 1);
    return () => {
      list.forEach((id) => {
        const n = (trackedRef.current.get(id) ?? 1) - 1;
        if (n <= 0) trackedRef.current.delete(id);
        else trackedRef.current.set(id, n);
      });
    };
  }, []);

  const subscribe = useCallback((accountId, cb) => {
    const listener = { accountId: accountId || null, cb };
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const syncingKey = syncingIds.join(',');
  const isSyncing = useCallback(
    (accountId) => Boolean(accountId) && syncingIds.includes(accountId),
    // `syncingKey` stands for `syncingIds`: a new array with the same ids must not rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncingKey],
  );

  // What the "syncing" banners list: every running sync, with the name a host declared for it
  // (null when no host named it — the banner then falls back to a generic sentence).
  const syncingAccounts = useMemo(
    () => syncingIds.map((id) => ({ id, name: names[id] ?? null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncingKey, names],
  );

  return useMemo(
    () => ({ isSyncing, syncingAccounts, startSync, track, subscribe }),
    [isSyncing, syncingAccounts, startSync, track, subscribe],
  );
}

/**
 * Mount ONCE at the root of the Financial Account window, so the list, the detail tabs and the
 * Edit account modal share one bank-sync state.
 */
export function BankSyncProvider({ children }) {
  const controller = useBankSyncController();
  return <BankSyncContext.Provider value={controller}>{children}</BankSyncContext.Provider>;
}

/**
 * The bank-sync controller: `isSyncing(id)`, `syncingAccounts` ([{id, name}]),
 * `startSync(id, options)`, `track(ids | [{id, name}])`, `subscribe(accountId, cb)`. Reads the window's provider; without one, falls back to a controller
 * private to the calling component (see the module comment).
 *
 * The `startSync` returned here binds `onDone` to the caller's lifetime: once the caller unmounts,
 * its `onDone` is dropped and the host listeners take over.
 */
export function useBankSync() {
  const shared = useContext(BankSyncContext);
  const fallback = useBankSyncController();
  const controller = shared ?? fallback;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const { startSync: rawStartSync } = controller;
  const startSync = useCallback(
    (accountId, options = {}) => rawStartSync(accountId, {
      ...options,
      isAlive: () => mountedRef.current,
    }),
    [rawStartSync],
  );
  return useMemo(() => ({ ...controller, startSync }), [controller, startSync]);
}

/**
 * Read-only: is `accountId` syncing right now? For the many small consumers (one per list row)
 * that only render the state — no fallback controller, no request. Outside a provider it is
 * always "not syncing".
 *
 * @param {string|null|undefined} accountId
 * @returns {{ syncing: boolean }}
 */
export function useBankSyncStatus(accountId) {
  const shared = useContext(BankSyncContext);
  if (!shared || !accountId) return NOT_SYNCING;
  return { syncing: shared.isSyncing(accountId) };
}

/**
 * Declares the bank-connected accounts a host has on screen, so a sync already running for any of
 * them (page reload, another user, the scheduled process) is found and followed. Passing
 * `{ id, name }` entries also names them for the "syncing" banners (`syncingAccounts`).
 *
 * @param {{ track: Function }} bankSync the controller from `useBankSync()`
 * @param {Array<string|{id: string, name?: string}>} accounts
 */
export function useBankSyncTracking(bankSync, accounts) {
  const { track } = bankSync;
  const entries = (accounts || [])
    .map((a) => (typeof a === 'string' ? { id: a, name: null } : { id: a?.id, name: a?.name || null }))
    .filter((a) => a.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  // A stable string, so a new array with the same accounts does not re-track.
  const key = entries.length > 0 ? JSON.stringify(entries.map((a) => [a.id, a.name])) : '';
  useEffect(
    () => (key ? track(JSON.parse(key).map(([id, name]) => ({ id, name }))) : undefined),
    [track, key],
  );
}

/**
 * Host-level reload for finished syncs nobody else reloads for (see "WHO RELOADS WHAT").
 *
 * @param {{ subscribe: Function }} bankSync the controller from `useBankSync()`
 * @param {string|null} accountId only this account's syncs; null for every account
 * @param {(accountId: string, result: object|null) => void} onDone
 */
export function useBankSyncDone(bankSync, accountId, onDone) {
  const { subscribe } = bankSync;
  const cbRef = useRef(onDone);
  cbRef.current = onDone;
  useEffect(
    () => subscribe(accountId, (id, result) => cbRef.current?.(id, result)),
    [subscribe, accountId],
  );
}
