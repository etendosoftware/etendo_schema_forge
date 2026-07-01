// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({
    genericLabels: {
      dueDate: 'dueDate',
      statusDocColumn: 'statusDocColumn',
      impTotal: 'impTotal',
      pendingPaymentColumn: 'pendingPaymentColumn',
      documentType: 'documentType',
      cobrada: 'cobrada',
      addCobro: 'addCobro',
      invoicesTab: 'invoicesTab',
      creditNotesTab: 'creditNotesTab',
      returnsTab: 'returnsTab',
      documentNo: 'documentNo',
      'invoiceList.col.siiStatus': 'SII Status',
      'invoiceList.col.tbaiStatus': 'TBAI Status',
      'invoiceList.col.verifactuStatus': 'Verifactu Status',
    },
    statuses: {},
  }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({ profile: null })),
}));

vi.mock('@/windows/custom/shared/fiscalTargets.js', () => ({
  getInvoiceFiscalTargets: vi.fn(() => ({ showSii: false, showTbai: false, showVerifactu: false })),
}));

vi.mock('@/windows/custom/shared/FiscalStatusBadge.jsx', () => ({
  FiscalStatusBadge: ({ status }) => (
    <span data-testid="fiscal-status-badge">{status}</span>
  ),
  normalizeVerifactuStatus: (status) => status,
}));

vi.mock('@/windows/custom/shared/InvoicePaymentHistoryModal.jsx', () => ({
  default: ({ onClose, onPaymentAdded }) => (
    <div data-testid="payment-history-modal">
      <button onClick={onClose}>Close payment modal</button>
      <button onClick={onPaymentAdded}>Payment added</button>
    </div>
  ),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (d) => `date:${d}`,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (currency, amount) => `${amount}:${currency}`,
}));

vi.mock('@/lib/invoiceDueDate', () => ({
  getDueDateState: () => 'overdue',
  getDueDateDotStyle: () => ({ background: 'red' }),
  getDueDateTextStyle: () => ({ color: 'red' }),
}));

vi.mock('../invoiceSubtype', () => ({
  getArSubtype: (row) => {
    const doc = row?.['transactionDocument$_identifier'];
    if (doc === 'ARCreditMemo') return 'NC';
    if (doc === 'ARReturn') return 'DEV';
    return null;
  },
}));

// DataTable mock that calls each column's render with multiple representative rows
// so all render branches (invoice, credit note, return, paid) are exercised.
const MOCK_ROWS = [
  // Regular AR Invoice — pending outstanding
  {
    eTGODueDate: '2026-01-01',
    outstandingAmount: '500',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: 'sent',
  },
  // Regular AR Invoice — paid (outstanding <= 0)
  {
    eTGODueDate: '2026-01-15',
    outstandingAmount: '0',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  },
  // Credit note — partial outstanding
  {
    eTGODueDate: '2026-02-01',
    outstandingAmount: '400',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'USD',
    'transactionDocument$_identifier': 'ARCreditMemo',
    aeatsiiEstado: 'CO',
  },
  // Non-CO — shows dash for outstanding
  {
    eTGODueDate: null,
    outstandingAmount: '300',
    grandTotalAmount: '600',
    documentStatus: 'DR',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  },
];

vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns, filters }) => (
    <div data-testid="data-table" data-filters={JSON.stringify(filters || [])}>
      {(columns || []).map((col) =>
        col.render ? (
          <div key={col.key} data-testid={`col-render-${col.key}`}>
            {MOCK_ROWS.map((row, i) => (
              <div key={i}>{col.render(row)}</div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import InvoiceHeaderTable from '../InvoiceHeaderTable.jsx';

const BASE_PROPS = {
  apiBaseUrl: '/api',
};

const AR_INVOICE_ROW = {
  eTGODueDate: '2026-01-01',
  outstandingAmount: '500',
  grandTotalAmount: '1000',
  documentStatus: 'CO',
  'currency$_identifier': 'EUR',
  'transactionDocument$_identifier': 'ARInvoice',
  aeatsiiEstado: 'sent',
};

describe('InvoiceHeaderTable (sales-invoice)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  it('renders without crashing and shows the DataTable', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('does not show payment modal initially', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('opens the payment modal when the "Pendiente de pago" outstanding badge is clicked', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    const btn = outstandingCol.querySelector('button');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('closes the payment modal when onClose is triggered', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Close payment modal'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('calls props.onDataMutated (ListView refresh contract) when a payment is added', () => {
    const onDataMutated = vi.fn();
    render(<InvoiceHeaderTable {...BASE_PROPS} onDataMutated={onDataMutated} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Payment added'));
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('does not blow up when only the stale onRefresh prop is passed (regression guard for ETP-4331)', () => {
    // ListView never passes `onRefresh` — only `onDataMutated`. This locks in that
    // passing the old (bugged) prop name has no effect on the refresh callback,
    // guarding against silently reintroducing the "stale list after payment" bug.
    const onRefresh = vi.fn();
    const onDataMutated = vi.fn();
    render(<InvoiceHeaderTable {...BASE_PROPS} onRefresh={onRefresh} onDataMutated={onDataMutated} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Payment added'));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('closes the modal after a payment is added', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} onDataMutated={vi.fn()} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Payment added'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('renders eTGODueDate column with date when row has a due date', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('col-render-eTGODueDate')).toBeInTheDocument();
    expect(screen.getByText('date:2026-01-01')).toBeInTheDocument();
  });

  it('renders transactionDocument column with invoice badge for regular AR invoice', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('invoicesTab');
  });

  it('renders transactionDocument column with credit note badge for NC subtype', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('creditNotesTab');
  });

  it('does not show SII column when showSii is false', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.queryByTestId('fiscal-status-badge')).toBeNull();
  });

  it('shows SII column with FiscalStatusBadge when showSii is true', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: true, showTbai: false, showVerifactu: false });
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getAllByTestId('fiscal-status-badge').length).toBeGreaterThan(0);
  });
});
