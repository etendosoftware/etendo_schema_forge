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

function Harness({ rows = ROWS, accessors }) {
  const { sorted, sortKey, sortDirection, toggleSort } = useClientSort(rows, { accessors });
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
});
