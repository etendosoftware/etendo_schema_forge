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
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import PaymentHeaderTableBase from '../PaymentHeaderTableBase.jsx';

// --- Helpers (mirror the private formatting logic in the source, so
// expectations stay correct regardless of the host's ICU data) ---

function currencySymbol(curr) {
  const code = curr || 'EUR';
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: code })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
const AMOUNT_FMT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return (n < 0 ? '-' : '') + AMOUNT_FMT.format(Math.abs(n)) + ' ' + currencySymbol(curr);
}

function thisMonthDate(day = '05') {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${day}`;
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

describe('PaymentHeaderTableBase — sidebar', () => {
  it('shows the loading skeleton and placeholder widgets when data is null', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={null} onDataMutated={vi.fn()} />);
    expect(screen.getByTestId('PaymentSidebar__panel')).toBeInTheDocument();
    // Two "—" placeholders (month subtitle absent + widget badges/counts) while data is null.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('computes and renders stats for dir="in": this-month total, pending total, draft count and per-method breakdown', () => {
    const rows = [
      { id: 'p1', status: 'RPR', amount: '120.5', paymentDate: thisMonthDate('05'), 'currency$_identifier': 'EUR', 'paymentMethod$_identifier': 'Transferencia' },
      { id: 'p2', status: 'RPPC', amount: '30', paymentDate: '2000-01-01', 'currency$_identifier': 'EUR', 'paymentMethod$_identifier': 'Efectivo' },
      { id: 'p3', status: 'RPAP', amount: '75' },
      { id: 'p4', status: 'RPVOID', amount: '10' },
    ];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));

    // Hero: only p1 counts towards "this month" (p2's date is out of range).
    expect(sidebar.getByText(`+ ${fmtAmt(120.5, 'EUR')}`)).toBeInTheDocument();

    // Pending bucket = every non-deposited row (p3 + p4) = 85.
    expect(sidebar.getByText(`2 porVencer`)).toBeInTheDocument();
    expect(sidebar.getByText(fmtAmt(85, 'EUR'))).toBeInTheDocument();

    // Per-method breakdown only includes deposited rows.
    expect(sidebar.getByText('Transferencia')).toBeInTheDocument();
    expect(sidebar.getByText('Efectivo')).toBeInTheDocument();
    expect(sidebar.getByText(fmtAmt(30, 'EUR'))).toBeInTheDocument();
  });

  it('groups thousands in the hero amount (1000-9999 range silently drops the separator without explicit useGrouping) — hardcoded literal, not the self-referential fmtAmt() helper', () => {
    const rows = [
      { id: 'p1', status: 'RPR', amount: '1500.5', paymentDate: thisMonthDate('05'), 'currency$_identifier': 'EUR' },
    ];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    // Hardcoded literal — the local fmtAmt() test helper above shares the SAME
    // missing-useGrouping bug as production, so it can never catch this regression.
    expect(sidebar.getByText('+ 1.500,50 €')).toBeInTheDocument();
    expect(sidebar.queryByText('+ 1500,50 €')).not.toBeInTheDocument();
  });

  it('uses the "pagado" hero label and no method breakdown for dir="out" with no deposited rows (zero amount renders without a sign)', () => {
    const rows = [{ id: 'p1', status: 'RPAP', amount: '40' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    // No deposited rows this month → thisMonth is 0 → the hero renders sign-less, not "− 0,00 €".
    expect(sidebar.getByText(fmtAmt(0, 'EUR'))).toBeInTheDocument();
    expect(sidebar.queryByText(`− ${fmtAmt(0, 'EUR')}`)).not.toBeInTheDocument();
    // No deposited rows → no per-method breakdown section rendered.
    expect(sidebar.queryByText('porMetodo')).not.toBeInTheDocument();
  });

  it('shows the minus sign for dir="out" when this month\'s deposited total is nonzero', () => {
    const rows = [
      { id: 'p1', status: 'RPR', amount: '40', paymentDate: thisMonthDate('05'), 'currency$_identifier': 'EUR' },
    ];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    expect(sidebar.getByText(`− ${fmtAmt(40, 'EUR')}`)).toBeInTheDocument();
  });

  it('renders the hero amount with a single sign (not a doubled "− -") when this month\'s deposited total is negative (dir="out")', () => {
    // Regression test: a negative deposited total must NOT get heroSign ("−")
    // glued in front of fmtAmt's own leading "-" (which would render "− -40,00 €").
    const rows = [
      { id: 'p1', status: 'RPR', amount: '-40', paymentDate: thisMonthDate('05'), 'currency$_identifier': 'EUR' },
    ];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    // Both the hero amount AND the per-method breakdown (single "other" method,
    // same -40 total) must render the sign-less single form.
    expect(sidebar.getAllByText(fmtAmt(-40, 'EUR')).length).toBeGreaterThanOrEqual(1);
    expect(sidebar.queryByText(`− ${fmtAmt(-40, 'EUR')}`)).not.toBeInTheDocument();
  });

  it('renders the hero amount with a single sign (not a doubled "+ -") when this month\'s deposited total is negative (dir="in")', () => {
    const rows = [
      { id: 'p1', status: 'RPR', amount: '-40', paymentDate: thisMonthDate('05'), 'currency$_identifier': 'EUR' },
    ];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    expect(sidebar.getAllByText(fmtAmt(-40, 'EUR')).length).toBeGreaterThanOrEqual(1);
    expect(sidebar.queryByText(`+ ${fmtAmt(-40, 'EUR')}`)).not.toBeInTheDocument();
  });

  it('renders the hero amount without a +/- sign when this month\'s total is exactly zero (dir="in")', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    // Both the hero amount and the "sinDepositar" widget count render as a sign-less zero.
    expect(sidebar.getAllByText(fmtAmt(0, 'EUR'))).toHaveLength(2);
    expect(sidebar.queryByText(`+ ${fmtAmt(0, 'EUR')}`)).not.toBeInTheDocument();
    expect(sidebar.queryByText(`− ${fmtAmt(0, 'EUR')}`)).not.toBeInTheDocument();
  });

  it('falls back to the raw currency code when Intl cannot resolve a currency symbol', () => {
    const rows = [{ id: 'p1', status: 'RPR', amount: '10', 'currency$_identifier': '1', paymentDate: thisMonthDate() }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    // currencySymbol() catches the RangeError from Intl.NumberFormat and returns the raw code.
    expect(sidebar.getByText('+ 10,00 1')).toBeInTheDocument();
  });

  it('renders zeroed widgets for an empty data array', () => {
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={[]} onDataMutated={vi.fn()} />);
    const sidebar = within(screen.getByTestId('PaymentSidebar__panel'));
    expect(sidebar.getByText('0 porVencer')).toBeInTheDocument();
    // Both the sign-less hero amount and the "sinDepositar" widget count read "0,00 €".
    expect(sidebar.getAllByText(fmtAmt(0, 'EUR')).length).toBeGreaterThanOrEqual(2);
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

  it('renders the amount column with a + sign and green color for a deposited row (dir="in")', () => {
    const rows = [{ id: 'p1', status: 'RPR', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p1');
    expect(cell).toHaveTextContent(`+ ${fmtAmt(50, 'EUR')}`);
    expect(cell.querySelector('span')).toHaveStyle({ color: 'rgb(23, 102, 58)' });
  });

  it('renders the amount column with a + sign and green color for an RPAE (Awaiting Execution) row (dir="in")', () => {
    // Regression test: RPAE was previously treated as NOT deposited (amber),
    // creating an inconsistency with the "Cobro depositado" DB label. It must
    // now render exactly like RPR — green amount, deposited status.
    const rows = [{ id: 'p12', status: 'RPAE', amount: '50', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p12');
    expect(cell).toHaveTextContent(`+ ${fmtAmt(50, 'EUR')}`);
    expect(cell.querySelector('span')).toHaveStyle({ color: 'rgb(23, 102, 58)' });
  });

  it('renders the amount column with a − sign and dark color for a non-deposited row (dir="out")', () => {
    const rows = [{ id: 'p2', status: 'RPAP', amount: '20', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} specName="payment-out" dir="out" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p2');
    expect(cell).toHaveTextContent(`− ${fmtAmt(20, 'EUR')}`);
    expect(cell.querySelector('span')).toHaveStyle({ color: 'rgb(18, 18, 23)' });
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

  it('renders the amount column with the directional sign preserved for a positive amount, guarding against future regressions in either direction', () => {
    const rows = [{ id: 'p11', status: 'RPR', amount: '5', 'currency$_identifier': 'EUR' }];
    render(<PaymentHeaderTableBase {...BASE_PROPS} dir="in" data={rows} onDataMutated={vi.fn()} />);
    const cell = screen.getByTestId('col-amount-p11');
    expect(cell.textContent).toBe(`+ ${fmtAmt(5, 'EUR')}`);
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
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }) }),
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
