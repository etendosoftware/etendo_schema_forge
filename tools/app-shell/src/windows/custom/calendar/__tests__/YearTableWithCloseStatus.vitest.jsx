import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

// Real Tag renders a plain <span> with no data-testid passthrough — mock it the same way
// PeriodsExpandablePanel.vitest.jsx / YearCloseStatusBadge.vitest.jsx already do.
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));

// Stub DataTable so we can drive YearTableWithCloseStatus's OWN column definitions (in
// particular the synthetic yearCloseStatus column's `render`) without pulling in the whole
// generic table implementation — mirrors PaymentHeaderTableBase.vitest.jsx's convention.
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    const { columns, data, token, apiBaseUrl } = props;
    return (
      <div data-testid="DataTable__stub">
        {(data ?? []).map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            {columns.map((col) => (
              <div key={col.key} data-testid={`col-${col.key}-${row.id}`}>
                {col.render ? col.render(row, { entity: 'year', token, apiBaseUrl }) : String(row[col.key] ?? '')}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

import YearTableWithCloseStatus from '../YearTableWithCloseStatus.jsx';

const YEARS = [
  { id: 'y1', fiscalYear: '2026', description: 'FY26' },
  { id: 'y2', fiscalYear: '2027', description: 'FY27' },
];

describe('YearTableWithCloseStatus', () => {
  it('rewrites apiBaseUrl to the end-year-close spec for the status check (not the year list\'s own base)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(
      <YearTableWithCloseStatus data={[YEARS[0]]} apiBaseUrl="https://api.test/fiscal-calendar" />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/end-year-close/accounting?year=y1',
      {}
    ));
  });

  it('shows the "closed" pill (green) for a year with at least one closing-type entry', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'f1' }] }) }));
    render(<YearTableWithCloseStatus data={[YEARS[0]]} apiBaseUrl="https://api.test/fiscal-calendar" />);

    await waitFor(() => {
      const badge = screen.getByTestId('col-yearCloseStatus-y1').querySelector('[data-testid="tag"]');
      expect(badge).toHaveAttribute('data-variant', 'green');
    });
  });

  it('shows the "not closed" pill (neutral) for a year with no closing-type entries', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<YearTableWithCloseStatus data={[YEARS[0]]} apiBaseUrl="https://api.test/fiscal-calendar" />);

    await waitFor(() => {
      const badge = screen.getByTestId('col-yearCloseStatus-y1').querySelector('[data-testid="tag"]');
      expect(badge).toHaveAttribute('data-variant', 'neutral');
    });
  });

  it('checks each row independently and in parallel, not one row at a time', async () => {
    const calls = [];
    global.fetch = vi.fn((url) => {
      calls.push(url);
      const closed = url.includes('year=y1');
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: closed ? [{ id: 'f1' }] : [] }) });
    });
    render(<YearTableWithCloseStatus data={YEARS} apiBaseUrl="https://api.test/fiscal-calendar" />);

    // Both requests are fired before either resolves — captured synchronously, not awaited
    // in sequence — proving the per-row fetches run in parallel.
    await waitFor(() => expect(calls.length).toBe(2));
    await waitFor(() => {
      const badgeY1 = screen.getByTestId('col-yearCloseStatus-y1').querySelector('[data-testid="tag"]');
      const badgeY2 = screen.getByTestId('col-yearCloseStatus-y2').querySelector('[data-testid="tag"]');
      expect(badgeY1).toHaveAttribute('data-variant', 'green');
      expect(badgeY2).toHaveAttribute('data-variant', 'neutral');
    });
  });

  it('renders nothing for the status cell while the check is pending or on error (no misleading placeholder)', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<YearTableWithCloseStatus data={[YEARS[0]]} apiBaseUrl="https://api.test/fiscal-calendar" />);

    expect(screen.getByTestId('col-yearCloseStatus-y1')).toBeEmptyDOMElement();
  });

  it('still renders the standard fiscalYear/description columns', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<YearTableWithCloseStatus data={[YEARS[0]]} apiBaseUrl="https://api.test/fiscal-calendar" />);

    expect(screen.getByTestId('col-fiscalYear-y1')).toHaveTextContent('2026');
    expect(screen.getByTestId('col-description-y1')).toHaveTextContent('FY26');
  });
});
