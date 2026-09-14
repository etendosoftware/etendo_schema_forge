// ETP-5272 follow-up: since ETP-4463, SIF-tab fields (e.g. `aeatsiiErrorRegistral`, the
// "Modificada error registral" checkbox) no longer persist via per-field PATCH — they only
// live in the pending-edits state until a full header save flushes them to the DB.
// `SifSendingModal.handleSend` used to call the SII/TBAI process actions directly, with no
// intervening save, so a user could tick the box and immediately click "Enviar a SIF" while
// the backend still held the OLD persisted value. These tests assert the fix: a dirty header
// is saved BEFORE any process action runs, a clean header skips the redundant save, and a
// failed save blocks the send outright.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => (...args) => apiFetchMock(...args),
}));

import SifSendingModal from '../SifSendingModal.jsx';

function renderModal(overrides = {}) {
  return render(
    <SifSendingModal
      pendingTargets={{ sendSii: true, sendTbai: false }}
      bodyKey="sendToSifBodySii"
      base="/sws/neo"
      specName="sales-invoice"
      recordId="INV_1"
      onClose={() => {}}
      {...overrides}
    />,
  );
}

describe('SifSendingModal — flushes pending header edits before sending (ETP-5272)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it('saves first, then sends, in that order, when the header is dirty', async () => {
    const callOrder = [];
    const onSave = vi.fn(async () => {
      callOrder.push('save');
      return { id: 'INV_1' };
    });
    apiFetchMock.mockImplementation(async (...args) => {
      callOrder.push('send');
      return { ok: true, json: () => Promise.resolve({}) };
    });

    renderModal({ onSave, isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['save', 'send']);
  });

  it('does not call onSave when the header is clean — no redundant round-trip', async () => {
    const onSave = vi.fn(async () => ({ id: 'INV_1' }));

    renderModal({ onSave, isDirty: false });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave when no onSave prop is provided, even if isDirty is true', async () => {
    renderModal({ isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks the send and surfaces an error when the save fails (dirty header)', async () => {
    const onSave = vi.fn(async () => null); // handleSave resolves null on failure

    renderModal({ onSave, isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await screen.findByText('sendToSifSaveError');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
    // Only the Close button is available — no per-target ✓/✗ result line was ever rendered.
    expect(screen.queryByText('sendToSifSuccessSii')).not.toBeInTheDocument();
    expect(screen.queryByText('sendToSifErrorSii')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
  });

  it('recovers from a blocked save on the next attempt once the header saves successfully', async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'INV_1' });

    renderModal({ onSave, isDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));
    await screen.findByText('sendToSifSaveError');

    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
