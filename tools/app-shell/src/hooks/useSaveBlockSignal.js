import { useCallback, useSyncExternalStore } from 'react';
import { getSaveBlockCount, subscribeSaveBlock } from '@/lib/saveBlockSignal.js';

/**
 * React binding for the save-block signal bus (ETP-5245).
 *
 * Returns a number that increments every time a save is refused for `id` — the stable toast id
 * the save gate passes to `reportInvalidFormatField` (e.g. `'product-cost-required'`). Feed it to
 * `InfoBanner`'s `reopenSignal` prop and the banner un-dismisses itself on every fresh refusal,
 * so a user who closed the explanation still gets it back the moment they hit the block again.
 *
 * `useSyncExternalStore` rather than useState+useEffect: the snapshot is a plain number read
 * straight from the store, so a block fired between render and effect-subscription can't be
 * missed — exactly the race that matters here, since the banner and the save gate live in
 * different subtrees.
 */
export function useSaveBlockSignal(id) {
  const subscribe = useCallback(listener => subscribeSaveBlock(id, listener), [id]);
  const getSnapshot = useCallback(() => getSaveBlockCount(id), [id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default useSaveBlockSignal;
