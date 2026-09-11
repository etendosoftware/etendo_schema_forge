import { useCallback, useEffect, useRef } from 'react';

/**
 * Serialises writes per RECORD, so two edits to the same row can never be in flight at once.
 *
 * ## Why the key is the record and not the field
 *
 * Etendo's optimistic locking is per record: a write must echo back the `updated` value it read,
 * and `apiFetch` injects the remembered token into every `PUT`/`PATCH` automatically. The cache
 * that remembers it is only refreshed by a *response*. So two writes to the same record that
 * overlap both carry the token the first one is about to consume, and the server refuses the
 * second as a 409 `stale_record` — even though the user did nothing wrong and no other writer
 * exists.
 *
 * That makes the field name the wrong unit of protection, and it is the mistake this hook exists
 * to make unrepeatable (ETP-5255 class C). Every panel that got this wrong got it wrong the same
 * way — it guarded the input, or the field, and two *different* fields of one row slipped past:
 *
 * - `ProductPriceBar` deduplicated inside each `PriceStepper` against its own last committed
 *   value, so `standardPrice` and `listPrice` — two steppers, one `PATCH /price/{row.id}` —
 *   could not see each other.
 * - `ContactsFinancialPanel` keyed its in-flight map by field name. It is correct today only
 *   because exactly one field persists; the second one to be wired up would have reintroduced
 *   the bug with nothing to catch it.
 * - `AmortizationLinesTable` had no guard at all: four triggers on one row, straight to
 *   `PUT /lines/{id}`.
 *
 * `FmModel303Page` was the only one that was right, and only because it autosaves the whole
 * record at once — so its single flag *is* a per-record key by accident of shape.
 *
 * ## What this hook guarantees, and what it deliberately does not
 *
 * It owns exactly the invariant that kept breaking, and nothing else:
 *
 * 1. **At most one write per record in flight.** Latency-independent — a longer debounce is not a
 *    fix, it only makes the race rarer on a fast network.
 * 2. **A write arriving mid-flight is coalesced, not dropped.** It is remembered per field (last
 *    value wins for that field, edits to *different* fields all survive) and replayed once the
 *    open write settles. Sequential by construction, so the replay reads a version cache the
 *    previous response already refreshed.
 * 3. **A failed write discards what was queued behind it.** `write` returning `false`, or
 *    throwing, drops the pending edits for that record instead of replaying them. This is not a
 *    convenience: the version cache is only refreshed by a *successful* response, so a replay
 *    after a refusal would carry the very token that was just rejected and fail identically. The
 *    caller has also usually put the field back to a known value by then (a rollback or a
 *    refetch), and writing on top of that would undo its own repair. Return nothing (or anything
 *    other than `false`) to flush normally.
 * 4. **The replay is abandoned on unmount**, so a queued write cannot fire into a torn-down tree.
 *
 * What it does NOT do, because these differ legitimately between panels and folding them in would
 * make it fit one caller and bend the other three:
 *
 * - **Deciding whether the value changed.** Compare against the last *persisted* value, never
 *   against a prop: a prop is a render behind, and for the whole window between "write accepted"
 *   and "parent re-rendered" it still holds the old value.
 * - **Rolling back a refused write.** Contacts restores the draft, the price bar refetches, the
 *   303 page drops a save that became ineligible. All three are right for their panel.
 * - **Debouncing.** Keep it in the input where it belongs; it coalesces rapid clicks, it is not a
 *   concurrency guard. Whatever the debounce does, route it through one commit path that clears
 *   the pending timer, so a timer and a blur cannot both fire.
 * - **Exposing "is this record saving?" for a spinner.** Deliberately absent: the flag lives in a
 *   ref, so reading it would not re-render and the spinner would simply never appear. Keep the
 *   `saving` state each panel already has — state for what is rendered, a ref for what guards.
 */
export function useRecordWriteQueue({ write }) {
  /** Records with a write currently open. The single-flight guard: a ref, never state. */
  const inFlightRef = useRef({});
  /**
   * Per record, the field→value edits that arrived while its write was open. A map rather than a
   * boolean so that editing two fields mid-flight replays both, and editing one field twice
   * replays only its latest value.
   */
  const queuedRef = useRef({});
  const mountedRef = useRef(true);
  const writeRef = useRef(write);

  // Read through a ref so a caller that passes an inline `write` does not have to memoise it to
  // keep the queue stable. The queue's identity must not change between arming and replaying.
  useEffect(() => { writeRef.current = write; }, [write]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const persist = useCallback(async function persist(recordId, fieldKey, value) {
    if (recordId == null || recordId === '') return;
    const key = String(recordId);

    if (inFlightRef.current[key]) {
      queuedRef.current[key] = { ...(queuedRef.current[key] ?? {}), [fieldKey]: value };
      return;
    }

    inFlightRef.current[key] = true;
    let discardQueued = false;
    try {
      discardQueued = (await writeRef.current({ recordId, fieldKey, value })) === false;
    } catch (err) {
      // An exception says nothing survived that we can reason about, so the queue goes with it —
      // and the throw is re-raised, because swallowing it here is how the original bug stayed
      // invisible for so long.
      discardQueued = true;
      throw err;
    } finally {
      // Cleared on every path — success, a refusal, or an unexpected throw. A flag left set would
      // stop the record saving for the rest of the session with nothing on screen to say so,
      // which is a worse failure than the duplicate write this removes.
      inFlightRef.current[key] = false;
      const queued = queuedRef.current[key];
      delete queuedRef.current[key];
      if (queued && !discardQueued && mountedRef.current) {
        const entries = Object.entries(queued);
        // Sequential: each awaits the previous, so the replay can never overlap. `.catch` because
        // there is no call site left to surface a rejection to (a 401 throws out of `apiFetch`)
        // and an unhandled rejection here is reported as an app error.
        for (const [queuedField, queuedValue] of entries) {
          await persist(recordId, queuedField, queuedValue).catch(() => {});
        }
      }
    }
  }, []);

  return { persist };
}

export default useRecordWriteQueue;
