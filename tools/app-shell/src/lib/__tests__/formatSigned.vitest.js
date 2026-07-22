import { describe, it, expect } from 'vitest';
import { formatSignedDelta } from '../formatSigned.js';

describe('formatSignedDelta — signedDelta lines-grid column type', () => {
  it('negative value renders "-N" with the negative tone', () => {
    expect(formatSignedDelta(-8)).toEqual({ text: '-8', tone: 'negative' });
  });

  it('zero renders "±0" with the neutral tone', () => {
    expect(formatSignedDelta(0)).toEqual({ text: '±0', tone: 'neutral' });
  });

  it('positive value renders "+N" with the positive tone', () => {
    expect(formatSignedDelta(2)).toEqual({ text: '+2', tone: 'positive' });
  });

  it('does not apply thousands grouping, matching sibling quantity columns', () => {
    expect(formatSignedDelta(1500)).toEqual({ text: '+1500', tone: 'positive' });
    expect(formatSignedDelta(-1600)).toEqual({ text: '-1600', tone: 'negative' });
  });

  it('falsy/non-numeric input falls back to zero (neutral)', () => {
    expect(formatSignedDelta(null)).toEqual({ text: '±0', tone: 'neutral' });
    expect(formatSignedDelta(undefined)).toEqual({ text: '±0', tone: 'neutral' });
  });
});
