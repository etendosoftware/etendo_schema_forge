/**
 * Flag exposure reporting (ETP-4686).
 *
 * Two properties make this hook safe to run inside flag resolution, and both
 * are load-bearing:
 *
 * - **It never disturbs evaluation.** A reporting failure must not change what a
 *   flag resolves to.
 * - **It deduplicates per flag/value/provider.** The hook runs on every render,
 *   so without dedupe the event is uncountable — but the provider belongs in the
 *   key. The hook is registered before the real provider is ready, so the first
 *   evaluation of every page load resolves through OpenFeature's built-in no-op
 *   default. Keying on flag/value alone let that transient result claim the
 *   session and silently swallow every later evaluation from the real provider;
 *   a Mixpanel board showed 74% of exposures attributed to "No-op Provider" as a
 *   result. Both the "report each provider once" and "collapse repeats from one
 *   provider" halves are asserted below — they trade off directly against each
 *   other, so neither may regress in the name of the other.
 */

import {
  createFlagExposureHook,
  buildExposureProperties,
  resetExposureCache,
} from '../flag-exposure.js';
import { buildObservabilityEvent, OBSERVABILITY_EVENTS } from '../../observability/events.js';
import { sanitizeEventProperties } from '../../observability/payload.js';

function hookContext({ flagKey = 'sample-flag', provider = 'in-memory', targetingKey = 'ada' } = {}) {
  return {
    flagKey,
    providerMetadata: { name: provider },
    context: { targetingKey },
  };
}

const details = (value, variant = value ? 'on' : 'off') => ({ value, variant });

beforeEach(() => {
  resetExposureCache();
});

describe('buildExposureProperties', () => {
  it('maps the evaluation onto the declared event properties', () => {
    expect(buildExposureProperties(hookContext(), details(true))).toEqual({
      flagKey: 'sample-flag',
      enabled: true,
      variant: 'on',
      provider: 'in-memory',
      username: 'ada',
    });
  });

  it('reports the value as `enabled`, never as `value`', () => {
    const properties = buildExposureProperties(hookContext(), details(false));
    expect(properties).toHaveProperty('enabled', false);
    expect(properties).not.toHaveProperty('value');
  });

  it('tolerates a missing hook context without throwing', () => {
    expect(() => buildExposureProperties(undefined, undefined)).not.toThrow();
  });
});

describe('the reported payload survives the observability sanitizer', () => {
  it('keeps every property, including the boolean', () => {
    const event = buildObservabilityEvent(
      OBSERVABILITY_EVENTS.FEATURE_FLAG_EVALUATED,
      buildExposureProperties(hookContext(), details(true))
    );
    expect(event.name).toBe('feature_flag_evaluated');
    expect(sanitizeEventProperties(event.properties)).toEqual({
      flagKey: 'sample-flag',
      enabled: true,
      variant: 'on',
      provider: 'in-memory',
      username: 'ada',
    });
  });
});

describe('createFlagExposureHook — deduplication', () => {
  it('reports a flag/value combination exactly once per session', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext(), details(true));
    hook.after(hookContext(), details(true));
    hook.after(hookContext(), details(true));

    expect(trackImpl).toHaveBeenCalledTimes(1);
    expect(trackImpl).toHaveBeenCalledWith(
      'feature_flag_evaluated',
      expect.objectContaining({ flagKey: 'sample-flag', enabled: true })
    );
  });

  it('reports each distinct value of the same flag once', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext(), details(true));
    hook.after(hookContext(), details(false));
    hook.after(hookContext(), details(true));

    expect(trackImpl).toHaveBeenCalledTimes(2);
    expect(trackImpl.mock.calls.map(([, properties]) => properties.enabled)).toEqual([true, false]);
  });

  it('keeps separate flags separate', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext({ flagKey: 'flag-a' }), details(true));
    hook.after(hookContext({ flagKey: 'flag-b' }), details(true));

    expect(trackImpl).toHaveBeenCalledTimes(2);
  });

  it('reports again after the session cache is reset', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext(), details(true));
    resetExposureCache();
    hook.after(hookContext(), details(true));

    expect(trackImpl).toHaveBeenCalledTimes(2);
  });

  it('collapses every repeat evaluation from one provider, however many renders', () => {
    // The volume guarantee, named explicitly: adding the provider to the dedupe
    // key must not turn a re-render into an event. `useFeatureFlag` evaluates on
    // every render, so a regression here multiplies the event count by the render
    // count rather than by the (small, bounded) number of providers.
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    for (let render = 0; render < 50; render += 1) {
      hook.after(hookContext({ provider: 'configcat' }), details(false));
    }

    expect(trackImpl).toHaveBeenCalledTimes(1);
    expect(trackImpl).toHaveBeenCalledWith(
      'feature_flag_evaluated',
      expect.objectContaining({ enabled: false, provider: 'configcat' })
    );
  });
});

/**
 * The provider dimension of the dedupe key.
 *
 * `initFeatureFlags` registers this hook before awaiting `createFlagProvider`, so
 * the first evaluation of every page load resolves through OpenFeature's built-in
 * no-op provider — which can only ever return the flag's declared default. These
 * are the literal names the SDK and the branch report, so the scenario below is
 * the one that actually reaches Mixpanel.
 */
describe('createFlagExposureHook — the provider is part of the dedupe key', () => {
  const NO_OP = 'No-op Provider';

  it('reports the same flag and value once per provider', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext({ provider: 'in-memory' }), details(false));
    hook.after(hookContext({ provider: 'configcat' }), details(false));

    expect(trackImpl).toHaveBeenCalledTimes(2);
    expect(trackImpl.mock.calls.map(([, properties]) => properties.provider))
      .toEqual(['in-memory', 'configcat']);
    // Same flag, same resolved value — only the provider differs.
    for (const [, properties] of trackImpl.mock.calls) {
      expect(properties).toMatchObject({ flagKey: 'sample-flag', enabled: false });
    }
  });

  it('does not let the startup no-op swallow the real provider that follows it', () => {
    // The regression this key exists to prevent: the no-op resolves `false`
    // because it has no data, the real provider later resolves `false` because
    // that is genuinely the value, and both must be visible. Under the old
    // flag/value key the second call was silently dropped, so a working control
    // plane was invisible in the board.
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext({ provider: NO_OP }), details(false));
    hook.after(hookContext({ provider: 'configcat' }), details(false));

    expect(trackImpl).toHaveBeenCalledTimes(2);
    expect(trackImpl.mock.calls.at(-1)?.[1]).toMatchObject({
      provider: 'configcat',
      enabled: false,
    });
  });

  it('still reports the real provider once when it disagrees with the no-op', () => {
    // The no-op can only answer with the declared default (`false`); a control
    // plane that has the flag on resolves `true`. Both differ in value AND
    // provider, so both are reported — and the enabled one is attributed to the
    // provider that actually decided it.
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext({ provider: NO_OP }), details(false));
    hook.after(hookContext({ provider: 'configcat' }), details(true));

    expect(trackImpl).toHaveBeenCalledTimes(2);
    expect(trackImpl.mock.calls.map(([, p]) => [p.provider, p.enabled]))
      .toEqual([[NO_OP, false], ['configcat', true]]);
  });

  it('reports each provider exactly once, not once per render', () => {
    // Both halves of the contract at the same time: three providers interleaved
    // across many renders yield three events, not nine.
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    for (let render = 0; render < 3; render += 1) {
      for (const provider of [NO_OP, 'in-memory', 'configcat']) {
        hook.after(hookContext({ provider }), details(false));
      }
    }

    expect(trackImpl).toHaveBeenCalledTimes(3);
    expect(trackImpl.mock.calls.map(([, p]) => p.provider))
      .toEqual([NO_OP, 'in-memory', 'configcat']);
  });

  it('treats an unidentified provider as its own bucket rather than throwing', () => {
    // `providerMetadata` is supplied by OpenFeature, but the hook must not depend
    // on it being populated to keep reporting.
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after({ flagKey: 'sample-flag', context: {} }, details(false));
    hook.after(hookContext({ provider: 'configcat' }), details(false));

    expect(trackImpl).toHaveBeenCalledTimes(2);
    expect(trackImpl.mock.calls[0][1].provider).toBeUndefined();
  });
});

describe('createFlagExposureHook — never disturbs evaluation', () => {
  it('ignores an evaluation with no flag key', () => {
    const trackImpl = vi.fn();
    createFlagExposureHook({ trackImpl }).after({ flagKey: undefined }, details(true));
    expect(trackImpl).not.toHaveBeenCalled();
  });

  it('ignores a non-boolean resolved value', () => {
    const trackImpl = vi.fn();
    const hook = createFlagExposureHook({ trackImpl });

    hook.after(hookContext(), { value: 'on', variant: 'on' });
    hook.after(hookContext(), { value: undefined });
    hook.after(hookContext(), undefined);

    expect(trackImpl).not.toHaveBeenCalled();
  });

  it('swallows a throwing tracker', () => {
    const trackImpl = vi.fn(() => {
      throw new Error('observability is down');
    });
    expect(() => createFlagExposureHook({ trackImpl }).after(hookContext(), details(true)))
      .not.toThrow();
  });

  it('swallows a rejecting tracker without an unhandled rejection', async () => {
    const trackImpl = vi.fn(() => Promise.reject(new Error('network')));
    expect(() => createFlagExposureHook({ trackImpl }).after(hookContext(), details(true)))
      .not.toThrow();
    // Give the rejection a turn to surface if it were left unhandled.
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('returns synchronously rather than awaiting the tracker', () => {
    let resolveTrack;
    const trackImpl = vi.fn(() => new Promise(resolve => { resolveTrack = resolve; }));
    const result = createFlagExposureHook({ trackImpl }).after(hookContext(), details(true));

    expect(result).toBeUndefined();
    expect(trackImpl).toHaveBeenCalledTimes(1);
    resolveTrack?.();
  });
});
