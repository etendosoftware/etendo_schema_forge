// @covers artifacts/sales-invoice/custom/InvoiceDeliveryBadge.jsx
// @covers artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
// A sales rectificative invoice has no delivery to track (the backend counts the
// return receipt as a delivery), so neither the detail topbar chip nor the list
// "delivered" cell is shown for it; an ordinary invoice (FAC) keeps both.
// Lives under app-shell because Vitest only collects `src/**` and these
// artifact components render JSX.

let capturedColumns = null;

vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns }) => {
    capturedColumns = columns;
    return <div data-testid="data-table" />;
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => ({ profile: null, earliestSiiCutoverDate: null, earliestVerifactuCutoverDate: null }),
}));

vi.mock('@/windows/custom/shared/InvoicePaymentHistoryModal.jsx', () => ({
  default: () => <div data-testid="payment-history-modal" />,
}));

import { render, screen } from '@testing-library/react';
import InvoiceDeliveryBadge from '@generated/sales-invoice/custom/InvoiceDeliveryBadge.jsx';
import InvoiceHeaderTable from '@generated/sales-invoice/custom/InvoiceHeaderTable.jsx';

const FAC = { arInvoiceSubtype: 'FAC', documentStatus: 'CO', eTGODeliveryStatus: 60 };
const RECTIFICATIVA = { ...FAC, arInvoiceSubtype: 'RECTIFICATIVA' };

describe('InvoiceDeliveryBadge', () => {
  it('renders the delivery chip for a completed ordinary invoice', () => {
    render(<InvoiceDeliveryBadge data={FAC} />);
    expect(screen.getByTestId('delivery-badge')).toHaveTextContent('soAllDelivered 60%');
  });

  it('renders nothing for a completed rectificative invoice', () => {
    render(<InvoiceDeliveryBadge data={RECTIFICATIVA} />);
    expect(screen.queryByTestId('delivery-badge')).not.toBeInTheDocument();
  });
});

describe('InvoiceHeaderTable — delivery status column', () => {
  function deliveryColumn() {
    capturedColumns = null;
    render(<InvoiceHeaderTable apiBaseUrl="/api" />);
    return capturedColumns.find((c) => c.key === 'eTGODeliveryStatus');
  }

  it('stays a real percent column so it remains filterable and sortable', () => {
    const col = deliveryColumn();
    expect(col).toMatchObject({ column: 'em_etgo_delivery_status', type: 'percent' });
  });

  it.each([
    ['FAC', FAC, '60%'],
    ['RECTIFICATIVA', RECTIFICATIVA, null],
  ])('renders the delivery cell of a %s row', (_label, row, expectedText) => {
    const col = deliveryColumn();
    render(<div data-testid="cell">{col.render(row)}</div>);
    const cell = screen.getByTestId('cell');
    if (expectedText) {
      expect(cell).toHaveTextContent(expectedText);
    } else {
      expect(cell).toBeEmptyDOMElement();
    }
  });
});
