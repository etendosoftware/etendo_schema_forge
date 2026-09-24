import { describe, it, expect, afterEach } from 'vitest';
import { SURVEYS, isInvoiceSpec, isOrderSpec } from '../surveys.js';
import { setRemoteSurveyConfig } from '../survey-config.js';

afterEach(() => {
  setRemoteSurveyConfig(null);
});

const MS_DAY = 86_400_000;
const NOW = new Date('2026-06-26T12:00:00.000Z').getTime();

function isoAgo(ms, from = NOW) {
  return new Date(from - ms).toISOString();
}

function surveyById(id) {
  return SURVEYS.find((s) => s.id === id);
}

function baseState(overrides = {}) {
  return {
    firstLoginAt: null,
    lastLoginAt: null,
    counters: { invoicing: 0, order: 0 },
    respondedCounts: {},
    respondedAt: {},
    respondedCountAt: {},
    ...overrides,
  };
}

describe('isInvoiceSpec / isOrderSpec', () => {
  it('recognizes both invoice spec names', () => {
    expect(isInvoiceSpec('sales-invoice')).toBe(true);
    expect(isInvoiceSpec('purchase-invoice')).toBe(true);
    expect(isInvoiceSpec('sales-order')).toBe(false);
  });

  it('recognizes both order spec names', () => {
    expect(isOrderSpec('purchase-order')).toBe(true);
    expect(isOrderSpec('sales-order')).toBe(true);
    expect(isOrderSpec('sales-invoice')).toBe(false);
  });
});

describe('nps.isEligible', () => {
  const nps = surveyById('nps');

  it('is not eligible without a firstLoginAt', () => {
    expect(nps.isEligible({ state: baseState(), now: NOW })).toBe(false);
  });

  it('is not eligible before the default 60-day min age', () => {
    const state = baseState({ firstLoginAt: isoAgo(30 * MS_DAY) });
    expect(nps.isEligible({ state, now: NOW })).toBe(false);
  });

  it('is eligible after the default 60-day min age', () => {
    const state = baseState({ firstLoginAt: isoAgo(61 * MS_DAY) });
    expect(nps.isEligible({ state, now: NOW })).toBe(true);
  });

  it('respects a VITE_SURVEY_NPS_MIN_AGE_DAYS override', () => {
    const state = baseState({ firstLoginAt: isoAgo(10 * MS_DAY) });
    expect(nps.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      nps.isEligible({ state, now: NOW, env: { VITE_SURVEY_NPS_MIN_AGE_DAYS: '5' } }),
    ).toBe(true);
  });

  it('respects a VITE_SURVEY_NPS_INACTIVITY_DAYS override', () => {
    const state = baseState({
      firstLoginAt: isoAgo(61 * MS_DAY),
      lastLoginAt: isoAgo(20 * MS_DAY),
    });
    // Default inactivity guard (14d) blocks a 20-day-inactive user.
    expect(nps.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      nps.isEligible({ state, now: NOW, env: { VITE_SURVEY_NPS_INACTIVITY_DAYS: '30' } }),
    ).toBe(true);
  });

  it('respects a VITE_SURVEY_RESPONSE_COOLDOWN_DAYS override for re-eligibility', () => {
    const state = baseState({
      firstLoginAt: isoAgo(61 * MS_DAY),
      respondedCounts: { nps: 1 },
      respondedAt: { nps: isoAgo(40 * MS_DAY) },
    });
    // Default cooldown (90d) blocks re-showing after only 40 days.
    expect(nps.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      nps.isEligible({ state, now: NOW, env: { VITE_SURVEY_RESPONSE_COOLDOWN_DAYS: '30' } }),
    ).toBe(true);
  });

  it('is eligible again when respondedAt is missing despite a prior response', () => {
    const state = baseState({
      firstLoginAt: isoAgo(61 * MS_DAY),
      respondedCounts: { nps: 1 },
      // respondedAt intentionally has no 'nps' entry — malformed/partial state
      // (e.g. data written before respondedAt tracking existed).
    });
    expect(nps.isEligible({ state, now: NOW })).toBe(true);
  });
});

// ETP-4353 Phase 2: nps.canned is the new offline fallback list resolveCannedOptions
// (SurveyModal.jsx) reads when getRemoteCannedResponses('nps', locale) has nothing —
// the data-shape half of the contract; the filtering/rendering behavior itself is
// covered via SurveyModal.vitest.jsx.
describe('nps.canned (offline fallback shape)', () => {
  const nps = surveyById('nps');

  it('has 7 entries, each with key/minScore/maxScore', () => {
    expect(nps.canned).toHaveLength(7);
    for (const entry of nps.canned) {
      expect(entry).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          minScore: expect.any(Number),
          maxScore: expect.any(Number),
        }),
      );
    }
  });

  it('has 6 always-visible entries spanning the full 0-10 scale', () => {
    const alwaysVisible = nps.canned.filter((c) => c.key !== 'surveyChipAI');
    expect(alwaysVisible).toHaveLength(6);
    for (const entry of alwaysVisible) {
      expect(entry.minScore).toBe(0);
      expect(entry.maxScore).toBe(10);
    }
  });

  it('has exactly one promoter-only entry (surveyChipAI, score 8-10)', () => {
    const aiEntries = nps.canned.filter((c) => c.key === 'surveyChipAI');
    expect(aiEntries).toHaveLength(1);
    expect(aiEntries[0]).toEqual(
      expect.objectContaining({ minScore: 8, maxScore: 10 }),
    );
  });
});

describe('csat_invoicing / csat_order.isEligible (shared csatDocumentIsEligible helper)', () => {
  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s is not eligible below the default 5-document minimum', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({ counters: { invoicing: 0, order: 0, [counterKey]: 4 } });
    expect(survey.isEligible({ state, now: NOW })).toBe(false);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s is eligible at the default 5-document minimum', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({ counters: { invoicing: 0, order: 0, [counterKey]: 5 } });
    expect(survey.isEligible({ state, now: NOW })).toBe(true);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s respects a VITE_SURVEY_CSAT_MIN_DOCS override', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({ counters: { invoicing: 0, order: 0, [counterKey]: 2 } });
    expect(survey.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      survey.isEligible({ state, now: NOW, env: { VITE_SURVEY_CSAT_MIN_DOCS: '2' } }),
    ).toBe(true);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s respects a VITE_SURVEY_CSAT_DOC_GAP override for re-eligibility', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({
      counters: { invoicing: 0, order: 0, [counterKey]: 15 },
      respondedCounts: { [id]: 1 },
      respondedAt: { [id]: isoAgo(91 * MS_DAY) },
      respondedCountAt: { [id]: 10 },
    });
    // Default gap (30 docs) blocks re-showing after only 5 more documents.
    expect(survey.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      survey.isEligible({ state, now: NOW, env: { VITE_SURVEY_CSAT_DOC_GAP: '5' } }),
    ).toBe(true);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s respects a VITE_SURVEY_RESPONSE_COOLDOWN_DAYS override for re-eligibility', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({
      counters: { invoicing: 0, order: 0, [counterKey]: 40 },
      respondedCounts: { [id]: 1 },
      respondedAt: { [id]: isoAgo(40 * MS_DAY) },
      respondedCountAt: { [id]: 5 },
    });
    // Default cooldown (90d) blocks re-showing after only 40 days.
    expect(survey.isEligible({ state, now: NOW, env: {} })).toBe(false);
    expect(
      survey.isEligible({ state, now: NOW, env: { VITE_SURVEY_RESPONSE_COOLDOWN_DAYS: '30' } }),
    ).toBe(true);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s treats a missing counters key as zero', (id, counterKey) => {
    const survey = surveyById(id);
    // counters entirely omits counterKey (not just set to 0).
    const state = baseState({ counters: {} });
    expect(survey.isEligible({ state, now: NOW })).toBe(false);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s treats a missing respondedCountAt map as a zero last-responded count', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({
      counters: { invoicing: 0, order: 0, [counterKey]: 20 },
      respondedCounts: { [id]: 1 },
      respondedAt: { [id]: isoAgo(200 * MS_DAY) },
      // respondedCountAt is entirely absent, not just missing the survey's key.
      respondedCountAt: undefined,
    });
    // Gap since last response falls back to the full count (20), which is
    // below the default 30-doc gap, so it stays ineligible.
    expect(survey.isEligible({ state, now: NOW })).toBe(false);
  });

  it.each([
    ['csat_invoicing', 'invoicing'],
    ['csat_order', 'order'],
  ])('%s is eligible again when respondedAt is missing despite a prior response', (id, counterKey) => {
    const survey = surveyById(id);
    const state = baseState({
      counters: { invoicing: 0, order: 0, [counterKey]: 40 },
      respondedCounts: { [id]: 1 },
      respondedCountAt: { [id]: 5 },
      // respondedAt intentionally has no entry for this survey id — malformed/partial state.
    });
    expect(survey.isEligible({ state, now: NOW })).toBe(true);
  });

  it('csat_invoicing and csat_order track independent counters', () => {
    const invoicing = surveyById('csat_invoicing');
    const order = surveyById('csat_order');
    const state = baseState({ counters: { invoicing: 5, order: 0 } });
    expect(invoicing.isEligible({ state, now: NOW })).toBe(true);
    expect(order.isEligible({ state, now: NOW })).toBe(false);
  });
});

describe('csat_onboarding.isEligible', () => {
  const csatOnboarding = surveyById('csat_onboarding');

  it('is eligible for an admin who completed onboarding and has not seen it yet', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(2 * MS_DAY),
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(true);
  });

  it('is not eligible for a non-admin even when onboarding is completed', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(2 * MS_DAY),
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: false, now: NOW })).toBe(false);
  });

  it('is not eligible before onboarding is completed', () => {
    const state = baseState({ onboardingCompleted: false, onboardingShown: false });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(false);
  });

  it('is not eligible once already shown (once-per-user frequency)', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: true,
      onboardingCompletedAt: isoAgo(2 * MS_DAY),
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(false);
  });

  it('is eligible once the 24h delay has just elapsed', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(MS_DAY),
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(true);
  });

  it('is not eligible before the 24h delay has elapsed', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(60 * 60 * 1000), // 1 hour ago
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(false);
  });

  it('is eligible immediately for the legacy cohort with no onboardingCompletedAt', () => {
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: null,
    });
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(true);
  });

  // ETP-4353 Phase 2 regression: csatOnboardingIsEligible no longer uses the removed
  // CSAT_ONBOARDING_DELAY_MS constant — it now calls getSurveyTypeConfig('csat_onboarding', env)
  // and gates on minAccountAgeMs instead. For a tenant that never adds a csat_onboarding row to
  // ETGO_Survey_Type (no remote config, no env var), behavior must stay exactly the original
  // hardcoded 24h gate.
  describe('unconfigured (no remote config, no env var) — behavior unchanged from before the refactor', () => {
    it('is still blocked just under 24h since onboardingCompletedAt', () => {
      const state = baseState({
        onboardingCompleted: true,
        onboardingShown: false,
        onboardingCompletedAt: isoAgo(MS_DAY - 60_000), // 23h59m ago
      });
      expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW, env: {} })).toBe(false);
    });

    it('is eligible at exactly 24h since onboardingCompletedAt', () => {
      const state = baseState({
        onboardingCompleted: true,
        onboardingShown: false,
        onboardingCompletedAt: isoAgo(MS_DAY),
      });
      expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW, env: {} })).toBe(true);
    });
  });

  it('respects a remote-configured csat_onboarding minAccountAgeDays (e.g. 3 days) instead of the 1-day default', () => {
    setRemoteSurveyConfig({ perSurvey: { csat_onboarding: { minAccountAgeDays: 3 } } });
    const state = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(2 * MS_DAY),
    });
    // Still under the remote-configured 3-day gate, even though it's past the old 24h default.
    expect(csatOnboarding.isEligible({ state, isAdmin: true, now: NOW })).toBe(false);

    const stateEligible = baseState({
      onboardingCompleted: true,
      onboardingShown: false,
      onboardingCompletedAt: isoAgo(3 * MS_DAY),
    });
    expect(csatOnboarding.isEligible({ state: stateEligible, isAdmin: true, now: NOW })).toBe(true);
  });
});
