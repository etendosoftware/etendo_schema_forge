import { renderHook, act, waitFor } from '@testing-library/react';

// ETP-4741 — creation-form defaults race.
//
// handleNew() opens an empty interactive form and fetches
// GET {apiBaseUrl}/{entity}/defaults asynchronously. Until the response lands the
// user can already be typing, and the merge that applies the defaults must not
// clobber what they entered. These tests pin the agreed contract:
//   - defaultsLoading is exposed so the form can gate itself while defaults fly
//   - the fetch is abortable and gives up after 4000ms
//   - the merge skips keys the user already touched (and their $_identifier twins)
//   - each handleNew emits exactly one defaults_block timing event

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
 * AbortError as soon as the caller's signal fires. Lets the timeout tests pass
 * whether the fix reacts to the abort rejection or to its own timer callback.
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
    observabilityMock.track.mockClear();
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

    it(`aborts the defaults request after ${DEFAULTS_TIMEOUT_MS}ms`, async () => {
      vi.useFakeTimers();
      mockFetchHonoringAbort();

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
        `a defaults request still pending after ${DEFAULTS_TIMEOUT_MS}ms must be aborted`
      ).toBe(true);
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

    // Deliberately uses a fetch stub that IGNORES the abort signal: a request
    // already in flight can still deliver its body after the abort. The guard
    // therefore has to live in the hook (a staleness check before the merge),
    // not in the abort alone.
    it('never merges a defaults response that resolves after the timeout', async () => {
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
        'a defaults response arriving after the timeout must be discarded, not merged'
      ).toBeUndefined();
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

    it('emits status "timeout" when the request is abandoned', async () => {
      vi.useFakeTimers();
      mockFetchHonoringAbort();

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
        'a timed-out defaults request must emit one defaults_block event'
      ).toHaveLength(1);
      expect(calls[0][1]).toEqual(expect.objectContaining({
        entity: 'salesOrder',
        status: 'timeout',
      }));
      expect(calls[0][1].durationMs).toBeGreaterThanOrEqual(0);
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

      // The timeout bumped the epoch itself; the next call must still take
      // ownership rather than inherit the abandoned cycle's state.
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
});
