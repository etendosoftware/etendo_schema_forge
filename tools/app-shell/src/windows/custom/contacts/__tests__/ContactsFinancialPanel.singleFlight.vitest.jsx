// ETP-5255 / ETP-5263 regression — the contacts credit panel must save SINGLE-FLIGHT.
//
// The bug: `creditLimit` had TWO independent routes into the same save — the number input's
// native `onBlur`, and the 400 ms debounced `onBlur` that each +/- click armed. A "+" click
// followed by leaving the field inside that window fired the save twice, and both requests
// carried the SAME optimistic-locking `updated` token (the second was built before the first
// response had refreshed the version cache), so the server refused the second with 409
// `stale_record` — against a change the user had made 400 ms earlier. It only reproduced when
// the first PATCH outlasted the debounce, which is why it looked intermittent.
//
// These tests therefore assert REQUEST COUNTS and REQUEST BODIES under a deliberately slow
// server, not the presence of a timer. The predecessor of this file asserted the component's
// source text (`setTimeout(..., 400)`, `debounceRef` declared, …) and passed identically with
// the bug live and with it fixed — see CLAUDE.md on ETP-4958. Two guards are exercised
// separately, because either one alone would let the duplicate through at some latency:
//
//   1. `commit()` cancels a pending debounce before saving (blur cannot be raced by a timer);
//   2. `persistCreditTaxField` refuses to start a second PATCH while one is open, and QUEUES
//      the newer value instead of dropping it.
//
// The real `createApiFetch` runs underneath (via `@/test/realApiFetch.js`) with
// `globalThis.fetch` stubbed below it, so what is counted is what would hit the network.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('lucide-react', () => ({
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

// Only the QA F-1 cases below reach `useEntity`, whose save path reports through toasts.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../BillingPreferencesForm', () => ({ default: () => <div data-testid="billing-form" /> }));
vi.mock('../FiscalDefaultsSection', () => ({ default: () => <div data-testid="fiscal-defaults-section" /> }));

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests, rememberRecordVersion,
} from '@/test/realApiFetch.js';
// Derived, never guessed: ETP-5328 moved the box to `MaskedAmountInput`, whose idle display
// routes through the canonical `formatCurrency()`. Hardcoding "8.000,00" would bake this suite to
// one instance's separator configuration.
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useEntity } from '@/hooks/useEntity';
import ContactsFinancialPanel from '../ContactsFinancialPanel.jsx';

/** What the box SHOWS for a committed amount, once it is not being edited. */
const idleDisplay = (amount) => formatCurrency(undefined, amount);

const BP_ID = 'bp-1';
const READ_TOKEN = 'TOKEN-FROM-READ';
const INITIAL_CREDIT_LIMIT = 5000;

const defaultProps = {
  // Deliberately frozen: the parent never re-renders with a new `data` in these tests, which
  // is precisely the window in which the old code compared the draft against a stale prop.
  data: { id: BP_ID, creditLimit: INITIAL_CREDIT_LIMIT, creditUsed: 1000, active: true },
  token: 'test-token',
  apiBaseUrl: '/sws/neo/contacts',
  catalogs: {},
  api: {},
  // The credit fields are read-only outside edit mode, and a read-only field never persists.
  editing: true,
  onChange: vi.fn(),
};

/**
 * ETP-5328 replaced the raw `<input type="number">` with `MaskedAmountInput`, which renders
 * `type="text"` — the field no longer has the `spinbutton` role. Anchor on the testid the
 * component forwards instead of on an input type this helper has already been bitten by once.
 */
function creditLimitInput() {
  return screen.getByTestId('CreditLimitStepperInput');
}

function plusButton() {
  return screen.getByTestId('icon-plus').closest('button');
}

/**
 * A `fetch` double whose responses are released by the test, so a save can be held open for as
 * long as the scenario needs. This is what makes the race deterministic instead of latency-
 * dependent: the duplicate write only ever appeared while the first one was still in flight.
 */
function installPendingFetch() {
  const pending = [];
  globalThis.fetch = vi.fn(() => new Promise((resolve) => { pending.push(resolve); }));
  return {
    /** Releases the oldest open request with a NEO envelope echoing `record`. */
    async settleNext(record) {
      const resolve = pending.shift();
      if (!resolve) throw new Error('settleNext(): no request is open');
      await act(async () => {
        resolve(neoResponse([record]));
        await Promise.resolve();
      });
    },
    get openCount() { return pending.length; },
  };
}

/** Lets queued microtasks (the real `apiFetch` is async before it reaches `fetch`) run. */
async function flushMicrotasks() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  resetRecordVersionsForTests();
  vi.clearAllMocks();
  // Stands in for `useEntity`: it remembers the record with no path context (the null bucket).
  rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ContactsFinancialPanel — single-flight credit-limit save (ETP-5255)', () => {
  // THE regression. Two triggers, one save.
  it('issues exactly one PATCH when a "+" click is followed by a blur', async () => {
    vi.useFakeTimers();
    const server = installPendingFetch();

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.click(plusButton());   // arms the 400 ms debounce
    fireEvent.blur(creditLimitInput()); // and now the blur commits
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(writeCalls(globalThis.fetch)).toHaveLength(1);

    // Well past the debounce, and with the first PATCH still unanswered: the armed timer must
    // have been cancelled by `commit()`. Before the fix this is where the second write went out.
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(writeCalls(globalThis.fetch)).toHaveLength(1);
    expect(bodyOf(writeCalls(globalThis.fetch)[0]).creditLimit).toBe(INITIAL_CREDIT_LIMIT + 1);

    await server.settleNext({ id: BP_ID, creditLimit: INITIAL_CREDIT_LIMIT + 1 });
  });

  // The latency-independent half: even with no timer involved at all, a trigger arriving while
  // a save is open must not open a second one. `commit()`'s clearTimeout alone would not stop
  // this — the guard is the in-flight ref.
  it('issues no second PATCH when another blur arrives while the first save is open', async () => {
    const server = installPendingFetch();

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    fireEvent.blur(creditLimitInput());
    await flushMicrotasks();
    expect(writeCalls(globalThis.fetch)).toHaveLength(1);

    // The queued trigger carried no new value, so flushing it must stay a no-op rather than
    // replay the write.
    await server.settleNext({ id: BP_ID, creditLimit: 7000 });
    await flushMicrotasks();
    expect(writeCalls(globalThis.fetch)).toHaveLength(1);
  });

  // The property that must not be traded away to get the one above: a mid-flight edit is
  // DELAYED, never dropped. A "fix" that simply swallowed the second trigger would turn a
  // visible 409 into silent data loss.
  it('replays an edit made while a save was in flight, carrying the newer value', async () => {
    const server = installPendingFetch();

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    // The user keeps typing while the server is still thinking.
    fireEvent.change(creditLimitInput(), { target: { value: '8000' } });
    fireEvent.blur(creditLimitInput());
    await flushMicrotasks();
    expect(writeCalls(globalThis.fetch)).toHaveLength(1);

    await server.settleNext({ id: BP_ID, creditLimit: 7000 });

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(2));
    const calls = writeCalls(globalThis.fetch);
    expect(bodyOf(calls[0]).creditLimit).toBe(7000);
    expect(bodyOf(calls[1]).creditLimit).toBe(8000);
    // Sequential by construction — the replay starts only after the first one settled.
    expect(server.openCount).toBe(1);

    // And the value the user typed is still on screen: adopting the server's superseded 7000
    // would have silently reverted their edit.
    expect(creditLimitInput()).toHaveValue(idleDisplay(8000));
  });

  // The early return must compare against what the SERVER last confirmed, not against the
  // `data` prop. The prop still holds 5000 here (the parent never re-rendered), so a
  // prop-based comparison sees a difference that is already persisted and writes again.
  it('sends nothing when the field is re-committed at its last persisted value', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{ id: BP_ID, creditLimit: 7000 }])));

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    fireEvent.blur(creditLimitInput());
    await flushMicrotasks();

    expect(writeCalls(globalThis.fetch)).toHaveLength(1);
  });

  it('does not save when the panel unmounts before a pending debounce fires', async () => {
    vi.useFakeTimers();
    installPendingFetch();

    const { unmount } = render(<ContactsFinancialPanel {...defaultProps} />);
    fireEvent.click(plusButton());
    unmount();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(writeCalls(globalThis.fetch)).toHaveLength(0);
  });

  // `saving` reports progress but must NOT lock the input: freezing it mid-save is how the
  // keystroke the user has already typed gets dropped.
  it('marks the stepper busy while a save is open without locking the input', async () => {
    const server = installPendingFetch();

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    await waitFor(() => expect(creditLimitInput().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true'));
    // `saving` must not lock the field — freezing it mid-save would drop a keystroke the user
    // has already typed. ETP-5328 moved the lock from `readOnly` to `disabled`, so assert the
    // property that now carries that meaning rather than the attribute that no longer exists.
    expect(creditLimitInput()).not.toBeDisabled();

    fireEvent.change(creditLimitInput(), { target: { value: '8000' } });
    expect(creditLimitInput()).toHaveValue(idleDisplay(8000));

    await server.settleNext({ id: BP_ID, creditLimit: 7000 });
    await waitFor(() => expect(creditLimitInput().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
  });

  // A refused write returns the field to the last confirmed value, and does not chain the
  // queued follow-up onto the rejection (it would only replay the same refused token).
  it('reverts to the last persisted value when the server refuses the write', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([], { ok: false, status: 409 })));

    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    await waitFor(() => expect(creditLimitInput()).toHaveValue(idleDisplay(INITIAL_CREDIT_LIMIT)));
    expect(writeCalls(globalThis.fetch)).toHaveLength(1);
  });
});

// ETP-5255 (QA F-1) — an autosaved credit limit must reach the header as SAVED, not as an edit.
//
// After each successful autosave the panel used to call `onChange(fieldKey, value)`, which
// DetailView routes to `useEntity.handleChange`. That writes `editing` only, so the header saw
// `editing.creditLimit !== selected.creditLimit`: "Guardar" stayed enabled after the panel had
// already stored the value, and its PATCH re-sent `creditLimit`. Clicked while the NEXT autosave
// was still in flight, that re-send carried the superseded value; the core's per-record write
// chain queued it behind the autosave, sent it with the refreshed `updated`, and the server
// accepted it — silently reverting the user's last click.

/** Types a credit limit and leaves the box — the same `persist` path each +/- click arms. */
function commitCreditLimit(value) {
  fireEvent.change(creditLimitInput(), { target: { value: String(value) } });
  fireEvent.blur(creditLimitInput());
}

describe('ContactsFinancialPanel — reports an autosave as persisted (ETP-5255, QA F-1)', () => {
  it('calls onPersisted with the value the server stored, and not onChange', async () => {
    // The server normalises what it is sent: the header must adopt what is STORED.
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{ id: BP_ID, creditLimit: 6999 }])));
    const onChange = vi.fn();
    const onPersisted = vi.fn();

    render(<ContactsFinancialPanel {...defaultProps} onChange={onChange} onPersisted={onPersisted} />);
    commitCreditLimit(7000);

    await waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(1));
    expect(onPersisted).toHaveBeenCalledWith({ creditLimit: 6999 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to onChange when the host provides no onPersisted', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{ id: BP_ID, creditLimit: 7000 }])));
    const onChange = vi.fn();

    render(<ContactsFinancialPanel {...defaultProps} onChange={onChange} />);
    commitCreditLimit(7000);

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith('creditLimit', 7000);
  });

  it('reports nothing when the server refuses the write', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([], { ok: false, status: 409 })));
    const onChange = vi.fn();
    const onPersisted = vi.fn();

    render(<ContactsFinancialPanel {...defaultProps} onChange={onChange} onPersisted={onPersisted} />);
    commitCreditLimit(7000);

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    await flushMicrotasks();
    expect(onPersisted).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * The observable property, with the REAL `useEntity` and the REAL `apiFetch` wired exactly the way
 * DetailView wires a primary-tab panel: `data`/`editing` = `hook.editing`, `onChange` =
 * `hook.handleChange`, `onPersisted` = `hook.applyPersistedFields`.
 */
describe('ContactsFinancialPanel + useEntity — an autosave leaves the header clean (QA F-1)', () => {
  const RECORD = {
    id: BP_ID,
    name: 'Acme',
    creditLimit: 0,
    creditUsed: 0,
    active: true,
    etgoWeb: 'https://old.example',
    updated: READ_TOKEN,
  };

  /**
   * Reads answer at once with the current record; writes are merged into it but stay open until
   * the test releases them. Holding a write open is what makes the F-1 race deterministic.
   */
  function installRecordServer() {
    const pending = [];
    let current = { ...RECORD };
    let version = 1;
    globalThis.fetch = vi.fn((url, opts) => {
      const method = String(opts?.method || 'GET').toUpperCase();
      if (method !== 'PATCH' && method !== 'PUT') return Promise.resolve(neoResponse([current]));
      return new Promise((resolve) => {
        pending.push(() => {
          version += 1;
          current = { ...current, ...JSON.parse(opts.body), updated: `v${version}` };
          resolve(neoResponse([current]));
        });
      });
    });
    return {
      async settleNext() {
        const release = pending.shift();
        if (!release) throw new Error('settleNext(): no write is open');
        await act(async () => {
          release();
          await Promise.resolve();
        });
      },
      get openCount() { return pending.length; },
    };
  }

  /** Stands in for DetailView's primary-tab mount; `hookRef` exposes the live hook. */
  function Host({ hookRef }) {
    const hook = useEntity('businessPartner', null, {
      token: 'test-token',
      apiBaseUrl: defaultProps.apiBaseUrl,
      skipListFetch: true,
    });
    hookRef.current = hook;
    if (!hook.editing) return null;
    return (
      <ContactsFinancialPanel
        data={hook.editing}
        token="test-token"
        apiBaseUrl={defaultProps.apiBaseUrl}
        catalogs={{}}
        api={{}}
        editing={hook.editing}
        onChange={hook.handleChange}
        onLocalChange={hook.handleChange}
        onPersisted={hook.applyPersistedFields}
      />
    );
  }

  function mountHost() {
    const hookRef = { current: null };
    render(<Host hookRef={hookRef} />);
    act(() => { hookRef.current.handleSelect(RECORD); });
    return hookRef;
  }

  it('keeps "Save" disabled after each autosave', async () => {
    const server = installRecordServer();
    const hookRef = mountHost();

    commitCreditLimit(1);
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    await server.settleNext();
    await waitFor(() => expect(hookRef.current.editing.creditLimit).toBe(1));
    expect(hookRef.current.isDirtyHeader).toBe(false);
    expect(hookRef.current.dirtyHeaderFieldKeys).not.toContain('creditLimit');

    commitCreditLimit(2);
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(2));
    await server.settleNext();
    await waitFor(() => expect(hookRef.current.editing.creditLimit).toBe(2));
    expect(hookRef.current.isDirtyHeader).toBe(false);
  });

  // The exact QA timeline: another field is legitimately dirty, the user clicks "Guardar" while
  // the second autosave is in flight. Before the fix the header PATCH carried `creditLimit: 1`,
  // was queued behind the autosave of 2, and reverted it.
  it('does not re-send the credit limit when "Save" races an in-flight autosave', async () => {
    const server = installRecordServer();
    const hookRef = mountHost();

    act(() => { hookRef.current.handleChange('etgoWeb', 'https://new.example'); });

    commitCreditLimit(1);
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    await server.settleNext();
    await waitFor(() => expect(hookRef.current.editing.creditLimit).toBe(1));

    commitCreditLimit(2);
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(2));
    expect(server.openCount).toBe(1); // the autosave of 2 is still in flight

    let savePromise;
    act(() => { savePromise = hookRef.current.handleSave({ silent: true }); });
    await flushMicrotasks();

    await server.settleNext(); // autosave of 2 returns; the queued header save now leaves
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(3));
    await server.settleNext();
    await act(async () => { await savePromise; });

    const calls = writeCalls(globalThis.fetch);
    expect(bodyOf(calls[1]).creditLimit).toBe(2);
    const headerSave = bodyOf(calls[2]);
    expect(headerSave.etgoWeb).toBe('https://new.example');
    expect(headerSave).not.toHaveProperty('creditLimit');

    await waitFor(() => expect(hookRef.current.editing.creditLimit).toBe(2));
    expect(hookRef.current.isDirtyHeader).toBe(false);
  });
});
