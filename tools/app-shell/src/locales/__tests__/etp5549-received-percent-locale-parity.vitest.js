import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/** ETP-5549 — previewCardReceivedPercent must exist in every shipped locale. */
const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5549 — previewCardReceivedPercent locale parity', () => {
  it.each(Object.entries(LOCALES))('%s defines a non-empty previewCardReceivedPercent', (name, dict) => {
    const v = dict.genericLabels?.previewCardReceivedPercent;
    expect(typeof v, name).toBe('string');
    expect(v.trim(), name).not.toBe('');
  });

  it.each(Object.entries(LOCALES))('%s keeps it distinct from the Delivered label', (name, dict) => {
    expect(dict.genericLabels.previewCardReceivedPercent, name)
      .not.toBe(dict.genericLabels.previewCardDeliveryPercent);
  });
});
