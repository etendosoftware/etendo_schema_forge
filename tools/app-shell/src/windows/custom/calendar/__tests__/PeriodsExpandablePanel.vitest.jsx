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
        parentId="year1"
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('Jan-2027'));
    global.fetch = postSpy;
    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/periodControl/p1/action/openClose',
      expect.objectContaining({ method: 'POST' })
    ));
  });

  it('calls the document openClose endpoint when Abrir/Cerrar Documento is clicked', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p3" />);
    await waitFor(() => screen.getByText('Jan-2027'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('API'));
    global.fetch = postSpy;
    fireEvent.click(screen.getByTestId('document-openclose-d1'));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/documents/d1/action/openClose',
      expect.objectContaining({ method: 'POST' })
    ));
  });

  it('collapses the period row again on a second click without re-fetching documents', async () => {
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p4" />);
    await waitFor(() => screen.getByText('Jan-2027'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('API'));
    const fetchCallsAfterExpand = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(screen.queryByTestId('period-documents-p1')).not.toBeInTheDocument());

    // Re-expanding should reuse the cached documents, not re-fetch.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('API'));
    expect(global.fetch.mock.calls.length).toBe(fetchCallsAfterExpand);
  });
});

// NOTE (Sentinel/QA, ETP-4478): a non-ok response from the `periodControl` or `documents`
// fetch is NOT handled anywhere in this component — `fetchJson` throws and neither `useEffect`
// call nor `toggleExpand` attaches a `.catch`, so a failed request surfaces as a real, uncaught
// `Unhandled Rejection` at runtime (verified interactively; not committed as a spec here because
// it would leave the suite exiting non-zero on an intentionally-uncaught rejection). See the QA
// report for BUG-1/BUG-2 (no error handling / no double-submit guard on the open/close actions).
