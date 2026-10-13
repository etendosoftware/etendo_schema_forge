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
 * Subscribes a component to a flag and re-reads it after every resolution event. `read` is the
 * typed OpenFeature getter (`getBooleanValue` / `getNumberValue`); the rest — the
 * Ready-ordering workaround included — is identical for every flag type.
 */
function useFlagValue(key, fallback, read) {
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

  // Booleans and numbers are compared by value, so returning a fresh evaluation
  // on every call is safe for useSyncExternalStore.
  const getSnapshot = useCallback(
    () => read(OpenFeature.getClient(), key, fallback),
    [key, fallback, read]
  );

  // The server snapshot is the declared default: SSR and the pre-hydration
  // pass must never assume a flag is on.
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

const readBoolean = (client, key, fallback) => client.getBooleanValue(key, fallback);
const readNumber = (client, key, fallback) => client.getNumberValue(key, fallback);

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
  return useFlagValue(key, defaultValue ?? defaultForFlag(key), readBoolean);
}

/**
 * Reads a NUMERIC feature flag (ETP-5676, e.g. `import-batch-size`). Same contract as
 * `useFeatureFlag`: synchronous, always answers, the declared default stands in until the control
 * plane does.
 *
 * @param {string} key Flag key from `flag-keys.js`
 * @param {number} [defaultValue] Overrides the default declared for the key
 */
export function useNumberFlag(key, defaultValue) {
  const declared = defaultValue ?? defaultForFlag(key);
  return useFlagValue(key, typeof declared === 'number' ? declared : 0, readNumber);
}
