import {
  OBSERVABILITY_CHANNELS,
  OBSERVABILITY_EVENT_LIST,
  OBSERVABILITY_EVENTS,
  OBSERVABILITY_PROPERTY_KEYS,
  buildObservabilityEvent,
  getObservabilityEvent,
} from '../events.js';

const ALLOWED_CHANNELS = new Set(Object.values(OBSERVABILITY_CHANNELS));
const ALLOWED_PROPERTIES = new Set(Object.values(OBSERVABILITY_PROPERTY_KEYS));
const SNAKE_CASE_EVENT_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

describe('observability event catalog', () => {
  it('uses snake_case names for every event', () => {
    for (const event of OBSERVABILITY_EVENT_LIST) {
      expect(event.name).toMatch(SNAKE_CASE_EVENT_NAME);
    }
  });

  it('keeps event names unique', () => {
    const names = OBSERVABILITY_EVENT_LIST.map(event => event.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only known channels and property keys', () => {
    for (const event of OBSERVABILITY_EVENT_LIST) {
      for (const channel of event.channels) {
        expect(ALLOWED_CHANNELS.has(channel)).toBe(true);
      }

      for (const property of event.properties) {
        expect(ALLOWED_PROPERTIES.has(property)).toBe(true);
      }
    }
  });

  it('preserves the current onboarding event strings exactly', () => {
    expect(OBSERVABILITY_EVENTS.ONBOARDING_AUTH_SUBMITTED.name).toBe('onboarding_auth_submitted');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_AUTH_SUCCEEDED.name).toBe('onboarding_auth_succeeded');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_AUTH_FAILED.name).toBe('onboarding_auth_failed');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_AUTH_LOGOUT.name).toBe('onboarding_auth_logout');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_ENVIRONMENT_ENTER_SUBMITTED.name).toBe('onboarding_environment_enter_submitted');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_ENVIRONMENT_ENTER_SUCCEEDED.name).toBe('onboarding_environment_enter_succeeded');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_ENVIRONMENT_ENTER_FAILED.name).toBe('onboarding_environment_enter_failed');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_RUN_STARTED.name).toBe('onboarding_run_started');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_RUN_SUCCEEDED.name).toBe('onboarding_run_succeeded');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_RUN_FAILED.name).toBe('onboarding_run_failed');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_SETUP_STEP_COMPLETED.name).toBe('onboarding_setup_step_completed');
    expect(OBSERVABILITY_EVENTS.ONBOARDING_SETUP_STEP_BACK.name).toBe('onboarding_setup_step_back');
  });

  it('builds stable payloads from the catalog and drops unknown keys', () => {
    expect(buildObservabilityEvent(OBSERVABILITY_EVENTS.TIME_TO_CREATE, {
      category: 'contacts',
      durationMs: 1200,
      entity: 'business_partner',
      operation: 'create',
      specName: 'business-partner',
      label: 'Private label',
      recordId: 'secret',
    })).toEqual({
      name: 'time_to_create',
      properties: {
        category: 'contacts',
        durationMs: 1200,
        entity: 'business_partner',
        operation: 'create',
        specName: 'business-partner',
      },
    });
  });

  it('normalizes catalog event properties before returning them', () => {
    expect(buildObservabilityEvent(OBSERVABILITY_EVENTS.TIME_TO_CREATE, {
      category: 'contacts',
      durationMs: '1200',
      value: true,
    })).toEqual({
      name: 'time_to_create',
      properties: {
        category: 'contacts',
      },
    });
  });

  it('normalizes fallback event properties for ad hoc callers', () => {
    expect(buildObservabilityEvent('custom_event', {
      action: 'open',
      rawUrl: '/private/123',
      randomKey: 'ignored',
    })).toEqual({
      name: 'custom_event',
      properties: {
        action: 'open',
      },
    });
  });

  it('resolves events by name', () => {
    expect(getObservabilityEvent('time_to_create')).toBe(OBSERVABILITY_EVENTS.TIME_TO_CREATE);
  });

  it('resolves event-like objects through the canonical catalog', () => {
    expect(getObservabilityEvent({
      name: 'time_to_create',
      channels: ['custom-channel'],
      properties: ['unsafeProperty'],
    })).toBe(OBSERVABILITY_EVENTS.TIME_TO_CREATE);

    expect(getObservabilityEvent({
      name: 'uncataloged_event',
      channels: ['mixpanel'],
      properties: ['action'],
    })).toBeUndefined();
  });

  it('rejects malformed event definition objects', () => {
    expect(getObservabilityEvent({ name: 'time_to_create' })).toBeUndefined();
    expect(buildObservabilityEvent({ name: 'time_to_create' }, { durationMs: 10 })).toEqual({
      name: undefined,
      properties: {},
    });
  });
});
