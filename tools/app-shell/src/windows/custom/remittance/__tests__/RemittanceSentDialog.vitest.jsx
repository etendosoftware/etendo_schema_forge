// @covers artifacts/remittance/custom/RemittanceSentDialog.jsx
// @covers artifacts/remittance/custom/RemittanceStatusChange.jsx
// @covers artifacts/remittance/custom/remittanceFileApi.js
//
// ETP-6247 «Pasar a Enviada al banco» (markSent): the status change as two chips plus the effect,
// posted by the dialog itself. Real ActionChoiceModal, StatusTag and remittanceFileApi; only
// useApiFetch and the toasts are mocked.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const mockDictionary = { 'backendError.remittanceMarkSentNotAllowed': 'T:notAllowed' };
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocale: () => ({}) }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceSentDialog from '@generated/remittance/custom/RemittanceSentDialog.jsx';
import { RemittanceStatusChip } from '@generated/remittance/custom/RemittanceStatusChange.jsx';
import { markRemittanceSent } from '@generated/remittance/custom/remittanceFileApi.js';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const sentCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/markSent'));

async function renderDialog() {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(<RemittanceSentDialog record={{ id: 'rem-1' }} apiBaseUrl="/api" onRefresh={onRefresh} onClose={onClose} />);
  await act(async () => {});
  return { onRefresh, onClose };
}

beforeEach(() => { vi.clearAllMocks(); mockApiFetch.mockReset(); mockApiFetch.mockResolvedValue(json({ response: { data: { status: 'SB' } } })); });

describe('markRemittanceSent', () => {
  it('posts an empty body and reads the status; a refusal throws with its body', async () => {
    await expect(markRemittanceSent(mockApiFetch, 'a b')).resolves.toEqual({ status: 'SB' });
    expect(mockApiFetch).toHaveBeenCalledWith('/remittance/a%20b/action/markSent', { method: 'POST', body: '{}' });
    mockApiFetch.mockResolvedValue(json({ error: { messageKeys: ['ETGO_RemittanceMarkSentNotAllowed'] } }, { ok: false, status: 422 }));
    await expect(markRemittanceSent(mockApiFetch, 'a')).rejects.toMatchObject({ status: 422 });
  });
});

describe('RemittanceSentDialog', () => {
  it('shows «Pendiente de envío → Enviada al banco», the effect, and names the step on the primary', async () => {
    await renderDialog();
    const change = screen.getByTestId('remittance-status-change');
    expect(change).toHaveAttribute('data-from', 'PR');
    expect(change).toHaveAttribute('data-to', 'SB');
    expect(change).toHaveTextContent('remittanceStatusPr');
    expect(change).toHaveTextContent('remittanceStatusSb');
    expect(screen.getByTestId('remittance-sent-effect')).toHaveTextContent('remittanceSentEffect');
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceSentTitle');
    expect(screen.getByTestId('action-confirm-modal')).toHaveTextContent('remittanceAdvanceToSent');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('posts markSent, toasts, refreshes and closes', async () => {
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(sentCalls()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('remittanceSentSuccess');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a refusal toasts the translated message and keeps the dialog open and usable', async () => {
    mockApiFetch.mockResolvedValue(json({ error: { message: 'raw', messageKeys: ['ETGO_RemittanceMarkSentNotAllowed'] } }, { ok: false, status: 422 }));
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(toast.error).toHaveBeenCalledWith('T:notAllowed');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('action-confirm-modal')).toBeEnabled();
  });

  it('Cancelar closes without posting', async () => {
    const { onClose } = await renderDialog();
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sentCalls()).toHaveLength(0);
  });
});

describe('RemittanceStatusChip', () => {
  it.each([['PR', 'remittanceStatusPr'], ['SB', 'remittanceStatusSb'], ['CT', 'remittanceStatusCt']])('%s reads as the header chip does', (status, key) => {
    const { unmount } = render(<RemittanceStatusChip status={status} />);
    expect(screen.getByText(key)).toBeInTheDocument();
    unmount();
  });

  it('is the detail\'s standard status pill (same component as every window\'s header), toned by the status field\'s variants', () => {
    const { unmount } = render(<RemittanceStatusChip status="SB" />);
    const pill = screen.getByTestId('remittance-status-chip-SB');
    expect(pill).toHaveAttribute('data-tone', 'info');
    expect(pill).toHaveStyle({ fontSize: '14px', borderRadius: '8px', padding: '4px 8px' });
    unmount();
    render(<RemittanceStatusChip status="CT" />);
    expect(screen.getByTestId('remittance-status-chip-CT')).toHaveAttribute('data-tone', 'success');
  });
});
