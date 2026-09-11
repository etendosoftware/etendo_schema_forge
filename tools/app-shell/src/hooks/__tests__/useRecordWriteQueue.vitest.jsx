// ETP-5255 class C — this hook exists to make a whole class of falso-409 bugs unrepeatable:
// two writes to the SAME record overlapping, both carrying the optimistic-locking token the
// first one is about to consume. These tests exercise the hook's contract directly (no panel,
// no fetch), controlling the `write` promise by hand so the race is deterministic instead of
// latency-dependent — a longer debounce would only make the bug rarer, never fix it.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRecordWriteQueue } from '../useRecordWriteQueue.js';

/** A promise this test settles by hand, so a write can be held "in flight" for as long as needed. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useRecordWriteQueue', () => {
  it('allows at most one write per record in flight, independent of latency', async () => {
    const first = deferred();
    const write = vi.fn(() => first.promise);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => { result.current.persist('rec-1', 'fieldA', 'a1'); });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ recordId: 'rec-1', fieldKey: 'fieldA', value: 'a1' });

    // THE regression this hook exists to prevent: a second edit to a DIFFERENT field of the
    // SAME record, arriving while the first write is still open, must not open a second write —
    // both carry the record's single optimistic-locking token.
    act(() => { result.current.persist('rec-1', 'fieldB', 'b1'); });
    expect(write).toHaveBeenCalledTimes(1);

    first.resolve();
    // The queued edit is replayed once the open write settles.
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write).toHaveBeenNthCalledWith(2, { recordId: 'rec-1', fieldKey: 'fieldB', value: 'b1' });
  });

  it('coalesces queued edits per field — last value wins for a repeated field, distinct fields all survive, replay is sequential never overlapped', async () => {
    // One controllable deferred per write() call, released one at a time by the test.
    const pending = [];
    const write = vi.fn(() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => { result.current.persist('rec-1', 'a', 'a1'); }); // opens the in-flight write
    expect(write).toHaveBeenCalledTimes(1);

    act(() => { result.current.persist('rec-1', 'b', 'b1'); }); // queued: { b: 'b1' }
    act(() => { result.current.persist('rec-1', 'b', 'b2'); }); // queued: { b: 'b2' } — overwritten, not appended
    act(() => { result.current.persist('rec-1', 'c', 'c1'); }); // queued: { b: 'b2', c: 'c1' } — a distinct field, not dropped
    expect(write).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);

    // Settle the open write — the replay for 'b' must start, carrying its LATEST value only.
    pending[0].resolve();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write).toHaveBeenNthCalledWith(2, { recordId: 'rec-1', fieldKey: 'b', value: 'b2' });
    // Never a stale intermediate value for the same field.
    expect(write).not.toHaveBeenCalledWith({ recordId: 'rec-1', fieldKey: 'b', value: 'b1' });

    // 'c' must not have started yet — the replay is sequential, one write open at a time.
    expect(pending).toHaveLength(2);
    expect(pending[1].promise).not.toBe(pending[0].promise);
    // Only the SECOND deferred is still open; the first already settled.
    await new Promise((r) => setTimeout(r, 0));
    expect(write).toHaveBeenCalledTimes(2); // 'c' has not fired while 'b' is still open

    pending[1].resolve();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    expect(write).toHaveBeenNthCalledWith(3, { recordId: 'rec-1', fieldKey: 'c', value: 'c1' });

    pending[2].resolve();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(3)); // nothing left queued
  });

  it('runs writes to DIFFERENT records in parallel — the guard is per record, not global', async () => {
    const d1 = deferred();
    const d2 = deferred();
    const write = vi.fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => { result.current.persist('rec-1', 'a', 'a1'); });
    act(() => { result.current.persist('rec-2', 'a', 'a1'); });

    // Both fire immediately — serializing across unrelated records would be a real
    // performance regression, not a fix for the optimistic-locking bug.
    expect(write).toHaveBeenCalledTimes(2);

    d1.resolve();
    d2.resolve();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2)); // nothing queued for either record
  });

  it('discards what was queued when write returns false (a refusal) — it does not replay a queued edit on top of a token the server just rejected', async () => {
    const pending = [];
    const write = vi.fn()
      .mockImplementationOnce(() => {
        const d = deferred();
        pending.push(d);
        return d.promise;
      })
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => { result.current.persist('rec-1', 'a', 'a1'); });
    act(() => { result.current.persist('rec-1', 'b', 'b1'); }); // queued while 'a' is open
    expect(write).toHaveBeenCalledTimes(1);

    // The first write settles as a REFUSAL (`write` resolves to `false`).
    pending[0].resolve(false);
    await new Promise((r) => setTimeout(r, 0));

    // The queued 'b' edit must NOT replay — it would carry a version token the caller has
    // already handled (rollback/refetch) on a refusal, and fighting that would just fail again.
    expect(write).toHaveBeenCalledTimes(1);

    // The record is not stuck either: a brand new edit still writes normally.
    act(() => { result.current.persist('rec-1', 'c', 'c1'); });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(2, { recordId: 'rec-1', fieldKey: 'c', value: 'c1' });
  });

  it('discards what was queued when write throws — the exception propagates and the queued edit is not replayed after it', async () => {
    const boom = new Error('boom');
    const write = vi.fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    // Caught here only to keep the test quiet — production call sites are fire-and-forget too,
    // by design (see the hook's docstring: swallowing it there is how the original bug hid).
    act(() => { result.current.persist('rec-1', 'a', 'a1').catch(() => {}); });
    act(() => { result.current.persist('rec-1', 'b', 'b1'); }); // queued while 'a' is open
    expect(write).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 0));

    // Queued 'b' must not have replayed.
    expect(write).toHaveBeenCalledTimes(1);

    act(() => { result.current.persist('rec-1', 'c', 'c1'); });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('abandons a queued replay on unmount — it never fires into a torn-down tree', async () => {
    const first = deferred();
    const write = vi.fn(() => first.promise);
    const { result, unmount } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => { result.current.persist('rec-1', 'a', 'a1'); });
    act(() => { result.current.persist('rec-1', 'b', 'b1'); }); // queued while 'a' is open
    expect(write).toHaveBeenCalledTimes(1);

    unmount();
    first.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // The queued 'b' edit must never replay after unmount.
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight flag on a REFUSED write (a resolved-but-rejected-looking write), so the record can save again', async () => {
    // "Refused" here means the caller's own `write` settles without throwing (e.g. it already
    // handled a non-ok response internally, as every real panel's writeField/writeField-like
    // function does) — the hook only needs to see the promise settle to release the guard.
    const write = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    await act(async () => { await result.current.persist('rec-1', 'a', 'a1'); });
    expect(write).toHaveBeenCalledTimes(1);

    act(() => { result.current.persist('rec-1', 'a', 'a2'); });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight flag even when write throws unexpectedly — a stuck flag would silently block every future save for that record', async () => {
    const boom = new Error('boom');
    const write = vi.fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    await act(async () => {
      await result.current.persist('rec-1', 'a', 'a1').catch(() => {});
    });
    expect(write).toHaveBeenCalledTimes(1);

    // The record must still be writable — a stuck in-flight flag would swallow this silently.
    act(() => { result.current.persist('rec-1', 'a', 'a2'); });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('is a no-op for a null or empty record id', () => {
    const write = vi.fn();
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    act(() => {
      result.current.persist(null, 'a', 'a1');
      result.current.persist('', 'a', 'a1');
      result.current.persist(undefined, 'a', 'a1');
    });

    expect(write).not.toHaveBeenCalled();
  });

  it('reads the latest `write` through a ref, so an inline (non-memoised) write function is never stale', async () => {
    const first = deferred();
    const writeV1 = vi.fn(() => first.promise);
    const writeV2 = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ write }) => useRecordWriteQueue({ write }),
      { initialProps: { write: writeV1 } },
    );

    act(() => { result.current.persist('rec-1', 'a', 'a1'); }); // opens with v1
    act(() => { result.current.persist('rec-1', 'b', 'b1'); }); // queued

    // The caller passes a NEW inline write function on the next render (no useCallback).
    rerender({ write: writeV2 });

    first.resolve();
    // The replay for 'b' must go through the CURRENT write (v2), not a stale v1 closure.
    await waitFor(() => expect(writeV2).toHaveBeenCalledWith({ recordId: 'rec-1', fieldKey: 'b', value: 'b1' }));
    expect(writeV1).toHaveBeenCalledTimes(1);
  });

  it('does not expose a "saving" flag — the guard lives in a ref and is not meant to drive a render', () => {
    const write = vi.fn();
    const { result } = renderHook(() => useRecordWriteQueue({ write }));

    expect(Object.keys(result.current)).toEqual(['persist']);
  });
});
