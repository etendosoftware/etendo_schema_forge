import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBulkRowDelete } from '../useBulkRowDelete';

/**
 * ETP-4656 — grid multi-select bulk delete hook.
 * Mirrors useRowDelete.vitest.jsx's conventions (same styled confirm dialog,
 * same mock shape for @/i18n / @/auth/api / @/hooks/useEntity).
 */
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// `ui('bulkDeleteConfirmMessage', { count })` and the three outcome-toast keys
// need real interpolation to assert the rendered/toasted text — same
// param-substitution convention used across the suite (e.g. useEntity.helpers.vitest.jsx).
// Wording mirrors the ETP-4656 Confluence design doc's 3-outcome table: one
// combined toast per outcome (all-succeed / partial-failure / all-fail), not
// two stacked success+error toasts.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      bulkDeleteConfirmTitle: 'Delete records',
      bulkDeleteConfirmMessage: 'Are you sure you want to delete {count} record(s)? This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
      bulkDeleteAllSucceeded: '{count} record(s) deleted successfully.',
      bulkDeletePartialFailure: '{succeeded} of {total} record(s) deleted. {failed} could not be deleted.',
      bulkDeleteAllFailed: 'None of the {count} selected record(s) could be deleted.',
      // ETP-5111 — the two account-delete blocker sentences the tests below exercise. Present so
      // the reason assertion goes through the REAL translation path (`translateAccountDeleteBlocked`
      // recognises the "Cannot delete this account. " prefix and answers with ONE generic
      // sentence) instead of silently landing on its untranslated fallback — which is what the
      // user would read if the key were missing, and therefore not what to assert against.
      //
      // One key, not nine: the backend lists every applicable blocker and the toast used to
      // concatenate all of them, which read as a system dump of near-identical sentences the user
      // could not act on differently. Collapsed by the user's own call, which is also the generic
      // error the ticket's acceptance criteria asked for on this surface.
      'backendError.accountHasLinkedRecords': 'Esta cuenta tiene registros vinculados, así que no se puede eliminar.',
    };
    let text = map[key] || key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  },
}));

vi.mock('@/auth/api', () => ({
  authHeaders: (t) => ({ 'Accept-Language': 'es_ES', ...(t ? { Authorization: `Bearer ${t}` } : {}) }),
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Accept-Language': 'es_ES' }),
}));

// ETP-5111 — the fallback now mirrors the REAL `extractErrorMessage`, which never returns null:
// when it cannot find a message anywhere in the body it returns `` `${ui('error')} ${res.status}` ``
// (useEntity.js), i.e. "Error 409". That difference used to be invisible, because the error's
// message was never shown to anyone; now that a single-record failure surfaces the message
// verbatim, an unfaithful mock here would hide what the user actually reads. Every pre-existing
// test below supplies `body.message`, so this only affects the message-less case.
vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: async (res) => {
    try {
      const body = await res.json();
      if (body.message) return body.message;
    } catch { /* body not JSON */ }
    return `Error ${res.status}`;
  },
}));

describe('useBulkRowDelete', () => {
  const defaultOpts = {
    apiBaseUrl: 'http://localhost/api',
    entity: 'header',
    token: 'test-token',
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns requestBulkDelete, bulkDeleteDialog and deleting', () => {
    const { result } = renderHook(() => useBulkRowDelete(defaultOpts));
    expect(typeof result.current.requestBulkDelete).toBe('function');
    expect(result.current.bulkDeleteDialog).toBeDefined();
    expect(result.current.deleting).toBe(false);
  });

  it('ignores an empty selection (no id-bearing rows)', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{}, null])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('filters out rows without an id before opening the dialog', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'r1' }, {}, { id: 'r2' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    // 2 of the 3 rows have an id -> count interpolates to 2.
    expect(screen.getByText(/delete 2 record\(s\)/)).toBeInTheDocument();
  });

  it('shows the confirm dialog with the selection count interpolated', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.getByText('Delete records')).toBeInTheDocument();
    expect(screen.getByText(/delete 3 record\(s\)/)).toBeInTheDocument();
  });

  it('all rows succeed: issues one DELETE per row, toasts success, and reports back via onSuccess', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/a',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/b',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'a' }, { id: 'b' }],
      [],
    );
    // Dialog closes after a fully-successful batch.
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('partial failure: fires ONE combined warning toast (not stacked success+error), and reports succeeded/failed separately', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/b')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'FK violation' }),
        });
      }
      return Promise.resolve({ ok: true });
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.warning).toHaveBeenCalledWith('1 of 2 record(s) deleted. 1 could not be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'a' }],
      [{ id: 'b' }],
    );
  });

  it('all rows fail: only the error toast fires and onSuccess reports every row as failed', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'FK violation' }),
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('None of the 2 selected record(s) could be deleted.');
    expect(onSuccess).toHaveBeenCalledWith(
      [],
      [{ id: 'a' }, { id: 'b' }],
    );
  });

  it('disables the confirm/cancel buttons while the batch is in flight', async () => {
    let resolveFetch;
    globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(screen.getByTestId('bulk-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__bulk-delete-cancel')).toBeDisabled();

    // Let the pending fetch resolve so the test doesn't leak into the next one.
    await act(async () => { resolveFetch({ ok: true }); });
  });

  it('closing the dialog without confirming does not issue any DELETE calls', async () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('Button__bulk-delete-cancel')); });

    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(defaultOpts.onSuccess).not.toHaveBeenCalled();
  });

  // ── ETP-4656 QA pass: single-row selection, large selections, mixed
  // network/HTTP failures, and double-submit protection ──────────────────

  it('single-row selection behaves the same as the N-row case (no special-casing divergence)', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'solo' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    // Singular count still renders through the same "{count} record(s)" copy.
    expect(screen.getByText(/delete 1 record\(s\)/)).toBeInTheDocument();
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/solo',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('1 record(s) deleted successfully.');
    expect(onSuccess).toHaveBeenCalledWith([{ id: 'solo' }], []);
  });

  it('large selection: issues one DELETE per row (no silent batching/truncation) and reports every row back', async () => {
    const ROWS = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}` }));
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete(ROWS)}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(globalThis.fetch).toHaveBeenCalledTimes(60);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('60 record(s) deleted successfully.');
    expect(onSuccess).toHaveBeenCalledWith(ROWS, []);
  });

  it('preserves per-row succeeded/failed attribution when requests resolve out of order (slower row settles first)', async () => {
    // Row 'a' is deliberately the slowest to resolve, 'b' and 'c' settle
    // sooner — Promise.allSettled must still map each outcome back to the
    // correct original row by index, not by resolution order.
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/a')) {
        // Extra microtask hops (no real timers involved) so 'a' settles a
        // few ticks after 'b'/'c' without relying on wall-clock delay.
        return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(
          () => ({ ok: false, json: async () => ({ message: 'FK violation' }) }),
        );
      }
      return Promise.resolve({ ok: true });
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'b' }, { id: 'c' }],
      [{ id: 'a' }],
    );
  });

  it('mixes a thrown network error on one row with an HTTP 4xx failure on another in the same batch', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/a')) return Promise.reject(new Error('Network error'));
      if (url.endsWith('/b')) {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'FK violation' }) });
      }
      return Promise.resolve({ ok: true }); // 'c' succeeds
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    // Both the network-thrown row and the HTTP-4xx row land in `failed`,
    // regardless of which failure mode produced them — and still collapse into
    // the single partial-failure warning toast, not stacked success+error ones.
    expect(toast.warning).toHaveBeenCalledWith('1 of 3 record(s) deleted. 2 could not be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'c' }],
      [{ id: 'a' }, { id: 'b' }],
    );
  });

  /**
   * ETP-5111 — the backend's REASON on the generic ListView bulk-delete path.
   *
   * Retiring `ListView`'s `isRowDeletable` removed the pre-emptive tooltip that used to explain an
   * ineligible selection, which left this hook's toast as the ONLY place a refusal can be
   * explained — and it could not explain anything, because it attached no `status` to the error and
   * forwarded no `errors` to `toastBatchDeleteOutcome`. Both are now wired
   * (`err.status = res.status`; `{ succeeded, failed, errors, total }`), so every `ListView` window
   * starts surfacing backend reasons for a single-record failure.
   *
   * Two things make this block load-bearing rather than a duplicate of `batchDelete.vitest.js`:
   *   1. it is a SECOND consumer of the `total === 1` rule, on a different code path, so the rule
   *      is pinned here independently instead of by inheritance;
   *   2. `commonFailureReason`'s guards are only reachable at all if the status really travels —
   *      test (a) below fails with a bare counter if either half of the fix is reverted.
   *
   * The reason is asserted as its TRANSLATED text, because the Cuentas 409 is a dynamic
   * concatenation (`"Cannot delete this account. " + String.join(" ", blockers)`) that no exact-text
   * map entry could ever match: `translateAccountDeleteBlocked` peels each known blocker sentence
   * off the prefix and translates them individually. Asserting the Spanish output is what proves
   * that path runs — asserting the raw English would also pass if translation silently fell back.
   */
  describe('backend reason on a failed bulk delete (ETP-5111)', () => {
    /**
     * The real shape `FinancialAccountHandler.deleteAccount` answers a blocked delete with. FOUR
     * blockers on purpose, the way a real account produces them — this is what the toast used to
     * render verbatim, one sentence after another.
     */
    const BLOCKED_REASON = 'Cannot delete this account. This account has registered transactions. '
      + 'This account has reconciliations recorded. This account has bank statements recorded. '
      + 'This account has payments recorded.';
    /** …and the single sentence the user must actually read for it, however many blockers there were. */
    const BLOCKED_REASON_ES = 'Esta cuenta tiene registros vinculados, así que no se puede eliminar.';
    const COUNTER_ONE = 'None of the 1 selected record(s) could be deleted.';

    /** A DELETE response that refuses with `status` + a body message, the way NEO really does. */
    function refusal(status, message) {
      return { ok: false, status, json: async () => ({ message }) };
    }

    /** Mounts the hook, opens the confirm dialog for `rows`, and confirms. */
    async function runBulkDelete(rows, onSuccess = vi.fn()) {
      function TestComponent() {
        const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
        return (
          <>
            <button onClick={() => requestBulkDelete(rows)}>Bulk</button>
            {bulkDeleteDialog}
          </>
        );
      }
      render(<TestComponent />);
      const user = userEvent.setup();
      await act(async () => { await user.click(screen.getByText('Bulk')); });
      await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });
      const { toast } = await import('sonner');
      return { toast, onSuccess };
    }

    // (a) The whole point of the fix. This one test fails if EITHER half is reverted: without
    // `err.status` the 409 is not recognised as a business rejection, and without `errors` reaching
    // the toast there is nothing to recognise — both degrade to the bare counter.
    it('ONE row refused with a 4xx: the toast IS the backend reason, translated, not a counter', async () => {
      globalThis.fetch.mockResolvedValue(refusal(409, BLOCKED_REASON));

      const { toast, onSuccess } = await runBulkDelete([{ id: 'acc-2' }]);

      expect(toast.error).toHaveBeenCalledWith(BLOCKED_REASON_ES);
      expect(toast.error).not.toHaveBeenCalledWith(COUNTER_ONE);
      // Never the raw English, and never the bare "Cannot delete this account." prefix on its own.
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Cannot delete'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      // Outcome handling is untouched by the reason: nothing succeeded, so the host is told to
      // keep the row selected for a retry.
      expect(onSuccess).toHaveBeenCalledWith([], [{ id: 'acc-2' }]);
    });

    // (b) The other direction, and the reason the REAL status has to travel rather than a
    // hardcoded 4xx: a 500's message is by design a log pointer ("check the logs"), so it must
    // never be shown as if the backend had refused for a stated business reason.
    it('ONE row failing with a 5xx: counters only, the message is withheld', async () => {
      globalThis.fetch.mockResolvedValue(
        refusal(500, 'Internal error. Please check logs for details.'),
      );

      const { toast } = await runBulkDelete([{ id: 'r1' }]);

      expect(toast.error).toHaveBeenCalledWith(COUNTER_ONE);
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('check logs'));
    });

    // (c) The `total === 1` rule, pinned on THIS path. Same single shared reason as (a), on two
    // rows instead of one: withheld, because one singular sentence cannot be attributed to a
    // specific row of the batch and the user cannot tell which one it belonged to.
    it('TWO rows refused with the SAME 4xx reason: counters only', async () => {
      globalThis.fetch.mockResolvedValue(refusal(409, BLOCKED_REASON));

      const { toast } = await runBulkDelete([{ id: 'acc-2' }, { id: 'acc-4' }]);

      expect(toast.error).toHaveBeenCalledWith('None of the 2 selected record(s) could be deleted.');
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Cannot delete'));
    });

    // (d) A refusal whose body says nothing a user can act on. `OPAQUE_REASON_RE` catches the
    // `HTTP nnn` / `nnn Something` shapes; the counter is strictly better than echoing a status
    // code back at the user.
    it.each(['HTTP 409', '409 Conflict'])(
      'ONE row refused with an opaque message (%s): counters only',
      async (opaque) => {
        globalThis.fetch.mockResolvedValue(refusal(409, opaque));

        const { toast } = await runBulkDelete([{ id: 'r1' }]);

        expect(toast.error).toHaveBeenCalledWith(COUNTER_ONE);
        expect(toast.error).not.toHaveBeenCalledWith(opaque);
      },
    );

    /**
     * (e) The subtle one, and the reason `OPAQUE_REASON_RE` grew a second alternative
     * (`^\S+\s+\d{3}$`) for ETP-5111. `extractErrorMessage` never returns null: when it finds no
     * message anywhere it falls back to `` `${ui('error')} ${res.status}` `` — literally
     * "Error 409". That is a non-null 4xx "reason" that passes `isBusinessRejection`, is not
     * matched by the older `^HTTP? nnn` alternative, and says nothing to a user (no locale even
     * defines an `error` key, so it is not translated either). Before the guard was widened it
     * would have been toasted verbatim.
     *
     * Asserted through BOTH doors: a body the extractor cannot read at all, and the same string
     * arriving as an explicit message. The second is what stops a future narrowing of the regex to
     * the literal extractor output from passing.
     */
    it('ONE row refused with a 4xx whose body carries no message: counters only, never "Error 409"', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });

      const { toast } = await runBulkDelete([{ id: 'r1' }]);

      expect(toast.error).toHaveBeenCalledWith(COUNTER_ONE);
      expect(toast.error).not.toHaveBeenCalledWith('Error 409');
    });

    it.each(['Error 409', 'Error 404'])(
      'ONE row refused with a bare "<word> <status>" message (%s): counters only',
      async (bare) => {
        globalThis.fetch.mockResolvedValue(refusal(409, bare));

        const { toast } = await runBulkDelete([{ id: 'r1' }]);

        expect(toast.error).toHaveBeenCalledWith(COUNTER_ONE);
        expect(toast.error).not.toHaveBeenCalledWith(bare);
      },
    );

    // The counterpart that stops the widened regex from over-reaching: a GENUINE business sentence
    // that merely happens to end in a number must still be surfaced. `^\S+\s+\d{3}$` requires the
    // whole message to be one word plus the number, so a real sentence is unaffected.
    it('a real business sentence ending in a number is still surfaced', async () => {
      const REAL = 'The period is closed for document 409';
      globalThis.fetch.mockResolvedValue(refusal(409, REAL));

      const { toast } = await runBulkDelete([{ id: 'r1' }]);

      expect(toast.error).toHaveBeenCalledWith(REAL);
      expect(toast.error).not.toHaveBeenCalledWith(COUNTER_ONE);
    });

    // (f) A row that never reached the backend at all: `fetch` itself rejects, so the error has no
    // `status` property whatsoever. Distinct from (b) — that one has a status this code rejects,
    // this one has none to read — and it is the realistic offline case.
    it('ONE row failing with a thrown network error (no status): counters only', async () => {
      globalThis.fetch.mockRejectedValue(new Error('Network error'));

      const { toast } = await runBulkDelete([{ id: 'r1' }]);

      expect(toast.error).toHaveBeenCalledWith(COUNTER_ONE);
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });

    // A partial outcome is counters-only by construction (it implies two or more records), so no
    // selection size can make it name a reason. Asserted here because (a) proves reasons DO flow
    // on this path now, which makes "and never into the partial toast" a real thing to pin.
    it('a partial outcome never names a reason, even when the failure is a 4xx sentence', async () => {
      globalThis.fetch.mockImplementation((url) => (url.endsWith('/bad')
        ? Promise.resolve(refusal(409, BLOCKED_REASON))
        : Promise.resolve({ ok: true })));

      const { toast } = await runBulkDelete([{ id: 'good' }, { id: 'bad' }]);

      expect(toast.warning).toHaveBeenCalledWith('1 of 2 record(s) deleted. 1 could not be deleted.');
      expect(toast.warning).not.toHaveBeenCalledWith(expect.stringContaining('Cannot delete'));
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  it('a rapid double-click on the confirm button while the batch is in flight only issues ONE batch of DELETE calls', async () => {
    // Regression guard for double-submit: the confirm button is disabled via
    // React state (`deleting`), which only takes effect after a render commits.
    // fireEvent dispatches synchronously and testing-library flushes the
    // resulting state update via `act` before the next event fires, so by the
    // time the second click event is dispatched the button must already be
    // disabled — the browser does not deliver click events to a disabled
    // button. This locks that behavior in against a future change (e.g.
    // switching the disabled wiring to something async) reintroducing it.
    let resolveFetch;
    globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    const confirmBtn = screen.getByTestId('bulk-delete-confirm');
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Let the pending fetch resolve so the test doesn't leak into the next one.
    await act(async () => { resolveFetch({ ok: true }); });
  });
});
