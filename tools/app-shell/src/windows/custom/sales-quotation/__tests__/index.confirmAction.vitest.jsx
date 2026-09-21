// ETP-5378 — row-hover "Confirmar" for Presupuesto de Venta.
//
// Unlike every other window fixed under this ticket, this one dispatches to TWO
// different modals depending on status (SendToEvaluationModal on Draft,
// QuotationConfirmModal on Bajo evaluación / Completado) — the same branching
// QuotationTopbarActions already does for the form. The case worth pinning here is
// the refetch: QuotationConfirmModal lets its `data` prop permanently win over its
// own internal refetch (ETP-4468, protecting an unsaved form edit), so handing it
// the raw grid row — which carries no `summedLineAmount` — would leave its subtotal
// line showing the grand total forever. Refetching first and handing it the FULL
// record avoids that.

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return { ...actual, createPortal: (node) => <div data-testid="portal">{node}</div> };
});

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: () => ({ requestDelete: vi.fn(), deleteDialog: null }),
}));

vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children },
}));

vi.mock('@/components/contract-ui/useCreateContactModal.jsx', () => ({
  useCreateContactModal: () => ({ headers: {}, createContactCtxValue: {}, contactPortal: null }),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({ default: () => null }));

vi.mock('../../shared/useRowEmailModal.jsx', () => ({
  useRowEmailModal: () => ({ onEmail: vi.fn(), emailModalPortal: null }),
}));

vi.mock('../../shared/useQuotationPdf.js', () => ({ useQuotationPdf: () => ({}) }));
vi.mock('../../shared/QuotationPreview.jsx', () => ({ default: () => null }));
vi.mock('../../shared/useSavedPreviewRecord.js', () => ({
  useSavedPreviewRecord: () => ({ effectiveRecord: null, clearSavedRecord: vi.fn() }),
}));

vi.mock('@generated/sales-quotation/generated/web/sales-quotation/QuotationTable', () => ({ default: () => null }));
vi.mock('@generated/sales-quotation/custom/QuotationSecondaryActions', () => ({ default: () => null }));

let lastGeneratedAppProps;
vi.mock('@generated/sales-quotation/generated/web/sales-quotation/index.jsx', () => ({
  default: (props) => { lastGeneratedAppProps = props; return <div data-testid="generated-app" />; },
}));

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

const toastLoading = vi.fn(() => 'toast-1');
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { loading: (...a) => toastLoading(...a), dismiss: vi.fn(), error: (...a) => toastError(...a), success: vi.fn() },
}));

let sendToEvalProps;
vi.mock('@generated/sales-quotation/custom/SendToEvaluationModal', () => ({
  default: (props) => { sendToEvalProps = props; return <div data-testid="send-to-eval-modal" />; },
}));

let quotationConfirmProps;
vi.mock('@generated/sales-quotation/custom/QuotationConfirmModal', () => ({
  default: (props) => { quotationConfirmProps = props; return <div data-testid="quotation-confirm-modal" />; },
}));

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesQuotationWindow from '../index.jsx';

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

async function openConfirm(row) {
  render(
    <SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />,
  );
  const entry = lastGeneratedAppProps.rowQuickActions.menuActions({ row, status: row.documentStatus })
    .find(a => a.key === 'confirm');
  await act(async () => { await entry.onClick({ row }); });
}

describe('SalesQuotationWindow — row-hover Confirmar (ETP-5378)', () => {
  beforeEach(() => {
    lastGeneratedAppProps = null;
    sendToEvalProps = null;
    quotationConfirmProps = null;
    apiFetchMock.mockReset();
    toastError.mockClear();
  });

  it('offers Confirm on Draft, Bajo evaluación and Completado', () => {
    render(<SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />);
    for (const documentStatus of ['DR', 'UE', 'CO']) {
      const actions = lastGeneratedAppProps.rowQuickActions.menuActions({ row: { documentStatus }, status: documentStatus });
      expect(actions.some(a => a.key === 'confirm')).toBe(true);
    }
  });

  it('offers no Confirm entry on a terminal status (e.g. Cancelado)', () => {
    render(<SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />);
    const actions = lastGeneratedAppProps.rowQuickActions.menuActions({ row: { documentStatus: 'CA' }, status: 'CA' });
    expect(actions.some(a => a.key === 'confirm')).toBe(false);
  });

  it('keeps the Reject entry from customMenuActions alongside Confirm on UE', () => {
    render(<SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />);
    const actions = lastGeneratedAppProps.rowQuickActions.menuActions({ row: { documentStatus: 'UE' }, status: 'UE' });
    expect(actions.map(a => a.key)).toEqual(['confirm', 'reject']);
  });

  it('refetches the record via /quotation/{id} — not the entity-generic /header path', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [{ id: 'q-1', documentStatus: 'DR' }] } }));
    await openConfirm({ id: 'q-1', documentStatus: 'DR' });
    expect(apiFetchMock).toHaveBeenCalledWith('/quotation/q-1');
  });

  it('opens SendToEvaluationModal on a Draft row, with the refetched record as data', async () => {
    const fresh = { id: 'q-1', documentStatus: 'DR', documentNo: '1000001', businessPartner: 'Laura Morat' };
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [fresh] } }));
    await openConfirm({ id: 'q-1', documentStatus: 'DR' });

    expect(screen.getByTestId('send-to-eval-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('quotation-confirm-modal')).not.toBeInTheDocument();
    expect(sendToEvalProps.quotationId).toBe('q-1');
    expect(sendToEvalProps.data).toEqual(fresh);
  });

  it('opens QuotationConfirmModal on a Bajo evaluación row, with the refetched record as data', async () => {
    const fresh = { id: 'q-2', documentStatus: 'UE', summedLineAmount: 12, grandTotalAmount: 15.14 };
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [fresh] } }));
    await openConfirm({ id: 'q-2', documentStatus: 'UE' });

    expect(screen.getByTestId('quotation-confirm-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('send-to-eval-modal')).not.toBeInTheDocument();
    expect(quotationConfirmProps.quotationId).toBe('q-2');
    // The refetched record, not the bare grid row — the row never carried
    // summedLineAmount, so this is exactly the value ETP-4468 would have hidden
    // forever behind the stale row if it had been passed instead.
    expect(quotationConfirmProps.data).toEqual(fresh);
  });

  it('does not pass onSave to QuotationConfirmModal — nothing is unsaved from a row action', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [{ id: 'q-2', documentStatus: 'CO' }] } }));
    await openConfirm({ id: 'q-2', documentStatus: 'CO' });
    expect(quotationConfirmProps.onSave).toBeUndefined();
  });

  it('bumps refreshKey (list refresh), not a form onRefresh, when QuotationConfirmModal completes', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [{ id: 'q-2', documentStatus: 'CO' }] } }));
    await openConfirm({ id: 'q-2', documentStatus: 'CO' });
    expect(lastGeneratedAppProps.refreshTrigger).toBe(0);
    await act(async () => { quotationConfirmProps.onRefresh(); });
    expect(lastGeneratedAppProps.refreshTrigger).toBe(1);
  });

  it('reports a failed refetch and opens neither modal', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, false, 500));
    await openConfirm({ id: 'q-1', documentStatus: 'DR' });

    expect(screen.queryByTestId('send-to-eval-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quotation-confirm-modal')).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith('boom');
  });

  it('ignores a row with no id instead of firing a request', async () => {
    render(<SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />);
    const entry = lastGeneratedAppProps.rowQuickActions.menuActions({ row: { documentStatus: 'DR' }, status: 'DR' })
      .find(a => a.key === 'confirm');
    await act(async () => { await entry.onClick({ row: { documentStatus: 'DR' } }); });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('closes without side effects when the modal is dismissed', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [{ id: 'q-1', documentStatus: 'DR' }] } }));
    await openConfirm({ id: 'q-1', documentStatus: 'DR' });
    await act(async () => { sendToEvalProps.onClose(); });
    expect(screen.queryByTestId('send-to-eval-modal')).not.toBeInTheDocument();
  });
});
