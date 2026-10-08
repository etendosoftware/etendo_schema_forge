// @covers tools/app-shell/src/lib/relativeTime.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelativeTime } from '../relativeTime.js';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (sec) => new Date(NOW - sec * 1000).toISOString();

describe('formatRelativeTime', () => {
  it('formats seconds, minutes, hours, days and months in Spanish', () => {
    assert.equal(formatRelativeTime(ago(54), 'es_ES', NOW), 'hace 54 segundos');
    assert.equal(formatRelativeTime(ago(120), 'es_ES', NOW), 'hace 2 minutos');
    assert.equal(formatRelativeTime(ago(3 * 3600), 'es_ES', NOW), 'hace 3 horas');
    assert.equal(formatRelativeTime(ago(3 * 86400), 'es_ES', NOW), 'hace 3 días');
    assert.equal(formatRelativeTime(ago(65 * 86400), 'es_ES', NOW), 'hace 2 meses');
  });

  it('formats in English', () => {
    assert.equal(formatRelativeTime(ago(54), 'en_US', NOW), '54 seconds ago');
    assert.equal(formatRelativeTime(ago(120), 'en_US', NOW), '2 minutes ago');
  });

  it('switches unit exactly at the minute / hour / day boundaries', () => {
    assert.equal(formatRelativeTime(ago(59), 'en_US', NOW), '59 seconds ago');
    assert.equal(formatRelativeTime(ago(60), 'en_US', NOW), '1 minute ago');
    assert.equal(formatRelativeTime(ago(3600), 'en_US', NOW), '1 hour ago');
    assert.equal(formatRelativeTime(ago(86400), 'en_US', NOW), 'yesterday');
  });

  it('returns null for missing or invalid input', () => {
    for (const bad of [null, undefined, '', 'not-a-date', NaN]) {
      assert.equal(formatRelativeTime(bad, 'es_ES', NOW), null);
    }
  });

  it('clamps a future instant to now', () => {
    assert.equal(formatRelativeTime(new Date(NOW + 60000).toISOString(), 'en_US', NOW), 'now');
  });

  it('accepts Date objects and epoch milliseconds', () => {
    assert.equal(formatRelativeTime(new Date(NOW - 120000), 'en_US', NOW), '2 minutes ago');
    assert.equal(formatRelativeTime(NOW - 120000, 'en_US', NOW), '2 minutes ago');
  });

  it('defaults to es_ES when no locale is given', () => {
    assert.equal(formatRelativeTime(ago(120), undefined, NOW), 'hace 2 minutos');
  });
});
