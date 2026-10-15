// @covers tools/app-shell/src/windows/custom/calendar/periodsBulkOpenClose.js
import { describe, it, expect, vi } from 'vitest';
import {
  isPeriodBulkSelectable,
  runPeriodsBulkOpenClose,
  summarizePeriodsBulkResults,
} from '../periodsBulkOpenClose.js';

const period = (id, startingDate, status) => ({ id, startingDate, status });

describe('runPeriodsBulkOpenClose', () => {
  it('posts one period at a time in start-date order, whatever the input order', async () => {
    const calls = [];
    let inFlight = 0;
    const postOne = vi.fn(async (id) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      calls.push(id);
      await Promise.resolve();
      inFlight -= 1;
      return { ok: true };
    });

    await runPeriodsBulkOpenClose(
      [period('mar', '2027-03-01', 'C'), period('jan', '2027-01-01', 'C'), period('feb', '2027-02-01', 'C')],
      'O',
      postOne,
    );

    expect(calls).toEqual(['jan', 'feb', 'mar']);
    expect(postOne).toHaveBeenCalledWith('jan', 'O');
  });

  it('keeps going after a failure or a rejection and reports each outcome', async () => {
    const postOne = vi.fn(async (id) => {
      if (id === 'feb') return { ok: false, message: 'Period has unposted documents' };
      if (id === 'mar') throw new Error('No connection');
      return { ok: true };
    });

    const results = await runPeriodsBulkOpenClose(
      [period('jan', '2027-01-01', 'O'), period('feb', '2027-02-01', 'O'), period('mar', '2027-03-01', 'M'), period('apr', '2027-04-01', 'O')],
      'C',
      postOne,
    );

    expect(results.map((r) => [r.period.id, r.outcome, r.message])).toEqual([
      ['jan', 'ok', undefined],
      ['feb', 'failed', 'Period has unposted documents'],
      ['mar', 'failed', 'No connection'],
      ['apr', 'ok', undefined],
    ]);
    expect(summarizePeriodsBulkResults(results)).toEqual({ ok: 2, skipped: 0, failed: 2 });
  });

  it('skips periods already in the target state without posting them', async () => {
    const postOne = vi.fn(async () => ({ ok: true }));

    const results = await runPeriodsBulkOpenClose(
      [period('jan', '2027-01-01', 'C'), period('feb', '2027-02-01', 'O')],
      'C',
      postOne,
    );

    expect(postOne).toHaveBeenCalledTimes(1);
    expect(postOne).toHaveBeenCalledWith('feb', 'C');
    expect(summarizePeriodsBulkResults(results)).toEqual({ ok: 1, skipped: 1, failed: 0 });
  });
});

describe('isPeriodBulkSelectable', () => {
  it('excludes only permanently closed periods', () => {
    expect(['N', 'O', 'C', 'M'].map((status) => isPeriodBulkSelectable({ status }))).toEqual([true, true, true, true]);
    expect(isPeriodBulkSelectable({ status: 'P' })).toBe(false);
  });
});
