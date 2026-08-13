import { describe, it, expect, vi } from 'vitest';

// indexEvents is a pure function but CalendarView.jsx pulls in heavy UI deps.
// Stub them so we can import the module without rendering anything.
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { indexEvents } from '../CalendarView.jsx';

// Use explicit local-time Date constructors so the YYYY-MM-DD keys produced by
// toDateKey() are independent of the runner's timezone.
const localDate = (y, m1based, d) => new Date(y, m1based - 1, d);
const localKey = (y, m1based, d) => {
  const mm = String(m1based).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
};

describe('indexEvents (CalendarView)', () => {
  // Regression: the `for (const cursor = ...; cursor <= end; ...)` refactor
  // must keep the same iteration semantics as the previous `while` loop.
  it('indexes a single-day event under exactly one date key', () => {
    const evt = { id: 'a', title: 'one-day', date: localDate(2026, 5, 19) };
    const map = indexEvents([evt]);
    expect(Object.keys(map)).toEqual([localKey(2026, 5, 19)]);
    expect(map[localKey(2026, 5, 19)]).toEqual([evt]);
  });

  it('treats an event without endDate the same as a single-day event', () => {
    const evt = { id: 'b', title: 'no-end', date: localDate(2026, 5, 19), endDate: undefined };
    const map = indexEvents([evt]);
    expect(Object.keys(map)).toEqual([localKey(2026, 5, 19)]);
  });

  it('indexes a 3-day event under 3 consecutive date keys', () => {
    const evt = {
      id: 'c',
      title: 'three-days',
      date: localDate(2026, 5, 19),
      endDate: localDate(2026, 5, 21),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toEqual([localKey(2026, 5, 19), localKey(2026, 5, 20), localKey(2026, 5, 21)]);
    for (const key of keys) {
      expect(map[key]).toEqual([evt]);
    }
  });

  it('indexes events that span a month boundary across every day', () => {
    // Jan 30 -> Feb 2 (4 days inclusive)
    const evt = {
      id: 'd',
      title: 'cross-month',
      date: localDate(2026, 1, 30),
      endDate: localDate(2026, 2, 2),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toEqual([
      localKey(2026, 1, 30),
      localKey(2026, 1, 31),
      localKey(2026, 2, 1),
      localKey(2026, 2, 2),
    ]);
  });

  it('accumulates multiple events on the same day', () => {
    const a = { id: 'a', title: 'A', date: localDate(2026, 5, 19) };
    const b = { id: 'b', title: 'B', date: localDate(2026, 5, 19) };
    const map = indexEvents([a, b]);
    expect(map[localKey(2026, 5, 19)]).toEqual([a, b]);
  });

  it('returns an empty object for no events', () => {
    expect(indexEvents([])).toEqual({});
  });

  it('does not index any day when endDate is before date', () => {
    const evt = {
      id: 'rev',
      title: 'reversed',
      date: localDate(2026, 5, 20),
      endDate: localDate(2026, 5, 18),
    };
    const map = indexEvents([evt]);
    expect(map).toEqual({});
  });

  it('indexes a 30-day span under exactly 30 consecutive date keys', () => {
    const evt = {
      id: 'long',
      title: 'long-span',
      date: localDate(2026, 5, 1),
      endDate: localDate(2026, 5, 30),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toHaveLength(30);
    for (let i = 1; i <= 30; i++) {
      expect(keys).toContain(localKey(2026, 5, i));
    }
  });

  it('indexes correctly across a DST spring-forward boundary', () => {
    // Europe/Madrid spring-forward 2026-03-29 (and US 2026-03-08).
    // Whatever the runner TZ, a 4-day span covering late March must yield 4 keys.
    const evt = {
      id: 'dst',
      title: 'dst-span',
      date: localDate(2026, 3, 28),
      endDate: localDate(2026, 3, 31),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toEqual([
      localKey(2026, 3, 28),
      localKey(2026, 3, 29),
      localKey(2026, 3, 30),
      localKey(2026, 3, 31),
    ]);
  });

  it('matches original behavior when start and end have different times-of-day', () => {
    // Original behavior: iterate calendar days from `start` at start's time-of-day
    // until cursor > end. With start at 01:00 and end at 23:00 three days later,
    // 22@01:00 <= 22@23:00 so day 22 is included; 23@01:00 > 22@23:00 so it stops.
    // Days indexed: 19, 20, 21, 22 (NOT 23).
    const start = new Date(2026, 4, 19, 1, 0); // May 19 01:00
    const end = new Date(2026, 4, 22, 23, 0);  // May 22 23:00
    const evt = { id: 'tod', title: 'time-of-day', date: start, endDate: end };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toEqual([
      localKey(2026, 5, 19),
      localKey(2026, 5, 20),
      localKey(2026, 5, 21),
      localKey(2026, 5, 22),
    ]);
  });

  it('matches original behavior when end time-of-day is before start time-of-day', () => {
    // start at 23:00 May 19, end at 01:00 May 22.
    // Original: 19@23, 20@23, 21@23 (≤ 22@01). 22@23 > 22@01, stop. → 3 keys.
    const evt = {
      id: 'tod2',
      title: 'reverse-tod',
      date: new Date(2026, 4, 19, 23, 0),
      endDate: new Date(2026, 4, 22, 1, 0),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toEqual([
      localKey(2026, 5, 19),
      localKey(2026, 5, 20),
      localKey(2026, 5, 21),
    ]);
  });

  it('indexes correctly across a DST fall-back boundary', () => {
    // Europe/Madrid fall-back 2026-10-25 (US 2026-11-01).
    const evt = {
      id: 'dst2',
      title: 'dst-span-fall',
      date: localDate(2026, 10, 24),
      endDate: localDate(2026, 11, 2),
    };
    const map = indexEvents([evt]);
    const keys = Object.keys(map).sort();
    expect(keys).toHaveLength(10);
    expect(keys[0]).toBe(localKey(2026, 10, 24));
    expect(keys[keys.length - 1]).toBe(localKey(2026, 11, 2));
  });
});
