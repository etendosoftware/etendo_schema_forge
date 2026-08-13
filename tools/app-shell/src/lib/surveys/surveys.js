const MS_DAY = 86_400_000;

const INVOICE_SPEC_NAMES = new Set(['sales-invoice', 'purchase-invoice']);
const ORDER_SPEC_NAMES = new Set(['purchase-order', 'sales-order']);

export function isInvoiceSpec(specName) {
  return INVOICE_SPEC_NAMES.has(specName);
}

export function isOrderSpec(specName) {
  return ORDER_SPEC_NAMES.has(specName);
}

function npsIsEligible({ state, now }) {
  if (!state.firstLoginAt) return false;
  const msSinceFirst = now - new Date(state.firstLoginAt).getTime();
  if (msSinceFirst < 60 * MS_DAY) return false;
  if (state.lastLoginAt && now - new Date(state.lastLoginAt).getTime() > 14 * MS_DAY) return false;
  const respondedCount = state.respondedCounts['nps'] ?? 0;
  if (respondedCount === 0) return true;
  const lastRespondedAt = state.respondedAt['nps'];
  if (!lastRespondedAt) return true;
  return now - new Date(lastRespondedAt).getTime() >= 90 * MS_DAY;
}

function csatOnboardingIsEligible() {
  return false; // onboarding survey disabled until fully implemented
}

function csatInvoicingIsEligible({ state, now }) {
  const count = state.counters.invoicing ?? 0;
  if (count < 5) return false;
  const respondedCount = state.respondedCounts['csat_invoicing'] ?? 0;
  if (respondedCount === 0) return true;
  const lastRespondedCountAt = state.respondedCountAt?.['csat_invoicing'] ?? 0;
  if (count - lastRespondedCountAt < 30) return false;
  const lastRespondedAt = state.respondedAt['csat_invoicing'];
  if (!lastRespondedAt) return true;
  return now - new Date(lastRespondedAt).getTime() >= 90 * MS_DAY;
}

function csatOrderIsEligible({ state, now }) {
  const count = state.counters.order ?? 0;
  if (count < 5) return false;
  const respondedCount = state.respondedCounts['csat_order'] ?? 0;
  if (respondedCount === 0) return true;
  const lastRespondedCountAt = state.respondedCountAt?.['csat_order'] ?? 0;
  if (count - lastRespondedCountAt < 30) return false;
  const lastRespondedAt = state.respondedAt['csat_order'];
  if (!lastRespondedAt) return true;
  return now - new Date(lastRespondedAt).getTime() >= 90 * MS_DAY;
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
