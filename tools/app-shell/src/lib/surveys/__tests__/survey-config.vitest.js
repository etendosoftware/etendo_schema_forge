import { describe, it, expect } from 'vitest';
import {
  resolvePositiveInt,
  getSurveyConfig,
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
});
