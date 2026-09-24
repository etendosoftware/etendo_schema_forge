import { useSyncExternalStore } from 'react';
import {
  getEnvironmentAccessDecision,
  subscribeEnvironmentAccessDecision,
} from '@/lib/environmentAccessGate.js';

/**
 * React binding for the environment-access gate (ETP-5443 follow-up). Returns the
 * blocking decision recorded from the latest NEO `windowaccessmap` call —
 * `'DEMO_TRIAL_EXPIRED'`, `'SUBSCRIPTION_REQUIRED'`, or `null` when access is not
 * currently blocked. See `lib/environmentAccessGate.js` for the full detection story.
 *
 * `useSyncExternalStore` rather than useState+useEffect: the snapshot is read straight
 * from the module-level store, so a decision recorded between render and effect
 * subscription can't be missed.
 */
export function useEnvironmentAccessGate() {
  return useSyncExternalStore(
    subscribeEnvironmentAccessDecision,
    getEnvironmentAccessDecision,
    getEnvironmentAccessDecision
  );
}

export default useEnvironmentAccessGate;
