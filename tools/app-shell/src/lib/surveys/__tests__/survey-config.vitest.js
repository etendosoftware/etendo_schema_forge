import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  declareBearerSession,
  declareCookieSession,
  TEST_BEARER_TOKEN,
} from '@/test/sessionContract.js';

beforeEach(() => {
  declareBearerSession();
});
import {
  resolvePositiveInt,
  getSurveyConfig,
  getSurveyTypeConfig,
  setRemoteSurveyConfig,
  isSurveyTypeEnabled,
  getRemoteCannedResponses,
  loadRemoteSurveyConfig,
  submitSurveyResponse,
  DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS,
  DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS,
  DEFAULT_SURVEY_MAX_PER_MONTH,
  DEFAULT_SURVEY_NPS_MIN_AGE_DAYS,
  DEFAULT_SURVEY_NPS_INACTIVITY_DAYS,
  DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS,
  DEFAULT_SURVEY_CSAT_MIN_DOCS,
  DEFAULT_SURVEY_CSAT_DOC_GAP,
} from '../survey-config.js';

const MS_DAY = 86_400_000;

afterEach(() => {
  setRemoteSurveyConfig(null);
});

describe('resolvePositiveInt', () => {
  it('returns the fallback when value is null or undefined', () => {
    expect(resolvePositiveInt(null, 5)).toBe(5);
    expect(resolvePositiveInt(undefined, 5)).toBe(5);
  });

  it('returns the fallback when value is an empty/whitespace string', () => {
    expect(resolvePositiveInt('', 5)).toBe(5);
    expect(resolvePositiveInt('   ', 5)).toBe(5);
  });

  it('returns the fallback when value is not a finite number', () => {
    expect(resolvePositiveInt('abc', 5)).toBe(5);
    expect(resolvePositiveInt('NaN', 5)).toBe(5);
    expect(resolvePositiveInt(Infinity, 5)).toBe(5);
  });

  it('returns the fallback when value is zero or negative', () => {
    expect(resolvePositiveInt('0', 5)).toBe(5);
    expect(resolvePositiveInt(-3, 5)).toBe(5);
  });

  it('parses and floors a valid positive numeric string', () => {
    expect(resolvePositiveInt('42', 5)).toBe(42);
    expect(resolvePositiveInt('7.9', 5)).toBe(7);
  });

  it('accepts a valid positive number (not just a string)', () => {
    expect(resolvePositiveInt(14, 5)).toBe(14);
  });
});

describe('getSurveyConfig', () => {
  it('returns all defaults when env is empty', () => {
    const config = getSurveyConfig({});
    expect(config).toEqual({
      globalCooldownMs: DEFAULT_SURVEY_GLOBAL_COOLDOWN_DAYS * MS_DAY,
      dismissedCooldownMs: DEFAULT_SURVEY_DISMISSED_COOLDOWN_DAYS * MS_DAY,
      maxPerMonth: DEFAULT_SURVEY_MAX_PER_MONTH,
    });
  });

  it('treats a null/undefined env as empty (falls back to defaults)', () => {
    expect(getSurveyConfig(null)).toEqual(getSurveyConfig({}));
    expect(getSurveyConfig(undefined)).toEqual(getSurveyConfig({}));
  });

  it('overrides maxPerMonth from VITE_SURVEY_MAX_PER_MONTH', () => {
    const config = getSurveyConfig({ VITE_SURVEY_MAX_PER_MONTH: '5' });
    expect(config.maxPerMonth).toBe(5);
  });

  it('falls back to the default maxPerMonth when the env value is invalid', () => {
    const config = getSurveyConfig({ VITE_SURVEY_MAX_PER_MONTH: '0' });
    expect(config.maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
  });

  it('overrides every day-based field and converts it to milliseconds', () => {
    const config = getSurveyConfig({
      VITE_SURVEY_GLOBAL_COOLDOWN_DAYS: '10',
      VITE_SURVEY_DISMISSED_COOLDOWN_DAYS: '3',
    });
    expect(config.globalCooldownMs).toBe(10 * MS_DAY);
    expect(config.dismissedCooldownMs).toBe(3 * MS_DAY);
  });

  describe('remote config precedence (backoffice window > env var > default)', () => {
    it('prefers the remote value over an env var override', () => {
      setRemoteSurveyConfig({ maxPerMonth: 7 });
      const config = getSurveyConfig({ VITE_SURVEY_MAX_PER_MONTH: '5' });
      expect(config.maxPerMonth).toBe(7);
    });

    it('falls back to the env var when the remote value is missing', () => {
      setRemoteSurveyConfig({ dismissedCooldownDays: undefined });
      const config = getSurveyConfig({ VITE_SURVEY_DISMISSED_COOLDOWN_DAYS: '3' });
      expect(config.dismissedCooldownMs).toBe(3 * MS_DAY);
    });

    it('falls back to the default when both remote and env values are invalid', () => {
      setRemoteSurveyConfig({ maxPerMonth: 0 });
      const config = getSurveyConfig({ VITE_SURVEY_MAX_PER_MONTH: 'not-a-number' });
      expect(config.maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
    });

    it('converts remote day counts to milliseconds like the env/default path', () => {
      setRemoteSurveyConfig({ globalCooldownDays: 12 });
      const config = getSurveyConfig({});
      expect(config.globalCooldownMs).toBe(12 * MS_DAY);
    });
  });
});

describe('getSurveyTypeConfig', () => {
  it('returns all defaults for an unconfigured survey key', () => {
    const config = getSurveyTypeConfig('nps', {});
    expect(config).toEqual({
      minAccountAgeMs: DEFAULT_SURVEY_NPS_MIN_AGE_DAYS * MS_DAY,
      inactivityGuardMs: DEFAULT_SURVEY_NPS_INACTIVITY_DAYS * MS_DAY,
      responseCooldownMs: DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS * MS_DAY,
      minDocuments: DEFAULT_SURVEY_CSAT_MIN_DOCS,
      documentGap: DEFAULT_SURVEY_CSAT_DOC_GAP,
    });
  });

  it('overrides every day-based field from VITE_SURVEY_* env vars', () => {
    const config = getSurveyTypeConfig('nps', {
      VITE_SURVEY_NPS_MIN_AGE_DAYS: '20',
      VITE_SURVEY_NPS_INACTIVITY_DAYS: '7',
      VITE_SURVEY_RESPONSE_COOLDOWN_DAYS: '45',
    });
    expect(config.minAccountAgeMs).toBe(20 * MS_DAY);
    expect(config.inactivityGuardMs).toBe(7 * MS_DAY);
    expect(config.responseCooldownMs).toBe(45 * MS_DAY);
  });

  it('overrides minDocuments/documentGap as plain counts (not milliseconds)', () => {
    const config = getSurveyTypeConfig('csat_invoicing', {
      VITE_SURVEY_CSAT_MIN_DOCS: '3',
      VITE_SURVEY_CSAT_DOC_GAP: '15',
    });
    expect(config.minDocuments).toBe(3);
    expect(config.documentGap).toBe(15);
  });

  describe('remote config precedence (backoffice "Surveys" row > env var > default)', () => {
    it('prefers the remote per-survey value over an env var override', () => {
      setRemoteSurveyConfig({ perSurvey: { nps: { minAccountAgeDays: 90 } } });
      const config = getSurveyTypeConfig('nps', { VITE_SURVEY_NPS_MIN_AGE_DAYS: '20' });
      expect(config.minAccountAgeMs).toBe(90 * MS_DAY);
    });

    it('keeps two survey keys independent — csat_invoicing and csat_order can differ', () => {
      setRemoteSurveyConfig({
        perSurvey: {
          csat_invoicing: { minDocuments: 3 },
          csat_order: { minDocuments: 8 },
        },
      });
      expect(getSurveyTypeConfig('csat_invoicing', {}).minDocuments).toBe(3);
      expect(getSurveyTypeConfig('csat_order', {}).minDocuments).toBe(8);
    });

    it('falls back to the env var when the remote survey key is missing', () => {
      setRemoteSurveyConfig({ perSurvey: { nps: {} } });
      const config = getSurveyTypeConfig('nps', { VITE_SURVEY_NPS_INACTIVITY_DAYS: '7' });
      expect(config.inactivityGuardMs).toBe(7 * MS_DAY);
    });

    it('falls back to the default when the remote config has no perSurvey at all', () => {
      setRemoteSurveyConfig({});
      const config = getSurveyTypeConfig('csat_invoicing', {});
      expect(config.minDocuments).toBe(DEFAULT_SURVEY_CSAT_MIN_DOCS);
    });
  });
});

describe('isSurveyTypeEnabled', () => {
  it('fails open (true) when no remote config has been loaded', () => {
    expect(isSurveyTypeEnabled('nps')).toBe(true);
  });

  it('fails open (true) when the survey key is absent from the reported perSurvey config', () => {
    setRemoteSurveyConfig({ perSurvey: { csat_invoicing: { enabled: false } } });
    expect(isSurveyTypeEnabled('nps')).toBe(true);
  });

  it('fails open (true) when the remote config has no perSurvey block at all', () => {
    setRemoteSurveyConfig({ maxPerMonth: 5 });
    expect(isSurveyTypeEnabled('nps')).toBe(true);
  });

  it('returns false only when the backend explicitly reports enabled: false for that key', () => {
    setRemoteSurveyConfig({ perSurvey: { nps: { enabled: false } } });
    expect(isSurveyTypeEnabled('nps')).toBe(false);
  });

  it('returns true when the backend explicitly reports enabled: true for that key', () => {
    setRemoteSurveyConfig({ perSurvey: { nps: { enabled: true } } });
    expect(isSurveyTypeEnabled('nps')).toBe(true);
  });

  it('keeps two survey keys independent — disabling one does not affect the other', () => {
    setRemoteSurveyConfig({ perSurvey: { nps: { enabled: false }, csat_invoicing: { enabled: true } } });
    expect(isSurveyTypeEnabled('nps')).toBe(false);
    expect(isSurveyTypeEnabled('csat_invoicing')).toBe(true);
  });
});

describe('getRemoteCannedResponses', () => {
  it('returns null when no remote config has been loaded', () => {
    expect(getRemoteCannedResponses('csat_invoicing', 'es_ES')).toBeNull();
  });

  it('returns null when the survey or language is not present in the remote config', () => {
    setRemoteSurveyConfig({ canned: { csat_invoicing: { es_ES: [{ icon: '🐢', text: 'Es lento' }] } } });
    expect(getRemoteCannedResponses('csat_order', 'es_ES')).toBeNull();
    expect(getRemoteCannedResponses('csat_invoicing', 'en_US')).toBeNull();
  });

  it('returns the array of {icon, text} for a known survey/language', () => {
    const phrases = [{ icon: '🐢', text: 'Es lento' }, { icon: '🤔', text: 'Difícil de usar' }];
    setRemoteSurveyConfig({ canned: { csat_invoicing: { es_ES: phrases } } });
    expect(getRemoteCannedResponses('csat_invoicing', 'es_ES')).toEqual(phrases);
  });
});

describe('loadRemoteSurveyConfig', () => {
  it('does nothing when apiBaseUrl is null/undefined', async () => {
    const fetchImpl = vi.fn();
    await loadRemoteSurveyConfig({ apiBaseUrl: null, fetchImpl });
    await loadRemoteSurveyConfig({ apiBaseUrl: undefined, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still fetches when apiBaseUrl is an empty string (the real dev-mode value from getApiBase())', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await loadRemoteSurveyConfig({ apiBaseUrl: '', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('/sws/survey-config/', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER_TOKEN}` },
    });
  });

  it('fetches the endpoint under the bearer scheme and stores the result', async () => {
    const payload = { maxPerMonth: 9, canned: {} };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER_TOKEN}` },
    });
    expect(getSurveyConfig({}).maxPerMonth).toBe(9);
  });

  // ETP-4576 — the cookie half of the pair above. Same call, other scheme: the
  // `__Host-` cookie is the credential, so no header carries one. A GET needs no
  // CSRF proof either.
  it('fetches the endpoint under the cookie scheme and stores the result', async () => {
    declareCookieSession();
    const payload = { maxPerMonth: 4, canned: {} };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(getSurveyConfig({}).maxPerMonth).toBe(4);
  });

  it('leaves the config untouched on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', fetchImpl });
    expect(getSurveyConfig({}).maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
  });

  it('leaves the config untouched and logs a warning on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const logger = { warn: vi.fn() };
    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', fetchImpl, logger });
    expect(logger.warn).toHaveBeenCalledWith(
      '[surveys] Failed to load remote survey config, using local defaults',
      expect.any(Error),
    );
    expect(getSurveyConfig({}).maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
  });
});

describe('submitSurveyResponse', () => {
  it('does nothing when apiBaseUrl is null/undefined or surveyKey is missing', async () => {
    const fetchImpl = vi.fn();
    await submitSurveyResponse({ apiBaseUrl: null, surveyKey: 'nps', fetchImpl });
    await submitSurveyResponse({ apiBaseUrl: undefined, surveyKey: 'nps', fetchImpl });
    await submitSurveyResponse({ apiBaseUrl: '/etendo', surveyKey: null, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the survey response with the bearer credential, JSON content type, and full body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await submitSurveyResponse({
      apiBaseUrl: '/etendo',
      surveyKey: 'nps',
      score: 9,
      feedback: '  great product  ',
      tags: ['fast', 'reliable'],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/response', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_BEARER_TOKEN}`,
      },
      body: JSON.stringify({
        surveyKey: 'nps',
        score: 9,
        feedback: 'great product',
        tags: ['fast', 'reliable'],
      }),
    });
  });

  it('still fetches when apiBaseUrl is an empty string (the real dev-mode value from getApiBase())', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await submitSurveyResponse({ apiBaseUrl: '', surveyKey: 'nps', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/sws/survey-config/response', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('omits score, feedback, and tags from the body when not provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await submitSurveyResponse({ apiBaseUrl: '/etendo', surveyKey: 'csat_invoicing', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/response', expect.objectContaining({
      body: JSON.stringify({ surveyKey: 'csat_invoicing' }),
    }));
  });

  it('omits feedback when it is only whitespace, and omits tags when the array is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await submitSurveyResponse({
      apiBaseUrl: '/etendo',
      surveyKey: 'nps',
      feedback: '   ',
      tags: [],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/response', expect.objectContaining({
      body: JSON.stringify({ surveyKey: 'nps' }),
    }));
  });

  it('logs a warning (and does not throw) when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const logger = { warn: vi.fn() };

    await submitSurveyResponse({ apiBaseUrl: '/etendo', surveyKey: 'nps', fetchImpl, logger });

    expect(logger.warn).toHaveBeenCalledWith('[surveys] Failed to persist survey response', 500);
  });

  it('logs a warning (and does not throw) when fetchImpl rejects', async () => {
    const error = new Error('network down');
    const fetchImpl = vi.fn().mockRejectedValue(error);
    const logger = { warn: vi.fn() };

    await expect(
      submitSurveyResponse({ apiBaseUrl: '/etendo', surveyKey: 'nps', fetchImpl, logger }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('[surveys] Failed to persist survey response', error);
  });
});
