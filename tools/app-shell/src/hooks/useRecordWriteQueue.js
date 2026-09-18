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
 * 4. **No write starts after unmount**, so nothing can fire into a torn-down tree — whether it
 *    is a queued replay armed from inside `persist`'s own `finally` block, or a fully independent
 *    call to `persist` arriving later from the caller's own code (ETP-5338: a caller like
 *    `FmModel303Page.persistEditableFields` that awaits `waitUntilIdle` before building and
 *    flushing its own snapshot resumes that await AFTER unmount when the write it was waiting on
 *    settles post-unmount — `persist` is called again from that resumed code, and it is not a
 *    replay the hook armed itself, so the finally-block's own `mountedRef.current` check does not
 *    cover it. Checking `mountedRef.current` at `persist`'s own entry point closes this for that
 *    call AND for every other caller shaped the same way, without each caller having to guard it
 *    itself).
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
  /**
   * Per record, the promise of whichever write call is CURRENTLY open — the original one, or,
   * once a replay starts, the replay's own promise. Reassigned every time `persist` actually
   * invokes `writeRef.current`, including from inside its own `finally` block when it replays a
   * queued edit. This is what `waitUntilIdle` below re-reads on every loop iteration instead of
   * closing over one promise reference, which is what let a caller (`FmModel303Page`) observe a
   * stale promise across the exact tick a replay starts (see `waitUntilIdle`'s comment).
   */
  const inFlightPromiseRef = useRef({});
  /**
   * Per record, true while a QUEUED BATCH (one or more field keys coalesced during the previous
   * write) is being replayed. Set once, before the replay `for` loop below starts, and cleared
   * once, after the ENTIRE loop exits — never per entry. `persist`'s own finally clears
   * `inFlightRef`/`queuedRef` for each individual replayed field between iterations, so between
   * replaying field N and starting field N+1 there is a real tick where both of those are falsy
   * even though the batch is not done. This ref is the marker that stays true across that tick,
   * and it is what closes the multi-field-key gap in `waitUntilIdle` below (ETP-5338).
   */
  const replayInProgressRef = useRef({});
  const mountedRef = useRef(true);
  const writeRef = useRef(write);

  // Read through a ref so a caller that passes an inline `write` does not have to memoise it to
  // keep the queue stable. The queue's identity must not change between arming and replaying.
  useEffect(() => { writeRef.current = write; }, [write]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const persist = useCallback(async function persist(recordId, fieldKey, value) {
    if (recordId == null || recordId === '') return;
    // ETP-5338 — the owning component has already unmounted. Refuse to START a new write at all,
    // whether this call is a fresh request from the caller's own code (see point 4 above) or a
    // queued replay reaching this point from the `finally` block below. An ALREADY-open write
    // (one that got past this check before unmount) is left alone — it is too late to stop the
    // request that is already in flight, and the `finally` block's own `mountedRef.current` check
    // still stops IT from replaying anything queued behind it.
    if (!mountedRef.current) return;
    const key = String(recordId);

    if (inFlightRef.current[key]) {
      queuedRef.current[key] = { ...(queuedRef.current[key] ?? {}), [fieldKey]: value };
      return;
    }

    inFlightRef.current[key] = true;
    // Recorded synchronously, before the await below yields, so a concurrent `waitUntilIdle`
    // reading `inFlightPromiseRef.current[key]` always sees the promise that matches the
    // `inFlightRef` flag it just observed as true.
    const writePromise = writeRef.current({ recordId, fieldKey, value });
    inFlightPromiseRef.current[key] = writePromise;
    let discardQueued = false;
    try {
      discardQueued = (await writePromise) === false;
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
        // Only the call that ARMS the batch marker is allowed to clear it. A recursive `persist`
        // call made from inside this same loop (replaying `queuedField`) can itself land back in
        // this exact `finally` block if a further edit was coalesced while it was writing — that
        // nested call must not clear the marker out from under the batch it belongs to.
        const ownsBatch = !replayInProgressRef.current[key];
        if (ownsBatch) replayInProgressRef.current[key] = true;
        try {
          // Sequential: each awaits the previous, so the replay can never overlap. `.catch`
          // because there is no call site left to surface a rejection to (a 401 throws out of
          // `apiFetch`) and an unhandled rejection here is reported as an app error.
          for (const [queuedField, queuedValue] of entries) {
            await persist(recordId, queuedField, queuedValue).catch(() => {});
          }
        } finally {
          if (ownsBatch) delete replayInProgressRef.current[key];
        }
      }
    }
  }, []);

  /**
   * Resolves once a record has NO write in flight and NOTHING queued behind it — i.e. truly
   * idle, not just "the write I happened to capture a reference to has settled".
   *
   * ## Why a loop, and not a single `await` of the current in-flight promise
   *
   * `persist`'s own replay logic (in its `finally` block, above) can reassign
   * `inFlightPromiseRef.current[key]` to a NEW promise in the exact same microtask turn that the
   * PREVIOUS promise for that key settles — that's precisely what happens when a queued edit
   * starts replaying. A caller that captured the old promise by value before awaiting it (as
   * `FmModel303Page`'s `handleGoBack` used to, via its own `manualDataInFlight` ref) can resume
   * from that await in a tick where the record looks free but a replay has already been armed
   * under a promise it never saw. Whether that interleaving is actually reachable from a real
   * click depends on unwritten assumptions about microtask scheduling order — this bug class has
   * shipped twice on this exact file (ETP-5338), so this hook now closes it structurally instead
   * of relying on that.
   *
   * The fix is to never trust a promise reference captured before the loop body starts: re-read
   * `inFlightRef`/`queuedRef` AFTER every await, and keep looping until both are clear. Any
   * replay armed mid-wait is picked up on the next iteration because it is read fresh, not
   * because of the order two continuations happen to run in.
   *
   * That closes the single-key case, but a SECOND gap exists when the queue holds more than one
   * field key for the record (e.g. a caller like `ProductPriceBar` persisting `standardPrice` and
   * `listPrice` on the same row): `persist`'s replay `for` loop clears `inFlightRef`/`queuedRef`
   * for the whole record in between replaying entry N and starting entry N+1, even though entry
   * N+1 is already queued to fire. Checking only `inFlightRef`/`queuedRef` would let this loop
   * exit in exactly that tick, before the batch is actually done. `replayInProgressRef` (armed
   * once before the replay loop starts, cleared once after the whole loop exits — see `persist`'s
   * `finally` block) stays true across that tick, so it is included below as a third condition.
   */
  const waitUntilIdle = useCallback(async function waitUntilIdle(recordId) {
    if (recordId == null || recordId === '') return;
    const key = String(recordId);
    while (inFlightRef.current[key] || queuedRef.current[key] || replayInProgressRef.current[key]) {
      const promise = inFlightPromiseRef.current[key];
      if (promise) {
        await promise.catch(() => {});
      } else {
        // Something is queued but the write that will replay it hasn't been armed yet (still
        // inside the owning `persist()` call's synchronous continuation) — yield one microtask
        // and re-check rather than busy-looping past it.
        await Promise.resolve();
      }
    }
  }, []);

  return { persist, waitUntilIdle };
}

export default useRecordWriteQueue;
