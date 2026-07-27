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
    RESOLUTION_EVENTS.forEach(event => client.addHandler(event, onChange));
    return () => RESOLUTION_EVENTS.forEach(event => client.removeHandler(event, onChange));
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
