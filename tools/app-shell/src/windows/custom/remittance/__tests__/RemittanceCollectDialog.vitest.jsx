// @covers artifacts/remittance/custom/RemittanceCollectDialog.jsx
// @covers artifacts/remittance/custom/remittanceFileApi.js
//
// ETP-6247 «Marcar como cobrada»: the dialog warns what it does, posts markCollected itself and
// refreshes. Real ActionChoiceModal, InfoBanner, remittanceFileApi, formatCurrency / dateOnly;
// only useApiFetch and the toasts are mocked.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const mockDictionary = { 'backendError.remittanceMarkCollectedNotAllowed': 'T:notAllowed' };
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocaleSwitch: () => ({ locale: 'es-ES' }) }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceCollectDialog from '@generated/remittance/custom/RemittanceCollectDialog.jsx';
import { markRemittanceCollected } from '@generated/remittance/custom/remittanceFileApi.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const data = (payload) => json({ response: { data: payload } });

function routes({ collect = data({ status: 'CT', settledOn: '2026-12-15' }) } = {}) {
  mockApiFetch.mockImplementation((url) => {
    if (url.endsWith('/action/markCollected')) return Promise.resolve(collect);
    if (url.startsWith('/lines?')) return Promise.resolve(data([{ amount: 1202.3, id: 4, isGridSummary: true }]));
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}
const collectCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/markCollected'));

async function renderDialog() {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(<RemittanceCollectDialog record={{ id: 'rem-1', dueDate: '2026-12-15' }} apiBaseUrl="/api" onRefresh={onRefresh} onClose={onClose} />);
  await act(async () => {});
  return { onRefresh, onClose };
}

beforeEach(() => { vi.clearAllMocks(); mockApiFetch.mockReset(); });

describe('markRemittanceCollected', () => {
  it('posts an empty body and reads status and settledOn', async () => {
    routes();
    await expect(markRemittanceCollected(mockApiFetch, 'a b')).resolves.toEqual({ status: 'CT', settledOn: '2026-12-15' });
    expect(mockApiFetch).toHaveBeenCalledWith('/remittance/a%20b/action/markCollected', { method: 'POST', body: '{}' });
  });

  it('a null settledOn stays null; a refusal throws with its body', async () => {
    routes({ collect: data({ status: 'PT', settledOn: null }) });
    await expect(markRemittanceCollected(mockApiFetch, 'a')).resolves.toEqual({ status: 'PT', settledOn: null });
    routes({ collect: json({ error: { messageKeys: ['ETGO_RemittanceMarkCollectedNotAllowed'] } }, { ok: false, status: 422 }) });
    await expect(markRemittanceCollected(mockApiFetch, 'a')).rejects.toMatchObject({ status: 422 });
  });
});

describe('RemittanceCollectDialog', () => {
  it('shows the receipts, the total and the due date, and warns that the payments are settled', async () => {
    routes();
    await renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceCollectTitle');
    expect(screen.getByTestId('remittance-collect-count')).toHaveTextContent('4');
    expect(screen.getByTestId('remittance-collect-date')).toHaveTextContent(formatCalendarDate('2026-12-15', 'es-ES'));
    expect(screen.getByTestId('remittance-collect-warning')).toHaveTextContent('remittanceCollectWarning');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('shows the status change «Enviada al banco → Cobrada» as two chips and names the step on the primary', async () => {
    routes();
    await renderDialog();
    const change = screen.getByTestId('remittance-status-change');
    expect(change).toHaveAttribute('data-from', 'SB');
    expect(change).toHaveAttribute('data-to', 'CT');
    expect(change).toHaveTextContent('remittanceStatusSb');
    expect(change).toHaveTextContent('remittanceStatusCt');
    expect(screen.getByTestId('action-confirm-modal')).toHaveTextContent('remittanceAdvanceToCollected');
  });

  it('posts markCollected, toasts, refreshes and closes', async () => {
    routes();
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(collectCalls()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('remittanceCollectedSuccess');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a refusal toasts its translated message and keeps the dialog open and usable', async () => {
    routes({ collect: json({ error: { message: 'raw', messageKeys: ['ETGO_RemittanceMarkCollectedNotAllowed'] } }, { ok: false, status: 422 }) });
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(toast.error).toHaveBeenCalledWith('T:notAllowed');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('action-confirm-modal')).toBeEnabled();
  });

  it('Cancelar closes without posting', async () => {
    routes();
    const { onClose } = await renderDialog();
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(collectCalls()).toHaveLength(0);
  });
});
