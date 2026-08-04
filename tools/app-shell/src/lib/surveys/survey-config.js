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
    npsMinAgeMs:
      resolveDays('npsMinAgeDays', 'VITE_SURVEY_NPS_MIN_AGE_DAYS', DEFAULT_SURVEY_NPS_MIN_AGE_DAYS) * MS_DAY,
    npsInactivityMs:
      resolveDays('npsInactivityDays', 'VITE_SURVEY_NPS_INACTIVITY_DAYS', DEFAULT_SURVEY_NPS_INACTIVITY_DAYS) * MS_DAY,
    responseCooldownMs:
      resolveDays('responseCooldownDays', 'VITE_SURVEY_RESPONSE_COOLDOWN_DAYS', DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS) * MS_DAY,
    csatMinDocs:
      resolveDays('csatMinDocs', 'VITE_SURVEY_CSAT_MIN_DOCS', DEFAULT_SURVEY_CSAT_MIN_DOCS),
    csatDocGap:
      resolveDays('csatDocGap', 'VITE_SURVEY_CSAT_DOC_GAP', DEFAULT_SURVEY_CSAT_DOC_GAP),
  };
}

/**
 * Predefined CSAT responses for a survey/language, sourced from the backoffice window via
 * loadRemoteSurveyConfig(). Returns null (not an empty array) when unavailable so callers can
 * tell "not loaded yet / unreachable" apart from "loaded, zero rows configured" and fall back
 * to the hardcoded survey.canned list in surveys.js.
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
      headers: { Authorization: `Bearer ${token}` },
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
