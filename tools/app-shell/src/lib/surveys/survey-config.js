// Survey engine tunables — team-configurable via VITE_SURVEY_* env vars (build-time only,
// requires a rebuild+redeploy to take effect). NOT a customer-facing setting: there is no UI,
// no window, no per-org override — this is for the Etendo GO team to tune cooldowns/caps per
// environment (dev/staging/prod) the same way VITE_RUM_SESSION_SAMPLE_RATE already works.
// See docs/surveys.md.
const MS_DAY = 86_400_000;

export const DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS = 30;
export const DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS = 21;
export const DEFAULT_SURVEY_MAX_PER_MONTH = 2;
export const DEFAULT_SURVEY_NPS_MIN_AGE_DAYS = 60;
export const DEFAULT_SURVEY_NPS_INACTIVITY_DAYS = 14;
export const DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS = 90;
export const DEFAULT_SURVEY_CSAT_MIN_DOCS = 5;
export const DEFAULT_SURVEY_CSAT_DOC_GAP = 30;

export function resolvePositiveInt(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getSurveyConfig(env = import.meta.env) {
  const resolvedEnv = env ?? {};
  return {
    globalCooldownMs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_GLOBAL_COOLDOWN_DAYS, DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS) * MS_DAY,
    dismissedCooldownMs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_DISMISSED_COOLDOWN_DAYS, DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS) * MS_DAY,
    maxPerMonth:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_MAX_PER_MONTH, DEFAULT_SURVEY_MAX_PER_MONTH),
    npsMinAgeMs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_NPS_MIN_AGE_DAYS, DEFAULT_SURVEY_NPS_MIN_AGE_DAYS) * MS_DAY,
    npsInactivityMs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_NPS_INACTIVITY_DAYS, DEFAULT_SURVEY_NPS_INACTIVITY_DAYS) * MS_DAY,
    responseCooldownMs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_RESPONSE_COOLDOWN_DAYS, DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS) * MS_DAY,
    csatMinDocs:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_CSAT_MIN_DOCS, DEFAULT_SURVEY_CSAT_MIN_DOCS),
    csatDocGap:
      resolvePositiveInt(resolvedEnv.VITE_SURVEY_CSAT_DOC_GAP, DEFAULT_SURVEY_CSAT_DOC_GAP),
  };
}
