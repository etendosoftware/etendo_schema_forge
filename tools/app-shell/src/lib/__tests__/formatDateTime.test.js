// @covers tools/app-shell/src/lib/formatDateTime.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime } from '../formatDateTime.js';

// formatDateTime renders in the viewer's local timezone, so the expectation is built from the
// same instant with local getters only where TZ is not pinned; the pinned cases set TZ first.
describe('formatDateTime', () => {
  const originalTz = process.env.TZ;

  it('renders a locale-ordered date and 24h time in America/Argentina/Buenos_Aires from a UTC instant', () => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
    try {
      assert.equal(formatDateTime('2026-10-06T12:05:00Z', 'es_ES'), '06/10/2026 09:05');
      // UTC 01:30 is still the previous calendar day in UTC-3.
      assert.equal(formatDateTime('2026-10-06T01:30:00Z', 'es_ES'), '05/10/2026 22:30');
    } finally {
      if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
    }
  });

  it('lets the locale order the date (month first for en_US) and keeps the 24h clock', () => {
    process.env.TZ = 'UTC';
    try {
      assert.equal(formatDateTime('2026-01-02T15:04:00Z', 'en_US'), '01/02/2026 15:04');
      assert.equal(formatDateTime('2026-01-02T15:04:00Z', 'es_ES'), '02/01/2026 15:04');
      assert.equal(formatDateTime('2026-10-06T11:45:00Z', 'es_AR'), '06/10/2026 11:45');
      assert.equal(formatDateTime('2026-10-06T11:45:00Z', 'en_US'), '10/06/2026 11:45');
    } finally {
      if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
    }
  });

  it('returns null for missing or invalid input', () => {
    for (const bad of [null, undefined, '', 'nope']) {
      assert.equal(formatDateTime(bad, 'es_ES'), null);
    }
  });

  it('accepts a Date instance', () => {
    const d = new Date(2026, 0, 5, 7, 8);
    assert.equal(formatDateTime(d, 'es_ES'), '05/01/2026 07:08');
  });
});
