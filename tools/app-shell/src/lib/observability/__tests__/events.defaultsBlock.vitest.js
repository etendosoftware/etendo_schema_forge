import {
  OBSERVABILITY_CHANNELS,
  OBSERVABILITY_PROPERTY_KEYS,
  buildObservabilityEvent,
  getObservabilityEvent,
} from '../events.js';

// ETP-4741 — the creation-form defaults fetch reports how long it blocked the
// form. startTiming only emits an event that is registered in the catalog with
// the TIMING channel and a durationMs property, so the catalog entry is part of
// the contract, not an implementation detail.
describe('defaults_block observability event (ETP-4741)', () => {
  it('is registered in the catalog', () => {
    expect(
      getObservabilityEvent('defaults_block')?.name,
      'the catalog must define a defaults_block event'
    ).toBe('defaults_block');
  });

  it('is routed to the timing channel', () => {
    const channels = getObservabilityEvent('defaults_block')?.channels ?? [];

    expect(
      channels,
      'defaults_block must declare the TIMING channel or startTiming will drop it'
    ).toContain(OBSERVABILITY_CHANNELS.TIMING);
  });

  it('declares durationMs, entity and status properties', () => {
    const properties = getObservabilityEvent('defaults_block')?.properties ?? [];

    expect(properties).toContain(OBSERVABILITY_PROPERTY_KEYS.DURATION_MS);
    expect(properties).toContain(OBSERVABILITY_PROPERTY_KEYS.ENTITY);
    expect(properties).toContain(OBSERVABILITY_PROPERTY_KEYS.STATUS);
  });

  // `category` is globally safe (payload.js keeps it) but is NOT part of this
  // event's declared properties, so it only gets dropped once defaults_block is
  // catalog-backed and pickEventProperties filters against its property list.
  it('builds a payload limited to its declared properties', () => {
    const event = buildObservabilityEvent('defaults_block', {
      durationMs: 1200,
      entity: 'salesOrder',
      status: 'timeout',
      category: 'should-be-dropped',
    });

    expect(event.properties).toEqual({
      durationMs: 1200,
      entity: 'salesOrder',
      status: 'timeout',
    });
  });
});
