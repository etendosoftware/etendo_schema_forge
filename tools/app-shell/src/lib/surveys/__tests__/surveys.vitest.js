import { describe, it, expect } from 'vitest';
import { SURVEYS, isInvoiceSpec, isOrderSpec } from '../surveys.js';

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
});
