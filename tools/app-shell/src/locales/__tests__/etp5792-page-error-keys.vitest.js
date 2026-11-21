// @covers tools/app-shell/src/locales/en_US.json
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

const KEYS = [
  'pageNotFoundTitle',
  'pageNotFoundBody',
  'pageNotFoundHome',
  'appErrorTitle',
  'appErrorBody',
  'appErrorReload',
  'skipToMainContent',
];

describe('ETP-5792 — 404, error page and skip link locale parity', () => {
  it.each(Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR }))('%s defines every key', (name, dict) => {
    const missing = KEYS.filter((k) => typeof dict.genericLabels[k] !== 'string' || !dict.genericLabels[k].trim());
    expect(missing, `${name} is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
