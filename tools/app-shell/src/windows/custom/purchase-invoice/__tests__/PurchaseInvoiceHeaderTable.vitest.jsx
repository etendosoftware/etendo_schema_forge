// Mocks must be hoisted before imports (Vitest hoisting)
// Mutable holders so individual tests can swap the locale dictionary / selected
// org without re-declaring the module mocks. `defaultDictionary` is the shape
// every pre-existing test relies on; overriding tests must restore it.
const i18nMock = vi.hoisted(() => {
  const defaultDictionary = {
    genericLabels: {
      dueDate: 'dueDate',
      statusDocColumn: 'statusDocColumn',
      impTotal: 'impTotal',
      pendingPaymentColumn: 'pendingPaymentColumn',
      documentType: 'documentType',
      pagada: 'pagada',
      addPago: 'addPago',
      invoicesTab: 'invoicesTab',
      rectificativeInvoicesTab: 'rectificativeInvoicesTab',
      returnInvoiceTab: 'returnInvoiceTab',
      'invoiceList.col.siiStatus': 'SII Status',
    },
    statuses: {},
  };
  return { defaultDictionary, dictionary: defaultDictionary };
});

const authMock = vi.hoisted(() => ({
  defaultSelectedOrg: { id: 'org-1' },
  selectedOrg: { id: 'org-1' },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => i18nMock.dictionary,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: authMock.selectedOrg, logout: vi.fn() }),
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

vi.mock('@/lib/invoiceDueDate', () => ({
  getDueDateState: () => 'overdue',
  getDueDateDotStyle: () => ({ background: 'red' }),
  getDueDateTextStyle: () => ({ color: 'red' }),
}));

vi.mock('@/lib/formatCurrency.js', () => ({
  // Source calls `formatCurrency(currency, amount)` — currency first, amount second.
  formatCurrency: (currency, amount) => `${amount}:${currency}`,
}));

// DataTable mock that calls each column's render with multiple representative rows
// so all render branches are exercised.
//
// ETP-4841: the payment badge is driven by the SIGN OF THE TOTAL, never by the
// document type, so these rows are laid out as a sign matrix. Every branch of
// resolveInvoicePaymentBadge appears exactly once, and the two rows that used to
// render wrong (rows 2 and 3 below) are pinned explicitly.
const MOCK_ROWS = [
  // 0 — ordinary invoice, partially paid → amber pending badge "500:EUR"
  {
    eTGODueDate: '2026-01-01',
    outstandingAmount: '500',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'AP Invoice',
    aeatsiiEstado: 'sent',
  },
  // 1 — ordinary invoice, settled → green "pagada"
  {
    eTGODueDate: '2026-01-15',
    outstandingAmount: '0',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'AP Invoice',
    aeatsiiEstado: null,
  },
  // 2 — ETP-4841 case A: Factura Rectificativa with a POSITIVE total (billed 3,
  // should have been 4). It is PAYABLE: amber pending badge "400:USD", never
  // "Saldo a favor". Before the fix the doc-type test made this a credit.
  {
    eTGODueDate: '2026-02-01',
    outstandingAmount: '400',
    grandTotalAmount: '1000',
    documentStatus: 'CO',
    'currency$_identifier': 'USD',
    'transactionDocument$_identifier': 'Factura Rectificativa',
    apInvoiceSubtype: 'RECTIFICATIVA',
    aeatsiiEstado: 'CO',
  },
  // 3 — ETP-4841 case B: ordinary "Factura" with a NEGATIVE total. It IS a
  // credit: "Saldo a favor · 900:SEK", never "pagada". Before the fix the
  // doc-type test sent it down the paid branch (outstanding <= 0).
  {
    eTGODueDate: '2026-02-15',
    outstandingAmount: '-900',
    grandTotalAmount: '-900',
    documentStatus: 'CO',
    'currency$_identifier': 'SEK',
    'transactionDocument$_identifier': 'AP Invoice',
    apInvoiceSubtype: 'FAC',
    aeatsiiEstado: null,
  },
  // 4 — case C: negative invoice fully consumed → green "cpCreditFullyApplied"
  {
    eTGODueDate: '2026-03-01',
    outstandingAmount: '0',
    grandTotalAmount: '-1000',
    documentStatus: 'CO',
    'currency$_identifier': 'USD',
    'transactionDocument$_identifier': 'AP CreditMemo',
    aeatsiiEstado: null,
  },
  // 5 — case D: positive invoice OVERPAID (outstanding < 0). Real dev data has
  // 7 such rows; they must read "pagada", never "Saldo a favor".
  {
    eTGODueDate: '2026-03-15',
    outstandingAmount: '-50',
    grandTotalAmount: '700',
    documentStatus: 'CO',
    'currency$_identifier': 'NOK',
    'transactionDocument$_identifier': 'AP Invoice',
    aeatsiiEstado: null,
  },
  // 6 — case E: not completed → em dash placeholder, no badge
  {
    eTGODueDate: null,
    outstandingAmount: '300',
    grandTotalAmount: '600',
    documentStatus: 'DR',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'AP Invoice',
    aeatsiiEstado: null,
  },
  // 7 — credit memo mostly applied (ETP-4331 repro ratio: -25.30 total, only
  // -2.30 left unused). Must show "Saldo a favor", never "Pendiente".
  {
    eTGODueDate: '2026-05-01',
    outstandingAmount: '-2.30',
    grandTotalAmount: '-25.30',
    documentStatus: 'CO',
    'currency$_identifier': 'GBP',
    'transactionDocument$_identifier': 'AP CreditMemo',
    aeatsiiEstado: null,
  },
  // 8 — return, fully unapplied (nothing applied yet).
  {
    eTGODueDate: '2026-05-15',
    outstandingAmount: '-27.60',
    grandTotalAmount: '-27.60',
    documentStatus: 'CO',
    'currency$_identifier': 'CHF',
    'transactionDocument$_identifier': 'Return Material Purchase Invoice',
    aeatsiiEstado: null,
  },
];

// Hoisted holder so the DataTable mock (below) can stash the `columns` prop it
// received, and tests can later read it back to assert on the raw column
// metadata (e.g. filterMode) — not just what the render() callback outputs.
const capturedColumnsHolder = vi.hoisted(() => ({ value: null }));

vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns, 'data-testid': testId }) => {
    capturedColumnsHolder.value = columns;
    return (
      <div data-testid={testId || 'data-table'}>
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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { resolveFilterMode } from '@/lib/gridQuery';
import PurchaseInvoiceHeaderTable from '../PurchaseInvoiceHeaderTable.jsx';

const BASE_PROPS = {
  apiBaseUrl: '/api',
  onRefresh: vi.fn(),
};

// Reusable row shapes.
// ETP-4841: what makes a row a credit is its NEGATIVE grandTotalAmount — the
// doc-type identifier on each shape is only there to prove it is ignored.
const AP_INVOICE_ROW = {
  eTGODueDate: '2026-01-01',
  outstandingAmount: '500',
  grandTotalAmount: '1000',
  documentStatus: 'CO',
  'currency$_identifier': 'EUR',
  'transactionDocument$_identifier': 'AP Invoice',
  aeatsiiEstado: 'sent',
};

// Credit memo with a negative total and half its balance still unused.
const CREDIT_ROW = {
  ...AP_INVOICE_ROW,
  'transactionDocument$_identifier': 'AP CreditMemo',
  grandTotalAmount: '-1000',
  outstandingAmount: '-500',
};

const CREDIT_ROW_APPLIED = {
  ...CREDIT_ROW,
  outstandingAmount: '0',
};

const PAID_ROW = {
  ...AP_INVOICE_ROW,
  outstandingAmount: '0',
};

// Positive invoice that has been OVERPAID — outstanding is negative but the
// total is not, so it is settled, not a credit.
const OVERPAID_ROW = {
  ...AP_INVOICE_ROW,
  outstandingAmount: '-100',
};

const RETURN_ROW = {
  ...AP_INVOICE_ROW,
  'transactionDocument$_identifier': 'Return Material Purchase Invoice',
  grandTotalAmount: '-1000',
  outstandingAmount: '-1000',
};

// ETP-4841 case A — a Factura Rectificativa that corrects an UNDER-invoice: its
// total is positive, so it is payable exactly like an ordinary invoice.
const POSITIVE_RECTIFICATIVA_ROW = {
  ...AP_INVOICE_ROW,
  'transactionDocument$_identifier': 'Factura Rectificativa',
  apInvoiceSubtype: 'RECTIFICATIVA',
  grandTotalAmount: '1000',
  outstandingAmount: '1000',
};

// ETP-4841 case B — an ordinary Factura with a negative total: a credit.
const NEGATIVE_ORDINARY_ROW = {
  ...AP_INVOICE_ROW,
  apInvoiceSubtype: 'FAC',
  grandTotalAmount: '-750',
  outstandingAmount: '-750',
};

const NO_DUE_DATE_ROW = {
  ...AP_INVOICE_ROW,
  eTGODueDate: null,
};

const NON_CO_ROW = {
  ...AP_INVOICE_ROW,
  documentStatus: 'DR',
};

const UNKNOWN_DOC_ROW = {
  ...AP_INVOICE_ROW,
  'transactionDocument$_identifier': 'SomeUnknownType',
};

// Helper: render with a custom DataTable mock that uses a specific row shape
function renderWithRow(row, extraProps = {}) {
  // Override DataTable globally for this call via the module mock
  // (the module mock already calls render on each column — we parametrize
  // via a secondary wrapper that injects the row we want into each render call)
  return render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} {...extraProps} />);
}

describe('PurchaseInvoiceHeaderTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fiscal targets to the default (no SII)
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  it('renders without crashing and shows the DataTable', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.getByTestId('DataTable__6b7cdb')).toBeInTheDocument();
  });

  it('renders eTGODueDate column with date when row has a due date and is AP Invoice', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.getByTestId('col-render-eTGODueDate')).toBeInTheDocument();
    // formatCalendarDate mock returns "date:2026-01-01"
    expect(screen.getByText('date:2026-01-01')).toBeInTheDocument();
  });

  // ETP-4841: grandTotalAmount is a plain `type: 'amount'` column again. It used
  // to be `type: 'custom'` with a renderer that did `-Math.abs(Number(raw))` for
  // every rectificativa, which printed a POSITIVE Factura Rectificativa as a
  // negative amount. There is no cell renderer to exercise any more — the stored
  // sign is displayed verbatim by DataTable's generic amount cell.
  it('declares grandTotalAmount as a plain amount column with no sign-flipping renderer', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.queryByTestId('col-render-grandTotalAmount')).toBeNull();
    const col = (capturedColumnsHolder.value || []).find((c) => c.key === 'grandTotalAmount');
    expect(col).toBeTruthy();
    expect(col.type).toBe('amount');
    expect(col.column).toBe('GrandTotal');
    expect(col.render).toBeUndefined();
  });

  it('renders outstandingAmount column with pending button for AP Invoice', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.getByTestId('col-render-outstandingAmount')).toBeInTheDocument();
  });

  it('renders transactionDocument column with AP Invoice badge', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.getByTestId('col-render-transactionDocument')).toBeInTheDocument();
    // Multiple rows are rendered — check the column container contains invoicesTab
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('invoicesTab');
  });

  it('renders transactionDocument column with credit note badge for AP CreditMemo', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    // The column container renders multiple rows including the NC row (AP CreditMemo)
    expect(screen.getByTestId('col-render-transactionDocument').textContent).toContain('rectificativeInvoicesTab');
  });

  it('renders both doc-type badges side by side across the mock rows', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const col = screen.getByTestId('col-render-transactionDocument');
    expect(col.textContent).toContain('invoicesTab');
    expect(col.textContent).toContain('rectificativeInvoicesTab');
  });

  it('falls back to the ordinary invoice badge for an unrecognized doc-type name', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const col = (capturedColumnsHolder.value || []).find((c) => c.key === 'transactionDocument');
    const { container } = render(<>{col.render(UNKNOWN_DOC_ROW)}</>);
    expect(container.textContent).toBe('invoicesTab');
  });

  it('does not show SII column when showSii is false', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.queryByTestId('fiscal-status-badge')).toBeNull();
  });

  it('shows SII column with FiscalStatusBadge when showSii is true', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: true, showTbai: false, showVerifactu: false });
    renderWithRow(AP_INVOICE_ROW);
    // Multiple rows render multiple badges — at least one should be present
    expect(screen.getAllByTestId('fiscal-status-badge').length).toBeGreaterThan(0);
  });

  it('does not show payment modal initially', () => {
    renderWithRow(AP_INVOICE_ROW);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('shows payment modal after clicking pending outstanding button', () => {
    // The DataTable mock renders the outstandingAmount column with the default AP Invoice row
    // which has outstanding: 500 and documentStatus: CO — this renders a clickable button
    renderWithRow(AP_INVOICE_ROW);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    const btn = outstandingCol.querySelector('button');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('closes payment modal when onClose is triggered', () => {
    renderWithRow(AP_INVOICE_ROW);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Close payment modal'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('calls onDataMutated (ListView refresh contract) when payment is added and modal closes', () => {
    const onDataMutated = vi.fn();
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} onDataMutated={onDataMutated} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Payment added'));
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('does not blow up when only the stale onRefresh prop is passed (regression guard for ETP-4331)', () => {
    // ListView never passes `onRefresh` — only `onDataMutated`. This test locks in
    // that passing the old (bugged) prop name has no effect on the callback path,
    // guarding against silently reintroducing the stale-list bug.
    const onRefresh = vi.fn();
    const onDataMutated = vi.fn();
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} onRefresh={onRefresh} onDataMutated={onDataMutated} />);
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    fireEvent.click(outstandingCol.querySelector('button'));
    fireEvent.click(screen.getByText('Payment added'));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onDataMutated).toHaveBeenCalled();
  });
});

// ── Coverage for outstandingAmount column render branches ─────────────────────
// The render callbacks are read back from the `columns` prop the component
// actually handed to DataTable (captured by the module-level mock), then invoked
// with one row shape per branch.

describe('PurchaseInvoiceHeaderTable — column render branches (inline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedColumnsHolder.value = null;
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  function getColRender(key) {
    const cols = capturedColumnsHolder.value;
    expect(cols, 'DataTable never received a columns prop').toBeTruthy();
    const col = cols.find((c) => c.key === key);
    expect(col, `expected column "${key}"`).toBeTruthy();
    return col.render;
  }

  it('outstanding — dash when documentStatus is not CO', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(NON_CO_ROW)}</>);
    expect(container.textContent).toBe('—');
  });

  it('outstanding — fully-applied pill for a negative-total row with 0 outstanding', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(CREDIT_ROW_APPLIED)}</>);
    expect(container.textContent).toMatch(/cpCreditFullyApplied/);
  });

  it('outstanding — paid check span for regular paid row', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(PAID_ROW)}</>);
    expect(container.textContent).toMatch(/pagada/);
  });

  it('outstanding — negative-total row with a remaining balance renders a clickable credit button', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(CREDIT_ROW)}</>);
    expect(container.querySelector('button')).toBeTruthy();
    expect(container.textContent).toBe('cpFavorBadge · 500:EUR');
  });

  it('eTGODueDate — dash when no due date', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('eTGODueDate')(NO_DUE_DATE_ROW)}</>);
    expect(container.textContent).toBe('—');
  });

  it('eTGODueDate — plain date (no state dot) for a negative-total row', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('eTGODueDate')(RETURN_ROW)}</>);
    expect(container.textContent).toBe('date:2026-01-01');
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('eTGODueDate — coloured state dot for a POSITIVE Factura Rectificativa (ETP-4841)', () => {
    // Before the fix any rectificativa lost its due-date state. A positive one is
    // payable, so it must keep the dot exactly like an ordinary invoice.
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('eTGODueDate')(POSITIVE_RECTIFICATIVA_ROW)}</>);
    expect(container.textContent).toBe('date:2026-01-01');
    expect(container.querySelector('.rounded-full')).toBeTruthy();
  });
});

// ── ETP-4331: credit notes/returns always show "Saldo a favor", never "Pendiente" ──
// Risk: a credit memo/return with most of its balance already applied elsewhere
// (e.g. -25.30 total, -2.30 unused) must never regress to the amber "Pendiente"
// badge — it always represents money owed BACK by the supplier.
describe('PurchaseInvoiceHeaderTable — outstandingAmount credit-note/return badge (ETP-4331 bugfix)', () => {
  it('mostly-applied credit memo shows the credit badge, never the pending one (bug repro)', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[7] — -25.30 total, -2.30 left unused.
    expect(screen.getByText(/cpFavorBadge · 2\.3:GBP/)).toBeInTheDocument();
    const outstandingCol = screen.getByTestId('col-render-outstandingAmount');
    expect(outstandingCol.querySelector('[aria-label="addPago"]')?.textContent ?? '')
      .not.toMatch(/cpFavorBadge/);
  });

  it('fully-unapplied return also shows the credit badge (regression guard)', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.getByText(/cpFavorBadge · 27\.6:CHF/)).toBeInTheDocument();
  });

  it('fully-applied credit memo still shows the green fully-applied badge (unchanged)', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[4] — negative total (-1000 USD) with outstandingAmount '0'.
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
  });

  it('regular AP invoice with partial payment still shows the amber pending badge, unaffected', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    // MOCK_ROWS[0] — regular AP invoice, outstanding 500 EUR.
    const pendingBadge = screen.getByText('500:EUR');
    const pendingButton = pendingBadge.closest('button');
    expect(pendingButton).toHaveAttribute('aria-label', 'addPago');
    expect(pendingButton.textContent).not.toMatch(/cpFavorBadge/);
  });
});

// ── ETP-4841: the badge follows the SIGN of the total, not the document type ──
// The four cases below are the ones the previous document-type test rendered
// wrong. They are driven through the real component's outstandingAmount cell.
describe('PurchaseInvoiceHeaderTable — sign-driven payment badge (ETP-4841)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedColumnsHolder.value = null;
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  function renderOutstanding(row) {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const col = (capturedColumnsHolder.value || []).find((c) => c.key === 'outstandingAmount');
    expect(col, 'expected the outstandingAmount column').toBeTruthy();
    return render(<>{col.render(row)}</>);
  }

  it('a Factura Rectificativa with a POSITIVE total renders the payable badge, not the credit one', () => {
    const { container } = renderOutstanding(POSITIVE_RECTIFICATIVA_ROW);
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addPago');
    expect(container.textContent).toContain('1000:EUR');
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
    expect(container.textContent).not.toMatch(/cpCreditFullyApplied/);
  });

  it('an ordinary Factura with a NEGATIVE total renders the credit badge, not "pagada"', () => {
    const { container } = renderOutstanding(NEGATIVE_ORDINARY_ROW);
    expect(container.textContent).toBe('cpFavorBadge · 750:EUR');
    expect(container.textContent).not.toMatch(/pagada/);
  });

  it('a negative invoice with a zero outstanding renders the fully-applied pill', () => {
    const { container } = renderOutstanding({ ...NEGATIVE_ORDINARY_ROW, outstandingAmount: '0' });
    expect(container.textContent).toBe('cpCreditFullyApplied');
  });

  it('an OVERPAID positive invoice (outstanding < 0) renders "pagada", never the credit badge', () => {
    const { container } = renderOutstanding(OVERPAID_ROW);
    expect(container.textContent).toMatch(/pagada/);
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
  });

  it('a non-completed row renders the em dash placeholder with no badge at all', () => {
    const { container } = renderOutstanding({ ...NEGATIVE_ORDINARY_ROW, documentStatus: 'DR' });
    expect(container.textContent).toBe('—');
    expect(container.querySelector('button')).toBeNull();
  });

  it('the whole grid renders each sign case exactly once (end-to-end matrix)', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const col = screen.getByTestId('col-render-outstandingAmount');
    // Case A — positive rectificativa is payable (MOCK_ROWS[2], 400 USD).
    expect(col.querySelector('[aria-label="addPago"]')).toBeTruthy();
    expect(screen.getByText('400:USD').closest('button')).toHaveAttribute('aria-label', 'addPago');
    // Case B — negative ordinary invoice is a credit (MOCK_ROWS[3], 900 SEK).
    expect(screen.getByText(/cpFavorBadge · 900:SEK/)).toBeInTheDocument();
    // Case C — negative invoice fully applied (MOCK_ROWS[4]).
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
    // Case D — overpaid positive invoice reads paid (MOCK_ROWS[1] and [5]).
    expect(screen.getAllByText('pagada').length).toBe(2);
    // Case E — the draft row contributes the only em dash.
    expect(col.textContent).toContain('—');
  });
});

// ── ETP-4738 → ETP-4841: apInvoiceSubtype now drives ONLY the doc-type badge ──
// getApSubtype (which resolves the unified FAC | RECTIFICATIVA subtype, from the
// server-injected apInvoiceSubtype or the doc-type-name fallback) still decides
// which pill the transactionDocument column shows. It no longer has any say in
// the payment badge — that is the sign of the total. This exercises the REAL
// artifacts/purchase-invoice/custom/purchaseInvoiceSubtype.js (not mocked —
// @generated resolves to artifacts/ in vitest.config.js).
describe('PurchaseInvoiceHeaderTable — apInvoiceSubtype column-render coverage (ETP-4738/ETP-4841)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedColumnsHolder.value = null;
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
  });

  function getColRender(key) {
    const cols = capturedColumnsHolder.value;
    expect(cols, 'DataTable never received a columns prop').toBeTruthy();
    const col = cols.find((c) => c.key === key);
    expect(col, `expected column "${key}"`).toBeTruthy();
    return col.render;
  }

  const RECTIFICATIVA_ROW = {
    eTGODueDate: '2026-06-01',
    outstandingAmount: '-15.00',
    grandTotalAmount: '-15.00',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'Factura Rectificativa',
    apInvoiceSubtype: 'RECTIFICATIVA',
    aeatsiiEstado: null,
  };

  const RECTIFICATIVA_ROW_APPLIED = {
    ...RECTIFICATIVA_ROW,
    outstandingAmount: '0',
  };

  const NORMAL_ROW_WITH_FAC_SUBTYPE = {
    eTGODueDate: '2026-06-15',
    outstandingAmount: '300',
    grandTotalAmount: '300',
    documentStatus: 'CO',
    'currency$_identifier': 'EUR',
    'transactionDocument$_identifier': 'AP Invoice',
    apInvoiceSubtype: 'FAC',
    aeatsiiEstado: null,
  };

  it('outstandingAmount — a NEGATIVE Factura Rectificativa shows the credit badge', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(RECTIFICATIVA_ROW)}</>);
    expect(container.textContent).toBe('cpFavorBadge · 15:EUR');
  });

  it('outstandingAmount — fully-consumed negative Factura Rectificativa shows the green fully-applied pill', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(RECTIFICATIVA_ROW_APPLIED)}</>);
    expect(container.textContent).toMatch(/cpCreditFullyApplied/);
  });

  it('outstandingAmount — the SAME apInvoiceSubtype with a POSITIVE total is payable instead (ETP-4841)', () => {
    // Identical doc type and subtype as RECTIFICATIVA_ROW; only the sign differs.
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(
      <>{getColRender('outstandingAmount')({ ...RECTIFICATIVA_ROW, grandTotalAmount: '15.00', outstandingAmount: '15.00' })}</>,
    );
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addPago');
    expect(container.textContent).toContain('15:EUR');
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
  });

  it('transactionDocument — the doc-type badge still follows apInvoiceSubtype for BOTH signs', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const renderFn = getColRender('transactionDocument');
    const negative = render(<>{renderFn(RECTIFICATIVA_ROW)}</>);
    const positive = render(<>{renderFn({ ...RECTIFICATIVA_ROW, grandTotalAmount: '15.00' })}</>);
    expect(negative.container.textContent).toBe('rectificativeInvoicesTab');
    expect(positive.container.textContent).toBe('rectificativeInvoicesTab');
  });

  it('eTGODueDate — a negative Factura Rectificativa renders a plain date (no progress-state dot)', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('eTGODueDate')(RECTIFICATIVA_ROW)}</>);
    expect(container.textContent).toBe('date:2026-06-01');
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('regression guard: an AP CreditMemo with no apInvoiceSubtype and a negative total is still a credit', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(CREDIT_ROW)}</>);
    expect(container.querySelector('button')).toBeTruthy();
    expect(container.textContent).toMatch(/cpFavorBadge/);
  });

  it('negative control: a normal invoice with apInvoiceSubtype "FAC" renders the amber pending badge', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = render(<>{getColRender('outstandingAmount')(NORMAL_ROW_WITH_FAC_SUBTYPE)}</>);
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addPago');
    expect(container.textContent).not.toMatch(/cpFavorBadge/);
    expect(container.textContent).not.toMatch(/cpCreditFullyApplied/);
  });
});

// ── Regression: advanced filter mode for custom-render columns (ETP-4705) ──
// `type: 'custom'` is required on these columns to drive their badge/button
// cell render, but resolveFilterMode() falls back to 'text' for any type it
// doesn't recognize — silently turning the advanced filter's date picker /
// identifier picker / numeric input into a free-text box. Each affected
// column must carry an explicit `filterMode` hint that resolveFilterMode()
// honors before ever looking at `type`. This locks the fix in: removing any
// of these `filterMode` values must fail this test.
describe('PurchaseInvoiceHeaderTable — advanced filter mode for custom columns (ETP-4705 regression)', () => {
  beforeEach(() => {
    capturedColumnsHolder.value = null;
  });

  function getColumn(key) {
    const col = (capturedColumnsHolder.value || []).find((c) => c.key === key);
    expect(col, `expected column "${key}" to be captured from DataTable props`).toBeTruthy();
    return col;
  }

  it('invoiceDate (plain date column) resolves to the date filter mode', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(resolveFilterMode(getColumn('invoiceDate'))).toBe('date');
  });

  it('eTGODueDate (custom-render date column) resolves to the date filter mode', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(resolveFilterMode(getColumn('eTGODueDate'))).toBe('date');
  });

  it('transactionDocument (custom-render FK badge column) resolves to the identifier filter mode', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(resolveFilterMode(getColumn('transactionDocument'))).toBe('identifier');
  });

  // ETP-4841 dropped the custom renderer here, so `type: 'amount'` now infers
  // numeric on its own and no filterMode hint is needed — the resolved mode must
  // stay the same either way.
  it('grandTotalAmount (plain amount column) still resolves to the numeric filter mode', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(getColumn('grandTotalAmount').filterMode).toBeUndefined();
    expect(resolveFilterMode(getColumn('grandTotalAmount'))).toBe('numeric');
  });

  it('outstandingAmount (custom-render amount column) resolves to the numeric filter mode', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(resolveFilterMode(getColumn('outstandingAmount'))).toBe('numeric');
  });

  it('bug repro: without the filterMode hint, a custom-render column falls back to text', () => {
    // Documents WHY the fix is needed: a bare `type: 'custom'` column with no
    // filterMode hint resolves to 'text' via resolveFilterMode's default case —
    // this is the exact regression the fix above prevents on the real columns.
    expect(resolveFilterMode({ key: 'eTGODueDate', type: 'custom' })).toBe('text');
  });
});

// ── Branch / fallback coverage (ETP-4738) ─────────────────────────────────────
// The defensive fallbacks in this component (missing locale dictionary, missing
// selected org, rows arriving without an amount or a currency) and the purple
// "Saldo a favor" click handler were never exercised. These tests drive each of
// them through the real component and assert the resulting behaviour, not just
// the absence of a crash.
describe('PurchaseInvoiceHeaderTable — branch/fallback coverage (ETP-4738)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: false });
    capturedColumnsHolder.value = null;
  });

  afterEach(() => {
    // Restore the shared mock holders so the rest of the file keeps its defaults.
    i18nMock.dictionary = i18nMock.defaultDictionary;
    authMock.selectedOrg = authMock.defaultSelectedOrg;
  });

  function getColumn(key) {
    const cols = capturedColumnsHolder.value;
    expect(cols, 'DataTable never received a columns prop').toBeTruthy();
    const col = cols.find((c) => c.key === key);
    expect(col, `expected column "${key}"`).toBeTruthy();
    return col;
  }

  function renderCell(key, row) {
    return render(<>{getColumn(key).render(row)}</>);
  }

  // ── setPaymentRow from the credit badge (uncovered line 172) ───────────────

  it('clicking the credit badge opens the payment history modal', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
    // MOCK_ROWS[7] credit memo with -2.30 unused → "cpFavorBadge · 2.3:GBP"
    fireEvent.click(screen.getByText(/cpFavorBadge · 2\.3:GBP/));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('closing the modal opened from the credit badge clears the selected row', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    fireEvent.click(screen.getByText(/cpFavorBadge · 27\.6:CHF/));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close payment modal'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('credit badge click stops propagation so the row navigation is not triggered', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const rowClick = vi.fn();
    const cell = render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={rowClick}>{getColumn('outstandingAmount').render(CREDIT_ROW)}</div>,
    );
    fireEvent.click(cell.container.querySelector('button'));
    expect(rowClick).not.toHaveBeenCalled();
    // The click still reached the component's own handler (modal is mounted in
    // the component tree rendered above, so query the whole document).
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  // ── locale dictionary fallbacks (uncovered branches on lines 45/46) ─────────

  it('falls back to raw label keys when the locale dictionary has no genericLabels', () => {
    i18nMock.dictionary = null;
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(getColumn('grandTotalAmount').label).toBe('impTotal');
    expect(getColumn('outstandingAmount').label).toBe('pendingPaymentColumn');
    expect(getColumn('eTGODueDate').label).toBe('dueDate');
    expect(getColumn('transactionDocument').label).toBe('documentType');
    expect(getColumn('transactionDocument').labels).toEqual({ en_US: 'documentType' });
  });

  it('uses translated genericLabels when present and falls back per missing key', () => {
    i18nMock.dictionary = {
      genericLabels: { impTotal: 'Importe total', documentType: 'Tipo de documento' },
      statuses: {},
    };
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(getColumn('grandTotalAmount').label).toBe('Importe total');
    expect(getColumn('transactionDocument').label).toBe('Tipo de documento');
    // Keys absent from the dictionary fall back to the key itself.
    expect(getColumn('eTGODueDate').label).toBe('dueDate');
    expect(getColumn('documentStatus').label).toBe('statusDocColumn');
  });

  it('SII column label falls back to "SII Status" when the dictionary key is missing', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: true, showTbai: false, showVerifactu: false });
    i18nMock.dictionary = { genericLabels: { impTotal: 'Importe total' }, statuses: {} };
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(getColumn('_siiStatus').label).toBe('SII Status');
  });

  it('SII column uses the translated label when the dictionary provides it', () => {
    getInvoiceFiscalTargets.mockReturnValue({ showSii: true, showTbai: false, showVerifactu: false });
    i18nMock.dictionary = {
      genericLabels: { 'invoiceList.col.siiStatus': 'Estado SII' },
      statuses: {},
    };
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(getColumn('_siiStatus').label).toBe('Estado SII');
  });

  // ── selected-org fallback (uncovered branch on line 49) ────────────────────

  it('passes the selected org id to useFiscalConfig', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(useFiscalConfig).toHaveBeenCalledWith('org-1', '/api');
  });

  it('passes a null orgId to useFiscalConfig when no org is selected', () => {
    authMock.selectedOrg = null;
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    expect(useFiscalConfig).toHaveBeenCalledWith(null, '/api');
  });

  // ── row-level fallbacks in the outstandingAmount cell (lines 153/154) ──────

  it('outstanding cell falls back to EUR when the row carries no currency identifier', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const row = { ...CREDIT_ROW, outstandingAmount: '-5', 'currency$_identifier': undefined };
    const { container } = renderCell('outstandingAmount', row);
    expect(container.textContent).toBe('cpFavorBadge · 5:EUR');
  });

  it('outstanding cell falls back to the full total when the amount is missing — the credit reads as fully unapplied', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const row = { ...CREDIT_ROW };
    delete row.outstandingAmount;
    const { container } = renderCell('outstandingAmount', row);
    // CREDIT_ROW total is -1000, so the whole balance is still available.
    expect(container.textContent).toBe('cpFavorBadge · 1000:EUR');
    expect(container.textContent).not.toMatch(/cpCreditFullyApplied/);
  });

  it('outstanding cell falls back to the full total when the amount is null — a regular invoice reads as UNPAID, never as paid', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = renderCell('outstandingAmount', {
      ...AP_INVOICE_ROW,
      outstandingAmount: null,
      'currency$_identifier': undefined,
    });
    // Safe direction: an unknown balance must not render as "pagada".
    expect(container.querySelector('button')).toHaveAttribute('aria-label', 'addPago');
    expect(container.textContent).toContain('1000:EUR');
    expect(container.textContent).not.toMatch(/pagada/);
  });

  it('outstanding cell still reads a PRESENT zero as genuinely paid', () => {
    render(<PurchaseInvoiceHeaderTable {...BASE_PROPS} />);
    const { container } = renderCell('outstandingAmount', {
      ...AP_INVOICE_ROW,
      outstandingAmount: 0,
    });
    expect(container.textContent).toMatch(/pagada/);
  });
});
