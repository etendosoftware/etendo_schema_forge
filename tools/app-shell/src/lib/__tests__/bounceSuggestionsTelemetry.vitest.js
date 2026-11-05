// @covers tools/app-shell/src/lib/bounceSuggestionsTelemetry.js
// @covers tools/app-shell/src/lib/observability/events.js
// @covers tools/app-shell/src/lib/observability/payload.js
// @covers tools/app-shell/src/lib/observability.js
/**
 * The bounce-suggestion events of the automatch modal (ETP-5581, roadmap #15): what reaches the
 * shared tracker — the tenant, pair counts and a boolean, nothing else.
 */
const observabilityMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability.js', () => ({
  track: observabilityMocks.track,
}));

import {
  trackBounceSuggestionsDismissed,
  trackBounceSuggestionsViewed,
} from '../bounceSuggestionsTelemetry.js';
import { clearSessionIdentity, setSessionIdentity } from '../sessionIdentity.js';

describe('bounceSuggestionsTelemetry', () => {
  beforeEach(() => {
    observabilityMocks.track.mockReset();
    observabilityMocks.track.mockResolvedValue(undefined);
    setSessionIdentity({ clientId: 'client-1', username: 'jane' });
  });

  afterEach(() => {
    clearSessionIdentity();
  });

  it('bounce_suggestions_viewed carries the tenant, the pair counts and auto_opened', () => {
    trackBounceSuggestionsViewed({ pairsShown: 3, pairsPreselected: 1, autoOpened: true });

    expect(observabilityMocks.track).toHaveBeenCalledWith('bounce_suggestions_viewed', {
      account_id: 'client-1',
      pairs_shown: 3,
      pairs_preselected: 1,
      auto_opened: true,
    });
  });

  it('bounce_suggestions_dismissed carries the tenant, the counts at close and auto_opened', () => {
    trackBounceSuggestionsDismissed({ pairsShown: 2, pairsCheckedAtClose: 0, autoOpened: false });

    expect(observabilityMocks.track).toHaveBeenCalledWith('bounce_suggestions_dismissed', {
      account_id: 'client-1',
      pairs_shown: 2,
      pairs_checked_at_close: 0,
      auto_opened: false,
    });
  });

  it('never sends the user, nor a property the event does not declare', () => {
    trackBounceSuggestionsViewed({
      pairsShown: 1, pairsPreselected: 0, autoOpened: false,
      // Not part of the wrapper's signature: must never travel even if a caller passes it.
      groupKey: 'bp-1', statementLineId: 'L1', amount: 120,
    });

    const [, properties] = observabilityMocks.track.mock.calls[0];
    expect(Object.keys(properties).sort()).toEqual(
      ['account_id', 'auto_opened', 'pairs_preselected', 'pairs_shown'],
    );
  });

  it('omits the account when nobody is signed in, and coerces auto_opened to a boolean', () => {
    clearSessionIdentity();
    trackBounceSuggestionsDismissed({ pairsShown: 1, pairsCheckedAtClose: 1 });

    const [, properties] = observabilityMocks.track.mock.calls[0];
    expect(properties).not.toHaveProperty('account_id');
    expect(properties.auto_opened).toBe(false);
  });

  it('drops a count outside the policy range instead of sending it', () => {
    trackBounceSuggestionsViewed({ pairsShown: -1, pairsPreselected: Number.NaN, autoOpened: true });

    const [, properties] = observabilityMocks.track.mock.calls[0];
    expect(properties).not.toHaveProperty('pairs_shown');
    expect(properties).not.toHaveProperty('pairs_preselected');
  });

  it('a failing or throwing tracker never reaches the caller', async () => {
    observabilityMocks.track.mockRejectedValueOnce(new Error('offline'));
    expect(() => trackBounceSuggestionsViewed({ pairsShown: 1, pairsPreselected: 1, autoOpened: true }))
      .not.toThrow();
    observabilityMocks.track.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => trackBounceSuggestionsDismissed({ pairsShown: 1, pairsCheckedAtClose: 0, autoOpened: true }))
      .not.toThrow();
    await Promise.resolve();
  });
});

// The real shared tracker, not the mock above: a support session (ETP-5351) silences these events
// like every other product event. Fresh copies of the modules, so the store and the tracker
// singleton start clean and the module-level mock of the tracker does not apply.
describe('bounceSuggestionsTelemetry through the shared tracker', () => {
  const SUPPORT_MARKER = { clientId: 'client-1', clientName: 'Acme', expiresAt: '2099-01-01T00:00:00Z' };

  function makeProvider(name, extra = {}) {
    return {
      name,
      enabled: true,
      init: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
      page: vi.fn().mockResolvedValue(undefined),
      identify: vi.fn().mockResolvedValue(undefined),
      group: vi.fn().mockResolvedValue(undefined),
      groupSet: vi.fn().mockResolvedValue(undefined),
      captureException: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
      setContext: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      ...extra,
    };
  }

  async function loadRealTracker() {
    vi.resetModules();
    vi.doUnmock('@/lib/observability.js');
    const support = await import('../supportSession.js');
    const observability = await import('../observability.js');
    const identity = await import('../sessionIdentity.js');
    const telemetry = await import('../bounceSuggestionsTelemetry.js');
    const mixpanel = makeProvider('mixpanel', { analytics: true });
    const datadog = makeProvider('datadog');
    await observability.initObservability({ providers: [mixpanel, datadog] });
    identity.setSessionIdentity({ clientId: 'client-1', username: 'jane' });
    return { support, observability, telemetry, mixpanel, datadog };
  }

  /** Lets the fire-and-forget `track` promise chain settle. */
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

  afterEach(() => {
    localStorage.clear();
  });

  it('sends nothing to any provider while a support session is active', async () => {
    const { support, observability, telemetry, mixpanel, datadog } = await loadRealTracker();
    support.applySupportSessionFromServer(SUPPORT_MARKER, { storage: localStorage });
    await settle();
    expect(observability.isAnalyticsSuppressed()).toBe(true);

    telemetry.trackBounceSuggestionsViewed({ pairsShown: 3, pairsPreselected: 1, autoOpened: true });
    telemetry.trackBounceSuggestionsDismissed({ pairsShown: 3, pairsCheckedAtClose: 1, autoOpened: true });
    await settle();

    const names = [...mixpanel.track.mock.calls, ...datadog.track.mock.calls].map(([name]) => name);
    expect(names).not.toContain('bounce_suggestions_viewed');
    expect(names).not.toContain('bounce_suggestions_dismissed');
  });

  it('reaches the providers once the support session ends, with the declared properties only', async () => {
    const { support, telemetry, mixpanel } = await loadRealTracker();
    support.applySupportSessionFromServer(SUPPORT_MARKER, { storage: localStorage });
    await settle();
    support.applySupportSessionFromServer(null, { storage: localStorage });
    await settle();

    telemetry.trackBounceSuggestionsViewed({ pairsShown: 3, pairsPreselected: 1, autoOpened: false });
    await settle();

    const call = mixpanel.track.mock.calls.find(([name]) => name === 'bounce_suggestions_viewed');
    expect(call).toBeTruthy();
    expect(call[1]).toMatchObject({ account_id: 'client-1', pairs_shown: 3, pairs_preselected: 1, auto_opened: false });
    expect(call[1]).not.toHaveProperty('username');
  });
});
