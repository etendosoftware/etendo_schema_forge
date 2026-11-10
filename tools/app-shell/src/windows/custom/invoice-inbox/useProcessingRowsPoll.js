import { useEffect, useRef, useState } from 'react';

/** Delays between polls, in ms; the last one repeats. */
export const POLL_DELAYS_MS = Object.freeze([3000, 5000, 8000, 13000, 20000, 30000]);
/** Polling stops after this long without any row changing. "Actualizar" or an upload resumes it. */
export const POLL_GIVE_UP_MS = 15 * 60 * 1000;

/** Delay before poll number `step` (0-based). */
export function nextPollDelay(step) {
  return POLL_DELAYS_MS[Math.min(step, POLL_DELAYS_MS.length - 1)];
}

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function useDocumentHidden() {
  const [hidden, setHidden] = useState(isDocumentHidden);
  useEffect(() => {
    const onChange = () => setHidden(isDocumentHidden());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

/**
 * ETP-6049 — re-reads the PROCESSING rows on screen until the background reader finishes them.
 *
 * Runs only while `ids` is not empty and the browser tab is visible. Backs off 3 s → 30 s and gives
 * up after 15 minutes without a change (the server sweeper retries stalled rows every 2 minutes,
 * so a row can legitimately stay PROCESSING for a while). `resetKey` — bumped on an explicit
 * reload or an accepted upload — restarts the backoff and the give-up clock.
 *
 * @param {object} opts
 * @param {string[]} opts.ids ids of the PROCESSING rows currently loaded
 * @param {(ids: string[]) => Promise<boolean>} opts.poll re-reads those rows; resolves true when
 *   any of them changed
 * @param {number} opts.resetKey
 */
export function useProcessingRowsPoll({ ids, poll, resetKey }) {
  const hidden = useDocumentHidden();
  const [tick, setTick] = useState(0);
  const stepRef = useRef(0);
  const lastChangeRef = useRef(Date.now());
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const idsKey = ids.join(',');

  useEffect(() => {
    stepRef.current = 0;
    lastChangeRef.current = Date.now();
  }, [resetKey]);

  useEffect(() => {
    if (!idsKey || hidden) return undefined;
    if (Date.now() - lastChangeRef.current > POLL_GIVE_UP_MS) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      stepRef.current += 1;
      let changed = false;
      try {
        changed = await pollRef.current(idsKey.split(','));
      } catch {
        // A failed poll is retried on the next tick, with the longer delay.
      }
      if (cancelled) return;
      if (changed) {
        stepRef.current = 0;
        lastChangeRef.current = Date.now();
      }
      setTick((n) => n + 1);
    }, nextPollDelay(stepRef.current));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // `tick` re-arms the timer after every poll, even when the ids did not change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, hidden, resetKey, tick]);
}
