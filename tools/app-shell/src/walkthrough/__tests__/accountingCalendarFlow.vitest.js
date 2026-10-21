/**
 * ETP-5577 — the calendar tour's "open the year" step must target the CURRENT year's Year cell
 * (marked by YearTableWithCloseStatus), never the first row or the row's selection checkbox.
 *
 * @covers tools/app-shell/src/walkthrough/flows/accounting-calendar.json
 */
import flow from '../flows/accounting-calendar.json';

describe('accounting-calendar flow, open-year step', () => {
  const step = flow.steps.find((s) => s.id === 'open-year');

  it('advances on a click of the current-year cell, not of the row (checkbox must not advance)', () => {
    expect(step.advance.on).toBe('targetClick');
    expect(step.target).toContain('[data-current-fiscal-year]');
  });

  it('spotlights the whole row of that year', () => {
    expect(step.highlightTarget).toContain('tr[data-testid^="row-"]');
    expect(step.highlightTarget).toContain('[data-current-fiscal-year]');
  });
});
