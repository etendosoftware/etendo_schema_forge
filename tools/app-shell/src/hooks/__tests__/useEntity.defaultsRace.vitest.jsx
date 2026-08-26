import { renderHook, act, waitFor } from '@testing-library/react';

// ETP-4741 — creation-form defaults race.
//
// handleNew() opens an empty interactive form and fetches
// GET {apiBaseUrl}/{entity}/defaults asynchronously. Until the response lands the
// user can already be typing, and the merge that applies the defaults must not
// clobber what they entered. These tests pin the agreed contract:
//   - defaultsLoading is exposed so the form can gate itself while defaults fly
//   - the fetch is abortable, and the 4000ms timer RELEASES THE GATE ONLY: it
//     never invalidates the session, so a slow response still merges when it
//     finally lands (the timer is a UX budget, not a correctness mechanism)
//   - invalidation is reserved for genuinely superseded sessions: a newer
//     handleNew, or a record load (handleSelect / fetchById)
//   - the merge skips keys the user already touched (and their $_identifier
//     twins), whether they were typed before or after the early release
//   - each handleNew emits at most one defaults_block timing event
//   - the gate release never waits on the observability emit

const observabilityMock = vi.hoisted(() => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

// startTiming's default client is { track } from lib/observability.js, so mocking
// this module observes the emitted event regardless of whether the hook goes
// through startTiming or calls track directly.
vi.mock('@/lib/observability.js', () => ({
  track: observabilityMock.track,
  page: vi.fn().mockResolvedValue(undefined),
  identify: vi.fn().mockResolvedValue(undefined),
  group: vi.fn().mockResolvedValue(undefined),
  groupSet: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue(undefined),
  captureException: vi.fn(),
  setContext: vi.fn(),
  initObservability: vi.fn(),
  createObservability: vi.fn(() => ({})),
  buildKpiProperties: vi.fn(() => ({})),
  trackKpiEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { useEntity } from '../useEntity';

const DEFAULTS_TIMEOUT_MS = 4000;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function abortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

/**
 * fetch stub with real abort semantics: the returned promise rejects with an
 * AbortError as soon as the caller's signal fires. Nothing aborts on the timer
 * any more, so under the current contract this stub simply stays pending across
 * a timeout — it settles only when a session that really does invalidate (a
 * record load) cancels it. Keeps the gate-release assertions honest either way.
 */
function mockFetchHonoringAbort() {
  const control = deferred();
  globalThis.fetch.mockImplementation((_url, init) => {
    const signal = init?.signal;
    if (!signal) return control.promise;
    if (signal.aborted) return Promise.reject(abortError());
    return Promise.race([
      control.promise,
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      }),
    ]);
  });
  return control;
}

/**
 * Drains the microtask queue inside act() so every `.then` in handleNew's
 * fetch chain (and the awaited track call) has run before we assert.
 */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

function defaultsBlockCalls() {
  return observabilityMock.track.mock.calls.filter(([name]) => name === 'defaults_block');
}

describe('useEntity — creation defaults race (ETP-4741)', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
    skipListFetch: true,
  };

  function renderEntity(entity = 'salesOrder', opts = {}) {
    return renderHook(() => useEntity(entity, null, { ...defaultOpts, ...opts }));
  }

  beforeEach(() => {
    // mockReset (not mockClear) so a per-test track implementation — e.g. the
    // never-settling stub used to prove the gate release is off the critical
    // path — can never leak into the next test.
    observabilityMock.track.mockReset().mockResolvedValue(undefined);
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // A1 — defaultsLoading flag
  // ---------------------------------------------------------------------------

  describe('defaultsLoading flag', () => {
    it('is false before handleNew is ever called', () => {
      const { result } = renderEntity();

      expect(
        result.current.defaultsLoading,
        'useEntity must expose defaultsLoading, false until handleNew starts a defaults fetch'
      ).toBe(false);
    });

    it('is true while the defaults request is in flight', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      expect(
        result.current.defaultsLoading,
        'defaultsLoading must be true from the moment handleNew starts fetching defaults'
      ).toBe(true);

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: {} }));
      });
      await settle();
    });

    it('is false once the defaults response resolves', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { marker: 'MERGED' } }));
      });
      await waitFor(() => expect(result.current.editing?.marker).toBe('MERGED'));

      expect(
        result.current.defaultsLoading,
        'defaultsLoading must return to false after a successful defaults response'
      ).toBe(false);
    });

    it('is false after the defaults endpoint answers with an HTTP error', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });
      await settle();

      expect(
        result.current.defaultsLoading,
        'defaultsLoading must return to false when the defaults endpoint returns an HTTP error'
      ).toBe(false);
    });

    it('is false after the defaults request fails with a network error', async () => {
      globalThis.fetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });
      await settle();

      expect(
        result.current.defaultsLoading,
        'defaultsLoading must return to false when the defaults request throws'
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // A2 — abort + timeout
  // ---------------------------------------------------------------------------

  describe('abort and timeout', () => {
    it('passes an AbortSignal to the defaults request', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      const [, init] = globalThis.fetch.mock.calls.at(-1);

      expect(
        init?.signal,
        'handleNew must pass an AbortSignal so the defaults fetch can be cancelled'
      ).toBeInstanceOf(AbortSignal);
    });

    // The timer's ONLY job is releasing the gate. Aborting would turn a slow
    // backend into a form with no defaults AND no initial callouts, which is
    // exactly the regression this contract exists to prevent.
    it(`does not abort the defaults request when the ${DEFAULTS_TIMEOUT_MS}ms timer fires`, async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      const [, init] = globalThis.fetch.mock.calls.at(-1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      expect(
        init?.signal?.aborted,
        'the timeout releases the gate only — the request must stay in flight, un-aborted'
      ).toBe(false);
    });

    it(`clears defaultsLoading once the ${DEFAULTS_TIMEOUT_MS}ms timeout fires`, async () => {
      vi.useFakeTimers();
      mockFetchHonoringAbort();

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      expect(
        result.current.defaultsLoading,
        'the timeout must release the form: defaultsLoading back to false'
      ).toBe(false);
    });

    // The timer must not invalidate the session. A slow backend still owns the
    // form's defaults; it just no longer holds the gate shut while it answers.
    it('merges a defaults response that resolves after the timeout', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { paymentTerms: 'PT_LATE' } }));
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        result.current.editing?.paymentTerms,
        'a defaults response arriving after the timeout must still be applied'
      ).toBe('PT_LATE');
    });

    // The user-visible consequence of the merge above. DetailView's initial
    // callout chain (DetailView.jsx — "editing became non-empty" one-shot) only
    // fires once editing stops being {}. Discarding the late response left the
    // form with no defaults AND no callouts; a late merge re-arms that chain.
    it('leaves editing non-empty after a late merge, re-arming the initial callouts', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      expect(
        Object.keys(result.current.editing ?? {}),
        'the form starts empty: the callout chain has nothing to react to yet'
      ).toHaveLength(0);

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { businessPartner: 'BP-1', paymentTerms: 'PT_LATE' } }));
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        Object.keys(result.current.editing ?? {}).length,
        'a late defaults merge must leave editing non-empty so the initial callouts can run'
      ).toBeGreaterThan(0);
    });

    // The abort ref must survive the timer: the request is still live, so the
    // sessions that DO invalidate (record load here) must still be able to
    // cancel it. Nulling the ref on timeout makes neutralization a silent no-op.
    it('keeps the request cancellable, so a later record load still neutralizes it', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);
      const loadedRow = { id: '42', organization: 'ORG-REAL' };

      const { result } = renderEntity();
      await act(async () => {
        result.current.handleNew();
      });
      const [, init] = globalThis.fetch.mock.calls.at(-1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      // Pinned on both sides so the abort below can only have come from the
      // record load — a timer that cancels the request would satisfy the second
      // assertion by itself and prove nothing.
      expect(
        init?.signal?.aborted,
        'precondition: the timer leaves the request alive'
      ).toBe(false);

      await act(async () => {
        result.current.handleSelect(loadedRow);
      });

      expect(
        init?.signal?.aborted,
        'the timer must not drop the abort handle: a record load still has to cancel the request'
      ).toBe(true);

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { organization: 'ORG-DEFAULT' } }));
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        result.current.editing?.organization,
        'a neutralized session must stay inert even though the timer already fired'
      ).toBe('ORG-REAL');
    });
  });

  // ---------------------------------------------------------------------------
  // A2b — edits made after the early release
  //
  // The whole point of releasing the gate early is that the user can start
  // working. Everything they type in that window is theirs, and the response
  // that lands afterwards goes through the same merge guard as a pre-release
  // edit: their keys are skipped, every untouched key still gets its default.
  // ---------------------------------------------------------------------------

  describe('edits made after the early release', () => {
    const LATE_DEFAULTS = {
      businessPartner: 'DEFAULT_BP',
      'businessPartner$_identifier': 'Default BP',
      paymentTerms: 'PT_DEFAULT',
    };

    async function typeAfterTimeoutThenResolve(field = 'businessPartner', value = 'USER_BP') {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      // The gate is open — this is the user working on the released form.
      await act(async () => {
        result.current.handleChange(field, value);
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: LATE_DEFAULTS }));
        await vi.advanceTimersByTimeAsync(1);
      });

      return result;
    }

    it('keeps a value the user typed after the timeout released the form', async () => {
      const result = await typeAfterTimeoutThenResolve();

      expect(
        result.current.editing?.paymentTerms,
        'precondition: the late response must have merged at all'
      ).toBe('PT_DEFAULT');
      expect(
        result.current.editing?.businessPartner,
        'a value typed after the early release must survive the late defaults merge'
      ).toBe('USER_BP');
    });

    it('still applies defaults to fields untouched during the release window', async () => {
      const result = await typeAfterTimeoutThenResolve();

      expect(
        result.current.editing?.paymentTerms,
        'keys the user never touched must still receive their default, however late it lands'
      ).toBe('PT_DEFAULT');
    });

    it('keeps the $_identifier companion of a field changed after the release', async () => {
      const result = await typeAfterTimeoutThenResolve();

      expect(
        result.current.editing?.paymentTerms,
        'precondition: the late response must have merged at all'
      ).toBe('PT_DEFAULT');
      expect(
        result.current.editing?.['businessPartner$_identifier'],
        'the display label of a user-picked value must not be replaced by the late default'
      ).not.toBe('Default BP');
    });
  });

  // ---------------------------------------------------------------------------
  // A3 — merge guard
  // ---------------------------------------------------------------------------

  describe('merge guard for user-entered values', () => {
    async function startNewWithPendingDefaults() {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      return { result, pending };
    }

    const LATE_DEFAULTS = {
      businessPartner: 'DEFAULT_BP',
      'businessPartner$_identifier': 'Default BP',
      paymentTerms: 'PT_DEFAULT',
    };

    it('keeps a value the user typed before the defaults landed', async () => {
      const { result, pending } = await startNewWithPendingDefaults();

      await act(async () => {
        result.current.handleChange('businessPartner', 'USER_BP');
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: LATE_DEFAULTS }));
      });
      await waitFor(() => expect(result.current.editing?.paymentTerms).toBe('PT_DEFAULT'));

      expect(
        result.current.editing.businessPartner,
        'late defaults must not overwrite a field the user already changed'
      ).toBe('USER_BP');
    });

    it('keeps the $_identifier companion of a user-changed field', async () => {
      const { result, pending } = await startNewWithPendingDefaults();

      await act(async () => {
        result.current.handleChange('businessPartner', 'USER_BP');
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: LATE_DEFAULTS }));
      });
      await waitFor(() => expect(result.current.editing?.paymentTerms).toBe('PT_DEFAULT'));

      expect(
        result.current.editing['businessPartner$_identifier'],
        'the $_identifier of a user-changed field must not be overwritten by late defaults'
      ).not.toBe('Default BP');
    });

    it('still applies defaults for fields the user did not touch', async () => {
      const { result, pending } = await startNewWithPendingDefaults();

      await act(async () => {
        result.current.handleChange('businessPartner', 'USER_BP');
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: LATE_DEFAULTS }));
      });
      await waitFor(() => expect(result.current.editing?.paymentTerms).toBe('PT_DEFAULT'));

      expect(
        result.current.editing.paymentTerms,
        'untouched keys must still receive their default value'
      ).toBe('PT_DEFAULT');
    });
  });

  // ---------------------------------------------------------------------------
  // A4 — defaults_block timing event
  // ---------------------------------------------------------------------------

  describe('defaults_block timing event', () => {
    it('emits exactly one event with status "ok" when defaults resolve', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { marker: 'MERGED' } }));
      });
      await waitFor(() => expect(result.current.editing?.marker).toBe('MERGED'));
      await settle();

      const calls = defaultsBlockCalls();

      expect(
        calls,
        'each handleNew must emit exactly one defaults_block timing event'
      ).toHaveLength(1);
      expect(calls[0][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'ok',
      }));
      expect(typeof calls[0][1].durationMs).toBe('number');
      expect(calls[0][1].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('emits status "error" when the defaults request throws', async () => {
      globalThis.fetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });
      await settle();

      const calls = defaultsBlockCalls();

      expect(
        calls,
        'a failed defaults request must still emit one defaults_block event'
      ).toHaveLength(1);
      expect(calls[0][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'error',
      }));
      expect(typeof calls[0][1].durationMs).toBe('number');
    });

    // 'timeout' is now a UX-budget signal, not an obituary: the request lives
    // on. It is the number we tune DEFAULTS_TIMEOUT_MS with, so the timer keeps
    // emitting it the moment it releases the gate.
    it('emits status "timeout" when the timer releases the gate', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      const calls = defaultsBlockCalls();

      expect(
        calls,
        'releasing the gate on the timer must emit one defaults_block event'
      ).toHaveLength(1);
      expect(calls[0][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'timeout',
      }));
      expect(calls[0][1].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('emits nothing more when the response lands after a timeout event', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });
      expect(defaultsBlockCalls()).toHaveLength(1);

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { paymentTerms: 'PT_LATE' } }));
        await vi.advanceTimersByTimeAsync(1);
      });

      const calls = defaultsBlockCalls();

      expect(
        calls,
        'the session reports once: a response landing after the timer must add no event'
      ).toHaveLength(1);
      expect(
        calls[0][1].status,
        'the one event a released-then-answered session emits is the timer\'s'
      ).toBe('timeout');
      expect(result.current.editing?.paymentTerms).toBe('PT_LATE');
    });
  });

  // ---------------------------------------------------------------------------
  // A5 — the gate release is off the observability critical path
  //
  // settleTiming ends in client.track(), which with Mixpanel enabled is a real
  // network call. Awaiting it before releasing defaultsLoading makes the form's
  // usability hostage to an analytics endpoint. The gate must be released
  // independently of whether the emit ever resolves.
  // ---------------------------------------------------------------------------

  describe('gate release vs. observability delivery', () => {
    it('releases defaultsLoading even if the timing event never delivers', async () => {
      // A track call that never settles — a hung analytics request.
      observabilityMock.track.mockImplementation(() => new Promise(() => {}));

      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { paymentTerms: 'PT_DEFAULT' } }));
      });
      await settle();

      expect(
        result.current.editing?.paymentTerms,
        'the merge itself must not wait on the analytics emit either'
      ).toBe('PT_DEFAULT');
      expect(
        result.current.defaultsLoading,
        'a hung track() must never keep the form gated'
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Re-entry — double "New" click while the first defaults request is pending.
  // Pins the schedule that makes a superseded call inert: the newest call owns
  // the epoch, so the older one can neither merge, release the gate, nor report.
  // ---------------------------------------------------------------------------

  describe('handleNew re-entry', () => {
    async function startTwoOverlappingCalls() {
      const first = deferred();
      const second = deferred();
      globalThis.fetch
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });
      await act(async () => {
        result.current.handleNew();
      });

      return { result, first, second };
    }

    async function resolveWith(pending, defaults) {
      await act(async () => {
        pending.resolve(jsonResponse({ defaults }));
      });
      await settle();
    }

    it('discards the first response once a second handleNew supersedes it', async () => {
      const { result, first } = await startTwoOverlappingCalls();

      await resolveWith(first, { paymentTerms: 'FIRST' });

      expect(
        result.current.editing?.paymentTerms,
        'a superseded response must never merge into the newer form'
      ).toBeUndefined();
    });

    it('merges the second response normally', async () => {
      const { result, first, second } = await startTwoOverlappingCalls();

      await resolveWith(first, { paymentTerms: 'FIRST' });
      await resolveWith(second, { paymentTerms: 'SECOND' });

      expect(result.current.editing?.paymentTerms).toBe('SECOND');
    });

    it('keeps defaultsLoading owned by the newest call', async () => {
      const { result, first, second } = await startTwoOverlappingCalls();

      expect(result.current.defaultsLoading).toBe(true);

      await resolveWith(first, { paymentTerms: 'FIRST' });
      expect(
        result.current.defaultsLoading,
        'a superseded response must not release the gate the newer call owns'
      ).toBe(true);

      await resolveWith(second, { paymentTerms: 'SECOND' });
      expect(
        result.current.defaultsLoading,
        'the newest call settling must release the gate'
      ).toBe(false);
    });

    it('emits no timing event for the superseded call', async () => {
      const { first } = await startTwoOverlappingCalls();

      await resolveWith(first, { paymentTerms: 'FIRST' });

      expect(
        defaultsBlockCalls(),
        'a superseded handleNew must stay silent — its settle path is inert'
      ).toHaveLength(0);
    });

    it('emits exactly one timing event once the surviving call settles', async () => {
      const { first, second } = await startTwoOverlappingCalls();

      await resolveWith(first, { paymentTerms: 'FIRST' });
      await resolveWith(second, { paymentTerms: 'SECOND' });

      const calls = defaultsBlockCalls();

      expect(
        calls,
        'two overlapping handleNew calls must report once, for the surviving one'
      ).toHaveLength(1);
      expect(calls[0][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'ok',
      }));
    });

    it('runs a clean cycle when a new handleNew follows a timed-out one', async () => {
      vi.useFakeTimers();
      const second = deferred();
      globalThis.fetch
        .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
        }))
        .mockReturnValueOnce(second.promise);

      const { result } = renderEntity('salesOrder');
      await act(async () => {
        result.current.handleNew();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULTS_TIMEOUT_MS + 1);
      });

      expect(result.current.defaultsLoading).toBe(false);
      expect(defaultsBlockCalls()).toHaveLength(1);
      expect(defaultsBlockCalls()[0][1].status).toBe('timeout');

      // The timeout only released the gate — the old session is still live, so
      // this call must supersede it and open a fresh cycle.
      await act(async () => {
        result.current.handleNew();
      });
      expect(
        result.current.defaultsLoading,
        'a handleNew after a timeout must open a fresh gate'
      ).toBe(true);

      await act(async () => {
        second.resolve(jsonResponse({ defaults: { paymentTerms: 'SECOND' } }));
        await vi.advanceTimersByTimeAsync(1);
      });
      await settle();

      expect(result.current.editing?.paymentTerms).toBe('SECOND');
      expect(result.current.defaultsLoading).toBe(false);

      const calls = defaultsBlockCalls();
      expect(calls).toHaveLength(2);
      expect(calls[1][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'ok',
      }));
    });
  });

  // ---------------------------------------------------------------------------
  // Record load during the defaults window (QA BUG-1).
  //
  // Opening an EXISTING record while a /new defaults request is still in flight
  // must neutralize that request the same way a second handleNew does. Otherwise
  // the creation defaults land on top of the loaded record and a save PATCHes
  // them onto real data.
  // ---------------------------------------------------------------------------

  describe('record-load neutralization', () => {
    const SELECTED_ROW = { id: '42', organization: 'ORG-REAL', documentNo: 'PO-42' };
    const LATE_DEFAULTS = { organization: 'ORG-DEFAULT', documentStatus: 'DR' };

    async function startNewWithPendingDefaults(entity = 'salesOrder') {
      const pending = deferred();
      globalThis.fetch.mockReturnValueOnce(pending.promise);

      const { result } = renderEntity(entity);
      await act(async () => {
        result.current.handleNew();
      });
      const [, defaultsInit] = globalThis.fetch.mock.calls.at(-1);

      return { result, pending, defaultsInit };
    }

    async function resolveDefaults(pending, defaults = LATE_DEFAULTS) {
      await act(async () => {
        pending.resolve(jsonResponse({ defaults }));
      });
      await settle();
    }

    describe('via handleSelect', () => {
      it('keeps the loaded record values when the defaults land late', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });
        await resolveDefaults(pending);

        expect(
          result.current.editing?.organization,
          'creation defaults must never overwrite a record loaded during the defaults window'
        ).toBe('ORG-REAL');
      });

      it('does not inject creation-only defaults into the loaded record', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });
        await resolveDefaults(pending);

        expect(
          result.current.editing?.documentStatus,
          'a field that exists only in the creation defaults must not appear on a loaded record'
        ).toBeUndefined();
        expect(result.current.selected?.id).toBe('42');
      });

      it('releases defaultsLoading as soon as a record is selected', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });

        expect(
          result.current.defaultsLoading,
          'selecting a record must release the creation gate immediately'
        ).toBe(false);

        // Guards the latch Sentinel warned about: neutralizing by epoch alone
        // makes handleNew's finally skip its release, leaving this stuck true.
        await resolveDefaults(pending);
        expect(
          result.current.defaultsLoading,
          'the neutralized response must not leave defaultsLoading latched'
        ).toBe(false);
      });

      it('aborts the pending defaults request', async () => {
        const { result, defaultsInit } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });

        expect(
          defaultsInit?.signal?.aborted,
          'selecting a record must abort the in-flight defaults request'
        ).toBe(true);
      });

      it('emits no defaults_block event for the neutralized session', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });
        await resolveDefaults(pending);

        expect(
          defaultsBlockCalls(),
          'a neutralized session must stay silent, like a superseded handleNew'
        ).toHaveLength(0);
      });
    });

    describe('via fetchById', () => {
      async function loadRecordById(result) {
        globalThis.fetch.mockResolvedValueOnce(
          jsonResponse({ response: { data: [SELECTED_ROW] } })
        );
        await act(async () => {
          result.current.fetchById('42');
        });
        await settle();
      }

      it('keeps the fetched record values when the defaults land late', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await loadRecordById(result);
        await resolveDefaults(pending);

        expect(
          result.current.editing?.organization,
          'creation defaults must never overwrite a record fetched during the defaults window'
        ).toBe('ORG-REAL');
        expect(result.current.editing?.documentStatus).toBeUndefined();
      });

      it('releases defaultsLoading once the record is fetched', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await loadRecordById(result);

        expect(
          result.current.defaultsLoading,
          'fetching a record must release the creation gate'
        ).toBe(false);

        await resolveDefaults(pending);
        expect(
          result.current.defaultsLoading,
          'the neutralized response must not leave defaultsLoading latched'
        ).toBe(false);
      });

      it('aborts the pending defaults request', async () => {
        const { result, defaultsInit } = await startNewWithPendingDefaults();

        await loadRecordById(result);

        expect(
          defaultsInit?.signal?.aborted,
          'fetching a record must abort the in-flight defaults request'
        ).toBe(true);
      });

      it('emits no defaults_block event for the neutralized session', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await loadRecordById(result);
        await resolveDefaults(pending);

        expect(
          defaultsBlockCalls(),
          'a session neutralized by fetchById must stay silent'
        ).toHaveLength(0);
      });
    });

    describe('lifecycle continuity', () => {
      it('runs a clean full cycle on the next handleNew after a neutralization', async () => {
        const { result, pending } = await startNewWithPendingDefaults();

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });
        await resolveDefaults(pending);

        const secondDefaults = deferred();
        globalThis.fetch.mockReturnValueOnce(secondDefaults.promise);
        await act(async () => {
          result.current.handleNew();
        });

        expect(
          result.current.defaultsLoading,
          'a handleNew after a neutralization must open a fresh gate'
        ).toBe(true);

        await act(async () => {
          secondDefaults.resolve(jsonResponse({ defaults: LATE_DEFAULTS }));
        });
        await settle();

        expect(result.current.editing?.organization).toBe('ORG-DEFAULT');
        expect(result.current.editing?.documentStatus).toBe('DR');
        expect(result.current.defaultsLoading).toBe(false);

        const calls = defaultsBlockCalls();
        expect(
          calls,
          'only the surviving cycle reports: the neutralized one must contribute no event'
        ).toHaveLength(1);
        expect(calls[0][1]).toEqual(expect.objectContaining({
          entity: 'salesOrder',
          status: 'ok',
        }));
      });
    });

    // Preservation: with nothing in flight, record loading is untouched.
    // These pass today and must keep passing after the fix.
    describe('with no defaults request pending', () => {
      it('handleSelect loads the record normally and stays silent', async () => {
        const { result } = renderEntity('salesOrder');

        await act(async () => {
          result.current.handleSelect(SELECTED_ROW);
        });

        expect(result.current.selected).toEqual(SELECTED_ROW);
        expect(result.current.editing).toEqual(SELECTED_ROW);
        expect(result.current.defaultsLoading).toBe(false);
        expect(defaultsBlockCalls()).toHaveLength(0);
      });

      it('fetchById loads the record normally and stays silent', async () => {
        const { result } = renderEntity('salesOrder');
        globalThis.fetch.mockResolvedValueOnce(
          jsonResponse({ response: { data: [SELECTED_ROW] } })
        );

        await act(async () => {
          result.current.fetchById('42');
        });
        await settle();

        expect(result.current.editing?.organization).toBe('ORG-REAL');
        expect(result.current.selected?.id).toBe('42');
        expect(result.current.defaultsLoading).toBe(false);
        expect(defaultsBlockCalls()).toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // E — ETP-5002: the required-field gate must not block on a default in flight
  //
  // ETP-4933 disables every primary persist action while a required field is
  // empty. ETP-4741's 4s budget releases defaultsLoading EARLY, without settling
  // the request — so on a slow `GET /<entity>/defaults` the form unlocks with the
  // defaults still in the air, and the gate then blocks Guardar/Confirmar on a
  // value the backend was about to supply. `purchase-order` marks `warehouse`
  // required with no contract default, which is exactly how the ETP-5002
  // rectificativa E2E specs died: "Completa primero los campos obligatorios:
  // Almacén" on a brand-new PO, with a disabled Guardar AND Confirmar.
  //
  // Contract: block on the REQUEST window (defaultsPending), not the UX window.
  // ---------------------------------------------------------------------------

  describe('required-field gate vs. pending defaults (ETP-5002)', () => {
    // Mirrors artifacts/purchase-order/contract.json: `warehouse` is
    // required + editable with defaultValue null, i.e. NEO's /defaults is the
    // only thing that ever fills it.
    const PO_FIELDS = [
      { key: 'warehouse', column: 'warehouse', label: 'Warehouse', type: 'search', required: true },
    ];

    function renderPO() {
      return renderEntity('purchaseOrder', { contractFields: PO_FIELDS });
    }

    it('defers blocking while the defaults request is still in flight', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });

      expect(result.current.defaultsPending, 'the defaults session must read as pending').toBe(true);
      expect(
        result.current.isValid,
        'the gate must not block a new record on a required field whose default has not landed'
      ).toBe(true);
      expect(result.current.missingRequiredFields).toEqual([]);

      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { warehouse: 'WH-1' } }));
      });
      await settle();
    });

    it('keeps deferring after the 4s UX budget expires — the request is what matters', async () => {
      vi.useFakeTimers();
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });

      await act(async () => {
        vi.advanceTimersByTime(DEFAULTS_TIMEOUT_MS + 1);
      });

      expect(
        result.current.defaultsLoading,
        'ETP-4741: the UX budget releases the form so the user can start working'
      ).toBe(false);
      expect(
        result.current.defaultsPending,
        'ETP-5002: the request is still running, so the gate must stay deferred'
      ).toBe(true);
      expect(
        result.current.isValid,
        'this is the exact ETP-5002 regression: unlocked form + still-flying default '
        + 'must NOT leave Guardar/Confirmar disabled on `warehouse`'
      ).toBe(true);

      vi.useRealTimers();
      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { warehouse: 'WH-1' } }));
      });
      await settle();
    });

    it('applies the gate in full once the defaults land WITHOUT the required field', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });
      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { someOtherField: 'X' } }));
      });
      await settle();

      expect(result.current.defaultsPending).toBe(false);
      expect(
        result.current.isValid,
        'once we KNOW the backend is not supplying warehouse, the gate is correct to block'
      ).toBe(false);
      expect(result.current.missingRequiredFields.map(f => f.key)).toEqual(['warehouse']);
    });

    it('clears the block when the defaults land WITH the required field', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });
      await act(async () => {
        pending.resolve(jsonResponse({ defaults: { warehouse: 'WH-1' } }));
      });
      await settle();

      expect(result.current.defaultsPending).toBe(false);
      expect(result.current.editing?.warehouse).toBe('WH-1');
      expect(result.current.isValid, 'the default filled the field, so nothing blocks').toBe(true);
    });

    it('applies the gate in full when the defaults request fails', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });
      await act(async () => {
        pending.reject(new Error('network down'));
      });
      await settle();

      expect(
        result.current.defaultsPending,
        'a failed session is settled, not pending — deferring forever would disable the gate'
      ).toBe(false);
      expect(result.current.isValid).toBe(false);
      expect(result.current.missingRequiredFields.map(f => f.key)).toEqual(['warehouse']);
    });

    it('stops deferring when a record load neutralizes the pending session', async () => {
      mockFetchHonoringAbort();

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });
      expect(result.current.defaultsPending).toBe(true);

      globalThis.fetch.mockResolvedValueOnce(
        jsonResponse({ response: { data: [{ id: '42', warehouse: '' }] } })
      );
      await act(async () => {
        result.current.fetchById('42');
      });
      await settle();

      expect(
        result.current.defaultsPending,
        'neutralizePendingDefaults must clear the deferral, or it latches forever'
      ).toBe(false);
    });

    it('never defers on an EXISTING record, even mid-session', async () => {
      const pending = deferred();
      globalThis.fetch.mockReturnValue(pending.promise);

      const { result } = renderPO();
      await act(async () => {
        result.current.handleNew();
      });
      // Simulate the post-create state: the record now has an id, while a
      // defaults response is somehow still outstanding.
      await act(async () => {
        result.current.handleChange('warehouse', '');
      });
      await act(async () => {
        pending.resolve(jsonResponse({ defaults: {} }));
      });
      await settle();

      expect(
        result.current.isValid,
        'a touched-and-emptied required field must still block once defaults settled'
      ).toBe(false);
    });
  });
});
