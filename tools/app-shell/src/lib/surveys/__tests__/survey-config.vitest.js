import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolvePositiveInt,
  getSurveyConfig,
  setRemoteSurveyConfig,
  getRemoteCannedResponses,
  loadRemoteSurveyConfig,
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
      npsMinAgeMs: DEFAULT_SURVEY_NPS_MIN_AGE_DAYS * MS_DAY,
      npsInactivityMs: DEFAULT_SURVEY_NPS_INACTIVITY_DAYS * MS_DAY,
      responseCooldownMs: DEFAULT_SURVEY_RESPONSE_COOLDOWN_DAYS * MS_DAY,
      csatMinDocs: DEFAULT_SURVEY_CSAT_MIN_DOCS,
      csatDocGap: DEFAULT_SURVEY_CSAT_DOC_GAP,
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
      VITE_SURVEY_NPS_MIN_AGE_DAYS: '20',
      VITE_SURVEY_NPS_INACTIVITY_DAYS: '7',
      VITE_SURVEY_RESPONSE_COOLDOWN_DAYS: '45',
    });
    expect(config.globalCooldownMs).toBe(10 * MS_DAY);
    expect(config.dismissedCooldownMs).toBe(3 * MS_DAY);
    expect(config.npsMinAgeMs).toBe(20 * MS_DAY);
    expect(config.npsInactivityMs).toBe(7 * MS_DAY);
    expect(config.responseCooldownMs).toBe(45 * MS_DAY);
  });

  it('overrides csatMinDocs and csatDocGap as plain counts (not milliseconds)', () => {
    const config = getSurveyConfig({
      VITE_SURVEY_CSAT_MIN_DOCS: '3',
      VITE_SURVEY_CSAT_DOC_GAP: '15',
    });
    expect(config.csatMinDocs).toBe(3);
    expect(config.csatDocGap).toBe(15);
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
      setRemoteSurveyConfig({ csatMinDocs: 0 });
      const config = getSurveyConfig({ VITE_SURVEY_CSAT_MIN_DOCS: 'not-a-number' });
      expect(config.csatMinDocs).toBe(DEFAULT_SURVEY_CSAT_MIN_DOCS);
    });

    it('converts remote day counts to milliseconds like the env/default path', () => {
      setRemoteSurveyConfig({ globalCooldownDays: 12, npsMinAgeDays: 40 });
      const config = getSurveyConfig({});
      expect(config.globalCooldownMs).toBe(12 * MS_DAY);
      expect(config.npsMinAgeMs).toBe(40 * MS_DAY);
    });
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
  it('does nothing when apiBaseUrl or token is missing', async () => {
    const fetchImpl = vi.fn();
    await loadRemoteSurveyConfig({ apiBaseUrl: null, token: 'tok', fetchImpl });
    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', token: null, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches the endpoint with a Bearer token and stores the result', async () => {
    const payload = { maxPerMonth: 9, canned: {} };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', token: 'tok-123', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/survey-config/', {
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(getSurveyConfig({}).maxPerMonth).toBe(9);
  });

  it('leaves the config untouched on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', token: 'tok', fetchImpl });
    expect(getSurveyConfig({}).maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
  });

  it('leaves the config untouched and logs a warning on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const logger = { warn: vi.fn() };
    await loadRemoteSurveyConfig({ apiBaseUrl: '/etendo', token: 'tok', fetchImpl, logger });
    expect(logger.warn).toHaveBeenCalledWith(
      '[surveys] Failed to load remote survey config, using local defaults',
      expect.any(Error),
    );
    expect(getSurveyConfig({}).maxPerMonth).toBe(DEFAULT_SURVEY_MAX_PER_MONTH);
  });
});
