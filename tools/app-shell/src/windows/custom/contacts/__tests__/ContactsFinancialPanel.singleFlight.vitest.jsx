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

vi.mock('../BillingPreferencesForm', () => ({ default: () => <div data-testid="billing-form" /> }));
vi.mock('../FiscalDefaultsSection', () => ({ default: () => <div data-testid="fiscal-defaults-section" /> }));

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests, rememberRecordVersion,
} from '@/test/realApiFetch.js';
import ContactsFinancialPanel from '../ContactsFinancialPanel.jsx';

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

function creditLimitInput() {
  return screen.getAllByRole('spinbutton')[0];
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
    expect(creditLimitInput()).toHaveValue(8000);
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
    expect(creditLimitInput()).not.toHaveAttribute('readonly');

    fireEvent.change(creditLimitInput(), { target: { value: '8000' } });
    expect(creditLimitInput()).toHaveValue(8000);

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

    await waitFor(() => expect(creditLimitInput()).toHaveValue(INITIAL_CREDIT_LIMIT));
    expect(writeCalls(globalThis.fetch)).toHaveLength(1);
  });
});
