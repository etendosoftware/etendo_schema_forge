const STORAGE_KEY = 'sf_survey_v1';

const DEFAULTS = Object.freeze({
  firstLoginAt: null,
  lastLoginAt: null,
  lastShownAt: null,
  lastDismissedAt: null,
  onboardingCompleted: false,
  onboardingShown: false,
  counters: Object.freeze({ invoicing: 0, order: 0 }),
  shownThisMonth: Object.freeze({}),
  respondedCounts: Object.freeze({}),
  respondedAt: Object.freeze({}),
  respondedCountAt: Object.freeze({}),
  dismissals: Object.freeze({}),
});

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSurveyState() {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, counters: { ...DEFAULTS.counters }, shownThisMonth: {}, respondedCounts: {}, respondedAt: {}, respondedCountAt: {}, dismissals: {} };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      counters: { ...DEFAULTS.counters },
      shownThisMonth: {},
      respondedCounts: {},
      respondedAt: {},
      respondedCountAt: {},
      dismissals: {},
      ...parsed,
    };
  } catch {
    return { ...DEFAULTS, counters: { ...DEFAULTS.counters }, shownThisMonth: {}, respondedCounts: {}, respondedAt: {}, respondedCountAt: {}, dismissals: {} };
  }
}

export function writeSurveyState(next) {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — fail silently
  }
}

export function markFirstLogin(now = Date.now()) {
  const state = readSurveyState();
  writeSurveyState({
    ...state,
    firstLoginAt: state.firstLoginAt ?? new Date(now).toISOString(),
    lastLoginAt: new Date(now).toISOString(),
  });
}

export function markOnboardingCompleted() {
  const state = readSurveyState();
  writeSurveyState({ ...state, onboardingCompleted: true });
}

export function markSurveyShown(surveyId, now = Date.now()) {
  const state = readSurveyState();
  const monthKey = new Date(now).toISOString().slice(0, 7);
  writeSurveyState({
    ...state,
    lastShownAt: new Date(now).toISOString(),
    onboardingShown: surveyId === 'csat_onboarding' ? true : state.onboardingShown,
    shownThisMonth: {
      ...state.shownThisMonth,
      [monthKey]: (state.shownThisMonth[monthKey] ?? 0) + 1,
    },
  });
}

export function markSurveyResponded(surveyId, now = Date.now()) {
  const state = readSurveyState();
  writeSurveyState({
    ...state,
    respondedCounts: {
      ...state.respondedCounts,
      [surveyId]: (state.respondedCounts[surveyId] ?? 0) + 1,
    },
    respondedAt: {
      ...state.respondedAt,
      [surveyId]: new Date(now).toISOString(),
    },
    respondedCountAt: {
      ...state.respondedCountAt,
      ...(surveyId === 'csat_invoicing' && { csat_invoicing: state.counters.invoicing ?? 0 }),
      ...(surveyId === 'csat_order' && { csat_order: state.counters.order ?? 0 }),
    },
  });
}

export function markSurveyDismissed(surveyId, now = Date.now()) {
  const state = readSurveyState();
  writeSurveyState({
    ...state,
    lastDismissedAt: new Date(now).toISOString(),
    dismissals: {
      ...state.dismissals,
      [surveyId]: new Date(now).toISOString(),
    },
  });
}

export function incrementSurveyCounter(key, now = Date.now()) {
  const state = readSurveyState();
  const counters = { ...state.counters, [key]: (state.counters[key] ?? 0) + 1 };
  writeSurveyState({ ...state, counters });
  return counters[key];
}
