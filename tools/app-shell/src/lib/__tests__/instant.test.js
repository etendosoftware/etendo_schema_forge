import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { formatInstant, hasTimeOfDay, parseInstant } from '../instant.js';

/**
 * These assert what a viewer SEES, so they only mean something under a known clock. Buenos Aires
 * (UTC−3, no DST) is the zone the bug was reported from: a payment made at 08:32 showed 11:32,
 * because the server's UTC digits were being read as local time (ETP-4895).
 */
const ORIGINAL_TZ = process.env.TZ;

describe('instant helpers', () => {
  before(() => { process.env.TZ = 'America/Argentina/Buenos_Aires'; });
  after(() => { process.env.TZ = ORIGINAL_TZ; });

  describe('parseInstant', () => {
    it('reads a zone-less NEO datetime as UTC', () => {
      // NEO's wire format carries no zone (NeoDateFormat.ISO_DATETIME), so this is the assumption
      // the whole fix rests on — stated here so a future change to that contract breaks a test.
      const parsed = parseInstant('2026-08-28T11:32:00');
      assert.equal(parsed.toISOString(), '2026-08-28T11:32:00.000Z');
      assert.equal(parsed.getHours(), 8, 'shown in the viewer\'s clock, not the server\'s');
    });

    it('accepts the space-separated form Postgres emits', () => {
      assert.equal(parseInstant('2026-08-28 11:32:00').toISOString(), '2026-08-28T11:32:00.000Z');
    });

    it('honours an explicit zone instead of assuming one', () => {
      assert.equal(parseInstant('2026-08-28T11:32:00Z').toISOString(), '2026-08-28T11:32:00.000Z');
      assert.equal(parseInstant('2026-08-28T13:32:00+02:00').toISOString(), '2026-08-28T11:32:00.000Z');
    });

    it('keeps a Date as it is', () => {
      const d = new Date('2026-08-28T11:32:00Z');
      assert.equal(parseInstant(d), d);
    });

    it('refuses a business date rather than pinning it to midnight UTC', () => {
      // The shift this exists to prevent: '2026-08-28' as midnight UTC is the 27th in Buenos Aires.
      assert.equal(parseInstant('2026-08-28'), null);
    });

    it('returns null for nothing and for nonsense', () => {
      assert.equal(parseInstant(null), null);
      assert.equal(parseInstant(''), null);
      assert.equal(parseInstant('not a date'), null);
      assert.equal(parseInstant(new Date('nope')), null);
    });
  });

  describe('hasTimeOfDay', () => {
    it('tells an instant from a business date', () => {
      assert.equal(hasTimeOfDay('2026-08-28T11:32:00'), true);
      assert.equal(hasTimeOfDay('2026-08-28 11:32'), true);
      assert.equal(hasTimeOfDay('2026-08-28'), false);
      assert.equal(hasTimeOfDay(null), false);
    });
  });

  describe('formatInstant', () => {
    it('renders the reported case in the viewer\'s clock', () => {
      // The regression itself: 11:32 was what every viewer saw, which was nobody's local time.
      assert.match(formatInstant('2026-08-28T11:32:00'), /· 08:32$/);
    });

    it('pads a single-digit hour and minute', () => {
      assert.match(formatInstant('2026-08-28T06:05:00'), /· 03:05$/);
    });

    it('crosses the day boundary the conversion implies', () => {
      // 01:30 UTC is still the previous evening in Buenos Aires.
      const formatted = formatInstant('2026-08-28T01:30:00');
      assert.match(formatted, /· 22:30$/);
      assert.match(formatted, /27/);
    });

    it('renders nothing when there is no instant', () => {
      assert.equal(formatInstant(null), '');
      assert.equal(formatInstant('2026-08-28'), '', 'a business date is not an instant');
    });
  });
});
