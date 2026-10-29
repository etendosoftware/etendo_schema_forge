import { useCallback, useSyncExternalStore } from 'react';
import { getPendingCount, subscribePending } from '@/lib/formPendingWork.js';

/**
 * React binding for the form pending-work registry (`lib/formPendingWork.js`).
 *
 * Returns `true` while a custom form component of the form identified by `scope` has work in
 * flight whose result must land before the record is saved. `useSyncExternalStore` because the
 * snapshot is a plain number read straight from the store: a registration made between render and
 * effect subscription (the watcher registers in a layout effect, the save button subscribes in a
 * passive one) cannot be missed.
 */
export function useFormPendingWork(scope) {
  const subscribe = useCallback(listener => subscribePending(scope, listener), [scope]);
  const getSnapshot = useCallback(() => getPendingCount(scope), [scope]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) > 0;
}

export default useFormPendingWork;
