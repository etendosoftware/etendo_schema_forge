import { render, screen, fireEvent } from '@testing-library/react';
import { useClientSort } from '../useClientSort';

vi.mock('@/i18n', () => ({
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

/**
 * useClientSort — the sort state behind the three hand-rolled financial-account grids.
 *
 * The cycle must match ListView.handleColumnSort (none → asc → desc → none) so the tabs feel
 * like every DataTable grid even though they sort in memory. See lib/clientSort.js for why
 * server-side sorting is not available to them.
 */
const ROWS = [
  { id: 'a', n: 3, date: '2026-03-01' },
  { id: 'b', n: 1, date: '2026-01-01' },
  { id: 'c', n: 2, date: '2026-02-01' },
];

function Harness({ rows = ROWS, accessors, initialSort }) {
  const { sorted, sortKey, sortDirection, toggleSort } = useClientSort(rows, { accessors, initialSort });
  return (
    <div>
      <span data-testid="order">{sorted.map((r) => r.id).join(',')}</span>
      <span data-testid="state">{String(sortKey)}:{sortDirection}</span>
      <button type="button" onClick={() => toggleSort('n')}>sort-n</button>
      <button type="button" onClick={() => toggleSort('date')}>sort-date</button>
    </div>
  );
}

const order = () => screen.getByTestId('order').textContent;
const state = () => screen.getByTestId('state').textContent;
const click = (name) => fireEvent.click(screen.getByText(name));

describe('useClientSort', () => {
  it('leaves the rows in the backend order until a column is picked', () => {
    render(<Harness />);

    expect(order()).toBe('a,b,c');
    expect(state()).toBe('null:asc');
  });

  it('cycles none → asc → desc → none on the same column', () => {
    render(<Harness />);

    click('sort-n');
    expect(state()).toBe('n:asc');
    expect(order()).toBe('b,c,a');

    click('sort-n');
    expect(state()).toBe('n:desc');
    expect(order()).toBe('a,c,b');

    // Third click clears rather than jumping to some default column — that is what makes the
    // backend's own order (newest-first movements, transactionDate desc reconciliations)
    // reachable again.
    click('sort-n');
    expect(state()).toBe('null:asc');
    expect(order()).toBe('a,b,c');
  });

  it('restarts at ascending when switching to a different column', () => {
    render(<Harness />);

    click('sort-n');
    click('sort-n');
    expect(state()).toBe('n:desc');

    click('sort-date');
    expect(state()).toBe('date:asc');
    expect(order()).toBe('b,c,a');
  });

  it('sorts through the accessor map when the key is not a row property', () => {
    render(<Harness accessors={{ n: (r) => -r.n }} />);

    click('sort-n');
    // Negated, so the ascending order is the reverse of the raw one.
    expect(order()).toBe('a,c,b');
  });

  // ETP-5083: `initialSort` seeds the indicator state for a caller (e.g. warehouse transactions)
  // that has ALREADY pre-sorted its own `rows` before handing them to this hook. Unlike that real
  // caller, this harness's ROWS are in their raw (unsorted-by-n) order, so seeding `n:desc` here
  // also proves the seed genuinely drives `sortRows` on first render — not just cosmetic state.
  describe('initialSort (ETP-5083)', () => {
    it('seeds sortKey/sortDirection and actually sorts on first render', () => {
      render(<Harness initialSort={{ key: 'n', direction: 'desc' }} />);

      expect(state()).toBe('n:desc');
      expect(order()).toBe('a,c,b'); // n desc: 3, 2, 1
    });

    it('omitting initialSort keeps today\'s default (null:asc, no re-sort) — zero regression for existing callers', () => {
      render(<Harness />);

      expect(state()).toBe('null:asc');
      expect(order()).toBe('a,b,c');
    });

    it('first click on the seeded column jumps straight to the opposite direction (one-shot), then the normal cycle resumes', () => {
      render(<Harness initialSort={{ key: 'n', direction: 'desc' }} />);

      // Click 1 on the seeded column ('n'): one-shot override, desc -> asc directly.
      click('sort-n');
      expect(state()).toBe('n:asc');
      expect(order()).toBe('b,c,a'); // n asc: 1, 2, 3

      // Click 2: normal cycle resumes — asc -> desc.
      click('sort-n');
      expect(state()).toBe('n:desc');
      expect(order()).toBe('a,c,b');

      // Click 3: normal cycle — desc -> none.
      click('sort-n');
      expect(state()).toBe('null:asc');
      expect(order()).toBe('a,b,c');

      // Click 4: normal cycle from none -> asc, NOT another one-shot jump (which would go to desc).
      click('sort-n');
      expect(state()).toBe('n:asc');
      expect(order()).toBe('b,c,a');
    });

    it('a first click on a DIFFERENT column falls through to the normal cycle and consumes the grace period', () => {
      render(<Harness initialSort={{ key: 'n', direction: 'desc' }} />);

      // First click ever lands on 'date', not the seeded 'n' — normal first-click behavior
      // (straight to ascending on the clicked column), no override applied to 'date' itself.
      click('sort-date');
      expect(state()).toBe('date:asc');
      expect(order()).toBe('b,c,a'); // date asc: 2026-01-01, 2026-02-01, 2026-03-01

      // Grace period is spent. A later click back on the seeded column ('n') follows the PLAIN
      // cycle: sortKey !== 'n' at this point, so it goes straight to n:asc — which happens to
      // coincide with what a live override would ALSO produce here (seed was desc, opposite is
      // asc), so a second click is needed to tell them apart: the normal cycle moves asc -> desc,
      // while a still-live one-shot has no second consumption and would never reach 'desc' via
      // this path. Landing on 'n:desc' proves the grace period was truly spent on the FIRST
      // click ever (on 'date'), not local to a per-column state.
      click('sort-n');
      expect(state()).toBe('n:asc');
      click('sort-n');
      expect(state()).toBe('n:desc');
    });
  });
});
