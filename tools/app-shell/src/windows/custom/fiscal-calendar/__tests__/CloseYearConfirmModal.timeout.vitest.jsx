// ETP-5424 — closing (or undoing the close of) a fiscal year posts the regularization entries
// synchronously and can outlive apiFetch's default timeout. A client-side cut while the server
// still commits would show an error and invite a second close, so the action opts out with
// `timeout: 0`. The real client performs the request; only its options are recorded
// (see `@/test/recordApiFetch.js`).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import CloseYearConfirmModal from '../CloseYearConfirmModal.jsx';

beforeEach(() => {
  resetApiFetchCalls();
  global.fetch = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', status: 'C' }] } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('CloseYearConfirmModal — timeout opt-out (ETP-5424)', () => {
  for (const [direction, action] of [['close', 'closeYear'], ['undo', 'undoCloseYear']]) {
    it(`the ${action} action passes timeout: 0`, async () => {
      render(
        <CloseYearConfirmModal
          direction={direction}
          isOpen
          currentRecord={{ id: 'year1' }}
          token="tok"
          apiBaseUrl="https://api.test/fiscal-calendar"
          onClose={() => {}}
          onSaved={() => {}}
          data-testid="CloseYearConfirmModal__timeout" />,
      );
      await waitFor(() => expect(screen.getByTestId('close-year-confirm')).not.toBeDisabled());
      fireEvent.click(screen.getByTestId('close-year-confirm'));

      await waitFor(() => expect(apiFetchCallsTo('/action/').length).toBe(1));
      const [call] = apiFetchCallsTo('/action/');
      expect(call.options.method).toBe('POST');
      expect(call.options.timeout).toBe(0);
    });
  }

  it('the period-status read keeps the default timeout (a plain list read)', async () => {
    render(
      <CloseYearConfirmModal direction="close" isOpen currentRecord={{ id: 'year1' }} token="tok"
        apiBaseUrl="https://api.test/fiscal-calendar" onClose={() => {}} onSaved={() => {}} data-testid="m" />,
    );
    await waitFor(() => expect(apiFetchCallsTo('/periodControl').length).toBeGreaterThanOrEqual(1));
    expect(apiFetchCallsTo('/periodControl')[0].options?.timeout).toBeUndefined();
  });
});
