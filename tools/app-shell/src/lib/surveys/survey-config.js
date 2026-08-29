import { authHeaders, buildHeaders } from '@/auth/api.js';
// Survey engine tunables — team-configurable via VITE_SURVEY_* env vars (build-time only,
// requires a rebuild+redeploy to take effect). NOT a customer-facing setting: there is no UI,
// no window, no per-org override — this is for the Etendo GO team to tune cooldowns/caps per
// environment (dev/staging/prod) the same way VITE_RUM_SESSION_SAMPLE_RATE already works.
// See docs/surveys.md.
//
// Since ETP-4352 phase 2, values can ALSO come from the "Survey Configuration" backoffice
// window (com.etendoerp.go, tables ETGO_Survey_Config / ETGO_Survey_Canned_Resp), served
// read-only via GET /sws/survey-config/ and loaded once via loadRemoteSurveyConfig(). This is
// the preferred, no-rebuild-needed source when reachable; VITE_SURVEY_* stays as the offline/
// unreachable-backend fallback so the survey engine degrades gracefully rather than breaking.
const MS_DAY = 86_400_000;

export const DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS = 30;
export const DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS = 21;
export const DEFAULT_SURVEY_MAX_PER_MONTH = 2;
export const DEFAULT_SURVEY_NPS_MIN_AGE_DAYS = 60;
export const DEFAULT_SURVEY_NPS_INACTIVITY_DAYS = 14;
export const DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS = 90;
export const DEFAULT_SURVEY_CSAT_MIN_DOCS = 5;
export const DEFAULT_SURVEY_CSAT_DOC_GAP = 30;

let remoteConfig = null;

export function resolvePositiveInt(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** Test/reset hook — also used internally once a fetch resolves. */
export function setRemoteSurveyConfig(config) {
  remoteConfig = config ?? null;
}

/** Truly-global tunables (cooldown/monthly cap) — shared by every survey. */
export function getSurveyConfig(env = import.meta.env) {
  const resolvedEnv = env ?? {};
  const remote = remoteConfig ?? {};

  function resolveDays(remoteField, envVar, fallback) {
    const envDefault = resolvePositiveInt(resolvedEnv[envVar], fallback);
    return resolvePositiveInt(remote[remoteField], envDefault);
  }

  return {
    globalCooldownMs:
      resolveDays('globalCooldownDays', 'VITE_SURVEY_GLOBAL_COOLDOWN_DAYS', DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS) * MS_DAY,
    dismissedCooldownMs:
      resolveDays('dismissedCooldownDays', 'VITE_SURVEY_DISMISSED_COOLDOWN_DAYS', DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS) * MS_DAY,
    maxPerMonth:
      resolveDays('maxPerMonth', 'VITE_SURVEY_MAX_PER_MONTH', DEFAULT_SURVEY_MAX_PER_MONTH),
  };
}

/**
 * Per-survey eligibility tunables (one backoffice row per survey key — see
 * ETGO_Survey_Type / "Surveys" tab). A survey not yet configured there (or an
 * unreachable backend) falls back field-by-field to the same VITE_SURVEY_* /
 * DEFAULT_SURVEY_* knobs used before this became per-survey — these stay
 * global fallback defaults, not per-survey, since they're only the
 * offline-degradation path.
 */
export function getSurveyTypeConfig(surveyKey, env = import.meta.env) {
  const resolvedEnv = env ?? {};
  const perSurvey = remoteConfig?.perSurvey?.[surveyKey] ?? {};

  function resolveDays(remoteField, envVar, fallback) {
    const envDefault = resolvePositiveInt(resolvedEnv[envVar], fallback);
    return resolvePositiveInt(perSurvey[remoteField], envDefault);
  }

  return {
    minAccountAgeMs:
      resolveDays('minAccountAgeDays', 'VITE_SURVEY_NPS_MIN_AGE_DAYS', DEFAULT_SURVEY_NPS_MIN_AGE_DAYS) * MS_DAY,
    inactivityGuardMs:
      resolveDays('inactivityGuardDays', 'VITE_SURVEY_NPS_INACTIVITY_DAYS', DEFAULT_SURVEY_NPS_INACTIVITY_DAYS) * MS_DAY,
    responseCooldownMs:
      resolveDays('responseCooldownDays', 'VITE_SURVEY_RESPONSE_COOLDOWN_DAYS', DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS) * MS_DAY,
    minDocuments:
      resolveDays('minDocuments', 'VITE_SURVEY_CSAT_MIN_DOCS', DEFAULT_SURVEY_CSAT_MIN_DOCS),
    documentGap:
      resolveDays('documentGap', 'VITE_SURVEY_CSAT_DOC_GAP', DEFAULT_SURVEY_CSAT_DOC_GAP),
  };
}

/**
 * Whether a survey type is enabled per the backoffice "Surveys" tab (ETGO_Survey_Type.isactive).
 *
 * This is a hard kill switch, NOT a tuning fallback: unlike the day/count fields in
 * getSurveyTypeConfig(), there is no "fall back to default and stay eligible" behavior here.
 * Returns `false` only when the backend explicitly reported that survey key with
 * `enabled: false` (i.e. isactive='N' in ETGO_Survey_Type) — every other case (survey not
 * configured yet, config unreachable, config not loaded yet) fails OPEN (`true`), since "not
 * configured" must not be confused with "explicitly turned off". Callers (selectNextSurvey) must
 * check this before running the survey's own isEligible() and skip the survey entirely when it
 * returns false — a backend-side disable always wins over local eligibility logic.
 */
export function isSurveyTypeEnabled(surveyKey) {
  return remoteConfig?.perSurvey?.[surveyKey]?.enabled !== false;
}

/**
 * Predefined CSAT responses for a survey/language, sourced from the backoffice window via
 * loadRemoteSurveyConfig(). Each item is { icon, text, minScore, maxScore } — callers filter by
 * the current score against that range. Returns null (not an empty array) when unavailable so
 * callers can tell "not loaded yet / unreachable" apart from "loaded, zero rows configured" and
 * fall back to the hardcoded survey.canned list in surveys.js (which has no ranges).
 */
export function getRemoteCannedResponses(surveyId, language) {
  return remoteConfig?.canned?.[surveyId]?.[language] ?? null;
}

/**
 * Fetches the backoffice "Survey Configuration" window's data once (typically called on
 * app/login mount). Silently no-ops on any failure — network error, non-200, malformed body —
 * so the survey engine keeps working off VITE_SURVEY_* / hardcoded defaults when the backend
 * is unreachable. Never throws.
 */
export async function loadRemoteSurveyConfig({ apiBaseUrl, token, fetchImpl = fetch, logger = console } = {}) {
  // apiBaseUrl is legitimately '' in dev (getApiBase() resolves to the app root) — only bail
  // when it's truly absent (null/undefined), not just falsy, or the fetch never fires locally.
  if (apiBaseUrl == null || !token) return;
  try {
    const response = await fetchImpl(`${apiBaseUrl}/sws/survey-config/`, {
      headers: authHeaders(token),
    });
    if (!response.ok) return;
    const data = await response.json();
    setRemoteSurveyConfig(data);
  } catch (e) {
    logger.warn('[surveys] Failed to load remote survey config, using local defaults', e);
  }
}

/**
 * Persists a submitted NPS/CSAT survey response — score, free-text feedback and tags — server
 * side, via POST /sws/survey-config/response (backend: SurveyConfigServlet, table
 * ETGO_Survey_Response). This is the GDPR remediation (ETP-4352) counterpart to Mixpanel no
 * longer receiving the raw feedback text (see useSurveyEngine.js's handleRespond, which now
 * sends Mixpanel only a `hasComment` boolean). Fire-and-forget from the caller's perspective —
 * silently no-ops on any failure so a flaky network never blocks or breaks the survey UI. Never
 * throws.
 */
export async function submitSurveyResponse({
  apiBaseUrl, token, surveyKey, score, feedback, tags, fetchImpl = fetch, logger = console,
} = {}) {
  if (apiBaseUrl == null || !token || !surveyKey) return;
  try {
    const response = await fetchImpl(`${apiBaseUrl}/sws/survey-config/response`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({
        surveyKey,
        ...(score != null ? { score } : {}),
        ...(feedback?.trim() ? { feedback: feedback.trim() } : {}),
        ...(tags?.length ? { tags } : {}),
      }),
    });
    if (!response.ok) {
      logger.warn('[surveys] Failed to persist survey response', response.status);
    }
  } catch (e) {
    logger.warn('[surveys] Failed to persist survey response', e);
  }
}
