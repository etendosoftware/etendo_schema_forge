import { readSurveyState } from './survey-state.js';
import { SURVEYS } from './surveys.js';

const MS_DAY = 86_400_000;
const GLOBAL_COOLDOWN_MS = 30 * MS_DAY;
const DISMISSED_COOLDOWN_MS = 21 * MS_DAY;
const MAX_PER_MONTH = 2;

export function isGlobalCooldownActive(state, now) {
  if (!state.lastShownAt) return false;
  return now - new Date(state.lastShownAt).getTime() < GLOBAL_COOLDOWN_MS;
}

export function isMonthlyLimitReached(state, now) {
  const monthKey = new Date(now).toISOString().slice(0, 7);
  return (state.shownThisMonth[monthKey] ?? 0) >= MAX_PER_MONTH;
}

export function isDismissedCooldownActive(state, surveyId, now) {
  const dismissedAt = state.dismissals[surveyId];
  if (!dismissedAt) return false;
  return now - new Date(dismissedAt).getTime() < DISMISSED_COOLDOWN_MS;
}

export function selectNextSurvey({ isAdmin, now = Date.now(), source } = {}) {
  const state = readSurveyState();

  if (isGlobalCooldownActive(state, now)) return null;
  if (isMonthlyLimitReached(state, now)) return null;

  for (const survey of SURVEYS) {
    if (source != null && survey.sources && !survey.sources.includes(source)) continue;
    if (!survey.isEligible({ state, isAdmin, now })) continue;
    if (isDismissedCooldownActive(state, survey.id, now)) continue;
    return survey;
  }

  return null;
}

export const SURVEY_TRIGGER_EVENT = 'sf:survey:trigger';

export function emitSurveyTrigger() {
  try {
    window.dispatchEvent(new CustomEvent(SURVEY_TRIGGER_EVENT));
  } catch {
    // non-browser environment — no-op
  }
}
