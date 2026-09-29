import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { TELEMETRY_KILL_ALL, TELEMETRY_KILL_PROVIDER_FLAGS } from '../flags/flag-keys.js';

/**
 * Telemetry kill switch (ETP-4578, D2): stops the observability providers from a runtime flag,
 * with no deploy.
 *
 * Two layers decide whether a provider may run:
 *
 *  1. **Build default** — `VITE_TELEMETRY_KILL`: `true` stops every provider, a comma list
 *     (`mixpanel,aws-rum`) stops those. It needs no network, so it holds from the first
 *     millisecond, and it cannot be lifted remotely: a build shipped with a provider killed
 *     stays killed.
 *  2. **Runtime flags** — `telemetry-kill-all` and `telemetry-kill-<provider>`, served by
 *     whichever control plane backs OpenFeature. A flag can only STOP telemetry that the
 *     build allows; it never starts a provider the build did not configure.
 *
 * A provider killed BEFORE the gateway starts is never started — its SDK is not even
 * imported, so no outbound call is possible. One killed later is shut down in place.
 */

const KILL_CONFIG_ERROR = '[observability] VITE_TELEMETRY_KILL names an unknown provider';

export const TELEMETRY_PROVIDER_NAMES = Object.freeze(Object.keys(TELEMETRY_KILL_PROVIDER_FLAGS));

/** `true` → everything; `mixpanel, aws-rum` → those; anything else → nothing. */
export function parseKillEnv(raw, logger = console) {
  const state = { all: false, names: new Set() };
  if (raw === true || String(raw ?? '').trim().toLowerCase() === 'true') {
    state.all = true;
    return state;
  }
  for (const token of String(raw ?? '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)) {
    if (TELEMETRY_PROVIDER_NAMES.includes(token)) state.names.add(token);
    else logger?.warn?.(`${KILL_CONFIG_ERROR}: ${token}`);
  }
  return state;
}

/** Build default OR runtime flags. Flag reads are synchronous and answer `false` with no provider. */
export function readKillState({ env = import.meta.env, client, logger = console } = {}) {
  const state = parseKillEnv(env?.VITE_TELEMETRY_KILL, logger);
  let flags;
  state.failed = false;
  try {
    flags = client ?? OpenFeature.getClient();
    if (flags.getBooleanValue(TELEMETRY_KILL_ALL, false)) state.all = true;
    for (const [name, key] of Object.entries(TELEMETRY_KILL_PROVIDER_FLAGS)) {
      if (flags.getBooleanValue(key, false)) state.names.add(name);
    }
  } catch (error) {
    // A broken flag client must not take telemetry down or up by accident. Callers that hold a
    // running gateway keep their current state when `failed` is set.
    state.failed = true;
    logger?.warn?.('[observability] could not read the telemetry kill flags', error);
  }
  return state;
}

/** The gateway's `disabled` option for a state. */
export function killStateToDisabled(state) {
  if (state.all) return true;
  return state.names.size > 0 ? [...state.names] : false;
}

/**
 * Applies flag changes to a running gateway: kills what became killed, revives what stopped
 * being killed. Changes are serialized so a quick on/off never interleaves.
 *
 * @param {{disable: Function, enable: Function}} target The observability facade.
 * @param {object} options
 * @param {object} options.initial The state the gateway was started with.
 * @returns {{apply: () => Promise<void>, unbind: () => void}}
 */
export function bindTelemetryKillSwitch(target, { env = import.meta.env, initial, logger = console, client } = {}) {
  const flags = client ?? OpenFeature.getClient();
  let applied = { all: Boolean(initial?.all), names: new Set(initial?.names ?? []) };
  let chain = Promise.resolve();

  async function reconcile() {
    const next = readKillState({ env, client: flags, logger });
    if (next.failed) return; // never revive a killed provider because the flag read broke
    const previous = applied;
    applied = next;
    // Lifting the global switch does not revive an adapter killed by name (gateway contract),
    // so the names are reconciled separately.
    if (next.all && !previous.all) await target.disable();
    if (!next.all && previous.all) await target.enable();
    for (const name of next.names) if (!previous.names.has(name)) await target.disable(name);
    for (const name of previous.names) if (!next.names.has(name)) await target.enable(name);
  }

  const apply = () => {
    chain = chain.then(reconcile).catch((error) => {
      logger?.warn?.('[observability] could not apply the telemetry kill switch', error);
    });
    return chain;
  };

  // `@openfeature/web-sdk` emits Ready one microtask BEFORE the provider is live for
  // evaluation (see useFeatureFlag), so re-read on the next microtask too.
  const notify = () => {
    apply();
    queueMicrotask(apply);
  };
  const events = [ProviderEvents.Ready, ProviderEvents.ConfigurationChanged, ProviderEvents.ContextChanged];
  events.forEach((event) => flags.addHandler(event, notify));

  return {
    apply,
    unbind: () => events.forEach((event) => flags.removeHandler(event, notify)),
  };
}
