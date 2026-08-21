import { useEffect, useState } from 'react';

/**
 * Broadcast when a record was written by something outside the window's own save flow — today, the
 * payment editor opened from the payment window and from the payments grid.
 *
 * Deliberately NOT `neo:processSuccess`: the payment sidebar listens to that one to append a
 * "confirmado"/"reactivado" entry to the activity timeline, so reusing it would invent a lifecycle
 * event every time someone merely saved a draft.
 */
export const RECORD_UPDATED_EVENT = 'etgo:recordUpdated';

/** Announces that `recordId` changed, so panels showing derived data can refetch. */
export function notifyRecordUpdated(recordId) {
  if (!recordId) return;
  window.dispatchEvent(new CustomEvent(RECORD_UPDATED_EVENT, { detail: { recordId } }));
}

/**
 * A counter that bumps whenever `recordId` is announced as changed. Add it to a fetch effect's
 * dependencies to make that panel reload.
 *
 * <p>Panels that show a record's *children* (the applied lines, the totals) cannot key their fetch
 * on the record itself: editing a payment leaves its id untouched, and `Updated` is not even
 * registered as a NEO field on these entities, so nothing in the payload changes for them to react
 * to. They kept showing pre-save amounts until the whole window was reloaded.
 */
export function useRecordRefreshSignal(recordId) {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    if (!recordId) return undefined;
    const handler = (e) => {
      if (e.detail?.recordId === recordId) setSignal((n) => n + 1);
    };
    window.addEventListener(RECORD_UPDATED_EVENT, handler);
    return () => window.removeEventListener(RECORD_UPDATED_EVENT, handler);
  }, [recordId]);

  return signal;
}
