// @covers tools/app-shell/src/windows/custom/calendar/AccountingPanel.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import AccountingPanel from '../AccountingPanel.jsx';

const ROW = {
  id: 'f1', account: '20000000', accountName: 'Profit and loss', debit: 1234.5, credit: 0,
  factaccttype: 'R', description: 'Year close', 'currency$_identifier': 'EUR',
};

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
});

describe('AccountingPanel', () => {
  it('fetches and renders accounting rows scoped to the year', async () => {
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__test" />);
    // The account reads "code - name", like every other accounting tab (ETP-5592).
    await waitFor(() => expect(screen.getByTestId('accounting-account-f1')).toHaveTextContent('20000000 - Profit and loss'));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/accounting?year=year1',
      {}
    );
    expect(screen.getByText('Year close')).toBeInTheDocument();
  });

  // ETP-5592: amounts go through the canonical currency formatter with the schema currency the
  // backend sends, never the raw number.
  it('formats debit and credit with the row currency instead of printing the raw number', async () => {
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByTestId('accounting-account-f1'));

    const row = screen.getByTestId('row-f1');
    expect(row).toHaveTextContent('€');
    expect(row).toHaveTextContent(/1[.,]?234[.,]50/);
    expect(row).not.toHaveTextContent('1234.5 ');
  });

  it('shows only the code when the backend sends no account name', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ ...ROW, accountName: '' }] }) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => expect(screen.getByTestId('accounting-account-f1').textContent).toBe('20000000'));
  });

  it('reports the number of rows as the tab count', async () => {
    const onCount = vi.fn();
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" onCount={onCount} />);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1));
  });

  it('shows an empty state when there are no rows', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__empty" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-empty')).toBeInTheDocument());
  });

  it('shows a loading indicator while the fetch is still pending', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(
      <AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__pending" />
    );
    expect(screen.getByTestId('accounting-panel-loading')).toBeInTheDocument();
  });

  it('shows a distinct error state (not the empty state) when the server responds with a non-ok status', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__error" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('accounting-panel-empty')).not.toBeInTheDocument();
  });

  it('shows the error state (not stuck loading) on a hard network failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__network" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
  });
});
