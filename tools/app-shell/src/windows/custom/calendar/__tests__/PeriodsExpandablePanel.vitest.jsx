import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PeriodsExpandablePanel from '../PeriodsExpandablePanel.jsx';

const PERIOD = { id: 'p1', name: 'Jan-2027', status: 'O', periodNo: 1 };
const DOC = { id: 'd1', documentCategory: 'API', periodStatus: 'O' };

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [PERIOD] }) });
    }
    if (url.includes('/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [DOC] }) });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
});

describe('PeriodsExpandablePanel', () => {
  it('fetches document rows only after the period row is expanded', async () => {
    render(
      <PeriodsExpandablePanel
        data={{ id: 'year1' }}
        token="tok"
        apiBaseUrl="https://api.test"
        data-testid="PeriodsExpandablePanel__test" />
    );
    await waitFor(() => expect(screen.getByText('Jan-2027')).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/documents'), expect.anything());

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));

    await waitFor(() => expect(screen.getByText('API')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/documents?parentId=p1'), expect.anything());
  });

  it('calls the period openClose endpoint when Abrir/Cerrar Periodo is clicked', async () => {
    global.fetch.mockImplementationOnce((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [PERIOD] }) });
      return Promise.reject(new Error('unexpected'));
    });
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel data={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('Jan-2027'));
    global.fetch = postSpy;
    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/calendar/periodControl/p1/action/openClose',
      expect.objectContaining({ method: 'POST' })
    ));
  });
});
