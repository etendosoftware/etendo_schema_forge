// @covers tools/app-shell/src/windows/custom/calendar/AccountingPanel.jsx
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeAll(installPointerCaptureStubs);

let apiFetchMock = vi.fn();
let gridColumnViewsEnabled = false;
vi.mock('@/auth/useApiFetch.js', async () => (await import('@/test/gridViewTestDoubles.jsx')).apiFetchHookMock(() => apiFetchMock));
vi.mock('@/lib/flags', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridFlagsMock(() => gridColumnViewsEnabled));

import AccountingPanel from '../AccountingPanel.jsx';
import { installPointerCaptureStubs } from '@/test/gridViewTestDoubles.jsx';

const ROW = {
  id: 'f1', account: '20000000', accountName: 'Profit and loss', debit: 1234.5, credit: 0,
  factaccttype: 'R', description: 'Year close', 'currency$_identifier': 'EUR',
};

beforeEach(() => {
  gridColumnViewsEnabled = false;
  apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
});

describe('AccountingPanel', () => {
  it('keeps grid controls and preference requests absent while the flag is off', async () => {
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" />);
    await screen.findByTestId('accounting-account-f1');
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(apiFetchMock.mock.calls.some(([url]) => url.includes('/grid-views/'))).toBe(false);
  });

  it('hides a column and saves explicitly with the accounting entity identity', async () => {
    gridColumnViewsEnabled = true;
    apiFetchMock = vi.fn((url) => url.includes('/grid-views/')
      ? Promise.resolve({ ok: true, status: 204 })
      : Promise.resolve({ ok: true, json: async () => ({ data: [ROW] }) }));
    const user = userEvent.setup();
    const onCount = vi.fn();
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" onCount={onCount} />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(apiFetchMock).toHaveBeenCalledWith('/sws/neo/grid-views/end-year-close/accounting', { baseUrl: '' });
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    await user.click(screen.getByTestId('grid-view-column-description'));
    expect(screen.queryByTestId('column-header-description')).not.toBeInTheDocument();
    expect(screen.getByTestId('accounting-account-f1')).toHaveTextContent(ROW.account);
    expect(screen.getByTestId('row-f1').querySelector('input[type="checkbox"]')).toBeNull();
    expect(onCount).toHaveBeenCalledWith(1);
    expect(apiFetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
    await user.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true));
    const [url, options] = apiFetchMock.mock.calls.find(([, request]) => request.method === 'PUT');
    expect(url).toBe('/sws/neo/grid-views/end-year-close/accounting');
    expect(JSON.parse(options.body).columns).toContainEqual(expect.objectContaining({ id: 'list:field:description', visible: false }));
  });

  it('retains loading and empty states while personal grid preferences load', async () => {
    gridColumnViewsEnabled = true;
    let finishRows;
    apiFetchMock = vi.fn((url) => url.includes('/grid-views/')
      ? new Promise(() => {})
      : new Promise((resolve) => { finishRows = resolve; }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" />);
    expect(screen.getByTestId('accounting-panel-loading')).toBeInTheDocument();
    finishRows({ ok: true, json: async () => ({ data: [] }) });
    expect(await screen.findByTestId('accounting-panel-empty')).toBeInTheDocument();
    expect(screen.getByTestId('grid-view-columns-trigger')).toBeDisabled();
  });

  it('fetches and renders accounting rows scoped to the year', async () => {
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__test" />);
    // The account reads "code - name", like every other accounting tab (ETP-5592).
    await waitFor(() => expect(screen.getByTestId('accounting-account-f1')).toHaveTextContent('20000000 - Profit and loss'));
    expect(apiFetchMock).toHaveBeenCalledWith(
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
    apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ ...ROW, accountName: '' }] }) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => expect(screen.getByTestId('accounting-account-f1').textContent).toBe('20000000'));
  });

  it('reports the number of rows as the tab count', async () => {
    const onCount = vi.fn();
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" onCount={onCount} />);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1));
  });

  it('shows an empty state when there are no rows', async () => {
    apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__empty" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-empty')).toBeInTheDocument());
  });

  it('shows a loading indicator while the fetch is still pending', () => {
    apiFetchMock = vi.fn(() => new Promise(() => {})); // never resolves
    render(
      <AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__pending" />
    );
    expect(screen.getByTestId('accounting-panel-loading')).toBeInTheDocument();
  });

  it('shows a distinct error state (not the empty state) when the server responds with a non-ok status', async () => {
    apiFetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__error" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('accounting-panel-empty')).not.toBeInTheDocument();
  });

  it('shows the error state (not stuck loading) on a hard network failure', async () => {
    apiFetchMock = vi.fn(() => Promise.reject(new Error('network down')));
    render(<AccountingPanel parentId="year1" apiBaseUrl="https://api.test" data-testid="AccountingPanel__network" />);
    await waitFor(() => expect(screen.getByTestId('accounting-panel-error')).toBeInTheDocument());
  });
});
