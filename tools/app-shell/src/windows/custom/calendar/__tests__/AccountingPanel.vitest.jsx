import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AccountingPanel from '../AccountingPanel.jsx';

const ROW = { id: 'f1', account: '20000000', debit: '100.00', credit: '0.00', factaccttype: 'R', description: 'Year close' };

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
});

describe('AccountingPanel', () => {
  it('fetches and renders accounting rows scoped to the year', async () => {
    render(<AccountingPanel data={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__test" />);
    await waitFor(() => expect(screen.getByText('20000000')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/calendar/accounting?year=year1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
    expect(screen.getByText('100.00')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<AccountingPanel data={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__empty" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-empty')).toBeInTheDocument());
  });
});
