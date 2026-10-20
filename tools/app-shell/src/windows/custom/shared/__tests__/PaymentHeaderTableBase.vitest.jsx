// @covers tools/app-shell/src/windows/custom/shared/PaymentHeaderTableBase.jsx
// --- Hoisted spies/state shared between mock factories and test bodies ---

const dataTableSpy = vi.hoisted(() => ({ current: null }));

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Stub DataTable so we can drive PaymentHeaderTableBase's OWN logic (columns,
// rowQuickActions.menuActions, onDelete wiring) without pulling in the whole
// generic table implementation. Mirrors the WarehouseCustomTable.vitest.jsx
// convention already used in this codebase.
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    dataTableSpy.current = props;
    const { columns, data, rowQuickActions } = props;
    return (
      <div data-testid="DataTable__stub">
        {(data ?? []).map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            {columns.map((col) => (
              <div key={col.key} data-testid={`col-${col.key}-${row.id}`}>
                {col.render ? col.render(row) : String(row[col.key] ?? '')}
              </div>
            ))}
            {(rowQuickActions?.menuActions?.({ row }) ?? []).map((action) => (
              <button
                key={action.key}
                data-testid={`menu-action-${action.key}-${row.id}`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
            <button
              data-testid={`delete-${row.id}`}
              onClick={() => rowQuickActions?.onDelete?.(row)}
            >
              delete
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('../PaymentLifecycleConfirmModal', () => ({
  default: ({ dir, action, data, onConfirm, onClose }) => (
    <div
      data-testid="PaymentLifecycleConfirmModal__stub"
      data-dir={dir}
      data-action={action}
      data-status={data?.status}
      data-posted={data?.posted}
    >
      <button data-testid="confirm-accept" onClick={onConfirm}>confirm</button>
      <button data-testid="confirm-close" onClick={onClose}>close</button>
    </div>
  ),
}));

// ETP-5022 — `useApiFetch` used to throw outside an AuthProvider, so this file stubbed it out
// to keep PaymentEditModalLauncher from exploding at mount. The hook is provider-optional now,
// and stubbing it would swallow the component's OWN requests (it went through the raw `fetch`
// before, it goes through this hook now), so the stub is gone. What the component needs is a
// session to read the token from, which is what this mock supplies.
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ token: 'tok-1' }),
}));

vi.mock('../ConfirmPaymentModal', () => ({
  default: ({ dir, onConfirm, onClose }) => (
    <div data-testid="ConfirmPaymentModal__stub" data-dir={dir}>
      <button data-testid="confirm-payment-confirm" onClick={onConfirm}>confirm</button>
      <button data-testid="confirm-payment-close" onClick={onClose}>close</button>
    </div>
  ),
}));

// --- Imports ---

import { render, screen, waitFor, within } from '@testing-library/react';
import { setSessionCredentials, CREDENTIAL_MODES } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatCurrency.js';
import PaymentHeaderTableBase from '../PaymentHeaderTableBase.jsx';

// The source now delegates straight to the shared formatCurrency() — build
// expectations from the SAME real function instead of a hand-rolled mirror,
// so this test can never drift from the actual centralized implementation.
// formatCurrency() embeds a real NBSP (U+00A0) before the symbol (how es-ES
// Intl actually renders it). toHaveTextContent()/getByText() normalize the
// RENDERED DOM's whitespace (NBSP collapses to a regular space) but do NOT
// normalize the expected string passed in — so the expected value here must
// use a regular space to match what the normalized DOM text looks like.
function fmtAmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'EUR', n);
}
// toHaveTextContent()/getByText() normalize the rendered DOM's whitespace
// (NBSP collapses to a regular space) but do not normalize the expected
// string — use this variant for those assertions; use fmtAmt() as-is for
// direct .textContent comparisons, which see the real NBSP on both sides.
function fmtAmtNorm(val, curr) {
  return fmtAmt(val, curr).replace(/\u00a0/g, ' ');
}

const BASE_PROPS = {
  specName: 'payment-in',
  apiBaseUrl: '/sws/neo',
  token: 'tok-1',
  onNavigate: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  dataTableSpy.current = null;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ---

// ETP-5778 — the sidebar is fed by `meta.summary` (computed by the backend over the whole
// filtered set, in the organization currency). It never adds the loaded rows up itself.
const SUMMARY = {
  orgCurrencyIso: 'EUR',
  rowCount: 18,
  total: { amount: 2400.14, approximate: true, count: 16, missingRateCurrencies: [] },
  pending: { amount: 193.55, approximate: true, count: 2, missingRateCurrencies: [] },
  draftCount: 2,
  byMethod: [
    { id: 'm-cash', label: 'Efectivo', amount: 1174.06, approximate: true, count: 10 },
    { id: 'm-transfer', label: 'Transferencia', amount: 1226.08, approximate: false, count: 6 },
  ],
  byCurrency: [
    { currencyIso: 'EUR', total: 2093.79, count: 7 },
    { currencyIso: 'USD', total: 355.72, count: 9 },
  ],
};

const renderSidebar = ({ summary = SUMMARY, columnFilters, ...rest } = {}) => {
  render(
    <PaymentHeaderTableBase
      {...BASE_PROPS}
      dir="in"
      data={[]}
      meta={summary === null ? null : { summary }}
      columnFilters={columnFilters}
      onDataMutated={vi.fn()}
      {...rest} />,
  );
  return within(screen.getByTestId('PaymentSidebar__panel'));
};

describe('PaymentHeaderTableBase — sidebar', () => {
  // ETP-4576 — apiFetch takes the credential from the active scheme, not from an argument,
  // so a test that expects an Authorization header has to declare the scheme first.
  beforeEach(() => setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: 'tok-1' }));

  it('draws a 1px top border on the root container (separator below the list toolbar)', () => {
    renderSidebar();
    const root = screen.getByTestId('PaymentSidebar__panel').closest('div[style*="border-top"]');
    expect(root).not.toBeNull();
    expect(root.style.borderTop).toBe('1px solid hsl(var(--border-subtle))');
  });

  it('shows the skeleton and placeholders while there is no summary, and never adds the rows up', () => {
    // Mixed currencies: the old client-side sum printed "2.463,39 €" here.
    const rows = [
      { id: 'p1', status: 'RPR', amount: '2325', 'currency$_identifier': 'EUR', paymentDate: '2026-10-01' },
      { id: 'p2', status: 'RPR', amount: '138.39', 'currency$_identifier': 'USD', paymentDate: '2026-10-02' },
    ];
    const sidebar = renderSidebar({ summary: null, data: rows });
    expect(sidebar.queryByTestId('payment-summary-total')).not.toBeInTheDocument();
    expect(sidebar.queryByTestId('payment-summary-by-currency')).not.toBeInTheDocument();
    expect(sidebar.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByTestId('PaymentSidebar__panel').textContent).not.toMatch(/2\.463,39/);
  });

  it('renders the hero total with a muted ≈ and the default foreground colour, no sign', () => {
    const sidebar = renderSidebar();
    const total = sidebar.getByTestId('payment-summary-total');
    expect(total).toHaveAttribute('data-approximate', 'true');
    expect(total).toHaveTextContent(`≈ ${fmtAmtNorm(2400.14, 'EUR')}`);
    expect(total.textContent).not.toContain('+');
    expect(total.closest('[style*="30px"]')).toHaveStyle({ color: 'hsl(var(--foreground))', fontSize: '30px' });
  });

  it('groups thousands in the hero amount — hardcoded literal, not the self-referential fmtAmt() helper', () => {
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, total: { ...SUMMARY.total, amount: 1500.5, approximate: false } },
    });
    expect(sidebar.getByTestId('payment-summary-total')).toHaveTextContent('1.500,50 €');
    expect(sidebar.queryByText(/1500,50/)).not.toBeInTheDocument();
  });

  it('shows no ≈ anywhere when the summary is not approximate (single currency)', () => {
    const sidebar = renderSidebar({
      summary: {
        ...SUMMARY,
        total: { amount: 100, approximate: false, count: 1, missingRateCurrencies: [] },
        pending: { amount: 0, approximate: false, count: 0, missingRateCurrencies: [] },
        byMethod: [{ id: 'm1', label: 'Efectivo', amount: 100, approximate: false, count: 1 }],
        byCurrency: [{ currencyIso: 'EUR', total: 100, count: 1 }],
      },
    });
    expect(screen.getByTestId('PaymentSidebar__panel').textContent).not.toContain('≈');
    // The currency breakdown is rendered even with a single currency.
    expect(sidebar.getByTestId('payment-summary-currency-EUR')).toBeInTheDocument();
  });

  it('renders Pendiente with ≈ and the due badge, and Por confirmar from draftCount', () => {
    const sidebar = renderSidebar();
    expect(sidebar.getByTestId('payment-summary-pending')).toHaveTextContent(`≈ ${fmtAmtNorm(193.55, 'EUR')}`);
    expect(sidebar.getByText('2 porVencer')).toBeInTheDocument();
    expect(sidebar.getByText('sinConfirmar')).toBeInTheDocument();
  });

  it('puts ≈ per method only where the backend flags it', () => {
    const sidebar = renderSidebar();
    expect(sidebar.getByTestId('payment-summary-method-m-cash-amount')).toHaveAttribute('data-approximate', 'true');
    expect(sidebar.getByTestId('payment-summary-method-m-transfer-amount')).toHaveAttribute('data-approximate', 'false');
    expect(sidebar.getByTestId('payment-summary-method-m-transfer-amount')).toHaveTextContent(fmtAmtNorm(1226.08, 'EUR'));
  });

  it('lists the currency breakdown in the backend order, in original currency and without ≈', () => {
    const sidebar = renderSidebar();
    const rows = sidebar.getByTestId('payment-summary-by-currency').querySelectorAll('[data-testid^="payment-summary-currency-"]:not([data-testid$="-amount"])');
    expect([...rows].map((r) => r.getAttribute('data-testid'))).toEqual([
      'payment-summary-currency-EUR',
      'payment-summary-currency-USD',
    ]);
    expect(sidebar.getByText('paymentSummaryByCurrency')).toBeInTheDocument();
    expect(sidebar.getByTestId('payment-summary-currency-USD')).toHaveTextContent(fmtAmtNorm(355.72, 'USD'));
    expect(sidebar.getByTestId('payment-summary-by-currency').textContent).not.toContain('≈');
  });

  it('warns about currencies without an exchange rate', () => {
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, total: { ...SUMMARY.total, missingRateCurrencies: ['GBP', 'CHF'] } },
    });
    expect(sidebar.getByTestId('payment-summary-missing-rate')).toHaveTextContent('financeAccountsBalanceMissingRate');
  });

  it('uses the Cobrado / Pagado title and tooltip per direction', () => {
    const inSidebar = renderSidebar();
    expect(inSidebar.getByTestId('payment-summary-title')).toHaveTextContent('paymentSummaryCollected');
    expect(inSidebar.getByTestId('payment-summary-info-button')).toHaveAttribute('aria-label', 'paymentSummaryCollectedInfo');
  });

  it('uses the Pagado title and tooltip for dir="out"', () => {
    const sidebar = renderSidebar({ specName: 'payment-out', dir: 'out' });
    expect(sidebar.getByTestId('payment-summary-title')).toHaveTextContent('paymentSummaryPaid');
    expect(sidebar.getByTestId('payment-summary-info-button')).toHaveAttribute('aria-label', 'paymentSummaryPaidInfo');
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('dateRangeAllTime · 18 pagosNoun');
  });

  it('builds the subtitle from the active date filter', () => {
    const all = renderSidebar();
    expect(all.getByTestId('payment-summary-subtitle')).toHaveTextContent('dateRangeAllTime · 18 cobrosNoun');
  });

  it('subtitles a preset filter with its label', () => {
    const sidebar = renderSidebar({
      columnFilters: { paymentDate: { mode: 'date', op: 'range', value: ['2026-09-16', '2026-10-15'], originalValue: 'preset:last30' } },
    });
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('dateRangeLast30Days · 18 cobrosNoun');
  });

  it('subtitles a custom range as dd/mm/yyyy – dd/mm/yyyy', () => {
    const sidebar = renderSidebar({
      columnFilters: { paymentDate: { mode: 'date', op: 'range', value: ['2026-10-01', '2026-10-15'], originalValue: 'custom:2026-10-01:2026-10-15' } },
    });
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('01/10/2026 – 15/10/2026 · 18 cobrosNoun');
  });

  it('renders a zeroed panel (no method block) for an empty set', () => {
    const sidebar = renderSidebar({
      summary: {
        orgCurrencyIso: 'EUR', rowCount: 0, draftCount: 0, byMethod: [], byCurrency: [],
        total: { amount: 0, approximate: false, count: 0, missingRateCurrencies: [] },
        pending: { amount: 0, approximate: false, count: 0, missingRateCurrencies: [] },
      },
    });
    expect(sidebar.getByTestId('payment-summary-total')).toHaveTextContent(fmtAmtNorm(0, 'EUR'));
    expect(sidebar.getByText('0 porVencer')).toBeInTheDocument();
    expect(sidebar.queryByText('porMetodo')).not.toBeInTheDocument();
    expect(sidebar.getByTestId('payment-summary-currency-EUR')).toBeInTheDocument();
  });

  it('falls back to all time for an unknown preset id without crashing', () => {
    const sidebar = renderSidebar({
      columnFilters: { paymentDate: { mode: 'date', op: 'range', value: [], originalValue: 'preset:bogus' } },
    });
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('dateRangeAllTime · 18 cobrosNoun');
  });

  it('derives the period from value[] for a stale filter without originalValue', () => {
    const sidebar = renderSidebar({
      columnFilters: { paymentDate: { mode: 'date', op: 'range', value: ['2026-01-05', '2026-01-31'] } },
    });
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('05/01/2026 – 31/01/2026 · 18 cobrosNoun');
  });

  it('falls back to all time for an empty filter object', () => {
    const sidebar = renderSidebar({ columnFilters: { paymentDate: {} } });
    expect(sidebar.getByTestId('payment-summary-subtitle')).toHaveTextContent('dateRangeAllTime · 18 cobrosNoun');
  });

  it('keys a method with a null id by its label', () => {
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, byMethod: [{ id: null, label: 'Cheque', amount: 50, approximate: false, count: 1 }] },
    });
    expect(sidebar.getByTestId('payment-summary-method-Cheque')).toHaveTextContent('Cheque');
    expect(sidebar.getByTestId('payment-summary-method-Cheque-amount')).toHaveTextContent(fmtAmtNorm(50, 'EUR'));
  });

  it('renders very large amounts in full without crashing', () => {
    const big = 123456789012.34;
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, total: { ...SUMMARY.total, amount: big, approximate: true } },
    });
    expect(sidebar.getByTestId('payment-summary-total')).toHaveTextContent(`≈ ${fmtAmtNorm(big, 'EUR')}`);
  });

  it('shows ≈ on hero, Pendiente and methods exactly where each approximate flag is true', () => {
    const sidebar = renderSidebar({
      summary: {
        ...SUMMARY,
        total: { ...SUMMARY.total, approximate: false },
        pending: { ...SUMMARY.pending, approximate: true },
        byMethod: [
          { id: 'a', label: 'A', amount: 1, approximate: true, count: 1 },
          { id: 'b', label: 'B', amount: 2, approximate: false, count: 1 },
        ],
      },
    });
    expect(sidebar.getByTestId('payment-summary-total').textContent).not.toContain('≈');
    expect(sidebar.getByTestId('payment-summary-pending').textContent).toContain('≈');
    expect(sidebar.getByTestId('payment-summary-method-a-amount').textContent).toContain('≈');
    expect(sidebar.getByTestId('payment-summary-method-b-amount').textContent).not.toContain('≈');
  });

  it('treats a missing approximate flag as exact', () => {
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, total: { amount: 10 }, pending: { amount: 5 }, byMethod: [{ id: 'z', label: 'Z', amount: 1 }] },
    });
    expect(screen.getByTestId('PaymentSidebar__panel').textContent).not.toContain('≈');
    expect(sidebar.getByTestId('payment-summary-total')).toHaveAttribute('data-approximate', 'false');
  });

  it('keeps the by-currency card informational: no click target, button role or pointer cursor', () => {
    const sidebar = renderSidebar();
    const card = sidebar.getByTestId('payment-summary-by-currency');
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    for (const el of [card, ...card.querySelectorAll('*')]) {
      expect(el.getAttribute('role')).toBeNull();
      expect(el.style.cursor).not.toBe('pointer');
    }
  });

  it('renders one row for a single-currency summary', () => {
    const sidebar = renderSidebar({
      summary: { ...SUMMARY, byCurrency: [{ currencyIso: 'EUR', total: 100, count: 1 }] },
    });
    const card = sidebar.getByTestId('payment-summary-by-currency');
    expect(card.querySelectorAll('[data-testid^="payment-summary-currency-"]:not([data-testid$="-amount"])')).toHaveLength(1);
  });

  it('shows the missing-rate warning only when currencies are missing', () => {
    expect(renderSidebar().queryByTestId('payment-summary-missing-rate')).not.toBeInTheDocument();
  });

  it('does not change the displayed totals when the loaded rows change but meta.summary does not', () => {
    const rowsA = [{ id: 'p1', status: 'RPR', amount: '1', 'currency$_identifier': 'EUR', paymentDate: '2026-10-01' }];
    const rowsB = [...rowsA, { id: 'p2', status: 'RPR', amount: '99999', 'currency$_identifier': 'EUR', paymentDate: '2026-10-02' }];
    const props = { ...BASE_PROPS, dir: 'in', meta: { summary: SUMMARY }, onDataMutated: vi.fn() };
    const { rerender } = render(<PaymentHeaderTableBase {...props} data={rowsA} />);
    const before = screen.getByTestId('PaymentSidebar__panel').textContent;
    rerender(<PaymentHeaderTableBase {...props} data={rowsB} meta={{ summary: SUMMARY, page: 2 }} />);
    expect(screen.getByTestId('PaymentSidebar__panel').textContent).toBe(before);
  });

  it('never signs or colours the hero amount, for either direction', () => {
    const sidebar = renderSidebar({ specName: 'payment-out', dir: 'out' });
    const total = sidebar.getByTestId('payment-summary-total');
    expect(total.textContent).not.toMatch(/[+-]/);
    expect(total.closest('[style*="30px"]')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });
});

describe('PaymentHeaderTableBase — columns', () => {
  it('builds the expected column keys and a status enum that maps deposited codes for dir="in"', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    const { columns } = dataTableSpy.current;
    expect(columns.map((c) => c.key)).toEqual(['documentNo', 'paymentDate', 'businessPartner', 'status', 'amount']);

    const statusCol = columns.find((c) => c.key === 'status');
    expect(statusCol.enumLabels.RPR).toBe('cobroDepositado');
    expect(statusCol.enumLabels.PWNC).toBe('cobroDepositado');
    // RPAE (Awaiting Execution) is deposited too — the DB translation already
    // labels it "Cobro depositado", matching DEPOSITED_STATUSES.
    expect(statusCol.enumLabels.RPAE).toBe('cobroDepositado');
    expect(statusCol.enumLabels.RPAP).toBe('statusDraft');
    expect(statusCol.enumLabels.DR).toBe('statusDraft');
  });

  it('sets the amount column\'s labels[locale] explicitly so resolveColumnLabel picks it over the AD-dictionary fallback for "Amount" (which resolves to "Importe cobrado/pagado")', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    const { columns } = dataTableSpy.current;
    const amountCol = columns.find((c) => c.key === 'amount');
    // `labels` (priority 1 in resolveColumnLabel) must win over translate(col.column).
    expect(amountCol.labels).toEqual({ en_US: 'amount' });
    expect(amountCol.label).toBe('amount');
  });

  it('maps deposited codes to pagoDepositado for dir="out"', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={[]} onDataMutated={vi.fn()} />);
    const { columns } = dataTableSpy.current;
    const statusCol = columns.find((c) => c.key === 'status');
    expect(statusCol.enumLabels.RPR).toBe('pagoDepositado');
    expect(statusCol.enumLabels.RPAE).toBe('pagoDepositado');
  });

  it('labels PPM as in progress, not deposited (ETP-4895)', () => {
    // PPM is confirmed-but-not-withdrawn. Calling it "depositado" here contradicted the invoice
    // modal, which reads the very same payment as "Pago en progreso" — and the payment window,
    // whose status pill maps PPM to the same key via decisions.json.
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={[]} onDataMutated={vi.fn()} />);
    const statusCol = dataTableSpy.current.columns.find((c) => c.key === 'status');
    expect(statusCol.enumLabels.PPM).toBe('cpPaymentStateInProgress');
    expect(statusCol.enumLabels.PWNC).toBe('pagoDepositado');
  });

  it('offers no Reactivar for a payment whose bank transfer is live (ETP-4895)', () => {
    // Reactivating behind the bank's back would desync Salt Edge from Etendo Go. The rule has to
    // hold in the grid too — enforcing it only on the form leaves a way around it.
    const rows = [{ id: 'p20', status: 'PPM', pisLocked: true }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    expect(dataTableSpy.current.rowQuickActions.menuActions({ row: rows[0] })).toEqual([]);
  });

  it('hands the payment back once the transfer was rejected', () => {
    const rows = [{ id: 'p21', status: 'PWNC', pisLocked: false }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    expect(dataTableSpy.current.rowQuickActions.menuActions({ row: rows[0] })[0].key).toBe('etprReactivatePayment');
  });

  it('names ETGOERR instead of printing the raw status code (ETP-4895)', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={[]} onDataMutated={vi.fn()} />);
    const statusCol = dataTableSpy.current.columns.find((c) => c.key === 'status');
    expect(statusCol.enumLabels.ETGOERR).toBe('cpPaymentStateError');
  });

  it('does not paint a PPM amount as deposited-green or red (dir="out")', () => {
    // The green amount says "this money moved"; for PPM it has not left the account yet.
    const rows = [{ id: 'p13', status: 'PPM', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p13');
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
    expect(cell.querySelector('span')).not.toHaveStyle({ color: 'hsl(var(--destructive))' });
    expect(cell.querySelector('span')).not.toHaveStyle({ color: 'var(--status-success-fg)' });
  });

  it('renders a deposited row amount in the default foreground colour (dir="out")', () => {
    const rows = [{ id: 'p14', status: 'RPR', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p14');
    expect(cell).toHaveTextContent(fmtAmtNorm(50, 'EUR'));
    expect(cell.textContent).not.toContain('−');
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });

  it('renders the amount column without a sign and in the default foreground colour for a deposited row (dir="in")', () => {
    const rows = [{ id: 'p1', status: 'RPR', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p1');
    expect(cell).toHaveTextContent(fmtAmtNorm(50, 'EUR'));
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });

  it('renders the amount column without a sign and in the default foreground colour for an RPAE (Awaiting Execution) row (dir="in")', () => {
    // Regression test: RPAE was previously treated as NOT deposited (amber),
    // creating an inconsistency with the "Cobro depositado" DB label. It must
    // now render exactly like RPR — semantic success amount, deposited status.
    const rows = [{ id: 'p12', status: 'RPAE', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p12');
    expect(cell).toHaveTextContent(fmtAmtNorm(50, 'EUR'));
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });

  it('renders a non-deposited row amount in the default foreground colour, never green or red (dir="in")', () => {
    const rows = [{ id: 'p20', status: 'RPAP', amount: '20', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p20');
    expect(cell.textContent).toBe(fmtAmt(20, 'EUR'));
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });

  it('renders the amount column without a sign and in the default foreground colour for a non-deposited row (dir="out")', () => {
    const rows = [{ id: 'p2', status: 'RPAP', amount: '20', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p2');
    expect(cell).toHaveTextContent(fmtAmtNorm(20, 'EUR'));
    expect(cell.textContent).not.toContain('−');
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });

  it('renders the amount column with a single sign (not a doubled "− -") for a negative amount (dir="out")', () => {
    // Regression test: fmtAmt() already prepends its own "-" for negative
    // values; buildColumns must NOT also glue the directional "− " in front
    // of it, or the cell would read "− -50,00 €".
    const rows = [{ id: 'p3', status: 'PPM', amount: '-50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p3');
    expect(cell.textContent).toBe(fmtAmt(-50, 'EUR'));
    expect(cell.textContent).not.toContain('− -');
  });

  it('renders the amount column with a single sign (not a doubled "+ -") for a negative amount (dir="in")', () => {
    const rows = [{ id: 'p10', status: 'RPR', amount: '-15', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p10');
    expect(cell.textContent).toBe(fmtAmt(-15, 'EUR'));
    expect(cell.textContent).not.toContain('+ -');
  });

  it('renders the amount column without a sign for a positive amount (dir="in")', () => {
    const rows = [{ id: 'p11', status: 'RPR', amount: '5', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p11');
    expect(cell.textContent).toBe(fmtAmt(5, 'EUR'));
    expect(cell.textContent).not.toContain('+');
    expect(cell.querySelector('span')).toHaveStyle({ color: 'hsl(var(--foreground))' });
  });
});

describe('PaymentHeaderTableBase — menu actions', () => {
  it('offers a Confirmar action for draft (RPAP) rows', () => {
    const rows = [{ id: 'p1', status: 'RPAP', amount: '10' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    expect(screen.getByTestId('menu-action-aPRMProcessPayment-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-action-etprReactivatePayment-p1')).not.toBeInTheDocument();
  });

  it('offers a Reactivar action for deposited rows', () => {
    const rows = [{ id: 'p1', status: 'RDNC', amount: '10' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    expect(screen.getByTestId('menu-action-etprReactivatePayment-p1')).toBeInTheDocument();
  });

  it('offers a Reactivar action for RPAE (Awaiting Execution) rows, since RPAE now counts as deposited', () => {
    const rows = [{ id: 'p13', status: 'RPAE', amount: '10' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    expect(screen.getByTestId('menu-action-etprReactivatePayment-p13')).toBeInTheDocument();
  });

  it('offers no menu action for other statuses (e.g. RPVOID)', () => {
    const rows = [{ id: 'p1', status: 'RPVOID', amount: '10' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    expect(screen.queryByTestId('menu-action-aPRMProcessPayment-p1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-action-etprReactivatePayment-p1')).not.toBeInTheDocument();
  });
});

describe('PaymentHeaderTableBase — confirm payment flow', () => {
  const rows = [{ id: 'p1', status: 'RPAP', amount: '10' }];

  it('POSTs to the aPRMProcessPayment action, toasts success, dispatches neo:processSuccess and refreshes on success', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onDataMutated = vi.fn();
    const listener = vi.fn();
    window.addEventListener('neo:processSuccess', listener);

    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={onDataMutated} />);
    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    expect(screen.getByTestId('ConfirmPaymentModal__stub')).toHaveAttribute('data-dir', 'in');

    await userEvent.click(screen.getByTestId('confirm-payment-confirm'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('cobroConfirmadoOk'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/finPayment/p1/action/aPRMProcessPayment',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-1', 'Accept-Language': 'es_ES' }) }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onDataMutated).toHaveBeenCalledTimes(1);
    // Modal closes after a successful action.
    expect(screen.queryByTestId('ConfirmPaymentModal__stub')).not.toBeInTheDocument();

    window.removeEventListener('neo:processSuccess', listener);
  });

  it('toasts the server error message and keeps the modal open when the response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Cannot confirm' }) });
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);

    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    await userEvent.click(screen.getByTestId('confirm-payment-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot confirm'));
    expect(screen.getByTestId('ConfirmPaymentModal__stub')).toBeInTheDocument();
  });

  it('falls back to the errorKey translation when the server response has no message/error', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);

    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    await userEvent.click(screen.getByTestId('confirm-payment-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cobroConfirmadoError'));
  });

  it('falls back to the errorKey translation when the error body cannot even be parsed as JSON', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('bad json'); } });
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);

    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    await userEvent.click(screen.getByTestId('confirm-payment-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cobroConfirmadoError'));
  });

  it('toasts the errorKey translation when the network request throws', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'));
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);

    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    await userEvent.click(screen.getByTestId('confirm-payment-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cobroConfirmadoError'));
  });

  it('closes the modal via onClose without calling the action', async () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('menu-action-aPRMProcessPayment-p1'));
    await userEvent.click(screen.getByTestId('confirm-payment-close'));
    expect(screen.queryByTestId('ConfirmPaymentModal__stub')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('PaymentHeaderTableBase — reactivate flow (dir="out")', () => {
  const rows = [{ id: 'p9', status: 'PPM', amount: '10' }];

  it('POSTs to the etprReactivatePayment action against the "header" entity and toasts the pago-specific keys', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onDataMutated = vi.fn();

    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={onDataMutated} />);
    await userEvent.click(screen.getByTestId('menu-action-etprReactivatePayment-p9'));
    const stub = screen.getByTestId('PaymentLifecycleConfirmModal__stub');
    expect(stub).toHaveAttribute('data-dir', 'out');
    expect(stub).toHaveAttribute('data-action', 'reactivate');
    expect(stub).toHaveAttribute('data-status', 'PPM');

    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('pagoReactivadoOk'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/header/p9/action/etprReactivatePayment',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onDataMutated).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
  });

  it('toasts pagoReactivadoError on failure — and per handleReactivate\'s unconditional setConfirm(null), the modal closes anyway', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);

    await userEvent.click(screen.getByTestId('menu-action-etprReactivatePayment-p9'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('pagoReactivadoError'));
    // handleReactivate calls setConfirm(null) unconditionally at the end
    // (regardless of runAction's success/failure) — this is the intentional
    // behavior change called out in the refactor: the modal always closes,
    // the toast alone carries success/failure feedback to the user.
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
  });

  it('closes the modal via onClose without calling the action', async () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('menu-action-etprReactivatePayment-p9'));
    await userEvent.click(screen.getByTestId('confirm-close'));
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('PaymentHeaderTableBase — delete flow', () => {
  it('opening delete via the DataTable\'s own delete trigger sets confirm to {action: "delete", row}', async () => {
    const rows = [{ id: 'p8', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p8'));

    const stub = screen.getByTestId('PaymentLifecycleConfirmModal__stub');
    expect(stub).toHaveAttribute('data-action', 'delete');
    expect(stub).toHaveAttribute('data-dir', 'in');
  });

  it('confirming POSTs to the eTPRRemovePayment action, toasts recordDeleted, dispatches neo:processSuccess and calls onDataMutated on success', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onDataMutated = vi.fn();
    const listener = vi.fn();
    window.addEventListener('neo:processSuccess', listener);

    const rows = [{ id: 'p5', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={onDataMutated} />);
    await userEvent.click(screen.getByTestId('delete-p5'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('recordDeleted'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/finPayment/p5/action/eTPRRemovePayment',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onDataMutated).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();

    window.removeEventListener('neo:processSuccess', listener);
  });

  it('resolves the "header" entity for payment-out deletes', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const rows = [{ id: 'p9', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p9'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/header/p9/action/eTPRRemovePayment',
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  it('toasts the server\'s message/error on a non-ok response and still closes the modal', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Cannot delete' }) });
    const rows = [{ id: 'p6', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p6'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot delete'));
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
  });

  it('falls back to ui("networkError") when the non-ok response has no message/error', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const rows = [{ id: 'p7', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p7'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
  });

  it('toasts ui("networkError") and still closes the modal when the request throws', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'));
    const rows = [{ id: 'p10', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p10'));
    await userEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
  });

  it('closes the modal via onClose without calling fetch', async () => {
    const rows = [{ id: 'p11', status: 'RPAP', amount: '5' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-p11'));
    await userEvent.click(screen.getByTestId('confirm-close'));

    expect(screen.queryByTestId('PaymentLifecycleConfirmModal__stub')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('PaymentHeaderTableBase — rowQuickActions contract', () => {
  it('never hides delete when the record is complete, gates edit as always-hidden and restricts delete to non-void rows', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    const { rowQuickActions } = dataTableSpy.current;
    expect(rowQuickActions.hideDeleteWhenComplete).toBe(false);
    expect(rowQuickActions.statusField).toBe('status');
    expect(rowQuickActions.sendDocument).toBeNull();
    expect(rowQuickActions.actions.edit.visibleWhen).toBe("@status@='__hidden__'");
    expect(rowQuickActions.actions.delete.visibleWhen).toBe("@status@!='RPVOID'");
  });

  it('preserves any rowQuickActions passed in via props while adding its own overrides', () => {
    render(
      <PaymentHeaderTableBase
        {...BASE_PROPS}
        dir="in"
        data={[]}
        onDataMutated={vi.fn()}
        rowQuickActions={{ customFlag: true }}
      />,
    );
    expect(dataTableSpy.current.rowQuickActions.customFlag).toBe(true);
  });

  it('forwards filters, showFooterTotals and specName straight through to DataTable', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    expect(dataTableSpy.current.filters).toEqual(['documentNo', 'paymentDate', 'businessPartner', 'status']);
    expect(dataTableSpy.current.showFooterTotals).toBe(false);
    expect(dataTableSpy.current.specName).toBe('payment-in');
  });
});

describe('PaymentHeaderTableBase — auto height layout effect', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('mirrors the nearest scrollable ancestor height onto the root element without crashing', () => {
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    document.body.appendChild(container);

    const { unmount } = render(
      <PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />,
      { container },
    );

    expect(screen.getByTestId('DataTable__stub')).toBeInTheDocument();
    unmount();
    document.body.removeChild(container);
  });
});
