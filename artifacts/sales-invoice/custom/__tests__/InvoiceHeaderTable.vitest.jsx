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
      rectificativeInvoicesTab: 'rectificativeInvoicesTab',
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

// `../invoiceSubtype` is intentionally NOT mocked: the real getArSubtype
// (FAC | RECTIFICATIVA, ETP-4737) drives the document-type badge column only.
// ETP-4841 removed its influence on the payment badge, so mocking it here would
// hide exactly the coupling these tests need to prove is gone.

// DataTable mock that calls each column's render with multiple representative rows.
//
// ETP-4841: the payment badge is driven by the SIGN OF THE TOTAL, never by the
// document type, so the rows below are laid out as a sign matrix. Every branch of
// resolveInvoicePaymentBadge appears once, and the two shapes that used to render
// wrong (rows 2 and 3) are pinned explicitly.
const MOCK_ROWS = [
  // 0 — ordinary AR invoice, partially paid → amber pending badge "500:EUR"
  {
    eTGODueDate: '2026-01-01',
    outstandingAmount: '500',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: 'sent',
  },
  // 1 — ordinary AR invoice, settled → green "cobrada"
  {
    eTGODueDate: '2026-01-15',
    outstandingAmount: '0',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  },
  // 2 — ETP-4841 case A: Factura Rectificativa with a POSITIVE total (billed 3,
  // should have been 4). PAYABLE: amber badge "400:USD", never "Saldo a favor".
  {
    eTGODueDate: '2026-02-01',
    outstandingAmount: '400',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'USD',
    'transactionDocument$_identifier': 'Factura Rectificativa',
    arInvoiceSubtype: 'RECTIFICATIVA',
    aeatsiiEstado: 'CO',
  },
  // 3 — ETP-4841 case B: ordinary "Factura" with a NEGATIVE total. It IS a
  // credit ("Saldo a favor · 900:SEK"), never "Cobrada" — before the fix its
  // negative outstanding satisfied `outstanding <= 0` and it read as collected.
  {
    eTGODueDate: '2026-02-15',
    outstandingAmount: '-900',
    grandTotalAmount: '-900',
    documentStatus: 'CO',
    'currency$_identifier': 'SEK',
    'transactionDocument$_identifier': 'ARInvoice',
    arInvoiceSubtype: 'FAC',
    aeatsiiEstado: null,
  },
  // 4 — case C: negative invoice fully consumed → green fully-applied pill
  {
    eTGODueDate: '2026-03-20',
    outstandingAmount: '0',
    grandTotalAmount: '-900',
    documentStatus: 'CO',
    'currency$_identifier': 'GBP',
    'transactionDocument$_identifier': 'ARCreditMemo',
    aeatsiiEstado: null,
  },
  // 5 — case D: positive invoice OVERPAID (outstanding < 0). Real dev data has
  // 7 such rows; they must read "cobrada", never "Saldo a favor".
  {
    eTGODueDate: '2026-03-25',
    outstandingAmount: '-50',
    grandTotalAmount: '700',
    documentStatus: 'CO',
    'currency$_identifier': 'NOK',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  },
  // 6 — case E: not completed → em dash placeholder, no badge
  {
    eTGODueDate: null,
    outstandingAmount: '300',
    grandTotalAmount: '600',
    documentStatus: 'DR',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  },
  // 7 — credit note mostly applied (ETP-4331 repro: -25.30 total, only -2.30
  // left unused). Must show the credit badge, never the pending one.
  {
    eTGODueDate: '2026-03-01',
    outstandingAmount: '-2.30',
    grandTotalAmount: '-25.30',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARCreditMemo',
    aeatsiiEstado: null,
  },
  // 8 — return, fully unapplied. Sibling of the ETP-4331 repro screenshot's
  // "Factura de devolución" row.
  {
    eTGODueDate: '2026-03-15',
    outstandingAmount: '-27.60',
    grandTotalAmount: '-27.60',
    documentStatus: 'CO',
    'currency$_identifier': 'CHF',
    'transactionDocument$_identifier': 'ARReturn',
    aeatsiiEstado: null,
  },
];

// Hoisted holder so tests can read back the `columns` prop the component handed
// to DataTable and invoke a single cell renderer with an arbitrary row.
const capturedColumnsHolder = vi.hoisted(() => ({ value: null }));

vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns, filters }) => {
    capturedColumnsHolder.value = columns;
    return (
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
    );
  },
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

  it('opens the payment modal when the "Saldo pendiente" outstanding badge is clicked', () => {
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

  it('renders transactionDocument column with the rectificative badge for the RECTIFICATIVA subtype', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('rectificativeInvoicesTab');
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

// ── ETP-4331: a credit with most of its balance already applied elsewhere ─────
// (e.g. -25.30 total, -2.30 unused) must never regress to the amber pending
// badge — it always represents money owed BACK to the counterparty.
describe('InvoiceHeaderTable — outstandingAmount credit-note/return badge (ETP-4331 bugfix)', () => {
  it('mostly-applied credit note shows the credit badge, never the pending one (bug repro)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[7] — -25.30 total, -2.30 left unused.
    expect(screen.getByText(/cpFavorBadge · 2\.3:EUR/)).toBeInTheDocument();
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    expect(outstandingCol.querySelector('[aria-label="addCobro"]')?.textContent ?? '')
      .not.toMatch(/cpFavorBadge/);
  });

  it('fully-unapplied return also shows the credit badge (regression guard)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByText(/cpFavorBadge · 27\.6:CHF/)).toBeInTheDocument();
  });

  it('fully-applied credit note still shows the green fully-applied badge (unchanged)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[4] — negative total (-900 GBP) with outstandingAmount '0'.
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
  });

  it('regular invoice with partial payment still shows the amber pending badge, unaffected', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[0] — regular AR invoice, outstanding 500.
    const pendingBadge = screen.getByText('500:EUR');
    const pendingButton = pendingBadge.closest('button');
    expect(pendingButton).toHaveAttribute('aria-label', 'addCobro');
    expect(pendingButton.textContent).not.toMatch(/cpFavorBadge/);
  });
});

// ── ETP-4841: the badge follows the SIGN of the total, not the document type ──
// The grid used to call getArSubtype and treat every RECTIFICATIVA as a credit.
// Both halves of that rule were wrong: a rectificativa can be positive (an
// under-invoiced correction, payable) and an ordinary Factura can be negative
// (a credit). The cases below drive the real outstandingAmount cell.
describe('InvoiceHeaderTable — sign-driven payment badge (ETP-4841)', () => {
  const AR_ROW = {
    eTGODueDate: '2026-06-01',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'ARInvoice',
    aeatsiiEstado: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedColumnsHolder.value = null;
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  function renderCell(key, row) {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const col = (capturedColumnsHolder.value || []).find((c) => c.key === key);
    expect(col, `expected column "${key}"`).toBeTruthy();
    return render(<>{col.render(row)}</>);
  }

  it('case A: a Factura Rectificativa with a POSITIVE total renders the payable badge', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      'transactionDocument$_identifier': 'Factura Rectificativa',
      arInvoiceSubtype: 'RECTIFICATIVA',
      grandTotalAmount: '1000',
      outstandingAmount: '1000',
    });
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addCobro');
    expect(container.textContent).toContain('1000:EUR');
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
    expect(container.textContent).not.toMatch(/cpCreditFullyApplied/);
  });

  it('case A: a POSITIVE Factura Rectificativa keeps its due-date state dot', () => {
    const { container } = renderCell('eTGODueDate', {
      ...AR_ROW,
      'transactionDocument$_identifier': 'Factura Rectificativa',
      arInvoiceSubtype: 'RECTIFICATIVA',
      grandTotalAmount: '1000',
      outstandingAmount: '1000',
    });
    expect(container.textContent).toBe('date:2026-06-01');
    expect(container.querySelector('.rounded-full')).toBeTruthy();
  });

  it('case B: an ordinary Factura with a NEGATIVE total renders the credit badge, not "cobrada"', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      arInvoiceSubtype: 'FAC',
      grandTotalAmount: '-750',
      outstandingAmount: '-750',
    });
    expect(container.textContent).toBe('cpFavorBadge · 750:EUR');
    expect(container.textContent).not.toMatch(/cobrada/);
  });

  it('case B: a NEGATIVE ordinary Factura loses the due-date state dot (no due date to chase)', () => {
    const { container } = renderCell('eTGODueDate', {
      ...AR_ROW,
      arInvoiceSubtype: 'FAC',
      grandTotalAmount: '-750',
      outstandingAmount: '-750',
    });
    expect(container.textContent).toBe('date:2026-06-01');
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('case C: a negative invoice with a zero outstanding renders the fully-applied pill', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      grandTotalAmount: '-750',
      outstandingAmount: '0',
    });
    expect(container.textContent).toBe('cpCreditFullyApplied');
  });

  it('case D: an OVERPAID positive invoice (outstanding < 0) renders "cobrada", never the credit badge', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      grandTotalAmount: '700',
      outstandingAmount: '-50',
    });
    expect(container.textContent).toMatch(/cobrada/);
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
  });

  it('case E: a non-completed row renders the em dash placeholder with no badge', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      documentStatus: 'DR',
      grandTotalAmount: '-750',
      outstandingAmount: '-750',
    });
    expect(container.textContent).toBe('—');
    expect(container.querySelector('button')).toBeNull();
  });

  // An ABSENT outstandingAmount means "unknown", not "settled". This grid used
  // to read `parseFloat(row.outstandingAmount ?? 0)`, which rendered a payload
  // without the field as "cobrada" on no evidence; the shared helper now falls
  // back to the full total instead.
  it('an absent outstandingAmount reads as UNPAID for the full total, never as "cobrada"', () => {
    const row = { ...AR_ROW, grandTotalAmount: '1000' };
    const { container } = renderCell('outstandingAmount', row);
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addCobro');
    expect(container.textContent).toContain('1000:EUR');
    expect(container.textContent).not.toMatch(/cobrada/);
  });

  it('an absent outstandingAmount on a credit reads as fully unapplied, never "Aplicada"', () => {
    const { container } = renderCell('outstandingAmount', { ...AR_ROW, grandTotalAmount: '-1000' });
    expect(container.textContent).toBe('cpFavorBadge · 1000:EUR');
    expect(container.textContent).not.toMatch(/cpCreditFullyApplied/);
  });

  it('a PRESENT zero outstandingAmount still reads as genuinely collected', () => {
    const { container } = renderCell('outstandingAmount', {
      ...AR_ROW,
      grandTotalAmount: '1000',
      outstandingAmount: '0',
    });
    expect(container.textContent).toMatch(/cobrada/);
  });

  it('the doc-type badge still follows getArSubtype for BOTH signs of a rectificativa', () => {
    const positive = renderCell('transactionDocument', {
      ...AR_ROW,
      'transactionDocument$_identifier': 'Factura Rectificativa',
      grandTotalAmount: '1000',
      outstandingAmount: '1000',
    });
    expect(positive.container.textContent).toBe('rectificativeInvoicesTab');

    const negative = renderCell('transactionDocument', {
      ...AR_ROW,
      'transactionDocument$_identifier': 'Factura Rectificativa',
      grandTotalAmount: '-1000',
      outstandingAmount: '-1000',
    });
    expect(negative.container.textContent).toBe('rectificativeInvoicesTab');
  });

  it('the whole grid renders each sign case exactly once (end-to-end matrix)', () => {
    render(<InvoiceHeaderTable {...BASE_PROPS} />);
    const col = screen.getByTestId('col-render-outstandingAmount');
    // Case A — positive rectificativa is payable (MOCK_ROWS[2], 400 USD).
    expect(screen.getByText('400:USD').closest('button')).toHaveAttribute('aria-label', 'addCobro');
    // Case B — negative ordinary invoice is a credit (MOCK_ROWS[3], 900 SEK).
    expect(screen.getByText(/cpFavorBadge · 900:SEK/)).toBeInTheDocument();
    // Case C — negative invoice fully applied (MOCK_ROWS[4]).
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
    // Case D — settled and overpaid positive invoices read "cobrada" (rows 1, 5).
    expect(screen.getAllByText('cobrada').length).toBe(2);
    // Case E — the draft row contributes the only em dash.
    expect(col.textContent).toContain('—');
  });
});
