// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (_curr, val) => `$${Number(val || 0).toFixed(2)}`,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <div data-testid="select" data-value={value || ''} data-onchange={typeof onValueChange}>{children}</div>
  ),
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-testid={`option-${value}`}>{children}</div>,
  SelectTrigger: ({ children }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, className }) => (
    <input type="date" value={value || ''} onChange={(e) => onChange?.(e.target.value)} className={className} data-testid="date-field" />
  ),
}));

// apiFetch is provided per-test via a module-level mock fn so each test can
// shape the catalog + submit responses independently.
let mockApiFetch;
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => (...args) => mockApiFetch(...args),
}));

import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NewPaymentEntryModal from '../NewPaymentEntryModal.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INVOICE = {
  documentNo: 'INV-001',
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'ACME',
};

function jsonRes(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

/**
 * Build an apiFetch mock keyed by URL fragment.
 * @param {object} cfg { accounts, methods, sources, plan, register }
 */
function buildApiFetch(cfg = {}) {
  const {
    accounts = [{ id: 'acc-1', label: 'Main Account', defaultPaymentMethod: 'Transfer' }],
    methods = [{ id: 'm-1', label: 'Transfer' }, { id: 'm-2', label: 'Cash' }],
    sources = [],
    plan = [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }],
    register = { response: { data: { id: 'pay-1' } } },
    registerOk = true,
  } = cfg;

  return vi.fn(async (path) => {
    if (path.includes('invoiceAccounts')) return jsonRes({ items: accounts });
    if (path.includes('invoicePaymentMethods')) return jsonRes({ items: methods });
    if (path.includes('invoiceCreditSources')) return jsonRes({ items: sources });
    if (path.includes('paymentPlan')) return jsonRes({ response: { data: plan } });
    if (path.includes('registerPayment')) return jsonRes(register, registerOk);
    return jsonRes({});
  });
}

/**
 * Build an apiFetch mock for PIS-eligible scenarios (ETP-4406): a
 * psd2Connected account, a transfer-like payment method, and a supplier
 * IBAN list — plus overrides for the registerPayment response and the
 * pisPaymentStatus sequence returned across successive polls.
 */
function buildPisApiFetch(cfg = {}) {
  const {
    accounts = [{ id: 'acc-1', label: 'Banco PIS', psd2Connected: true, maskedPan: '****1234' }],
    methods = [{ id: 'm-1', label: 'Transferencia' }],
    sources = [],
    plan = [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }],
    // ETP-4406: the default supplier IBAN must be a structurally valid IBAN
    // (ISO 13616 mod-97) — otherwise the new IBAN validation keeps SEPA's
    // pisReady false and Confirmar disabled, breaking every confirm/polling test.
    pisAccounts = [{ id: 'ES91 2100 0418 4502 0005 1332', name: 'Cuenta principal', iban: 'ES91 2100 0418 4502 0005 1332', default: true }],
    pisTemplates = [
      { value: 'SEPA', label: 'Single Euro Payments Area (SEPA)' },
      { value: 'DOMESTIC', label: 'DOMESTIC' },
      { value: 'FPS', label: 'Faster Payment' },
    ],
    register = { response: { data: { id: 'pay-1' } } },
    registerOk = true,
    pisStatusSequence = ['executed'],
  } = cfg;
  let pisStatusCallIndex = 0;

  return vi.fn(async (path) => {
    if (path.includes('pisSupplierAccounts')) return jsonRes({ items: pisAccounts });
    if (path.includes('pisTemplates')) return jsonRes({ items: pisTemplates });
    if (path.includes('pisPaymentStatus')) {
      const status = pisStatusSequence[Math.min(pisStatusCallIndex, pisStatusSequence.length - 1)];
      pisStatusCallIndex += 1;
      return jsonRes({ status });
    }
    if (path.includes('invoiceAccounts')) return jsonRes({ items: accounts });
    if (path.includes('invoicePaymentMethods')) return jsonRes({ items: methods });
    if (path.includes('invoiceCreditSources')) return jsonRes({ items: sources });
    if (path.includes('paymentPlan')) return jsonRes({ response: { data: plan } });
    if (path.includes('registerPayment')) return jsonRes(register, registerOk);
    return jsonRes({});
  });
}

const defaults = {
  dir: 'in',
  specName: 'sales-invoice',
  invoiceId: 'inv-1',
  invoiceData: INVOICE,
  scheduleId: 'sched-1',
  outstanding: 1000,
  apiBaseUrl: 'http://host/sws/neo/sales-invoice',
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

function renderModal(overrides = {}) {
  const props = { ...defaults, onClose: vi.fn(), onSaved: vi.fn(), ...overrides };
  return { ...render(<NewPaymentEntryModal {...props} />), props };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewPaymentEntryModal', () => {
  beforeEach(() => {
    mockApiFetch = buildApiFetch();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('header / title', () => {
    it('shows the collection title for dir "in"', () => {
      renderModal({ dir: 'in' });
      expect(screen.getByText('cpNewCollection')).toBeInTheDocument();
      // header is title-only now (no type/draft badges)
      expect(screen.queryByText('cpNewPayment')).not.toBeInTheDocument();
    });

    it('shows the payment title for dir "out"', () => {
      mockApiFetch = buildApiFetch();
      renderModal({ dir: 'out' });
      expect(screen.getByText('cpNewPayment')).toBeInTheDocument();
      expect(screen.queryByText('cpNewCollection')).not.toBeInTheDocument();
    });

    it('renders the invoice document number', () => {
      renderModal();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });
  });

  describe('amount field', () => {
    it('prefills the amount input with the outstanding total (es-ES)', () => {
      renderModal({ outstanding: 6420 });
      expect(screen.getByTestId('cp-amount-input')).toHaveValue('6.420,00');
    });
  });

  describe('credit section visibility', () => {
    it('hides the credit section when there are no sources', async () => {
      mockApiFetch = buildApiFetch({ sources: [] });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      expect(screen.queryByText('cpCreditSectionTitle')).not.toBeInTheDocument();
    });

    it('shows the unified credit section when sources are present', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 200 }],
      });
      renderModal();
      expect(await screen.findByText('cpCreditSectionTitle')).toBeInTheDocument();
      // hint renders inline as "· cpCreditSectionHint", so match a substring
      expect(screen.getByText(/cpCreditSectionHint/)).toBeInTheDocument();
      expect(screen.getByTestId('cp-credit-row-s1')).toBeInTheDocument();
      // credit rows are badged "Crédito" (purple)
      expect(screen.getByText('cpCreditBadge')).toBeInTheDocument();
    });

    it('renders credit and abono rows together in the unified section', async () => {
      mockApiFetch = buildApiFetch({
        sources: [
          { id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 200 },
          { id: 's2', kind: 'abono', doc: 'SF-2', date: '2024-02-01', avail: 50 },
        ],
      });
      renderModal();
      // both kinds live under a single section title
      expect(await screen.findByText('cpCreditSectionTitle')).toBeInTheDocument();
      expect(screen.getByTestId('cp-credit-row-s1')).toBeInTheDocument();
      expect(screen.getByTestId('cp-credit-row-s2')).toBeInTheDocument();
      // each kind keeps its own badge: credit -> Crédito, abono -> Saldo a favor
      expect(screen.getByText('cpCreditBadge')).toBeInTheDocument();
      expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    });

    it('toggles a credit row into the balance when clicked', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 200 }],
      });
      renderModal();
      const row = await screen.findByTestId('cp-credit-row-s1');
      // unselected rows show the "unused" hint
      expect(screen.getByText('cpUnused')).toBeInTheDocument();
      fireEvent.click(row);
      // selecting the row consumes the credit and removes the unused hint
      await waitFor(() => expect(screen.queryByText('cpUnused')).not.toBeInTheDocument());
    });

    // Regression (ETP-4331 follow-up): user report — "Nuevo cobro" for an invoice
    // with 25,30€ pending; selecting a "Saldo a favor" line that covers it in full
    // left cash ("Importe") at 0,00€ and "Diferencia" at 0,00€ (a fully exact,
    // valid reconciliation), yet "Confirmar" stayed disabled. Root cause:
    // missingRequired gated on balance.amount (cash only), which is legitimately 0
    // once a credit line covers 100% of the invoice by design. Fixed to gate on
    // balance.funds (cash + used credit) instead — this test reproduces the exact
    // repro and would have failed before the fix (missingRequired stuck `true`).
    it('enables Confirmar/Guardar when a saldo-a-favor line fully covers the invoice and zeroes the cash amount', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'abono', doc: 'SF-1', date: '2024-03-01', avail: 25.30 }],
      });
      renderModal({ outstanding: 25.30 });

      const row = await screen.findByTestId('cp-credit-row-s1');
      fireEvent.click(row);

      // Selecting the line auto-caps usage to min(avail, need) = 25.30 and drops
      // the cash amount to max(0, applied - usedByOthers - use) = 0 — exactly the
      // repro: cash "Importe" left at 0,00€, credit fully covering the invoice.
      const input = await within(row).findByTestId('cp-credit-use-s1');
      await waitFor(() => expect(input).toHaveValue('25,30'));
      await waitFor(() => expect(screen.getByTestId('cp-amount-input')).toHaveValue('0,00'));

      // Balance is exact — no missing, no excess — "Diferencia" shows 0,00 €.
      expect(screen.getByText('cpDifference')).toBeInTheDocument();
      expect(screen.queryByText('cpMissing')).not.toBeInTheDocument();
      expect(screen.queryByText('cpExcess')).not.toBeInTheDocument();

      // Core regression assertion: both footer actions are enabled — before the
      // fix, missingRequired read balance.amount (0 here) and stayed `true`,
      // keeping Guardar/Confirmar disabled despite the fully-covered, exact balance.
      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
    });

    it('edits the "use" amount via the input field, clamped to [0, avail]', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 500 }],
      });
      renderModal({ outstanding: 50 });
      const row = await screen.findByTestId('cp-credit-row-s1');
      fireEvent.click(row);
      // selecting caps "use" to the invoice need (50, since avail=500 > need).
      const input = await within(row).findByTestId('cp-credit-use-s1');
      await waitFor(() => expect(input).toHaveValue('50,00'));

      // typing a value within [0, avail] is reflected exactly after blur.
      fireEvent.change(input, { target: { value: '150,00' } });
      fireEvent.blur(input);
      await waitFor(() => expect(input).toHaveValue('150,00'));

      // typing a negative value clamps to 0.
      fireEvent.change(input, { target: { value: '-100' } });
      fireEvent.blur(input);
      await waitFor(() => expect(input).toHaveValue('0,00'));
    });

    it('clamps the "use" amount at avail when the typed value exceeds the available credit', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 120 }],
      });
      renderModal({ outstanding: 1000 });
      const row = await screen.findByTestId('cp-credit-row-s1');
      fireEvent.click(row);
      // selecting caps "use" to avail (120), since need (1000) > avail.
      const input = await within(row).findByTestId('cp-credit-use-s1');
      await waitFor(() => expect(input).toHaveValue('120,00'));

      fireEvent.change(input, { target: { value: '220,00' } });
      fireEvent.blur(input);
      // 220 would exceed avail (120) — clamps down to 120 on blur.
      await waitFor(() => expect(input).toHaveValue('120,00'));
    });
  });

  describe('confirm enablement', () => {
    it('enables Confirmar on an exact balance', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
    });

    it('disables Confirmar on unresolved excess (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      const confirm = screen.getByText('cpConfirm').closest('button');
      expect(confirm).toBeDisabled();
    });

    it('re-enables Confirmar after choosing an excess resolution (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      fireEvent.click(screen.getByText('cpLeaveCredit').closest('button'));
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
    });

    it('disables Confirmar on any excess (dir "out") with an inline error', async () => {
      mockApiFetch = buildApiFetch();
      renderModal({ dir: 'out', specName: 'purchase-invoice', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      const confirm = screen.getByText('cpConfirm').closest('button');
      expect(confirm).toBeDisabled();
      expect(screen.getByText('cpExcessInline')).toBeInTheDocument();
    });
  });

  describe('required field markers (missingRequired wiring)', () => {
    it('renders a trailing "*" next to each of the four mandatory field labels', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Field({ label, required }) renders `{label}{required && <span> *</span>}`
      // as sibling text nodes inside the same <label>, so each label's
      // container ends with a literal "*" once `required` is passed through.
      for (const key of ['cpAmount', 'date', 'cpPaymentMethod', 'account']) {
        const label = screen.getByText(key, { selector: 'label' });
        expect(label).toHaveTextContent(`${key} *`);
      }
    });
  });

  describe('missingRequired disables both footer actions per-field (ETP-4331 redesign)', () => {
    it('disables Guardar and Confirmar while methodId is empty, even with a valid date/account/amount', async () => {
      // No default method resolves (empty method catalog) -> methodId stays ''.
      mockApiFetch = buildApiFetch({ methods: [] });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });

    it('disables Guardar and Confirmar while accountId is empty, even with a valid date/method/amount', async () => {
      // No accounts resolve -> accountId stays ''.
      mockApiFetch = buildApiFetch({ accounts: [] });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });

    it('disables Guardar and Confirmar when the amount is cleared to 0, even with a valid date/method/account', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      // sanity: both start enabled with the default-resolved exact balance.
      await waitFor(() => expect(screen.getByTestId('cp-confirm')).not.toBeDisabled());

      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '0' } });

      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });
  });

  describe('missingRequired satisfied — buttons enabled purely on the required-fields contract', () => {
    it('does not disable Guardar/Confirmar due to missingRequired once all four fields are populated (exact balance)', async () => {
      // Default catalog + default outstanding (1000) resolves an exact
      // balance (amount === outstanding), so canConfirm is also satisfied —
      // this isolates the missingRequired contract from the balance contract.
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      const saveDraft = screen.getByTestId('cp-save-draft');
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(saveDraft).not.toBeDisabled());
      expect(confirm).not.toBeDisabled();
    });
  });

  describe('partial payment (missing amount)', () => {
    it('shows the cpMissing label with the difference when the amount is less than the outstanding total', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '800' } });
      expect(screen.getByText('cpMissing')).toBeInTheDocument();
      // the delta amount (200,00) should be rendered nearby
      expect(screen.getByText(/200,00/)).toBeInTheDocument();
      // Confirmar stays enabled for a partial payment — only excess blocks it.
      const confirm = screen.getByText('cpConfirm').closest('button');
      expect(confirm).not.toBeDisabled();
    });
  });

  describe('catalog loading resilience', () => {
    it('degrades gracefully (no crash, both actions disabled) when invoiceAccounts rejects', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) return Promise.reject(new Error('network error'));
        if (path.includes('invoicePaymentMethods')) return jsonRes({ items: [{ id: 'm-1', label: 'Transfer' }] });
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      // no accounts resolved -> accountId stays empty -> missingRequired is
      // true -> both footer actions are disabled instead of crashing, and the
      // modal itself keeps rendering normally (no thrown error).
      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
      expect(screen.getByTestId('cp-new-payment-modal')).toBeInTheDocument();
      expect(props.onSaved).not.toHaveBeenCalled();
    });
  });

  describe('fetchPendingSchedule (no scheduleId prop)', () => {
    it('resolves the scheduleId from the first outstanding installment in the payment plan', async () => {
      mockApiFetch = buildApiFetch({
        plan: [
          { finPaymentScheduleID: 'sched-paid', outstandingAmount: '0' },
          { finPaymentScheduleID: 'sched-pending', outstandingAmount: '400' },
        ],
      });
      renderModal({ scheduleId: undefined });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).scheduleId).toBe('sched-pending');
      });
    });

    it('resolves scheduleId to empty (no crash) when the paymentPlan request rejects', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) return jsonRes({ items: [{ id: 'acc-1', label: 'Main Account' }] });
        if (path.includes('invoicePaymentMethods')) return jsonRes({ items: [{ id: 'm-1', label: 'Transfer' }] });
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return Promise.reject(new Error('network error'));
        return jsonRes({});
      });
      renderModal({ scheduleId: undefined });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      // loading resolves without throwing; scheduleId stays empty so Guardar
      // surfaces the paymentRequestFailed validation instead of crashing.
      fireEvent.click(screen.getByText('save').closest('button'));
      await waitFor(() => expect(screen.getByText('paymentRequestFailed')).toBeInTheDocument());
    });

    it('falls back to plan[0] when no installment has an outstanding amount', async () => {
      mockApiFetch = buildApiFetch({
        plan: [
          { finPaymentScheduleID: 'sched-first', outstandingAmount: '0' },
          { finPaymentScheduleID: 'sched-second', outstandingAmount: '0' },
        ],
      });
      renderModal({ scheduleId: undefined });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).scheduleId).toBe('sched-first');
      });
    });
  });

  describe('submit', () => {
    it('Guardar posts registerPayment with process "draft"', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.click(screen.getByText('save').closest('button'));

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        expect(body.process).toBe('draft');
        expect(body.scheduleId).toBe('sched-1');
        expect(body.actual_payment).toBe('1000');
        expect(body.fin_financial_account_id).toBe('acc-1');
      });
    });

    it('Confirmar posts registerPayment with process "confirm"', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).process).toBe('confirm');
      });
    });

    it('invokes onSaved with the deposited state on a successful confirm', async () => {
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);
      await waitFor(() => {
        expect(props.onSaved).toHaveBeenCalledWith(expect.any(Object), 'deposited');
      });
    });

    it('surfaces an error and does not call onSaved when the API fails', async () => {
      mockApiFetch = buildApiFetch({ register: {}, registerOk: false });
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.click(screen.getByText('save').closest('button'));
      await waitFor(() => {
        expect(screen.getByText('cpSaveFailed')).toBeInTheDocument();
      });
      expect(props.onSaved).not.toHaveBeenCalled();
    });

    it('shows paymentRequestFailed and does not POST when no scheduleId could be resolved', async () => {
      mockApiFetch = buildApiFetch({ plan: [] });
      const { props } = renderModal({ scheduleId: undefined });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.click(screen.getByText('save').closest('button'));

      await waitFor(() => {
        expect(screen.getByText('paymentRequestFailed')).toBeInTheDocument();
      });
      const registerCall = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
      expect(registerCall).toBeFalsy();
      expect(props.onSaved).not.toHaveBeenCalled();
    });

    it('disables Guardar/Confirmar and does not POST when no account could be resolved', async () => {
      mockApiFetch = buildApiFetch({ accounts: [] });
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // no accounts resolved -> accountId stays '' -> missingRequired is true,
      // so both footer buttons are disabled and the click never fires submit().
      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();

      const registerCall = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
      expect(registerCall).toBeFalsy();
      expect(props.onSaved).not.toHaveBeenCalled();
    });

    it('shows the generic cpSaveFailed error when a failed register response has no parseable JSON body', async () => {
      // res.ok=false so submit() throws via extractSaveError(json, ui); json
      // resolves to null because res.json() rejects (malformed/empty body),
      // exercising the `res.json().catch(() => null)` fallback on line 363.
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) return jsonRes({ items: [{ id: 'acc-1', label: 'Main Account' }] });
        if (path.includes('invoicePaymentMethods')) return jsonRes({ items: [{ id: 'm-1', label: 'Transfer' }] });
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        if (path.includes('registerPayment')) {
          return { ok: false, json: () => Promise.reject(new Error('malformed body')) };
        }
        return jsonRes({});
      });
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.click(screen.getByText('save').closest('button'));

      await waitFor(() => {
        expect(screen.getByText('cpSaveFailed')).toBeInTheDocument();
      });
      expect(props.onSaved).not.toHaveBeenCalled();
    });

    it('sends overpaymentAction "leave-credit" by default when excess is left as credit (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      // Leave the default "credit" resolution selected (do not click "Dar vuelto").
      fireEvent.click(screen.getByText('cpLeaveCredit').closest('button'));
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).overpaymentAction).toBe('leave-credit');
      });
    });

    it('sends overpaymentAction "refund" when "Dar vuelto" is selected (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      fireEvent.click(screen.getByText('cpGiveChange').closest('button'));
      const confirm = screen.getByText('cpConfirm').closest('button');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).overpaymentAction).toBe('refund');
      });
    });
  });

  describe('close', () => {
    it('calls onClose from the footer Cancelar button', async () => {
      const { props } = renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.click(screen.getByText('cancel').closest('button'));
      expect(props.onClose).toHaveBeenCalled();
    });
  });

  // ETP-4005 "date required" validation, ported into NewPaymentEntryModal.
  describe('date validation', () => {
    it('disables Confirmar when the date field is cleared', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());

      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });
      expect(confirm).toBeDisabled();
    });

    it('disables Guardar when the date is cleared (missingRequired blocks the click before submit() can validate)', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });

      // date is now '' -> missingRequired is true -> Guardar is disabled, so
      // the click never invokes submit()'s own paymentDateRequired check.
      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
    });

    it('does not POST registerPayment when the date is cleared (Guardar disabled, no click reaches submit)', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });

      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      // clicking a disabled button fires no onClick — submit() never runs.
      fireEvent.click(screen.getByTestId('cp-save-draft'));

      const registerCall = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
      expect(registerCall).toBeFalsy();
    });

    it('re-enables Guardar/Confirmar once a valid date is entered again after clearing it', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('cp-save-draft')).toBeDisabled());
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();

      // Because both footer buttons are disabled whenever date is empty, the
      // submit()-driven dateInvalid/red-border path is no longer reachable via
      // the UI (clicking a disabled button fires no onClick). The remaining
      // observable contract is: re-populating the date clears missingRequired
      // and re-enables both actions.
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '2026-05-10' } });

      const saveDraft = screen.getByTestId('cp-save-draft');
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(saveDraft).not.toBeDisabled());
      expect(confirm).not.toBeDisabled();
    });
  });

  // ETP-4331: payment method defaults from the invoice, and the account list
  // filters to only those that support the selected method.
  describe('default payment method / account (ETP-4331)', () => {
    it('defaults the method to the invoice\'s own defaultMethodId when present', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultPaymentMethod: 'Transfer' },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultPaymentMethod: 'Transfer' },
            ],
            defaultMethodId: 'm-cash',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-transfer', label: 'Transfer' }, { id: 'm-cash', label: 'Cash' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // The invoice's own method (Cash / m-cash) wins over the old
      // defaultPaymentMethod-name-matching heuristic (which would have picked Transfer).
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Cash');
      // Both accounts support m-cash, so the first one (Caja) is selected.
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Caja');
    });

    it('falls back to pickMethodId when defaultMethodId is absent from invoiceAccounts', async () => {
      mockApiFetch = buildApiFetch({
        accounts: [{ id: 'acc-1', label: 'Main Account', defaultPaymentMethod: 'Transfer' }],
        methods: [{ id: 'm-1', label: 'Transfer' }, { id: 'm-2', label: 'Cash' }],
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // No defaultMethodId on the response -> legacy heuristic matches the
      // account's defaultPaymentMethod name ("Transfer") against the method list.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer');
    });

    it('falls back to pickMethodId when defaultMethodId does not match any known method', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [{ id: 'acc-1', label: 'Main Account', defaultPaymentMethod: 'Cash' }],
            defaultMethodId: 'm-unknown',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-1', label: 'Transfer' }, { id: 'm-2', label: 'Cash' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // defaultMethodId ("m-unknown") isn't in methList -> falls back to the
      // account's defaultPaymentMethod name match ("Cash").
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Cash');
    });
  });

  // NOTE ON INTERACTION SCOPE (ETP-4331): the "Método de pago" CreatableSearchSelect
  // is mounted with `staticOptions={methods}` and NO remount `key`, unlike the
  // account selector (which deliberately uses `key={`account-${methodId}`}`).
  // CreatableSearchSelect seeds its internal `options` state from `staticOptions`
  // only once, on mount (`useState(staticOptions ?? [])`), and its fetch effect
  // short-circuits whenever `staticOptions` is truthy (see CreatableSearchSelect.jsx
  // line ~136: `if (staticOptions) return;`). Because `methods` is always `[]` at
  // the modal's very first render (the catalog fetch is async), the method dropdown's
  // options are permanently stuck at `[]` for the lifetime of the mounted modal —
  // confirmed via screen.debug(): the panel renders "noResultsFor" for any query,
  // even after `methods` state is populated. This means a user currently CANNOT
  // change the payment method via the dropdown once the modal is open — this is a
  // pre-existing product bug in NewPaymentEntryModal.jsx (not something introduced
  // by this test file), reported separately; per policy this test suite does not
  // patch the source. The tests below exercise the method-dependent account
  // filtering through the reachable code path — the initial default-method
  // resolution — which drives the exact same `methodId` state and the same
  // `filteredAccounts`/`key={account-${methodId}}` remount machinery that would
  // also run on a (currently unreachable) manual method change.
  describe('account filtering by selected payment method (ETP-4331)', () => {
    it('narrows the account dropdown to only accounts that support the resolved default method', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultPaymentMethod: 'Cash' },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultPaymentMethod: 'Cash' },
            ],
            defaultMethodId: 'm-transfer',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Default method resolves to Transfer; Caja doesn't support it, so the
      // first supporting account (Banco) is auto-selected instead.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer');
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Banco');

      // The account dropdown itself must not offer Caja as an option for Transfer.
      fireEvent.click(screen.getByTestId('field-account-chip'));
      const accountInput = await screen.findByTestId('field-account');
      fireEvent.focus(accountInput);
      fireEvent.change(accountInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-account')).toBeInTheDocument());
      expect(screen.queryByTestId('option-account-acc-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('option-account-acc-2')).toBeInTheDocument();
    });

    it('keeps offering an account that supports the resolved method alongside others that do not', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultPaymentMethod: 'Cash' },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultPaymentMethod: 'Cash' },
            ],
            defaultMethodId: 'm-cash',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Cash is supported by both accounts -> Caja (first in list) stays selected.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Cash');
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Caja');

      // Both accounts remain selectable for Cash.
      fireEvent.click(screen.getByTestId('field-account-chip'));
      const accountInput = await screen.findByTestId('field-account');
      fireEvent.focus(accountInput);
      fireEvent.change(accountInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-account')).toBeInTheDocument());
      expect(screen.getByTestId('option-account-acc-1')).toBeInTheDocument();
      expect(screen.getByTestId('option-account-acc-2')).toBeInTheDocument();
    });
  });

  // ETP-4331: default account selection now mirrors Classic's priority order —
  // BP-preferred account (if it supports the method) > defaultForMethodIds flag
  // > first supporting account (legacy) > first account overall.
  describe('default account selection hierarchy (ETP-4331)', () => {
    it('tier 1 — selects the BP-preferred account when it supports the resolved method', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultForMethodIds: ['m-cash'] },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultForMethodIds: ['m-transfer'] },
            ],
            defaultMethodId: 'm-cash',
            bpPreferredAccountId: 'acc-2',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // acc-2 (Banco) is the BP-preferred account and it supports m-cash, so it
      // wins over acc-1 (alphabetically first AND flagged default for m-cash).
      expect(await screen.findByTestId('field-account-chip')).toHaveTextContent('Banco');
    });

    it('tier 1 skipped — falls through to the defaultForMethodIds flag when the BP-preferred account does not support the method', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultForMethodIds: ['m-cash'] },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-transfer'], defaultForMethodIds: ['m-transfer'] },
            ],
            defaultMethodId: 'm-cash',
            // BP-preferred account (Banco) does NOT support m-cash.
            bpPreferredAccountId: 'acc-2',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Banco is skipped (doesn't support m-cash) -> falls to tier 2: Caja is
      // flagged default for m-cash.
      expect(await screen.findByTestId('field-account-chip')).toHaveTextContent('Caja');
    });

    it('tier 2 — the defaultForMethodIds flag wins over alphabetical order when there is no BP preference', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          // No bpPreferredAccountId in the response. Both accounts support
          // m-cash, but only the second one (alphabetically) is flagged default.
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultForMethodIds: [] },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash'], defaultForMethodIds: ['m-cash'] },
            ],
            defaultMethodId: 'm-cash',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Banco is flagged default for m-cash -> wins over Caja despite being
      // second alphabetically and despite Caja also supporting the method.
      expect(await screen.findByTestId('field-account-chip')).toHaveTextContent('Banco');
    });

    it('tier 3 — falls back to the first supporting account (legacy behavior) when neither BP preference nor default flag apply', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultPaymentMethod: 'Cash' },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultPaymentMethod: 'Cash' },
            ],
            defaultMethodId: 'm-cash',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // No bpPreferredAccountId, no defaultForMethodIds match -> first account
      // that supports m-cash wins (Caja, first in list).
      expect(await screen.findByTestId('field-account-chip')).toHaveTextContent('Caja');
    });

    // Per the note above ("INTERACTION SCOPE"), the payment-method select DOES
    // remount once, from key="method-loading" to key="method-loaded", right when
    // `loading` flips to false — the same render that first exposes a non-empty
    // `methods` staticOptions list. That single remount is exactly when a real
    // user's first method change becomes possible, so we drive it the same way
    // the account-filtering tests already do: open the dropdown via its chip and
    // click a different option.
    it('re-applies the hierarchy on method change (not just initial load)', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultForMethodIds: ['m-cash'] },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultForMethodIds: ['m-transfer'] },
            ],
            defaultMethodId: 'm-cash',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Initial load: m-cash resolves, Caja is the flagged default for m-cash.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Cash');
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Caja');

      // Change the payment method to Transfer via the method select.
      fireEvent.click(screen.getByTestId('field-paymentMethod-chip'));
      const methodInput = await screen.findByTestId('field-paymentMethod');
      fireEvent.focus(methodInput);
      fireEvent.change(methodInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-paymentMethod')).toBeInTheDocument());
      // The option button only wires `onMouseDown` (with preventDefault, so the
      // input never loses focus mid-selection) — mirroring CreatableSearchSelect's
      // actual event wiring, `fireEvent.mouseDown` is required here; a plain
      // `fireEvent.click` does not reliably trigger it under jsdom.
      fireEvent.mouseDown(screen.getByTestId('option-paymentMethod-m-transfer'));

      // For Transfer, Banco is the flagged default (Caja no longer supports it
      // anyway) -> the account reselects to Banco, not just "first supporting".
      await waitFor(() => expect(screen.getByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer'));
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Banco');
    });
  });

  // Regression for the bug fixed alongside ETP-4331's default-account hierarchy:
  // clearing "Cuenta" and then clearing "Método de pago" must leave the account
  // cleared — accountSupportsMethod(a, methodId) vacuously returns true for a
  // falsy methodId, so without the `if (!methodId) return '';` guard in
  // pickDefaultAccountId, clearing the method used to silently refill the
  // account with the BP-preferred (or otherwise defaulted) account.
  describe('clearing account then method must not silently refill the account (bug fix)', () => {
    it('leaves the account empty after clearing "Cuenta" and then clearing "Método de pago"', async () => {
      // Same BP-preferred-account setup as the tier-1 hierarchy test above:
      // acc-2 (Banco) is bpPreferredAccountId and supports the resolved method,
      // so it would normally win tier 1 of pickDefaultAccountId.
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', paymentMethodIds: ['m-cash'], defaultForMethodIds: ['m-cash'] },
              { id: 'acc-2', label: 'Banco', paymentMethodIds: ['m-cash', 'm-transfer'], defaultForMethodIds: ['m-transfer'] },
            ],
            defaultMethodId: 'm-cash',
            bpPreferredAccountId: 'acc-2',
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Sanity: the catalogs settled and the account auto-selected to the
      // BP-preferred account (Banco), same as the tier-1 hierarchy test.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Cash');
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Banco');

      // 1. Clear the "Cuenta" field via the chip's X button.
      const accountChip = screen.getByTestId('field-account-chip');
      const accountClearBtn = accountChip.querySelector('[aria-label="clear"]');
      expect(accountClearBtn).not.toBeNull();
      fireEvent.mouseDown(accountClearBtn);

      // The account is now cleared — the chip is gone, the plain input shows.
      await waitFor(() => expect(screen.queryByTestId('field-account-chip')).not.toBeInTheDocument());
      expect(screen.getByTestId('field-account')).toHaveValue('');
      // Both actions are disabled while accountId is empty (missingRequired).
      expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();

      // 2. THEN clear the "Método de pago" field the same way.
      const methodChip = screen.getByTestId('field-paymentMethod-chip');
      const methodClearBtn = methodChip.querySelector('[aria-label="clear"]');
      expect(methodClearBtn).not.toBeNull();
      fireEvent.mouseDown(methodClearBtn);

      // The method is now cleared too.
      await waitFor(() => expect(screen.queryByTestId('field-paymentMethod-chip')).not.toBeInTheDocument());
      expect(screen.getByTestId('field-paymentMethod')).toHaveValue('');

      // Core regression assertion: the account must NOT have been silently
      // refilled by clearing the method (it stays cleared — no chip, no value).
      expect(screen.queryByTestId('field-account-chip')).not.toBeInTheDocument();
      expect(screen.getByTestId('field-account')).toHaveValue('');

      // Both required fields are empty, so both footer actions stay disabled.
      expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });
  });

  describe('legacy backend compatibility: accounts without paymentMethodIds (ETP-4331)', () => {
    it('shows all accounts regardless of the resolved method when paymentMethodIds is absent (old backend shape)', async () => {
      mockApiFetch = vi.fn(async (path) => {
        if (path.includes('invoiceAccounts')) {
          // Old backend shape: no paymentMethodIds field on any account at all,
          // and no top-level defaultMethodId either.
          return jsonRes({
            items: [
              { id: 'acc-1', label: 'Caja', defaultPaymentMethod: 'Transfer' },
              { id: 'acc-2', label: 'Banco', defaultPaymentMethod: 'Transfer' },
            ],
          });
        }
        if (path.includes('invoicePaymentMethods')) {
          return jsonRes({ items: [{ id: 'm-cash', label: 'Cash' }, { id: 'm-transfer', label: 'Transfer' }] });
        }
        if (path.includes('invoiceCreditSources')) return jsonRes({ items: [] });
        if (path.includes('paymentPlan')) return jsonRes({ response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '1000' }] } });
        return jsonRes({});
      });
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // No paymentMethodIds on either account -> accountSupportsMethod treats
      // `undefined` as "always matches", so both stay selectable for whichever
      // method is resolved (here: legacy heuristic picks Transfer).
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer');

      fireEvent.click(screen.getByTestId('field-account-chip'));
      const accountInput = await screen.findByTestId('field-account');
      fireEvent.focus(accountInput);
      fireEvent.change(accountInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-account')).toBeInTheDocument());
      expect(screen.getByTestId('option-account-acc-1')).toBeInTheDocument();
      expect(screen.getByTestId('option-account-acc-2')).toBeInTheDocument();
    });
  });

  // ETP-4406: Salt Edge PIS bank transfer block for purchase-invoice payments.
  describe('PIS bank transfer (ETP-4406)', () => {
    let openSpy;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    });

    afterEach(() => {
      openSpy.mockRestore();
    });

    describe('visibility gate', () => {
      it('shows the PIS block when the account is PSD2-connected, the method is a transfer, dir is "out", and the currency is EUR', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        expect(await screen.findByTestId('cp-pis-section')).toBeInTheDocument();
        expect(screen.getByText('cpPisTitle')).toBeInTheDocument();
      });

      it('hides the PIS block for a receipt (dir "in"), even with an otherwise-eligible account/method/currency', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'in' });
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('cp-pis-section')).not.toBeInTheDocument();
      });

      it('hides the PIS block when the selected account is not PSD2-connected', async () => {
        mockApiFetch = buildPisApiFetch({
          accounts: [{ id: 'acc-1', label: 'Banco Clásico', psd2Connected: false }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('cp-pis-section')).not.toBeInTheDocument();
      });

      it('hides the PIS block when the resolved payment method is not a transfer', async () => {
        mockApiFetch = buildPisApiFetch({
          methods: [{ id: 'm-1', label: 'Efectivo' }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('cp-pis-section')).not.toBeInTheDocument();
      });

      it('hides the PIS block when the invoice currency is not EUR or GBP', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({
          dir: 'out', specName: 'purchase-invoice',
          invoiceData: { ...INVOICE, 'currency$_identifier': 'USD' },
        });
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('cp-pis-section')).not.toBeInTheDocument();
      });
    });

    describe('confirm request body', () => {
      it('sends pis:true only on Confirmar when the block is active, leaving Guardar (draft) unchanged', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        fireEvent.click(screen.getByTestId('cp-save-draft'));
        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
          expect(call).toBeTruthy();
          const body = JSON.parse(call[1].body);
          expect(body.process).toBe('draft');
          expect(body.pis).toBeUndefined();
        });
      });

      it('sends pis:true plus the SEPA template + creditor IBAN on Confirmar (EUR default)', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
          expect(call).toBeTruthy();
          const body = JSON.parse(call[1].body);
          expect(body.process).toBe('confirm');
          expect(body.pis).toBe(true);
          // EUR invoice defaults the template to SEPA and preselects the supplier's IBAN.
          expect(body.pisTemplate).toBe('SEPA');
          // ETP-4406: buildPisPaymentFields now normalizes the IBAN (strips the
          // display spaces, upper-cases) via normalizeIban before sending it.
          expect(body.pisCreditorIban).toBe('ES9121000418450200051332');
        });
      });

      it('does not send a pis field at all on the regular (non-PIS) confirm path — regression guard', async () => {
        // Default buildApiFetch() account has no psd2Connected flag -> block never renders.
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
        expect(screen.queryByTestId('cp-pis-section')).not.toBeInTheDocument();

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
          expect(call).toBeTruthy();
          const body = JSON.parse(call[1].body);
          expect(body).not.toHaveProperty('pis');
        });
      });
    });

    describe('template-driven creditor fields', () => {
      // CreatableSearchSelect derives its own testids from field.key, so IBAN/template presence
      // is asserted via their <label> text (the useUI mock echoes the key); the BBAN/sort-code/
      // account-number plain inputs expose explicit data-testids.
      it('shows only the IBAN field for the default SEPA template (EUR invoice)', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        expect(await screen.findByText('cpPisIbanLabel', { selector: 'label' })).toBeInTheDocument();
        expect(screen.queryByTestId('cp-pis-bban')).not.toBeInTheDocument();
        expect(screen.queryByTestId('cp-pis-sort-code')).not.toBeInTheDocument();
        expect(screen.queryByTestId('cp-pis-account-number')).not.toBeInTheDocument();
      });

      it('shows sort code + account number (and hides IBAN) for the FPS template (GBP invoice)', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({
          dir: 'out', specName: 'purchase-invoice',
          invoiceData: { ...INVOICE, 'currency$_identifier': 'GBP' },
        });
        await screen.findByTestId('cp-pis-section');

        expect(await screen.findByTestId('cp-pis-sort-code')).toBeInTheDocument();
        expect(screen.getByTestId('cp-pis-account-number')).toBeInTheDocument();
        expect(screen.queryByText('cpPisIbanLabel', { selector: 'label' })).not.toBeInTheDocument();
      });

      it('keeps Confirmar disabled for FPS until sort code + account number are filled, then sends them', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({
          dir: 'out', specName: 'purchase-invoice',
          invoiceData: { ...INVOICE, 'currency$_identifier': 'GBP' },
        });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        const sortCode = await screen.findByTestId('cp-pis-sort-code');
        // Both FPS fields empty -> confirm blocked.
        await waitFor(() => expect(confirm).toBeDisabled());

        fireEvent.change(sortCode, { target: { value: '123456' } });
        fireEvent.change(screen.getByTestId('cp-pis-account-number'), { target: { value: '12345678' } });
        await waitFor(() => expect(confirm).not.toBeDisabled());

        fireEvent.click(confirm);
        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
          expect(call).toBeTruthy();
          const body = JSON.parse(call[1].body);
          expect(body.pisTemplate).toBe('FPS');
          expect(body.pisCreditorSortCode).toBe('123456');
          expect(body.pisCreditorAccountNumber).toBe('12345678');
          expect(body.pisCreditorIban).toBeUndefined();
        });
      });
    });

    // ETP-4406: the SEPA "IBAN Destino" is validated with the shared isValidIban
    // (ISO 13616 mod-97). A structurally invalid IBAN surfaces an inline error and
    // keeps Confirmar disabled (via pisReady → confirmDisabled); a valid one clears
    // the error and, with the other required fields satisfied, re-enables Confirmar.
    describe('IBAN validation (SEPA — ETP-4406)', () => {
      const VALID_IBAN = 'DE89370400440532013000';
      const INVALID_IBAN = 'DE00370400440532013000';

      it('shows the inline IBAN error and disables Confirmar when the preselected supplier IBAN is structurally invalid', async () => {
        mockApiFetch = buildPisApiFetch({
          pisAccounts: [{ id: INVALID_IBAN, name: 'Cuenta inválida', iban: INVALID_IBAN, default: true }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        // The invalid IBAN is the only gate here: amount/date/method/account are all
        // satisfied by the default catalog + exact balance, so a disabled Confirmar
        // isolates the IBAN validation (pisReady=false) as the cause.
        expect(await screen.findByTestId('cp-pis-iban-error')).toBeInTheDocument();
        expect(screen.getByTestId('cp-pis-iban-error')).toHaveTextContent('financeAccountsNewIbanInvalid');
        await waitFor(() => expect(screen.getByTestId('cp-confirm')).toBeDisabled());
      });

      it('shows no IBAN error and enables Confirmar when the preselected supplier IBAN is valid', async () => {
        mockApiFetch = buildPisApiFetch({
          pisAccounts: [{ id: VALID_IBAN, name: 'Cuenta válida', iban: VALID_IBAN, default: true }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        // A valid IBAN clears the inline error and, with every other required field
        // satisfied, leaves Confirmar enabled.
        await waitFor(() => expect(screen.getByTestId('cp-confirm')).not.toBeDisabled());
        expect(screen.queryByTestId('cp-pis-iban-error')).not.toBeInTheDocument();
      });

      it('does not POST registerPayment while the IBAN is invalid (Confirmar stays disabled)', async () => {
        mockApiFetch = buildPisApiFetch({
          pisAccounts: [{ id: INVALID_IBAN, name: 'Cuenta inválida', iban: INVALID_IBAN, default: true }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        await waitFor(() => expect(screen.getByTestId('cp-confirm')).toBeDisabled());
        // Clicking a disabled button fires no onClick — submit() never runs.
        fireEvent.click(screen.getByTestId('cp-confirm'));

        const registerCall = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(registerCall).toBeFalsy();
      });

      it('sends the valid IBAN normalized (no spaces, upper-cased) in the confirm body', async () => {
        mockApiFetch = buildPisApiFetch({
          pisAccounts: [{ id: 'de89 3704 0044 0532 0130 00', name: 'Cuenta válida', iban: 'de89 3704 0044 0532 0130 00', default: true }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
          expect(call).toBeTruthy();
          const body = JSON.parse(call[1].body);
          expect(body.pisTemplate).toBe('SEPA');
          // normalizeIban(' de89 3704 ... ') -> 'DE89370400440532013000'.
          expect(body.pisCreditorIban).toBe(VALID_IBAN);
        });
      });
    });

    describe('SCA widget + status polling', () => {
      // Real timers on purpose: the component's poll interval is a plain
      // `setTimeout(..., 3000)`, and fake timers deadlock against Testing
      // Library's own `waitFor`/`findBy*` (which also poll via `setTimeout`).
      // These three tests wait out the real 3s interval instead, with a
      // per-test timeout generous enough for two polls.

      it('opens the Salt Edge widget and calls onSaved("deposited") once polling reaches "executed"', async () => {
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['authorizing', 'executed'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();
        // Opened as a popup window (named target + window features), not a browser tab.
        expect(openSpy).toHaveBeenCalledWith(
          'https://saltedge.example/widget/abc',
          'saltEdgePisWidget',
          expect.stringContaining('popup=yes'));
        expect(screen.getByText('cpPisStatusRequested')).toBeInTheDocument();

        // First poll (~3s) -> "authorizing".
        await waitFor(() => expect(screen.getByText('cpPisStatusAuthorizing')).toBeInTheDocument(),
          { timeout: 4500 });

        // Second poll (~3s) -> "executed", which resolves the wait and calls onSaved.
        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'pay-1' }), 'deposited'), { timeout: 4500 });
        expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument();
      }, 12000);

      it('shows an inline error and does not call onSaved when polling reaches a terminal non-executed status', async () => {
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['failed'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        await waitFor(() => expect(screen.getByText('cpPisFailedError')).toBeInTheDocument(),
          { timeout: 4500 });
        expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument();
        expect(props.onSaved).not.toHaveBeenCalled();
      }, 8000);

      it('lets the user cancel the wait and return to the editable form', async () => {
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['authorizing'],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('cp-pis-cancel-wait'));
        expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument();
        expect(screen.getByTestId('cp-confirm')).toBeInTheDocument();
      });

      it('undoes the PPM payment on cancel — posts cancelPisPayment and refreshes via onSaved', async () => {
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['authorizing'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('cp-pis-cancel-wait'));

        // Reactivate + delete is delegated to the backend, keyed by the local PIS payment id.
        await waitFor(() => {
          const call = mockApiFetch.mock.calls.find(c => c[0].includes('cancelPisPayment'));
          expect(call).toBeTruthy();
          expect(JSON.parse(call[1].body).pisPaymentId).toBe('pis-1');
        });
        // The invoice/history is refreshed so the undone payment no longer shows as paid.
        await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
      });

      // Regression coverage for the pisReturnedRef fix: the popup now auto-closes on its own
      // once PisCallbackPage.jsx posts back `{ type: 'pis-completed' }`, so a closed popup must
      // no longer be treated as "the user bailed out early" once that message was received.
      describe('popup auto-close after pis-completed postMessage', () => {
        it('does not show the "window closed" warning when the popup closes after a pis-completed message', async () => {
          const fakePopup = { closed: false, close: vi.fn() };
          openSpy.mockImplementation(() => fakePopup);
          mockApiFetch = buildPisApiFetch({
            register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
            pisStatusSequence: ['authorizing', 'authorizing', 'authorizing'],
          });
          renderModal({ dir: 'out', specName: 'purchase-invoice' });
          await screen.findByTestId('cp-pis-section');

          const confirm = screen.getByTestId('cp-confirm');
          await waitFor(() => expect(confirm).not.toBeDisabled());
          fireEvent.click(confirm);
          expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

          // The bank auth completes: PisCallbackPage posts back to the opener, then the popup
          // auto-closes itself — both happen before the next ~3s poll tick fires.
          act(() => {
            window.dispatchEvent(new MessageEvent('message', {
              data: { type: 'pis-completed', paymentId: 'pis-1' },
              origin: window.location.origin,
            }));
          });
          fakePopup.closed = true;

          // Wait past the poll tick that runs the "is the popup closed" heuristic — asserted via
          // a second pisPaymentStatus call, since the closed-check runs synchronously before it.
          await waitFor(() => {
            const calls = mockApiFetch.mock.calls.filter(c => c[0].includes('pisPaymentStatus'));
            expect(calls.length).toBeGreaterThanOrEqual(2);
          }, { timeout: 8000 });

          expect(screen.queryByTestId('cp-pis-reopen')).not.toBeInTheDocument();
          expect(screen.queryByText('cpPisWindowClosed')).not.toBeInTheDocument();
          expect(screen.getByText('cpPisStatusAuthorizing')).toBeInTheDocument();
        }, 12000);

        it('still shows the "window closed" warning + reopen button when the popup closes without a pis-completed message', async () => {
          const fakePopup = { closed: false, close: vi.fn() };
          openSpy.mockImplementation(() => fakePopup);
          mockApiFetch = buildPisApiFetch({
            register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
            pisStatusSequence: ['authorizing', 'authorizing', 'authorizing'],
          });
          renderModal({ dir: 'out', specName: 'purchase-invoice' });
          await screen.findByTestId('cp-pis-section');

          const confirm = screen.getByTestId('cp-confirm');
          await waitFor(() => expect(confirm).not.toBeDisabled());
          fireEvent.click(confirm);
          expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

          // The user closes the Salt Edge window early — no pis-completed message ever arrives.
          fakePopup.closed = true;

          expect(await screen.findByTestId('cp-pis-reopen', {}, { timeout: 4500 })).toBeInTheDocument();
          expect(screen.getByText('cpPisWindowClosed')).toBeInTheDocument();

          // Reopening opens a fresh popup and clears the warning.
          fireEvent.click(screen.getByTestId('cp-pis-reopen'));
          expect(openSpy).toHaveBeenCalledWith(
            'https://saltedge.example/widget/abc',
            'saltEdgePisWidget',
            expect.stringContaining('popup=yes'));
          expect(screen.queryByTestId('cp-pis-reopen')).not.toBeInTheDocument();
        }, 8000);
      });
    });
  });
});
