import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysUntil } from '../certExpiryUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'certExpiryUtils.js'), 'utf8');

function addDays(n) {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n));
  return target.toISOString().slice(0, 10);
}

describe('certExpiryUtils — exports', () => {
  it('exports daysUntil as a named function', () => assert.match(src, /export function daysUntil/));
  it('uses Date.UTC to avoid local-time shifting', () => assert.match(src, /Date\.UTC/));
  it('builds todayUtc from UTC date parts (getUTCFullYear/Month/Date)', () => assert.match(src, /getUTCFullYear/));
  it('round-trips expiryUtc through Date to reject impossible dates', () => assert.match(src, /getUTCFullYear[\s\S]{0,120}getUTCMonth[\s\S]{0,60}getUTCDate/));
});

describe('daysUntil — null / falsy inputs', () => {
  it('returns null for null', () => assert.equal(daysUntil(null), null));
  it('returns null for empty string', () => assert.equal(daysUntil(''), null));
  it('returns null for undefined', () => assert.equal(daysUntil(undefined), null));
});

describe('daysUntil — relative future dates', () => {
  it('returns 1 for tomorrow', () => assert.equal(daysUntil(addDays(1)), 1));
  it('returns 30 for 30 days from now', () => assert.equal(daysUntil(addDays(30)), 30));
  it('returns 60 for 60 days from now', () => assert.equal(daysUntil(addDays(60)), 60));
  it('returns 0 for today', () => assert.equal(daysUntil(addDays(0)), 0));
});

describe('daysUntil — past dates', () => {
  it('returns a negative number for yesterday', () => assert.equal(daysUntil(addDays(-1)), -1));
  it('returns -30 for 30 days ago', () => assert.equal(daysUntil(addDays(-30)), -30));
});

describe('daysUntil — non-ISO inputs', () => {
  it('returns null for non-YYYY-MM-DD input', () => assert.equal(daysUntil('not-a-date'), null));
  it('returns null for slash-delimited date', () => assert.equal(daysUntil('13/05/2026'), null));
});

describe('daysUntil — out-of-range components', () => {
  it('returns null for month 13', () => assert.equal(daysUntil('2026-13-01'), null));
  it('returns null for month 0', () => assert.equal(daysUntil('2026-00-01'), null));
  it('returns null for day 32', () => assert.equal(daysUntil('2026-01-32'), null));
  it('returns null for day 0', () => assert.equal(daysUntil('2026-01-00'), null));
  it('returns null for impossible day in February (2026-02-31)', () => assert.equal(daysUntil('2026-02-31'), null));
  it('returns null for impossible day in April (2026-04-31)', () => assert.equal(daysUntil('2026-04-31'), null));
});
