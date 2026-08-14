// Real-render coverage companion to ConfirmWithCreditButtonBase.test.js (which
// only asserts regex/string matches against the source text and therefore
// contributes zero executed lines to coverage). Mirrors the sibling
// return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx convention
// (jsdom render + @testing-library/react against the real component tree).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mocks below expose the props needed to exercise ConfirmWithCreditButtonBase's
// own callback wiring (onConfirmed/onClose/onConfirm/navigate) via buttons the
// tests can click directly — the real modals' internals are out of scope here.
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: ({ onConfirmed, onClose }) => (
    <div data-testid="confirm-inout-modal">
      <button data-testid="confirm-inout-confirm-with-id" onClick={() => onConfirmed({ invoice: { id: 'INV-1', documentNo: 'FC-001', amount: 100 } })} />
      <button data-testid="confirm-inout-confirm-no-id" onClick={() => onConfirmed({ invoice: {} })} />
      <button data-testid="confirm-inout-close" onClick={onClose} />
    </div>
  ),
}));

vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: ({ navigate, onClose }) => (
    <div data-testid="confirm-result-modal">
      <button data-testid="result-navigate" onClick={() => navigate('/some/route')} />
      <button data-testid="result-close" onClick={onClose} />
    </div>
  ),
}));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onConfirm, onClose }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button data-testid="create-invoice-confirm" onClick={onConfirm} />
      <button data-testid="create-invoice-close" onClick={onClose} />
    </div>
  ),
}));

import ConfirmWithCreditButtonBase from '../ConfirmWithCreditButtonBase.jsx';

const BASE_PROPS = {
  recordId: 'REC-001',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/some-window',
  entitySegment: 'someWindow',
  invoiceRoute: '/sales-invoice/',
  invoiceType: 'facturaVenta',
  invoiceCreatedTitleKey: 'invoiceCreatedTitle',
  generatePdfFn: vi.fn(),
  getPdfLabelsFn: () => ({}),
  specName: 'some-window',
  entityName: 'someWindow',
};

describe('ConfirmWithCreditButtonBase — postConfirmButtonLabel (ETP-4737)', () => {
  it('falls back to ui("createReturnInvoice") when postConfirmButtonLabel is not provided', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('createReturnInvoice');
  });

  it('renders the caller-provided postConfirmButtonLabel as the button text instead of the default', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('Crear Factura Rectificativa');
    expect(btn).not.toHaveTextContent('createReturnInvoice');
  });

  it('does not render the post-confirm button at all when status is CO but hasReturnInvoice is true', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: true }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('does not render the post-confirm button in DR status, regardless of postConfirmButtonLabel', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
    // DR renders its own distinct confirm button instead.
    expect(screen.getByTestId('action-confirm-with-credit')).toBeInTheDocument();
  });
});

// ETP-4728 — print unification. PrintButton no longer exists: printing is
// served exclusively by the generic icon-only print flow in DetailView.jsx /
// DocumentPrintDrawer.jsx. This component must never regrow it.
describe('ConfirmWithCreditButtonBase — no private PrintButton (ETP-4728)', () => {
  it('does not render a print button in any status', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    expect(screen.queryByText('print')).not.toBeInTheDocument();

    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    expect(screen.queryAllByText('print').length).toBe(0);
  });
});

// ETP-4737 round 3 — modal open/close/confirm callback wiring. These lines
// were previously untouched because no existing test ever clicked the action
// buttons or drove the mocked modals' own callback props.
describe('ConfirmWithCreditButtonBase — modal open/close/confirm wiring', () => {
  let originalLocation;

  beforeEach(() => {
    mockNavigate.mockClear();
    // window.location.reload is non-configurable in jsdom — replace location,
    // matching the established pattern in useServiceWorker.vitest.jsx.
    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: { id: 'RET-1', documentNo: 'FC-002', grandTotalAmount: 50 } } }),
    }));
  });

  afterEach(() => {
    delete window.location;
    window.location = originalLocation;
  });

  it('opens ConfirmInOutModal when the DR confirm button is clicked', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('does not open any modal when the DR confirm button is disabled (confirmDisabled via linesCount 0)', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 0 }}
      />
    );
    const btn = screen.getByTestId('action-confirm-with-credit');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('opens CreateInvoiceConfirmModal when the CO post-confirm button is clicked', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
  });

  it('closes ConfirmInOutModal without producing a result when its onClose fires', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-inout-close'));
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
  });

  it('closes ConfirmInOutModal and shows the result modal when onConfirmed resolves an invoice with an id', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));

    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('closes ConfirmInOutModal and reloads the page (no result modal) when onConfirmed resolves an invoice without an id', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-no-id'));

    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('closes CreateInvoiceConfirmModal without calling the return-invoice flow when its onClose fires', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    fireEvent.click(screen.getByTestId('create-invoice-close'));

    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('closes CreateInvoiceConfirmModal and triggers the return-invoice creation flow when its onConfirm fires', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false, id: 'REC-001' }}
      />
    );
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));

    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/action/createReturnInvoice');
    await waitFor(() => expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument());
  });

  it('marks the result as navigated and calls navigate when the result modal fires its primary action, and does not reload on close afterwards', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-navigate'));
    expect(mockNavigate).toHaveBeenCalledWith('/some/route');

    fireEvent.click(screen.getByTestId('result-close'));
    await waitFor(() => expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument());
    // setTimeout(0) inside onClose checks resultNavigatedRef — give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('reloads the page after closing the result modal when the user did not navigate away first', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireEvent.click(screen.getByTestId('action-confirm-with-credit'));
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-close'));
    await waitFor(() => expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
