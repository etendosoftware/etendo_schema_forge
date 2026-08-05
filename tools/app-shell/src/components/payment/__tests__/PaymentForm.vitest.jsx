import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock the data hooks (no network) ─────────────────────────────────────────
const outstanding = { invoices: [], loading: false };
vi.mock('@/hooks/useMovementLookups', () => ({
  useBPartnerLookup: () => ({ results: [], loading: false, error: null }),
  useGLItemLookup: () => ({ results: [], loading: false, error: null }),
  useOutstandingInvoices: () => outstanding,
}));

// ── Mock the advanced filter builder (just exposes the value it received) ─────
vi.mock('@/components/contract-ui/AdvancedFilterBuilder', () => ({
  AdvancedFilterBuilder: ({ value }) => (
    <div data-testid="adv-filter-builder" data-value={JSON.stringify(value ?? null)} />
  ),
}));

// ── Mock the Radix primitives used through fields.jsx + InvoiceFilter ─────────
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <div data-testid="rselect">
      <span data-testid="rselect-value">{value}</span>
      {children}
      <button type="button" data-testid={`select-fire-${value || 'none'}`} onClick={() => onValueChange('FIRED')}>fire</button>
    </div>
  ),
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ value, onClick, children }) => (
    <button type="button" data-testid={`opt-${value}`} onClick={onClick}>{children}</button>
  ),
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input data-testid="date-field" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverAnchor: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
}));

import { PaymentForm } from '../PaymentForm.jsx';

const METHODS = [
  { id: 'm1', name: 'Transferencia', payinAllow: true, payoutAllow: false, isDefault: true },
  { id: 'm2', name: 'Efectivo', payinAllow: true, payoutAllow: true, isDefault: false },
  { id: 'm3', name: 'Cheque', payinAllow: false, payoutAllow: true, isDefault: false },
];

const INVOICES = [
  { id: 'i1', no: 'FAC-001', metodo: 'Transferencia', bp: 'Acme', desc: '', venc: '15/06/2026', fecha: '01/06/2026', total: 1250, expected: 1250, pend: 1250, dias: -5, mon: 'EUR' },
  { id: 'i2', no: 'FAC-002', metodo: 'Transferencia', bp: 'Globex', desc: '', venc: '20/06/2026', fecha: '02/06/2026', total: 14, expected: 14, pend: 14, dias: 3, mon: 'EUR' },
];

/** Renders PaymentForm and returns a getter for the latest onChange snapshot. */
function renderForm(props = {}) {
  const snapshots = [];
  const onChange = (s) => snapshots.push(s);
  const utils = render(
    <PaymentForm
      paymentMethods={METHODS}
      invoices={INVOICES}
      onChange={onChange}
      {...props}
    />,
  );
  return { ...utils, last: () => snapshots[snapshots.length - 1], snapshots };
}

describe('PaymentForm — snapshot shape & defaults', () => {
  it('emits a snapshot with the documented shape', async () => {
    const { last } = renderForm();
    await waitFor(() => expect(last()).toBeTruthy());
    const s = last();
    expect(s).toHaveProperty('tercero');
    expect(s).toHaveProperty('paymentMethodId');
    expect(s).toHaveProperty('fechaPago');
    expect(s).toHaveProperty('referencia');
    expect(s).toHaveProperty('accountId');
    expect(s).toHaveProperty('selectedInvoices');
    expect(s).toHaveProperty('writeoffs');
    expect(s).toHaveProperty('commissions');
    expect(s).toHaveProperty('overpaymentAction');
    expect(s.totals).toEqual(expect.objectContaining({ totF: 0, totGL: 0, total: 0, pago: 0, diff: 0, cuadra: true }));
  });

  it('pre-selects the default payment method', async () => {
    const { last } = renderForm();
    await waitFor(() => expect(last()?.paymentMethodId).toBe('m1'));
  });

  it('falls back to the first allowed method when none is default (doc=out)', async () => {
    // For doc=out only m2/m3 are allowed; none is default → first allowed (m2).
    const { last } = renderForm({ doc: 'out' });
    await waitFor(() => expect(last()?.paymentMethodId).toBe('m2'));
  });

  it('seeds the payment-method default as an advanced-filter condition', async () => {
    renderForm();
    await waitFor(() => {
      const raw = screen.getByTestId('adv-filter-builder').getAttribute('data-value');
      const value = JSON.parse(raw);
      expect(value).toEqual({
        rowOperator: 'and',
        conditions: [{ field: 'metodo', operator: 'equals', value: ['Transferencia'] }],
      });
    });
  });

  it('uses the account id from context when an account is provided', async () => {
    const { last } = renderForm({ account: { id: 'acc-9', label: 'Banco' } });
    await waitFor(() => expect(last()?.accountId).toBe('acc-9'));
  });
});

describe('PaymentForm — account field conditional render', () => {
  it('renders a read-only account label when account is in context', () => {
    renderForm({ account: { id: 'acc-9', label: 'Banco Principal' } });
    expect(screen.getByText('Ingresar en')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Banco Principal')).toBeInTheDocument();
  });

  it('hides the account field when showAccountField is false', () => {
    renderForm({ showAccountField: false });
    expect(screen.queryByText('Ingresar en')).not.toBeInTheDocument();
  });

  it('labels the account field "Pagar desde" for doc=out', () => {
    renderForm({ doc: 'out', account: { id: 'a', label: 'Caja' } });
    expect(screen.getByText('Pagar desde')).toBeInTheDocument();
  });
});

describe('PaymentForm — invoice selection auto-fill & totals', () => {
  it('assigns the lesser of pending vs remaining payment', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 25 });
    await waitFor(() => expect(last()).toBeTruthy());

    // Select the large invoice (pend 1250) with only 25 left to allocate → 25.
    const checkboxes = screen.getAllByRole('button').filter((b) => b.querySelector('svg'));
    // The first row's select checkbox: scope by row text instead.
    const row1 = screen.getByText('FAC-001').closest('tr');
    await user.click(within(row1).getAllByRole('button')[0]);

    await waitFor(() => {
      const sel = last().selectedInvoices;
      expect(sel.i1).toBe(25);
    });
  });

  it('assigns the full pending for a smaller invoice', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 1000 });
    await waitFor(() => expect(last()).toBeTruthy());

    const row2 = screen.getByText('FAC-002').closest('tr');
    await user.click(within(row2).getAllByRole('button')[0]);

    await waitFor(() => expect(last().selectedInvoices.i2).toBe(14));
  });

  it('toggling a selected invoice off removes it', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 1000 });
    await waitFor(() => expect(last()).toBeTruthy());
    const row2 = screen.getByText('FAC-002').closest('tr');
    const cb = within(row2).getAllByRole('button')[0];
    await user.click(cb);
    await waitFor(() => expect(last().selectedInvoices.i2).toBe(14));
    await user.click(cb);
    await waitFor(() => expect(last().selectedInvoices.i2).toBeUndefined());
  });

  it('cuadra is true when the payment matches the assigned total', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 14 });
    await waitFor(() => expect(last()).toBeTruthy());
    const row2 = screen.getByText('FAC-002').closest('tr');
    await user.click(within(row2).getAllByRole('button')[0]);
    await waitFor(() => {
      expect(last().totals.totF).toBe(14);
      expect(last().totals.cuadra).toBe(true);
    });
  });
});

describe('PaymentForm — overpayment action visibility', () => {
  it('shows the overpayment action selector only when overpaid', async () => {
    const { last } = renderForm({ initialAmount: 100 });
    await waitFor(() => expect(last()).toBeTruthy());
    // pago 100 with nothing assigned → diff 100 > 0 → overpaid.
    expect(screen.getByText('Acción por sobrepago')).toBeInTheDocument();
    expect(last().totals.cuadra).toBe(false);
  });

  it('hides the overpayment selector when balanced', async () => {
    const { last } = renderForm({ initialAmount: 0 });
    await waitFor(() => expect(last()).toBeTruthy());
    expect(screen.queryByText('Acción por sobrepago')).not.toBeInTheDocument();
  });

  it('overpaymentAction is null in the snapshot when not overpaid', async () => {
    const { last } = renderForm({ initialAmount: 0 });
    await waitFor(() => expect(last()?.overpaymentAction).toBeNull());
  });
});

describe('PaymentForm — invoice row interactions', () => {
  it('edits the amount-to-pay for a selected invoice', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 1000 });
    await waitFor(() => expect(last()).toBeTruthy());
    const row1 = screen.getByText('FAC-001').closest('tr');
    await user.click(within(row1).getAllByRole('button')[0]); // select
    const amtInput = within(row1).getByPlaceholderText('0.00');
    await user.clear(amtInput);
    await user.type(amtInput, '500');
    await user.tab();
    await waitFor(() => expect(last().selectedInvoices.i1).toBe(500));
  });

  it('toggles the write-off (descuento) flag', async () => {
    const user = userEvent.setup();
    const { last } = renderForm({ initialAmount: 1000 });
    await waitFor(() => expect(last()).toBeTruthy());
    const row1 = screen.getByText('FAC-001').closest('tr');
    // The write-off toggle is the "No" button in the descuento column.
    await user.click(within(row1).getByText('No'));
    await waitFor(() => expect(last().writeoffs.i1).toBe(true));
  });

  it('expands a row to show secondary detail (invoice date)', async () => {
    const user = userEvent.setup();
    renderForm({ initialAmount: 0 });
    const row1 = screen.getByText('FAC-001').closest('tr');
    const buttons = within(row1).getAllByRole('button');
    // Last button in the row is the chevron expander.
    await user.click(buttons[buttons.length - 1]);
    expect(screen.getByText('Fecha de factura')).toBeInTheDocument();
  });

  it('shows the selection count chip once an invoice is selected', async () => {
    const user = userEvent.setup();
    renderForm({ initialAmount: 1000 });
    const row1 = screen.getByText('FAC-001').closest('tr');
    await user.click(within(row1).getAllByRole('button')[0]);
    expect(await screen.findByText('1 sel.')).toBeInTheDocument();
  });
});

describe('PaymentForm — commissions (GL) grid', () => {
  it('adds a commission row and reflects it in the snapshot', async () => {
    const user = userEvent.setup();
    const { last } = renderForm();
    await waitFor(() => expect(last()).toBeTruthy());
    await user.click(screen.getByText('Añadir comisiones y conceptos (GL)'));
    await waitFor(() => expect(last().commissions).toHaveLength(1));
    expect(screen.getByText('Comisiones y conceptos (GL)')).toBeInTheDocument();
  });

  it('removes a commission row', async () => {
    const user = userEvent.setup();
    const { last } = renderForm();
    await waitFor(() => expect(last()).toBeTruthy());
    await user.click(screen.getByText('Añadir comisiones y conceptos (GL)'));
    await waitFor(() => expect(last().commissions).toHaveLength(1));
    await user.click(screen.getByTitle('Eliminar'));
    await waitFor(() => expect(last().commissions).toHaveLength(0));
  });
});

describe('PaymentForm — free-text search box', () => {
  it('expands the search box and filters rows by query', async () => {
    const user = userEvent.setup();
    renderForm({ initialAmount: 0 });
    await user.click(screen.getByTitle('Buscar'));
    const search = await screen.findByPlaceholderText('Buscar…');
    await user.type(search, 'FAC-001');
    // FAC-002 should disappear from the table.
    await waitFor(() => expect(screen.queryByText('FAC-002')).not.toBeInTheDocument());
    expect(screen.getByText('FAC-001')).toBeInTheDocument();
  });
});

describe('PaymentForm — empty state & commissions toggle', () => {
  it('renders the commissions add CTA by default', () => {
    renderForm();
    expect(screen.getByText('Añadir comisiones y conceptos (GL)')).toBeInTheDocument();
  });

  it('omits commissions when allowCommissions is false', () => {
    renderForm({ allowCommissions: false });
    expect(screen.queryByText('Añadir comisiones y conceptos (GL)')).not.toBeInTheDocument();
  });

  it('renders the contextual note when provided', () => {
    renderForm({ note: <div data-testid="ctx-note">hola</div> });
    expect(screen.getByTestId('ctx-note')).toBeInTheDocument();
  });
});

describe('PaymentForm — payment amount currency symbol (ETP-4314)', () => {
  // Regression: the "Importe del pago" AmountInput used to always show '€'
  // regardless of the actual account/document currency. fields.jsx is NOT
  // mocked in this file, so this exercises the real AmountInput + the real
  // getCurrencySymbol() resolution end-to-end.
  // `invoices: []` avoids the invoice-row MoneyInputs, which share the same
  // fallback data-testid ("field-number") as the payment AmountInput when no
  // `name` prop is given, and would otherwise make the lookup ambiguous.
  it('shows the literal € by default (no currency prop)', () => {
    renderForm({ invoices: [] });
    const amountInput = screen.getByTestId('field-number');
    expect(amountInput.parentElement).toHaveTextContent('€');
  });

  it('shows the real currency symbol ($) when currency="USD" is passed', () => {
    renderForm({ invoices: [], currency: 'USD' });
    const amountInput = screen.getByTestId('field-number');
    expect(amountInput.parentElement).toHaveTextContent('$');
    expect(amountInput.parentElement).not.toHaveTextContent('€');
  });
});
