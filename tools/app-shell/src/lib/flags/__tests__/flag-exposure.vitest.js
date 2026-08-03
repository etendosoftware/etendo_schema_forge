/**
 * Flag exposure reporting (ETP-4686).
 *
 * Two properties make this hook safe to run inside flag resolution, and both
 * are load-bearing: it deduplicates (the hook runs on every render, so without
 * it the event is uncountable) and it never disturbs evaluation (a reporting
 * failure must not change what a flag resolves to).
 */

import {
  createFlagExposureHook,
  buildExposureProperties,
  resetExposureCache,
} from '../flag-exposure.js';
import { buildObservabilityEvent, OBSERVABILITY_EVENTS } from '../../observability/events.js';
import { sanitizeEventProperties } from '../../observability/payload.js';

function hookContext({ flagKey = 'tenant-upgrade', provider = 'in-memory', targetingKey = 'ada' } = {}) {
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
      flagKey: 'tenant-upgrade',
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
      flagKey: 'tenant-upgrade',
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
      expect.objectContaining({ flagKey: 'tenant-upgrade', enabled: true })
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
