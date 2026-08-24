import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AccountingPanel from '../AccountingPanel.jsx';
// ETP-4576 — the component asks the shared builder for its credential, so what a
// test may assert is "the active scheme's header", never a literal it also chose.
// The scheme is declared per test rather than inherited: src/test/setup.js resets
// to the bearer default, and an assertion that relies on that default passes by
// omission.
import { declareBearerSession, expectBearerHeader } from '@/test/sessionContract.js';

const ROW = { id: 'f1', account: '20000000', debit: '100.00', credit: '0.00', factaccttype: 'R', description: 'Year close' };

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
  declareBearerSession('tok');
});

describe('AccountingPanel', () => {
  it('fetches and renders accounting rows scoped to the year', async () => {
    render(<AccountingPanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__test" />);
    await waitFor(() => expect(screen.getByText('20000000')).toBeInTheDocument());
    expect(global.fetch.mock.calls.at(-1)[0]).toBe('https://api.test/accounting?year=year1');
    expectBearerHeader('tok', global.fetch);
    expect(screen.getByText('100.00')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    declareBearerSession('tok');
    render(<AccountingPanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__empty" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-empty')).toBeInTheDocument());
  });

  it('shows a loading indicator while the fetch is still pending', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    declareBearerSession('tok');
    render(
      <AccountingPanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__pending" />
    );
    expect(screen.getByTestId('accounting-panel-loading')).toBeInTheDocument();
  });

  it('shows a distinct error state (not the empty state) when the server responds with a non-ok status', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    declareBearerSession('tok');
    render(<AccountingPanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__error" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('accounting-panel-empty')).not.toBeInTheDocument();
  });

  it('shows the error state (not stuck loading) on a hard network failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    declareBearerSession('tok');
    render(<AccountingPanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="AccountingPanel__network" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
  });
});
