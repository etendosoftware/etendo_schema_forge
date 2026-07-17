import { readSurveyState } from './survey-state.js';
import { SURVEYS } from './surveys.js';
import { getSurveyConfig } from './survey-config.js';

export function isGlobalCooldownActive(state, now, env = import.meta.env) {
  if (!state.lastShownAt) return false;
  const { globalCooldownMs } = getSurveyConfig(env);
  return now - new Date(state.lastShownAt).getTime() < globalCooldownMs;
}

export function isMonthlyLimitReached(state, now, env = import.meta.env) {
  const monthKey = new Date(now).toISOString().slice(0, 7);
  const { maxPerMonth } = getSurveyConfig(env);
  return (state.shownThisMonth[monthKey] ?? 0) >= maxPerMonth;
}

export function isDismissedCooldownActive(state, surveyId, now, env = import.meta.env) {
  const dismissedAt = state.dismissals[surveyId];
  if (!dismissedAt) return false;
  const { dismissedCooldownMs } = getSurveyConfig(env);
  return now - new Date(dismissedAt).getTime() < dismissedCooldownMs;
}

export function selectNextSurvey({ isAdmin, now = Date.now(), source, env = import.meta.env } = {}) {
  const state = readSurveyState();

  if (isGlobalCooldownActive(state, now, env)) return null;
  if (isMonthlyLimitReached(state, now, env)) return null;

  for (const survey of SURVEYS) {
    if (source != null && survey.sources && !survey.sources.includes(source)) continue;
    if (!survey.isEligible({ state, isAdmin, now, env })) continue;
    if (isDismissedCooldownActive(state, survey.id, now, env)) continue;
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
