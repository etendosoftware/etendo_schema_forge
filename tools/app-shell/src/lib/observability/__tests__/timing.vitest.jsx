import { renderHook } from '@testing-library/react';

const observabilityMock = vi.hoisted(() => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../observability.js', () => ({
  track: observabilityMock.track,
}));

import { OBSERVABILITY_EVENTS } from '../events.js';
import { startTiming } from '../timing.js';
import { useTiming } from '../useTiming.js';

describe('startTiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks a catalog-backed timing event with durationMs', async () => {
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(432.2);

    const stop = startTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, { now });
    const event = await stop({
      category: 'contacts',
      entity: 'business_partner',
      operation: 'create',
      specName: 'business-partner',
      label: 'should-be-dropped',
    });

    expect(observabilityMock.track).toHaveBeenCalledWith('time_to_create', {
      category: 'contacts',
      durationMs: 332,
      entity: 'business_partner',
      operation: 'create',
      specName: 'business-partner',
    });
    expect(event).toEqual({
      name: 'time_to_create',
      properties: {
        category: 'contacts',
        durationMs: 332,
        entity: 'business_partner',
        operation: 'create',
        specName: 'business-partner',
      },
    });
  });

  it('tracks only once even if stop is called twice', async () => {
    const now = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20);

    const stop = startTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, { now });
    await stop({ category: 'contacts' });
    await stop({ category: 'contacts' });

    expect(observabilityMock.track).toHaveBeenCalledTimes(1);
  });

  it('returns without tracking when no valid clock is available', async () => {
    const stop = startTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, {
      now: () => undefined,
    });

    await expect(stop({ category: 'contacts' })).resolves.toBeUndefined();
    expect(observabilityMock.track).not.toHaveBeenCalled();
  });

  it('returns without tracking unknown timing event names', async () => {
    const stop = startTiming('ad_hoc_timing_event', {
      now: () => 10,
    });

    await expect(stop({ durationMs: 20, rawUrl: '/private/123' })).resolves.toBeUndefined();
    expect(observabilityMock.track).not.toHaveBeenCalled();
  });

  it('returns without tracking catalog events that are not timing events', async () => {
    const now = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(40);
    const stop = startTiming(OBSERVABILITY_EVENTS.APP_STARTED, { now });

    await expect(stop({ category: 'startup' })).resolves.toBeUndefined();
    expect(observabilityMock.track).not.toHaveBeenCalled();
  });
});

describe('useTiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts and stops a timing session for React flows', async () => {
    const now = vi.fn()
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(140);
    const { result } = renderHook(() =>
      useTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, { now })
    );

    result.current.start({ category: 'contacts', specName: 'business-partner' });
    await result.current.stop({
      entity: 'business_partner',
      operation: 'create',
      rawUrl: '/business-partner/123',
    });

    expect(observabilityMock.track).toHaveBeenCalledWith('time_to_create', {
      category: 'contacts',
      durationMs: 90,
      entity: 'business_partner',
      operation: 'create',
      specName: 'business-partner',
    });
  });

  it('cancels an active timer without emitting an event', async () => {
    const now = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(40);
    const { result } = renderHook(() =>
      useTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, { now })
    );

    result.current.start({ category: 'contacts' });
    result.current.cancel();
    await result.current.stop({ entity: 'business_partner' });

    expect(observabilityMock.track).not.toHaveBeenCalled();
  });
});
