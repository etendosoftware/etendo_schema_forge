import { useCallback, useSyncExternalStore } from 'react';
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { defaultForFlag } from './flag-keys.js';

/**
 * Events after which a flag may resolve differently: the provider finished
 * starting up, the control plane pushed a new configuration, or the evaluation
 * context changed because the user signed in.
 */
const RESOLUTION_EVENTS = [
  ProviderEvents.Ready,
  ProviderEvents.ConfigurationChanged,
  ProviderEvents.ContextChanged,
];

/**
 * Reads a boolean feature flag.
 *
 * The read is synchronous and always answers: before a provider is registered,
 * or when one is unreachable, OpenFeature's no-op provider hands back the
 * default, so components render normally instead of waiting on the network.
 *
 * Flags decide what the UI *shows*. Authorization is enforced by the backend —
 * never treat a value from here as a security boundary.
 *
 * @param {string} key Flag key from `flag-keys.js`
 * @param {boolean} [defaultValue] Overrides the default declared for the key
 */
export function useFeatureFlag(key, defaultValue) {
  const fallback = defaultValue ?? defaultForFlag(key);

  const subscribe = useCallback(onChange => {
    const client = OpenFeature.getClient();

    // `@openfeature/web-sdk` emits PROVIDER_READY one microtask *before* the new
    // provider is installed for evaluation:
    //
    //     inside Ready handler : false   <-- event fires here
    //     one microtask later  : true    <-- provider actually live
    //
    // useSyncExternalStore re-reads the snapshot synchronously when notified, so
    // notifying only from inside the handler reads the stale value, sees no
    // change, and skips the re-render — and no further event follows, pinning a
    // component that mounted first to its default for the whole session.
    //
    // Notifying both synchronously and on the next microtask makes this
    // independent of that ordering: whichever side of the boundary the
    // installation lands on, one of the two reads sees the new value. The
    // redundant notification costs a snapshot read, and React drops it when the
    // value is unchanged.
    const notify = () => {
      onChange();
      queueMicrotask(onChange);
    };

    RESOLUTION_EVENTS.forEach(event => client.addHandler(event, notify));
    return () => RESOLUTION_EVENTS.forEach(event => client.removeHandler(event, notify));
  }, []);

  // Booleans are compared by value, so returning a fresh evaluation on every
  // call is safe for useSyncExternalStore.
  const getSnapshot = useCallback(
    () => OpenFeature.getClient().getBooleanValue(key, fallback),
    [key, fallback]
  );

  // The server snapshot is the declared default: SSR and the pre-hydration
  // pass must never assume a flag is on.
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
