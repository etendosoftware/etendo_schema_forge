// Real-render coverage companion to ConfirmWithCreditButtonBase.test.js (which
// only asserts regex/string matches against the source text and therefore
// contributes zero executed lines to coverage). Mirrors the sibling
// return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx convention
// (jsdom render + @testing-library/react against the real component tree).
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: () => <div data-testid="confirm-inout-modal" />,
}));

vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: () => <div data-testid="create-invoice-confirm-modal" />,
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
