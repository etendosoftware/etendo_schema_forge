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
  // Mirrors the real getArSubtype contract (artifacts/sales-invoice/custom/invoiceSubtype.js):
  // server-injected arInvoiceSubtype takes priority; only falls back to the
  // doc-type-identifier check when it is absent (ETP-4738).
  getArSubtype: (row) => {
    if (row?.arInvoiceSubtype) return row.arInvoiceSubtype;
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
  // Credit note — mostly applied (ETP-4331 repro: -25.30 total, only -2.30 left
  // unused). Must show "Saldo a favor", never "Pendiente".
  {
    eTGODueDate: '2026-03-01',
    outstandingAmount: '-2.30',
    grandTotalAmount: '-25.30',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARCreditMemo',
    aeatsiiEstado: null,
  },
  // Return — fully unapplied (nothing applied yet). Sibling of the ETP-4331
  // repro screenshot's "Factura de devolución" row.
  {
    eTGODueDate: '2026-03-15',
    outstandingAmount: '-27.60',
    grandTotalAmount: '-27.60',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARReturn',
    aeatsiiEstado: null,
  },
  // Credit note — fully applied (outstanding ~ 0). Must still show "Aplicada".
  {
    eTGODueDate: '2026-03-20',
    outstandingAmount: '0',
    grandTotalAmount: '-900',
    documentStatus: 'CO',
    'currency$_identifier': 'GBP',
    'transactionDocument$_identifier': 'ARCreditMemo',
    aeatsiiEstado: null,
  },
  // ETP-4738: Factura Rectificativa — arInvoiceSubtype: 'NC' server-injected,
  // but the doc-type identifier is NOT one the fallback regex recognizes
  // (no "credit"/"memo"/"crédito"/"return"/"devoluci" substring).
  {
    eTGODueDate: '2026-04-01',
    outstandingAmount: '-8.40',
    grandTotalAmount: '-8.40',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'Factura Rectificativa',
    arInvoiceSubtype: 'NC',
    aeatsiiEstado: null,
  },
  // Same doc type, fully consumed.
  {
    eTGODueDate: '2026-04-15',
    outstandingAmount: '0',
    grandTotalAmount: '-8.40',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'Factura Rectificativa',
    arInvoiceSubtype: 'NC',
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

// ── ETP-4331: credit notes/returns always show "Saldo a favor", never "Pendiente" ──
// Risk: a credit note/return with most of its balance already applied elsewhere
// (e.g. -25.30 total, -2.30 unused) must never regress to the amber "Pendiente"
// badge — it always represents money owed BACK to the counterparty.
describe('InvoiceHeaderTable — outstandingAmount credit-note/return badge (ETP-4331 bugfix)', () => {
  it('mostly-applied credit note shows "Saldo a favor", never "Pendiente" (bug repro)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const badge = screen.getByText(/Saldo a favor · 2\.3:EUR/);
    expect(badge).toBeInTheDocument();
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    expect(outstandingCol.textContent).not.toMatch(/Pendiente/);
  });

  it('fully-unapplied return also shows "Saldo a favor" (regression guard)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByText(/Saldo a favor · 27\.6:EUR/)).toBeInTheDocument();
  });

  it('fully-applied credit note still shows the green "Aplicada" badge (unchanged)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    // Two rows are fully-applied credit instruments now (the ARCreditMemo row
    // and the ETP-4738 Factura Rectificativa row below) — assert at least one.
    expect(screen.getAllByText('Aplicada').length).toBeGreaterThan(0);
  });

  it('regular invoice with partial payment still shows the amber pending badge, unaffected', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[0] — regular AR invoice, outstanding 500, non-credit type.
    const pendingBadge = screen.getByText('500:EUR');
    const pendingButton = pendingBadge.closest('button');
    expect(pendingButton).toHaveAttribute('aria-label', 'addCobro');
    expect(pendingButton.textContent).not.toMatch(/Saldo a favor/);
  });
});

// ── ETP-4738: Factura Rectificativa recognized via arInvoiceSubtype ────────────
// SalesInvoiceHeaderHandler already injected arInvoiceSubtype on every list row
// before ETP-4738 — only the reclassification logic (FAC->NC for rectificative
// + negative total) is new. This proves the grid already renders "Saldo a
// favor"/"Aplicada" correctly for a doc-type name ("Factura Rectificativa")
// that getArSubtype's identifier fallback would never recognize on its own.
describe('InvoiceHeaderTable — arInvoiceSubtype recognizes Factura Rectificativa (ETP-4738)', () => {
  it('shows "Saldo a favor" for a Factura Rectificativa row with arInvoiceSubtype NC and a nonzero balance', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByText(/Saldo a favor · 8\.4:EUR/)).toBeInTheDocument();
  });

  it('shows the green "Aplicada" pill once the Factura Rectificativa balance is fully consumed', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const aplicadaBadges = screen.getAllByText('Aplicada');
    expect(aplicadaBadges.length).toBeGreaterThan(0);
  });

  it('renders the credit-note doc-type badge for Factura Rectificativa via arInvoiceSubtype (not the identifier)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('creditNotesTab');
  });
});
