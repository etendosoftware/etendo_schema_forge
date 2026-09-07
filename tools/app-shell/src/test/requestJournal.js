/**
 * A monotonic start/finish journal for proving that a batch of requests is issued
 * SEQUENTIALLY (ETP-5112).
 *
 * Why this exists rather than a plain call-order assertion: `Promise.all(...)` and a
 * `for (… of …) await …` loop fire their requests in exactly the same ORDER. An
 * assertion on arrival order therefore passes against the very defect these tests exist
 * to catch, and a reverted serialization would go unnoticed.
 *
 * What actually distinguishes the two is OVERLAP. So every tracked request stamps two
 * ticks of a shared counter — one when it starts, one when it settles — and a test asserts
 * that each request started strictly after the previous one finished. Give the FIRST
 * request an artificial `delayMs` so a concurrent implementation is forced to interleave:
 * the later request stamps its start tick while the delayed one is still in flight, and
 * {@link createRequestJournal.overlapGaps} goes negative.
 *
 * Ticks, not wall-clock timestamps: `Date.now()` has millisecond granularity, so two
 * requests that genuinely overlap can share a timestamp and produce a gap of 0 that a
 * `>= 0` assertion would wave through. A counter cannot tie.
 *
 * The background is core's `JsonToDataConverter`, which parses a write's `updated`
 * optimistic-locking token through a `private final static SimpleDateFormat` (line 129).
 * `SimpleDateFormat` keeps parsing state in a shared `Calendar`, so two concurrent writes
 * corrupt each other's parse and one comes back as a 500 conflict against a record nobody
 * touched. Six screens were changed to serialize their writes; these journals are what
 * keeps them that way.
 */
export function createRequestJournal() {
  let clock = 0;
  const entries = [];

  /**
   * Records one request's lifetime and returns whatever `result` produces.
   *
   * @param {string} label identifies the request in `labels()` and in failure output
   * @param {object} [options]
   * @param {number} [options.delayMs] hold the request open this long — put it on the
   *   FIRST request of a batch so a concurrent implementation is forced to overlap
   * @param {*|(() => *)} [options.result] resolved value, or a factory for one (use a
   *   factory when the value is single-use, e.g. a Response double)
   * @param {Error|string} [options.fail] reject with this instead of resolving, to
   *   exercise the per-item error handling a sequential loop must preserve
   */
  async function track(label, { delayMs = 0, result, fail } = {}) {
    const entry = { label, startedAt: ++clock, finishedAt: null };
    entries.push(entry);
    if (delayMs > 0) await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    entry.finishedAt = ++clock;
    if (fail) throw (fail instanceof Error ? fail : new Error(String(fail)));
    return typeof result === 'function' ? result() : result;
  }

  /** Labels in the order the requests STARTED. */
  function labels() {
    return entries.map(e => e.label);
  }

  /**
   * Tick gap between each request starting and its predecessor finishing.
   * Every gap `> 0` means no two requests were ever in flight together; any gap `<= 0`
   * is an overlap, i.e. the serialization was lost.
   */
  function overlapGaps() {
    // A predecessor that has not settled yet counts as still open forever (`Infinity`), so
    // the gap goes to `-Infinity` instead of silently reading as positive. Without this a
    // test that asserts before the batch has fully drained would pass against a concurrent
    // implementation: the LAST request settles first there, and `startedAt - null` is just
    // `startedAt`. Prefer `allSettled()` below over relying on this, but never let the
    // oversight read as a pass.
    return entries.slice(1).map((e, i) => e.startedAt - (entries[i].finishedAt ?? Infinity));
  }

  /**
   * The single worst gap, so a test can assert on one number and still fail on any
   * overlapping pair in a fan-out of N. `Infinity` for a batch of 0 or 1 requests —
   * assert on `entries.length` too, so a batch that never ran cannot pass by default.
   */
  function minOverlapGap() {
    const gaps = overlapGaps();
    return gaps.length ? Math.min(...gaps) : Infinity;
  }

  /** True once every tracked request has settled — poll this with `waitFor`. */
  function allSettled(expectedCount) {
    return entries.length === expectedCount && entries.every(e => e.finishedAt !== null);
  }

  function reset() {
    clock = 0;
    entries.length = 0;
  }

  return { entries, track, labels, overlapGaps, minOverlapGap, allSettled, reset };
}
