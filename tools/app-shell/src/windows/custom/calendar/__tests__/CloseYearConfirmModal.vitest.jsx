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
        apiBaseUrl="https://api.test"
        onClose={() => {}}
        onSaved={onSaved}
        data-testid="CloseYearConfirmModal__test" />
    );
    await waitFor(() => expect(screen.getByTestId('close-year-confirm')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('close-year-confirm'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/year/year1/action/closeYear',
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('keeps confirm disabled when a period is still open', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'p1', status: 'O' }] }) }));
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok" apiBaseUrl="https://api.test"
        onClose={() => {}} onSaved={() => {}} data-testid="modal2" />
    );
    await waitFor(() => screen.getByTestId('close-year-confirm'));
    expect(screen.getByTestId('close-year-confirm')).toBeDisabled();
  });
});
