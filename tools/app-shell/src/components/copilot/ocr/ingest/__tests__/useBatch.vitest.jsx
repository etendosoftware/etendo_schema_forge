// @covers tools/app-shell/src/components/copilot/ocr/ingest/useBatch.js
/**
 * Tests for useBatch — covers where the batch endpoint resolves to (ETP-5371) and the runBatch
 * POST flow (success, non-ok with body, non-ok without body, fetch rejection) with mocked fetch.
 */

import { renderHook, act } from '@testing-library/react';
import { useBatch } from '../useBatch.js';

describe('useBatch — batchUrl', () => {
  const originalLocation = window.location;

  function setPathname(pathname) {
    Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
    delete import.meta.env.VITE_API_BASE;
    vi.restoreAllMocks();
  });

  function mockOkFetch() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"committed":true}',
    });
  }

  it('posts to /batch at the NEO root', async () => {
    mockOkFetch();
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    await act(async () => {
      await result.current.runBatch([]);
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/sws/neo/batch');
  });

  /**
   * ETP-5371 — this hook used to derive the NEO root by stripping the last segment off the
   * caller's own `apiBaseUrl`, which worked only because `ListView` happens to be handed a
   * spec URL. The First Steps checklist passed the deployment prefix (`/etendo`), the chop
   * produced `''`, and the POST went to `/batch` — outside the backend entirely, where
   * CloudFront answered 403 and the failure read like an infrastructure outage.
   *
   * The hook no longer accepts `apiBaseUrl` at all, so the test passes one anyway: whatever a
   * caller hands it, the batch URL must keep the deployment's context path.
   */
  it('regression: keeps the deployment context path no matter what the caller passes', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');
    mockOkFetch();

    const { result } = renderHook(() => useBatch({ apiBaseUrl: '/etendo', token: 'tok' }));

    await act(async () => {
      await result.current.runBatch([]);
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/etendo/sws/neo/batch');
  });

  it('sends the Products window and the First Steps checklist to the same endpoint', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');
    mockOkFetch();

    // The two shapes the two entry points used to pass in.
    const fromListView = renderHook(() => useBatch({ apiBaseUrl: '/etendo/sws/neo/product', token: 'tok' }));
    const fromFirstSteps = renderHook(() => useBatch({ apiBaseUrl: '/etendo', token: 'tok' }));

    await act(async () => {
      await fromListView.result.current.runBatch([]);
      await fromFirstSteps.result.current.runBatch([]);
    });

    const [listViewUrl] = globalThis.fetch.mock.calls[0];
    const [firstStepsUrl] = globalThis.fetch.mock.calls[1];
    expect(firstStepsUrl).toBe(listViewUrl);
  });
});

describe('useBatch — runBatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed json on success and toggles loading true then false', async () => {
    let resolveText;
    const textPromise = new Promise((r) => { resolveText = r; });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => textPromise,
    });

    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let promise;
    // Kick off the request and let React commit the setLoading(true) update.
    await act(async () => {
      promise = result.current.runBatch([{ id: 'a' }]);
    });
    expect(result.current.loading).toBe(true);

    let returned;
    await act(async () => {
      resolveText('{"committed":true}');
      returned = await promise;
    });

    expect(returned).toEqual({ committed: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends a POST with { operations } body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    const { result } = renderHook(() => useBatch({ token: 'my-token' }));

    const ops = [{ id: 'op1', spec: 'product' }];
    await act(async () => {
      await result.current.runBatch(ops);
    });

    // Auth/Content-Type headers are now `useApiFetch`'s responsibility, covered
    // by its own tests — this hook only owns the method + body it sends.
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/batch');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ operations: ops });
  });

  it('ETP-5676: adds each batch option to the body only when the caller asks for it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));
    const ops = [{ id: 'op1', spec: 'product' }];

    await act(async () => {
      await result.current.runBatch(ops, { onlyReturnIds: true });
      await result.current.runBatch(ops);
      await result.current.runBatch(ops, { skipRedundantCallouts: true });
    });

    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ operations: ops, _onlyReturnIds: true });
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ operations: ops });
    expect(JSON.parse(globalThis.fetch.mock.calls[2][1].body))
      .toEqual({ operations: ops, _skipRedundantCallouts: true });
  });

  it('ETP-5676: returns an ids-only response as-is when the caller asks for ids only', async () => {
    const idsOnly = { committed: true, operations: [{ id: 'r0.product', recordId: 'P-1', ok: true }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(idsOnly) });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let response;
    await act(async () => {
      response = await result.current.runBatch([{ id: 'r0.product', spec: 'product' }], { onlyReturnIds: true });
    });

    expect(response).toEqual(idsOnly);
    expect(result.current.error).toBeNull();
  });

  it('returns json on a non-ok response that still carries a body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => '{"committed":false,"failedAt":{"id":"x"}}',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let returned;
    await act(async () => {
      returned = await result.current.runBatch([]);
    });

    expect(returned).toEqual({ committed: false, failedAt: { id: 'x' } });
    expect(result.current.error).toBeNull();
  });

  it('throws and sets error on a non-ok response with an empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Batch failed (500)');
    expect(result.current.error).toBe(error);
    expect(result.current.loading).toBe(false);
  });

  it('throws and sets error on a non-ok response with an invalid (non-JSON) body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Gateway error',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Batch failed (502)');
    expect(result.current.error).toBe(error);
  });

  it('regression: preserves the raw response text on the thrown error (a genuinely uncontrolled failure, e.g. a stack trace or gateway error page)', async () => {
    // A non-ok response whose body isn't even valid JSON has nothing else worth
    // inspecting besides its raw text — without this, the import UI's system-error
    // dialog would have nothing to show beyond the generic "Batch failed (502)".
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Gateway error: upstream connection reset\n  at some.internal.Handler',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.raw).toBe('Gateway error: upstream connection reset\n  at some.internal.Handler');
  });

  it('ETP-5350: declares the locale key and the status on the thrown error, so the user never reads "Batch failed (502)"', async () => {
    // `Batch failed (<status>)` is a developer-facing diagnostic, and until ETP-5350 it was
    // also the sentence the user read — app-shell-core's `sendRow` handed the rejection
    // straight back, so this English literal reached the review queue and the blocking
    // system-error dialog in an otherwise Spanish session. The engine can now recover the
    // status by parsing it back out of the prose, but this is what makes that unnecessary:
    // the throw site knows the status, so it states it rather than encoding it in a sentence
    // someone might reword later.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Gateway error: upstream connection reset',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.messageKey).toBe('importErrorServerFailure');
    expect(error.params).toEqual({ status: 502 });
  });

  it('sets error and rethrows when fetch rejects', async () => {
    const networkErr = new Error('network down');
    globalThis.fetch = vi.fn().mockRejectedValue(networkErr);
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBe(networkErr);
    expect(result.current.error).toBe(networkErr);
    expect(result.current.loading).toBe(false);
  });
});

// ETP-5677 — async mode: submit, poll the job, fold the result into the envelope callers read.
describe('useBatch — async job mode (ETP-5677)', () => {
  const ops = [{ id: 'r0.product', spec: 'product', entity: 'product', body: {} }];

  /** A scripted fetch: each call takes the next response; a function is called to build it. */
  function script(...responses) {
    const queue = [...responses];
    globalThis.fetch = vi.fn(async () => {
      const next = queue.shift();
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return next;
    });
  }

  const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    text: async () => JSON.stringify(body),
  });

  const accepted = reply(202, { jobId: 'J1', state: 'QUEUED', totalRows: 2, totalOps: 2 });
  const row = (index, ok, extra = {}) => ({ index, ids: [`r${index}.product`], committed: ok, ...extra });

  async function run(options = {}) {
    const { result } = renderHook(() => useBatch({ token: 'tok' }));
    let out;
    let thrown;
    await act(async () => {
      try {
        out = await result.current.runBatch(ops, { async: true, pollIntervalMs: 0, ...options });
      } catch (e) {
        thrown = e;
      }
    });
    return { out, thrown, result };
  }

  afterEach(() => { vi.useRealTimers(); });

  it('posts async:true and polls GET /batch/jobs/{id} until the job is done', async () => {
    script(accepted,
      reply(200, { jobId: 'J1', state: 'RUNNING', done: false, processedRows: 1, totalRows: 2, rows: [] }),
      reply(200, { jobId: 'J1', state: 'SUCCEEDED', done: true, processedRows: 2, totalRows: 2, rows: [
        row(0, true, { operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] }),
        row(1, true, { operations: [{ id: 'r1.product', ok: true, recordId: 'P-2' }] }),
      ] }));
    const onProgress = vi.fn();

    const { out } = await run({ onlyReturnIds: true, onProgress });

    const [submitUrl, submitOpts] = globalThis.fetch.mock.calls[0];
    expect(submitUrl).toBe('/sws/neo/batch');
    expect(JSON.parse(submitOpts.body)).toEqual({ operations: ops, _onlyReturnIds: true, async: true });
    expect(globalThis.fetch.mock.calls[1][0]).toBe('/sws/neo/batch/jobs/J1');
    expect(globalThis.fetch.mock.calls[1][1].method).toBe('GET');
    expect(out).toEqual({ committed: true, operations: [
      { id: 'r0.product', ok: true, recordId: 'P-1' },
      { id: 'r1.product', ok: true, recordId: 'P-2' },
    ] });
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { processedRows: 1, totalRows: 2 },
      { processedRows: 2, totalRows: 2 },
    ]);
  });

  it('keeps per-row results of a partly rejected job and never claims an atomic rollback', async () => {
    const rows = [
      row(0, true, { operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] }),
      row(1, false, { failedAt: { id: 'r1.product', index: 0 }, error: { status: 400, message: 'bad name' } }),
    ];
    script(accepted, reply(200, { jobId: 'J1', state: 'PARTIAL', done: true, processedRows: 2, totalRows: 2, rows, hint: 'resend failed rows' }));

    const { out } = await run();

    expect(out.committed).toBe(false);
    expect(out.partial).toBe(true);
    expect(out.rows).toEqual(rows);
    expect(out.error).toEqual({ status: 400, message: 'bad name' });
    expect(out.failedAt).toEqual({ id: 'r1.product', index: 0 });
    expect(out).not.toHaveProperty('atomic');
    expect(out).not.toHaveProperty('persisted');
  });

  it('reports a cancelled or interrupted job with the rows it has, not as a rollback', async () => {
    script(accepted, reply(200, { jobId: 'J1', state: 'INTERRUPTED', done: true, processedRows: 1, totalRows: 2,
      rows: [row(0, true, { operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] })] }));

    const { out } = await run();

    expect(out).toMatchObject({ committed: false, partial: true, state: 'INTERRUPTED' });
    expect(out.rows).toHaveLength(1);
  });

  it('survives transient poll failures but gives up (outcome unknown) after five in a row', async () => {
    script(accepted, new Error('network'), new Error('network'),
      reply(200, { jobId: 'J1', state: 'SUCCEEDED', done: true, processedRows: 1, totalRows: 1, rows: [
        row(0, true, { operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] }),
      ] }));
    const recovered = await run();
    expect(recovered.out.committed).toBe(true);

    script(accepted, ...Array.from({ length: 5 }, () => new Error('network down')));
    const { thrown, result } = await run();
    expect(thrown.message).toBe('network down');
    expect(result.current.error).toBe(thrown);
  });

  it('throws a classified error when the job vanished (404)', async () => {
    script(accepted, reply(404, { error: { message: 'Job not found' } }));

    const { thrown } = await run();

    expect(thrown.messageKey).toBe('importErrorServerFailure');
    expect(thrown.params).toEqual({ status: 404 });
  });

  it('waits out a 429 with the advertised Retry-After and resubmits instead of failing the rows', async () => {
    vi.useFakeTimers();
    script(reply(429, { error: { message: 'Too many' } }, { 'Retry-After': '2' }), accepted,
      reply(200, { jobId: 'J1', state: 'SUCCEEDED', done: true, processedRows: 1, totalRows: 1, rows: [
        row(0, true, { operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] }),
      ] }));
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let out;
    await act(async () => {
      const pending = result.current.runBatch(ops, { async: true, pollIntervalMs: 0 });
      await vi.advanceTimersByTimeAsync(1999);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      out = await pending;
    });

    expect(out.committed).toBe(true);
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('POST');
    expect(globalThis.fetch.mock.calls[1][1].method).toBe('POST');
  });

  it('returns a synchronous answer as it is when the server does not know async', async () => {
    const sync = { committed: true, operations: [{ id: 'r0.product', ok: true, recordId: 'P-1' }] };
    script(reply(200, sync));

    const { out } = await run();

    expect(out).toEqual(sync);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('answers a refused submit (400) like a synchronous refusal: the body, no polling', async () => {
    script(reply(400, { error: { status: 400, message: 'operations[0].id duplicates an earlier op' } }));

    const { out } = await run();

    expect(out.error.status).toBe(400);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not send async unless the caller asks (the synchronous contract is unchanged)', async () => {
    script(reply(200, { committed: true, operations: [] }));
    const { result } = renderHook(() => useBatch({ token: 'tok' }));
    await act(async () => { await result.current.runBatch(ops); });
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ operations: ops });
  });
});
