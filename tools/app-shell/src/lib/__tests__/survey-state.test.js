import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  readSurveyState,
  writeSurveyState,
  markFirstLogin,
  markOnboardingCompleted,
  markSurveyShown,
  markSurveyResponded,
  markSurveyDismissed,
  incrementSurveyCounter,
} from '../surveys/survey-state.js';

// survey-state.js reads and writes window.localStorage through a guarded getStorage().
// It has no imports of its own, so a plain in-memory stub is all the harness it needs —
// this is the node-runner counterpart of the existing vitest suite, kept here because the
// Node coverage pass is the one whose line model reaches the merged lcov.
const STORAGE_KEY = 'sf_survey_v1';

function installStorage({ throwOnGet = false, throwOnSet = false } = {}) {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        if (throwOnGet) throw new Error('getItem blocked');
        return map.has(key) ? map.get(key) : null;
      },
      setItem(key, value) {
        if (throwOnSet) throw new Error('setItem blocked');
        map.set(key, String(value));
      },
    },
  };
  return map;
}

function storedState(map) {
  return JSON.parse(map.get(STORAGE_KEY));
}

describe('survey-state', () => {
  let store;

  beforeEach(() => {
    store = installStorage();
  });

  afterEach(() => {
    delete globalThis.window;
  });

  describe('readSurveyState', () => {
    it('returns the defaults when nothing is stored', () => {
      const state = readSurveyState();
      assert.equal(state.firstLoginAt, null);
      assert.equal(state.onboardingCompleted, false);
      assert.equal(state.onboardingShown, false);
      assert.deepEqual(state.counters, { invoicing: 0, order: 0 });
      assert.deepEqual(state.shownThisMonth, {});
      assert.deepEqual(state.dismissals, {});
    });

    it('returns fresh mutable collections, not the frozen defaults', () => {
      const state = readSurveyState();
      state.counters.invoicing = 5;
      state.dismissals.x = 'y';
      const second = readSurveyState();
      assert.equal(second.counters.invoicing, 0);
      assert.deepEqual(second.dismissals, {});
    });

    it('merges stored values over the defaults', () => {
      store.set(STORAGE_KEY, JSON.stringify({
        onboardingCompleted: true,
        counters: { invoicing: 3, order: 1 },
      }));
      const state = readSurveyState();
      assert.equal(state.onboardingCompleted, true);
      assert.deepEqual(state.counters, { invoicing: 3, order: 1 });
      // Untouched keys still fall back to their default.
      assert.equal(state.lastShownAt, null);
    });

    it('falls back to the defaults when the stored payload is not valid JSON', () => {
      store.set(STORAGE_KEY, '{not json');
      const state = readSurveyState();
      assert.equal(state.onboardingCompleted, false);
      assert.deepEqual(state.counters, { invoicing: 0, order: 0 });
    });

    it('falls back to the defaults when reading from storage throws', () => {
      installStorage({ throwOnGet: true });
      const state = readSurveyState();
      assert.equal(state.firstLoginAt, null);
    });

    it('falls back to the defaults when there is no window at all', () => {
      delete globalThis.window;
      const state = readSurveyState();
      assert.equal(state.firstLoginAt, null);
      assert.deepEqual(state.counters, { invoicing: 0, order: 0 });
    });
  });

  describe('writeSurveyState', () => {
    it('persists the given state', () => {
      writeSurveyState({ onboardingCompleted: true });
      assert.equal(storedState(store).onboardingCompleted, true);
    });

    it('swallows storage failures instead of throwing', () => {
      installStorage({ throwOnSet: true });
      assert.doesNotThrow(() => writeSurveyState({ onboardingCompleted: true }));
    });
  });

  describe('markFirstLogin', () => {
    it('records both first and last login on a clean state', () => {
      const now = Date.parse('2026-03-01T10:00:00.000Z');
      markFirstLogin(now);
      const state = storedState(store);
      assert.equal(state.firstLoginAt, '2026-03-01T10:00:00.000Z');
      assert.equal(state.lastLoginAt, '2026-03-01T10:00:00.000Z');
    });

    it('keeps the original firstLoginAt and only moves lastLoginAt', () => {
      markFirstLogin(Date.parse('2026-03-01T10:00:00.000Z'));
      markFirstLogin(Date.parse('2026-04-02T08:30:00.000Z'));
      const state = storedState(store);
      assert.equal(state.firstLoginAt, '2026-03-01T10:00:00.000Z');
      assert.equal(state.lastLoginAt, '2026-04-02T08:30:00.000Z');
    });
  });

  describe('markOnboardingCompleted', () => {
    it('flips onboardingCompleted while preserving the rest of the state', () => {
      incrementSurveyCounter('invoicing');
      markOnboardingCompleted();
      const state = storedState(store);
      assert.equal(state.onboardingCompleted, true);
      assert.equal(state.counters.invoicing, 1);
    });
  });

  describe('markSurveyShown', () => {
    it('stamps lastShownAt and counts the month', () => {
      markSurveyShown('csat_invoicing', Date.parse('2026-05-04T12:00:00.000Z'));
      const state = storedState(store);
      assert.equal(state.lastShownAt, '2026-05-04T12:00:00.000Z');
      assert.deepEqual(state.shownThisMonth, { '2026-05': 1 });
      assert.equal(state.onboardingShown, false);
    });

    it('accumulates within the same month and starts a new key on the next one', () => {
      markSurveyShown('csat_invoicing', Date.parse('2026-05-04T12:00:00.000Z'));
      markSurveyShown('csat_invoicing', Date.parse('2026-05-20T12:00:00.000Z'));
      markSurveyShown('csat_invoicing', Date.parse('2026-06-01T12:00:00.000Z'));
      assert.deepEqual(storedState(store).shownThisMonth, { '2026-05': 2, '2026-06': 1 });
    });

    it('sets onboardingShown only for the onboarding survey', () => {
      markSurveyShown('csat_onboarding', Date.parse('2026-05-04T12:00:00.000Z'));
      assert.equal(storedState(store).onboardingShown, true);
      // A later non-onboarding survey must not clear the flag.
      markSurveyShown('csat_order', Date.parse('2026-05-05T12:00:00.000Z'));
      assert.equal(storedState(store).onboardingShown, true);
    });
  });

  describe('markSurveyResponded', () => {
    it('counts responses per survey and stamps the time', () => {
      const now = Date.parse('2026-05-04T12:00:00.000Z');
      markSurveyResponded('csat_order', now);
      markSurveyResponded('csat_order', now);
      const state = storedState(store);
      assert.equal(state.respondedCounts.csat_order, 2);
      assert.equal(state.respondedAt.csat_order, '2026-05-04T12:00:00.000Z');
    });

    it('snapshots the invoicing counter when the invoicing survey is answered', () => {
      incrementSurveyCounter('invoicing');
      incrementSurveyCounter('invoicing');
      markSurveyResponded('csat_invoicing', Date.parse('2026-05-04T12:00:00.000Z'));
      assert.equal(storedState(store).respondedCountAt.csat_invoicing, 2);
    });

    it('snapshots the order counter when the order survey is answered', () => {
      incrementSurveyCounter('order');
      markSurveyResponded('csat_order', Date.parse('2026-05-04T12:00:00.000Z'));
      assert.equal(storedState(store).respondedCountAt.csat_order, 1);
    });

    it('snapshots nothing for a survey with no counter of its own', () => {
      markSurveyResponded('csat_onboarding', Date.parse('2026-05-04T12:00:00.000Z'));
      assert.deepEqual(storedState(store).respondedCountAt, {});
    });
  });

  describe('markSurveyDismissed', () => {
    it('stamps both the global and the per-survey dismissal', () => {
      markSurveyDismissed('csat_order', Date.parse('2026-05-04T12:00:00.000Z'));
      const state = storedState(store);
      assert.equal(state.lastDismissedAt, '2026-05-04T12:00:00.000Z');
      assert.equal(state.dismissals.csat_order, '2026-05-04T12:00:00.000Z');
    });

    it('keeps earlier dismissals of other surveys', () => {
      markSurveyDismissed('csat_order', Date.parse('2026-05-04T12:00:00.000Z'));
      markSurveyDismissed('csat_invoicing', Date.parse('2026-05-05T12:00:00.000Z'));
      const state = storedState(store);
      assert.equal(state.dismissals.csat_order, '2026-05-04T12:00:00.000Z');
      assert.equal(state.dismissals.csat_invoicing, '2026-05-05T12:00:00.000Z');
    });
  });

  describe('incrementSurveyCounter', () => {
    it('returns the new value and persists it', () => {
      assert.equal(incrementSurveyCounter('invoicing'), 1);
      assert.equal(incrementSurveyCounter('invoicing'), 2);
      assert.equal(storedState(store).counters.invoicing, 2);
    });

    it('starts an unknown counter key at 1 without disturbing the known ones', () => {
      const value = incrementSurveyCounter('shipment');
      assert.equal(value, 1);
      const state = storedState(store);
      assert.equal(state.counters.shipment, 1);
      assert.deepEqual(
        { invoicing: state.counters.invoicing, order: state.counters.order },
        { invoicing: 0, order: 0 },
      );
    });
  });
});
