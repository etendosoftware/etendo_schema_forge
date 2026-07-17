import { getSurveyConfig } from './survey-config.js';

const INVOICE_SPEC_NAMES = new Set(['sales-invoice', 'purchase-invoice']);
const ORDER_SPEC_NAMES = new Set(['purchase-order', 'sales-order']);

export function isInvoiceSpec(specName) {
  return INVOICE_SPEC_NAMES.has(specName);
}

export function isOrderSpec(specName) {
  return ORDER_SPEC_NAMES.has(specName);
}

function npsIsEligible({ state, now, env = import.meta.env }) {
  if (!state.firstLoginAt) return false;
  const { npsMinAgeMs, npsInactivityMs, responseCooldownMs } = getSurveyConfig(env);
  const msSinceFirst = now - new Date(state.firstLoginAt).getTime();
  if (msSinceFirst < npsMinAgeMs) return false;
  if (state.lastLoginAt && now - new Date(state.lastLoginAt).getTime() > npsInactivityMs) return false;
  const respondedCount = state.respondedCounts['nps'] ?? 0;
  if (respondedCount === 0) return true;
  const lastRespondedAt = state.respondedAt['nps'];
  if (!lastRespondedAt) return true;
  return now - new Date(lastRespondedAt).getTime() >= responseCooldownMs;
}

function csatOnboardingIsEligible() {
  return false; // onboarding survey disabled until fully implemented
}

// Shared by csat_invoicing/csat_order — previously duplicated verbatim per survey.
function csatDocumentIsEligible(counterKey, surveyId, { state, now, env = import.meta.env }) {
  const { csatMinDocs, csatDocGap, responseCooldownMs } = getSurveyConfig(env);
  const count = state.counters[counterKey] ?? 0;
  if (count < csatMinDocs) return false;
  const respondedCount = state.respondedCounts[surveyId] ?? 0;
  if (respondedCount === 0) return true;
  const lastRespondedCountAt = state.respondedCountAt?.[surveyId] ?? 0;
  if (count - lastRespondedCountAt < csatDocGap) return false;
  const lastRespondedAt = state.respondedAt[surveyId];
  if (!lastRespondedAt) return true;
  return now - new Date(lastRespondedAt).getTime() >= responseCooldownMs;
}

function csatInvoicingIsEligible(args) {
  return csatDocumentIsEligible('invoicing', 'csat_invoicing', args);
}

function csatOrderIsEligible(args) {
  return csatDocumentIsEligible('order', 'csat_order', args);
}

export const SURVEYS = Object.freeze([
  Object.freeze({
    id: 'csat_onboarding',
    type: 'csat',
    sources: ['login'],
    scaleMax: 5,
    titleKey: 'surveyOnboardingTitle',
    q2TitleKey: 'surveyOnboardingQ2',
    q2PlaceholderKey: 'surveyOnboardingQ2Placeholder',
    thanksKey: 'surveyOnboardingThanks',
    isEligible: csatOnboardingIsEligible,
  }),
  Object.freeze({
    id: 'nps',
    type: 'nps',
    sources: ['login'],
    scaleMax: 10,
    titleKey: 'surveyNpsTitle',
    isEligible: npsIsEligible,
  }),
  Object.freeze({
    id: 'csat_invoicing',
    type: 'csat',
    sources: ['trigger'],
    scaleMax: 5,
    titleKey: 'surveyInvoicingTitle',
    q2TitleKey: 'surveyInvoicingQ2',
    q2PlaceholderKey: 'surveyInvoicingQ2Placeholder',
    thanksKey: 'surveyInvoicingThanks',
    isEligible: csatInvoicingIsEligible,
  }),
  Object.freeze({
    id: 'csat_order',
    type: 'csat',
    sources: ['trigger'],
    scaleMax: 5,
    titleKey: 'surveyOrderTitle',
    q2TitleKey: 'surveyOrderQ2',
    q2PlaceholderKey: 'surveyOrderQ2Placeholder',
    thanksKey: 'surveyOrderThanks',
    isEligible: csatOrderIsEligible,
  }),
]);
