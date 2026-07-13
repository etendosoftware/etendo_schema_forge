import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CloseYearConfirmModal from '../CloseYearConfirmModal.jsx';

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'p1', status: 'C' }, { id: 'p2', status: 'P' }] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('CloseYearConfirmModal', () => {
  it('enables confirm only once all periods are closed, then POSTs closeYear', async () => {
    const onSaved = vi.fn();
    render(
      <CloseYearConfirmModal
        direction="close"
        isOpen
        currentRecord={{ id: 'year1' }}
        token="tok"
        apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}}
        onSaved={onSaved}
        data-testid="CloseYearConfirmModal__test" />
    );
    await waitFor(() => expect(screen.getByTestId('close-year-confirm')).not.toBeDisabled());
    // The periodControl status check must hit the open-close-period-control spec (unchanged
    // by the ETP-4478 rework), not fiscal-calendar — those are two separate specs now.
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/open-close-period-control/periodControl?year=year1',
      expect.anything()
    );
    fireEvent.click(screen.getByTestId('close-year-confirm'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/fiscal-calendar/year/year1/action/closeYear',
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('keeps confirm disabled when a period is still open', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'p1', status: 'O' }] }) }));
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}} onSaved={() => {}} data-testid="modal2" />
    );
    await waitFor(() => screen.getByTestId('close-year-confirm'));
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });

  it('keeps confirm disabled when one period out of a mix is still Never Opened (N)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [
        { id: 'p1', status: 'C' },
        { id: 'p2', status: 'P' },
        { id: 'p3', status: 'N' },
      ] }),
    }));
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}} onSaved={() => {}} data-testid="modal3" />
    );
    await waitFor(() => screen.getByTestId('close-year-confirm'));
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });

  it('keeps confirm disabled when the year has zero periods', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}} onSaved={() => {}} data-testid="modal4" />
    );
    await waitFor(() => screen.getByTestId('close-year-confirm'));
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });

  it('enables confirm for the undo direction and POSTs undoCloseYear', async () => {
    const onSaved = vi.fn();
    render(
      <CloseYearConfirmModal
        direction="undo"
        isOpen
        currentRecord={{ id: 'year1' }}
        token="tok"
        apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}}
        onSaved={onSaved}
        data-testid="modal5" />
    );
    await waitFor(() => expect(screen.getByTestId('close-year-confirm')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('close-year-confirm'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/fiscal-calendar/year/year1/action/undoCloseYear',
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('disables the confirm button while a submission is in flight (no double-submit)', async () => {
    let resolveAction;
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'p1', status: 'C' }] }) });
      }
      return new Promise((resolve) => { resolveAction = resolve; });
    });
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test/fiscal-calendar"
        onClose={() => {}} onSaved={() => {}} data-testid="modal6" />
    );
    await waitFor(() => expect(screen.getByTestId('close-year-confirm')).not.toBeDisabled());

    fireEvent.click(screen.getByTestId('close-year-confirm'));
    await waitFor(() => expect(screen.getByTestId('close-year-confirm')).toBeDisabled());

    resolveAction({ ok: true, json: () => Promise.resolve({}) });
  });
});
