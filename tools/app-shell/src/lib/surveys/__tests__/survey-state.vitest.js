import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readSurveyState,
  writeSurveyState,
  markFirstLogin,
  markOnboardingCompleted,
  markSurveyShown,
  markSurveyResponded,
  markSurveyDismissed,
  incrementSurveyCounter,
} from '../survey-state.js';

const STORAGE_KEY = 'sf_survey_v1';

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

describe('survey-state', () => {
  let mockStorage;
  const NOW = new Date('2026-01-15T10:00:00.000Z').getTime();

  beforeEach(() => {
    mockStorage = makeStorage();
    vi.stubGlobal('window', { localStorage: mockStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('readSurveyState', () => {
    it('returns defaults when storage is empty', () => {
      const state = readSurveyState();
      expect(state.firstLoginAt).toBeNull();
      expect(state.lastLoginAt).toBeNull();
      expect(state.onboardingCompleted).toBe(false);
      expect(state.onboardingShown).toBe(false);
      expect(state.counters).toEqual({ invoicing: 0, order: 0 });
      expect(state.shownThisMonth).toEqual({});
      expect(state.respondedCounts).toEqual({});
      expect(state.respondedAt).toEqual({});
      expect(state.respondedCountAt).toEqual({});
      expect(state.dismissals).toEqual({});
    });

    it('merges stored data with defaults', () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify({
        firstLoginAt: '2026-01-01T00:00:00.000Z',
        onboardingCompleted: true,
        counters: { invoicing: 3, order: 0 },
      }));
      const state = readSurveyState();
      expect(state.firstLoginAt).toBe('2026-01-01T00:00:00.000Z');
      expect(state.onboardingCompleted).toBe(true);
      expect(state.counters.invoicing).toBe(3);
      expect(state.shownThisMonth).toEqual({});
    });

    it('returns defaults on corrupted JSON', () => {
      mockStorage.setItem(STORAGE_KEY, 'not-json');
      const state = readSurveyState();
      expect(state.firstLoginAt).toBeNull();
    });
  });

  describe('markFirstLogin', () => {
    it('sets firstLoginAt and lastLoginAt on first call', () => {
      markFirstLogin(NOW);
      const state = readSurveyState();
      expect(state.firstLoginAt).toBe(new Date(NOW).toISOString());
      expect(state.lastLoginAt).toBe(new Date(NOW).toISOString());
    });

    it('does not overwrite firstLoginAt but updates lastLoginAt', () => {
      const earlier = new Date('2025-06-01').getTime();
      markFirstLogin(earlier);
      markFirstLogin(NOW);
      const state = readSurveyState();
      expect(state.firstLoginAt).toBe(new Date(earlier).toISOString());
      expect(state.lastLoginAt).toBe(new Date(NOW).toISOString());
    });
  });

  describe('markOnboardingCompleted', () => {
    it('sets onboardingCompleted to true', () => {
      markOnboardingCompleted();
      expect(readSurveyState().onboardingCompleted).toBe(true);
    });
  });

  describe('markSurveyShown', () => {
    it('updates lastShownAt and increments monthly counter', () => {
      markSurveyShown('nps', NOW);
      const state = readSurveyState();
      expect(state.lastShownAt).toBe(new Date(NOW).toISOString());
      expect(state.shownThisMonth['2026-01']).toBe(1);
    });

    it('sets onboardingShown when surveyId is csat_onboarding', () => {
      markSurveyShown('csat_onboarding', NOW);
      expect(readSurveyState().onboardingShown).toBe(true);
    });

    it('does not set onboardingShown for other surveys', () => {
      markSurveyShown('nps', NOW);
      expect(readSurveyState().onboardingShown).toBe(false);
    });
  });

  describe('markSurveyResponded', () => {
    it('increments respondedCounts and sets respondedAt', () => {
      markSurveyResponded('nps', NOW);
      const state = readSurveyState();
      expect(state.respondedCounts['nps']).toBe(1);
      expect(state.respondedAt['nps']).toBe(new Date(NOW).toISOString());
    });

    it('accumulates multiple responses', () => {
      markSurveyResponded('nps', NOW);
      markSurveyResponded('nps', NOW + 1000);
      expect(readSurveyState().respondedCounts['nps']).toBe(2);
    });

    it('snapshots invoicing counter into respondedCountAt for csat_invoicing', () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify({ counters: { invoicing: 7, order: 0 } }));
      markSurveyResponded('csat_invoicing', NOW);
      expect(readSurveyState().respondedCountAt['csat_invoicing']).toBe(7);
    });

    it('snapshots order counter into respondedCountAt for csat_order', () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify({ counters: { invoicing: 0, order: 12 } }));
      markSurveyResponded('csat_order', NOW);
      expect(readSurveyState().respondedCountAt['csat_order']).toBe(12);
    });
  });

  describe('markSurveyDismissed', () => {
    it('sets dismissal timestamp for the survey', () => {
      markSurveyDismissed('csat_invoicing', NOW);
      const state = readSurveyState();
      expect(state.lastDismissedAt).toBe(new Date(NOW).toISOString());
      expect(state.dismissals['csat_invoicing']).toBe(new Date(NOW).toISOString());
    });
  });

  describe('incrementSurveyCounter', () => {
    it('increments from zero', () => {
      const result = incrementSurveyCounter('invoicing');
      expect(result).toBe(1);
      expect(readSurveyState().counters.invoicing).toBe(1);
    });

    it('increments existing value', () => {
      incrementSurveyCounter('invoicing');
      incrementSurveyCounter('invoicing');
      const result = incrementSurveyCounter('invoicing');
      expect(result).toBe(3);
    });

    it('increments order independently from invoicing', () => {
      incrementSurveyCounter('invoicing');
      incrementSurveyCounter('invoicing');
      incrementSurveyCounter('order');
      const state = readSurveyState();
      expect(state.counters.invoicing).toBe(2);
      expect(state.counters.order).toBe(1);
    });

    // QA edge case: unknown counter key should create it without throwing
    it('creates a new key for an unknown counter without throwing', () => {
      const result = incrementSurveyCounter('foo');
      expect(result).toBe(1);
      expect(readSurveyState().counters['foo']).toBe(1);
      // known keys must be unaffected
      expect(readSurveyState().counters.invoicing).toBe(0);
      expect(readSurveyState().counters.order).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // QA edge case: localStorage unavailable (getStorage returns null)
  // -------------------------------------------------------------------------

  describe('readSurveyState with no localStorage', () => {
    it('returns clean defaults when window has no localStorage (SSR/private mode)', () => {
      vi.stubGlobal('window', {}); // localStorage is undefined
      const state = readSurveyState();
      expect(state.firstLoginAt).toBeNull();
      expect(state.counters).toEqual({ invoicing: 0, order: 0 });
      expect(state.shownThisMonth).toEqual({});
      expect(state.respondedCounts).toEqual({});
      expect(state.dismissals).toEqual({});
    });

    it('returns clean defaults when window is undefined (non-browser)', () => {
      vi.stubGlobal('window', undefined);
      const state = readSurveyState();
      expect(state.firstLoginAt).toBeNull();
      expect(state.counters).toEqual({ invoicing: 0, order: 0 });
    });
  });

  describe('writeSurveyState with no localStorage', () => {
    it('fails silently when localStorage is unavailable', () => {
      vi.stubGlobal('window', {}); // no localStorage
      expect(() => writeSurveyState({ firstLoginAt: 'x' })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // QA edge case: backward compat — respondedCountAt absent in old stored data
  // -------------------------------------------------------------------------

  describe('readSurveyState backward compat (old data without respondedCountAt)', () => {
    it('provides empty respondedCountAt when key is missing from stored data', () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify({
        firstLoginAt: '2025-01-01T00:00:00.000Z',
        counters: { invoicing: 10, order: 0 },
        respondedCounts: { csat_invoicing: 1 },
        respondedAt: { csat_invoicing: '2025-03-01T00:00:00.000Z' },
        // respondedCountAt intentionally absent (old format)
      }));
      const state = readSurveyState();
      expect(state.respondedCountAt).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // QA edge case: markSurveyResponded with a non-CSAT survey id (e.g. 'nps')
  // -------------------------------------------------------------------------

  describe('markSurveyResponded with non-CSAT survey id', () => {
    it('does not write respondedCountAt for non-CSAT surveys (nps has no counter)', () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify({
        counters: { invoicing: 5, order: 3 },
      }));
      markSurveyResponded('nps', NOW);
      const state = readSurveyState();
      expect(state.respondedCountAt['nps']).toBeUndefined();
    });

    it('increments respondedCounts for nps', () => {
      markSurveyResponded('nps', NOW);
      expect(readSurveyState().respondedCounts['nps']).toBe(1);
    });
  });
});
