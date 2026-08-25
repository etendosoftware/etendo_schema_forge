// Mocks must be hoisted before imports (Vitest hoisting)
// NOTE (ETP-4314): the mock now interpolates params (rather than swallowing them)
// so fmtCur()'s output (ExcessBand's excess amount, the PIS "dinero"/"credito"
// clauses) actually reaches the DOM — needed for the thousands-grouping
// regressions below. Calls made with no params still return the bare key, so
// every other `getByText('someKey')` exact-match assertion in this file is
// unaffected (only 'cpExcessInline', which IS called with params, was updated
// to a regex match accordingly).
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

// NOTE: `@/lib/formatCurrency` is intentionally NOT mocked. MoneyAmount now delegates to the
// real shared util, which formats en-US with a narrowSymbol (USD→"$92.00", EUR→"92.00 €",
// GBP→"£92.00"). The old crude stub here hardcoded a leading "$" and ignored the currency code,
// which masked the account-currency symbol on the multi-currency readout — using the real,
// dependency-free util keeps these assertions faithful to what the running app renders.

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

// The modal reads the bearer token from AuthContext (ETP-4504 added the
// multi-currency hooks, which need it) — a static token is enough for the mock.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// ── multi-currency hooks (ETP-4504) ──────────────────────────────────────────
// useDocumentCurrency resolves the org currency (gates the "leave credit" excess
// option); useConversionRate prefills the editable conversion rate. Both are
// mocked with module-level, per-test-configurable values so each test can drive
// canLeaveCredit / the foreign-currency conversion path deterministically without
// a network round-trip. Reset in beforeEach.
let mockOrgCurrency = 'EUR';
vi.mock('../useDocumentCurrency.js', () => ({
  useDocumentCurrency: () => ({
    orgCurrencyCode: mockOrgCurrency,
    exchangeRate: null,
    isSameCurrency: true,
    loading: false,
    convertAmount: (x) => x,
  }),
}));

let mockConversion = { rate: null, hasRate: false, loading: false };
vi.mock('../useConversionRate.js', () => ({
  // Returns the module-level value. A test may assign a FUNCTION instead of a
  // plain object, in which case it is invoked with the hook args
  // ({ fromCode, toCode, ... }) so a scenario can vary the prefilled rate per
  // currency pair (ETP-4504 W1 — rate cleared when switching to a pair with no
  // DB rate). A plain object is returned as-is (the common single-pair case).
  useConversionRate: (args) => (typeof mockConversion === 'function' ? mockConversion(args) : mockConversion),
}));

import { useState } from 'react';
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
 * bankConnected account, a transfer-like payment method, and a supplier
 * IBAN list — plus overrides for the registerPayment response and the
 * pisPaymentStatus sequence returned across successive polls.
 */
function buildPisApiFetch(cfg = {}) {
  const {
    accounts = [{ id: 'acc-1', label: 'Banco PIS', bankConnected: true, maskedPan: '****1234' }],
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
    // Default: org currency equals the (EUR) invoice currency, so a receipt may
    // leave an overpayment as credit; no conversion prefill (same-currency path).
    mockOrgCurrency = 'EUR';
    mockConversion = { rate: null, hasRate: false, loading: false };
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

  // Edit mode (re-opening an existing draft via the `payment` prop) — covers
  // modalTitleFor's isEdit branches, the isEdit prefill block, normalizeDraftDate,
  // and matchMethodIdByName, none of which run under the default (create) mode
  // exercised by every other test in this file.
  describe('edit mode (payment prop present)', () => {
    it('shows the edit-collection title and prefills method/account/amount/date from the draft', async () => {
      mockApiFetch = buildApiFetch();
      renderModal({
        dir: 'in',
        payment: { id: 'pay-edit-1', paymentDate: '2024-05-10', paymentMethod: 'Transfer', accountId: 'acc-1', amount: 500 },
      });

      expect(screen.getByText('cpEditCollection')).toBeInTheDocument();
      expect(screen.queryByText('cpNewCollection')).not.toBeInTheDocument();

      // normalizeDraftDate matches the 'YYYY-MM-DD' prefix regex and returns it as-is.
      await waitFor(() => expect(screen.getByTestId('date-field')).toHaveValue('2024-05-10'));
      // matchMethodIdByName finds 'Transfer' in the method catalog by name.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer');
      // payment.accountId is used directly (no default-account heuristic needed).
      expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Main Account');
      // balance.onAmountChange(formatPlain(payment.amount)) prefills the cash amount.
      await waitFor(() => expect(screen.getByTestId('cp-amount-input')).toHaveValue('500.00'));
    });

    it('shows the edit-payment title for dir "out"', () => {
      mockApiFetch = buildApiFetch();
      renderModal({
        dir: 'out',
        payment: { id: 'pay-edit-2', paymentDate: '2024-05-10', paymentMethod: 'Transfer', accountId: 'acc-1', amount: 500 },
      });
      expect(screen.getByText('cpEditPayment')).toBeInTheDocument();
      expect(screen.queryByText('cpNewPayment')).not.toBeInTheDocument();
    });

    it('falls back to today when the draft date does not match the yyyy-MM-dd prefix and is unparseable', async () => {
      mockApiFetch = buildApiFetch();
      renderModal({
        payment: { id: 'pay-edit-3', paymentDate: 'not-a-real-date', paymentMethod: 'Transfer', accountId: 'acc-1', amount: 10 },
      });
      const today = new Date().toISOString().slice(0, 10);
      expect(screen.getByTestId('date-field')).toHaveValue(today);
    });

    it('parses a non-yyyy-MM-dd but valid date string via the Date fallback branch', async () => {
      mockApiFetch = buildApiFetch();
      renderModal({
        payment: { id: 'pay-edit-4', paymentDate: '03/05/2024', paymentMethod: 'Transfer', accountId: 'acc-1', amount: 10 },
      });
      // The regex requires a leading 'YYYY-MM-DD'; a slash-formatted date falls through to
      // `new Date(raw)`, which parses successfully here, so the fallback returns a real
      // (not "today") normalized date instead of degrading to today() — asserted loosely
      // to stay independent of the test runner's local timezone.
      const value = screen.getByTestId('date-field').value;
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('falls back to the default-method heuristic when the draft has no paymentMethod (matchMethodIdByName "!name" branch)', async () => {
      mockApiFetch = buildApiFetch();
      renderModal({
        payment: { id: 'pay-edit-5', paymentDate: '2024-05-10', accountId: 'acc-1', amount: 10 },
      });
      // matchMethodIdByName(methods, undefined) short-circuits to '' -> pickDefaultMethodId
      // resolves the account's defaultPaymentMethod name ("Transfer") instead.
      expect(await screen.findByTestId('field-paymentMethod-chip')).toHaveTextContent('Transfer');
    });
  });

  describe('amount field', () => {
    it('prefills the amount input with the outstanding total (en-US)', () => {
      renderModal({ outstanding: 6420 });
      expect(screen.getByTestId('cp-amount-input')).toHaveValue('6,420.00');
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
    // with 25.30€ pending; selecting a "Saldo a favor" line that covers it in full
    // left cash ("Importe") at 0.00€ and "Diferencia" at 0.00€ (a fully exact,
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
      // repro: cash "Importe" left at 0.00€, credit fully covering the invoice.
      const input = await within(row).findByTestId('cp-credit-use-s1');
      await waitFor(() => expect(input).toHaveValue('25.30'));
      await waitFor(() => expect(screen.getByTestId('cp-amount-input')).toHaveValue('0.00'));

      // Balance is exact — no missing, no excess — "Diferencia" shows 0.00 €.
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
      await waitFor(() => expect(input).toHaveValue('50.00'));

      // typing a value within [0, avail] is reflected exactly after blur.
      fireEvent.change(input, { target: { value: '150.00' } });
      fireEvent.blur(input);
      await waitFor(() => expect(input).toHaveValue('150.00'));

      // typing a negative value clamps to 0.
      fireEvent.change(input, { target: { value: '-100' } });
      fireEvent.blur(input);
      await waitFor(() => expect(input).toHaveValue('0.00'));
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
      await waitFor(() => expect(input).toHaveValue('120.00'));

      fireEvent.change(input, { target: { value: '220.00' } });
      fireEvent.blur(input);
      // 220 would exceed avail (120) — clamps down to 120 on blur.
      await waitFor(() => expect(input).toHaveValue('120.00'));
    });

    it('does not toggle the row off when clicking inside the "use" amount container (stopPropagation)', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 500 }],
      });
      renderModal({ outstanding: 50 });
      const row = await screen.findByTestId('cp-credit-row-s1');
      fireEvent.click(row);
      const input = await within(row).findByTestId('cp-credit-use-s1');

      // The "use" input's wrapper stops propagation on click so that interacting with the
      // amount field never bubbles up to the row's own onClick (which toggles selection off).
      fireEvent.click(input);

      expect(screen.getByTestId('cp-credit-use-s1')).toBeInTheDocument();
      expect(screen.queryByText('cpUnused')).not.toBeInTheDocument();
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
      expect(screen.getByText(/^cpExcessInline/)).toBeInTheDocument();
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
      // the delta amount (200,00) should be rendered nearby — MoneyAmount now renders
      // es-ES digits via the shared formatCurrency util ("200,00 €" for the EUR invoice).
      // Scoped to the delta cell: since ETP-4797 a partial payment also renders the write-off
      // toggle, whose title repeats the same figure, so a bare getByText would match twice.
      expect(within(screen.getByTestId('cp-delta-cell')).getByText(/200,00/))
        .toBeInTheDocument();
      // Confirmar stays enabled for a partial payment — only excess blocks it.
      const confirm = screen.getByText('cpConfirm').closest('button');
      expect(confirm).not.toBeDisabled();
    });

    it('ETP-4797: offers the write-off toggle, off by default, on a partial payment', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '800' } });

      const toggle = screen.getByTestId('cp-writeoff-toggle-switch');
      expect(toggle).toHaveAttribute('data-state', 'unchecked');
      // The amount in the title is the shortfall, not the payment.
      expect(screen.getByText(/writeoffAdjustTitle.*200,00/)).toBeInTheDocument();
    });

    it('ETP-4797: hides the write-off toggle once the amount covers the invoice', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '800' } });
      expect(screen.getByTestId('cp-writeoff-toggle-switch')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1000' } });
      expect(screen.queryByTestId('cp-writeoff-toggle-switch')).not.toBeInTheDocument();
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

    // ETP-4504 (Option C): both excess resolutions — "Dejar a crédito" and
    // "Dar vuelto"/refund — render side by side for an org-currency receipt,
    // and choosing refund makes the confirm payload carry overpaymentAction "refund".
    it('renders BOTH the "Dejar a crédito" and "Dar vuelto"/refund cards on excess (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      // Default beforeEach: org currency EUR === invoice EUR → canLeaveCredit true,
      // so both cards render (shared gate).
      expect(screen.getByTestId('cp-excess-credit')).toBeInTheDocument();
      expect(screen.getByTestId('cp-excess-refund')).toBeInTheDocument();
      expect(screen.getByText('cpLeaveCredit')).toBeInTheDocument();
      expect(screen.getByText('cpGiveChange')).toBeInTheDocument();
    });

    it('sends overpaymentAction "refund" when "Dar vuelto" is chosen on excess (dir "in")', async () => {
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      // Choose the refund resolution instead of the default credit one.
      fireEvent.click(screen.getByTestId('cp-excess-refund'));
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

  // ETP-4504: multi-currency conversion. When the selected financial account's
  // currency differs from the invoice currency the modal shows an editable
  // conversion-rate field plus a live "amount in account currency" readout, and
  // sends `conversionRate` in the register payload. Same-currency → none of that.
  describe('multi-currency conversion (ETP-4504)', () => {
    // Account whose currency (EUR) differs from the USD invoice → foreign path.
    const FOREIGN_ACCOUNTS = [{ id: 'acc-eur', label: 'Cuenta EUR', currency: 'EUR', defaultPaymentMethod: 'Transfer' }];
    // Account matching the invoice currency (USD) → same-currency path.
    const SAME_ACCOUNTS = [{ id: 'acc-usd', label: 'Cuenta USD', currency: 'USD', defaultPaymentMethod: 'Transfer' }];
    const USD_INVOICE = { ...INVOICE, 'currency$_identifier': 'USD' };

    it('shows the conversion fields when the account currency differs from the invoice currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE });
      // Conversion fields appear once the account (and thus its currency) resolves.
      expect(await screen.findByTestId('cp-conversion-fields')).toBeInTheDocument();
      expect(screen.getByTestId('cp-conversion-rate-input')).toBeInTheDocument();
      expect(screen.getByTestId('cp-amount-in-account-input')).toBeInTheDocument();
    });

    it('hides the conversion fields when the account currency matches the invoice currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: SAME_ACCOUNTS });
      renderModal({ invoiceData: USD_INVOICE });
      // Wait for the account (USD) to auto-select so its currency is known.
      await screen.findByTestId('field-account-chip');
      // Same currency → no conversion UI at all.
      expect(screen.queryByTestId('cp-conversion-fields')).not.toBeInTheDocument();
    });

    it('auto-calculates amount-in-account = amount × rate, and recomputes bidirectionally on amount, rate, and a typed converted-amount value', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      // Rate prefilled to 0.92; amount prefilled to the outstanding (100).
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      const readout = await screen.findByTestId('cp-amount-in-account-input');
      // 100 × 0.92 = 92, formatted en-US plain (no symbol embedded — the field is now a
      // free-standing editable <input>; the symbol renders in a separate sibling <span>).
      await waitFor(() => expect(readout).toHaveValue('92.00'));

      // Symbol money convention (ETP-4504): the modal shows the real currency symbol via
      // Intl `narrowSymbol` (USD→$, EUR→€, GBP→£), never the raw 3-letter ISO code. The
      // account-currency symbol is a sibling <span> next to the input (curSuffix); the amount
      // input's own suffix carries the invoice symbol ($, USD). Pinning both guards against a
      // future refactor silently reverting to ISO-code text.
      expect(readout.parentElement).toHaveTextContent(/€/);
      expect(screen.getByTestId('cp-amount-input').parentElement).toHaveTextContent(/\$/);

      // Recompute forward on amount (invoice-currency) change: 200 × 0.92 = 184, rate unchanged.
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '200' } });
      await waitFor(() => expect(readout).toHaveValue('184.00'));
      expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.92');

      // Recompute forward on rate change: 200 × 0.5 = 100.
      fireEvent.change(screen.getByTestId('cp-conversion-rate-input'), { target: { value: '0.5' } });
      await waitFor(() => expect(readout).toHaveValue('100.00'));

      // Reverse direction: typing directly into the converted-amount field derives a new rate
      // (the inverse of amount × rate) — invoice-currency amount is still 200 here.
      fireEvent.change(readout, { target: { value: '50' } });
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.25'));

      // Regression guard for `skipAmountRecomputeRef`: deriving the rate from the typed amount
      // re-renders with a new `rate`, which is a dependency of the amount-recompute effect —
      // without the skip guard that effect would immediately re-fire and reformat/clobber the
      // field the user is still typing in (e.g. back to "46.00" = round2(200 × 0.23...)).
      // Asserted synchronously (no waitFor) right after the change so a removed guard, which
      // would only clobber the value on the FOLLOWING render/microtask, cannot slip past this
      // check by coincidence.
      expect(readout).toHaveValue('50');
    });

    it('includes conversionRate in the register body only in the foreign-currency case', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });
      await screen.findByTestId('cp-conversion-fields');

      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).conversionRate).toBe('0.92');
      });
    });

    it('omits conversionRate from the register body when the account currency matches the invoice currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: SAME_ACCOUNTS });
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        // `conversionRate: undefined` is dropped by JSON.stringify → key absent.
        expect(JSON.parse(call[1].body)).not.toHaveProperty('conversionRate');
      });
    });

    // ETP-4504 B1: a foreign payment MUST carry a positive conversion rate. When
    // no DB rate prefills the field (and the user has not typed one), both Save and
    // Confirm are blocked and a required-rate hint is shown — otherwise the backend
    // would silently apply a 1:1 rate and post the wrong ledger amount.
    it('blocks Save AND Confirm and shows the rate error when a foreign account has no prefilled rate (ETP-4504 B1)', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      // No DB rate for the pair → the field stays empty (nothing to prefill).
      mockConversion = { rate: null, hasRate: false, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      // Empty rate → required-rate hint visible and BOTH actions disabled.
      expect(screen.getByTestId('cp-conversion-rate-error')).toBeInTheDocument();
      expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();

      // Typing a valid positive rate clears the hint and re-enables both actions.
      fireEvent.change(screen.getByTestId('cp-conversion-rate-input'), { target: { value: '0.92' } });
      await waitFor(() => {
        expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
        expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled();
        expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
      });
    });

    it('enables Save and Confirm with no rate error when a foreign account has a valid prefilled rate (ETP-4504 B1)', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      // A valid prefilled rate satisfies the gate: no hint, both actions enabled.
      expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled();
        expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
      });
    });

    // ETP-4504 W1: the rate hook is keyed on the target (account) currency, so
    // switching to a different foreign account re-seeds the field — and CLEARS it
    // when the new pair has no DB rate, rather than carrying the stale rate across.
    it('clears the prefilled rate when switching to a foreign account that has no DB rate (ETP-4504 W1)', async () => {
      mockApiFetch = buildApiFetch({
        accounts: [
          { id: 'acc-eur', label: 'Cuenta EUR', currency: 'EUR', defaultPaymentMethod: 'Transfer' },
          { id: 'acc-gbp', label: 'Cuenta GBP', currency: 'GBP', defaultPaymentMethod: 'Transfer' },
        ],
      });
      // EUR pair has a rate; GBP pair has none — driven by the target currency.
      mockConversion = ({ toCode }) => (toCode === 'EUR'
        ? { rate: 0.92, hasRate: true, loading: false }
        : { rate: null, hasRate: false, loading: false });
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      // Auto-selects the first account (EUR) → rate prefilled to 0.92.
      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.92'));

      // Switch the account to the GBP one (which has no DB rate).
      fireEvent.click(screen.getByTestId('field-account-chip'));
      const accountInput = await screen.findByTestId('field-account');
      fireEvent.focus(accountInput);
      fireEvent.change(accountInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-account')).toBeInTheDocument());
      // Options select on mouseDown (fires before blur), not click.
      fireEvent.mouseDown(screen.getByTestId('option-account-acc-gbp'));

      // Stale 0.92 must NOT carry over: the field is cleared and the gate blocks again.
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue(''));
      expect(screen.getByTestId('cp-conversion-rate-error')).toBeInTheDocument();
    });

    it('applies no rate gating and renders no rate error for a same-currency account (ETP-4504)', async () => {
      mockApiFetch = buildApiFetch({ accounts: SAME_ACCOUNTS });
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      // Same currency → no conversion UI and no rate error node at all.
      expect(screen.queryByTestId('cp-conversion-fields')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
      // Save/Confirm follow the normal rules (enabled with a valid amount).
      await waitFor(() => {
        expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled();
        expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
      });
    });

    // ETP-4504: a foreign rate of exactly 1 is also invalid — the backend rejects it
    // (compareTo(ONE)==0 → 400), so the modal blocks it up-front and the shared error
    // node switches to the "must differ from 1" message. A missing/0 rate keeps the
    // original "enter the rate" message; a valid non-1 rate clears the gate.
    it('blocks Save AND Confirm and shows the "invalid" hint when a foreign rate is exactly 1 (ETP-4504)', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      // No DB prefill → the field starts empty and the rate is typed manually.
      mockConversion = { rate: null, hasRate: false, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });
      await screen.findByTestId('cp-conversion-fields');
      const rateInput = screen.getByTestId('cp-conversion-rate-input');

      // A rate of exactly 1 (any spelling) → the "must differ from 1" hint + both actions blocked.
      for (const oneStr of ['1', '1.00']) {
        fireEvent.change(rateInput, { target: { value: oneStr } });
        await waitFor(() => {
          expect(screen.getByTestId('cp-conversion-rate-error')).toHaveTextContent('cpConversionRateInvalid');
          expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
          expect(screen.getByTestId('cp-confirm')).toBeDisabled();
        });
      }

      // 0 or empty → the hint reverts to the "enter the rate" (required) message.
      fireEvent.change(rateInput, { target: { value: '0' } });
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-error')).toHaveTextContent('cpConversionRateRequired'));
      fireEvent.change(rateInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-error')).toHaveTextContent('cpConversionRateRequired'));

      // A valid non-1 rate clears the error node entirely and re-enables both actions.
      fireEvent.change(rateInput, { target: { value: '0.92' } });
      await waitFor(() => {
        expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
        expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled();
        expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
      });
    });

    // QA gap #2: partial cash + same-currency credit + foreign account, combined. A USD
    // credit line covers part of a USD invoice, cash covers the rest, and the EUR account
    // needs a rate. The balance must reconcile exactly (confirmable, no excess), the
    // account-currency readout tracks the CASH portion × rate, and the payload carries BOTH
    // the conversion rate and the consumed credit sources.
    it('reconciles a partial credit + cash payment on a foreign account and sends rate + creditSources (ETP-4504)', async () => {
      mockApiFetch = buildApiFetch({
        accounts: FOREIGN_ACCOUNTS,
        // Same-currency (USD) credit worth 40 against a 100 USD invoice.
        sources: [{ id: 's1', kind: 'credit', doc: 'CN-1', date: '2024-01-01', avail: 40, paymentId: 'cn-1' }],
      });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      // Consume the credit: it caps to min(avail 40, need 100) = 40 and drops cash to 60.
      fireEvent.click(await screen.findByTestId('cp-credit-row-s1'));
      await waitFor(() => expect(screen.getByTestId('cp-amount-input')).toHaveValue('60.00'));

      // Amount-in-account tracks the CASH portion only: 60 × 0.92 = 55.20 (account currency).
      await waitFor(() => expect(screen.getByTestId('cp-amount-in-account-input')).toHaveValue('55.20'));

      // Exact balance (60 cash + 40 credit = 100) → no excess, confirm enabled.
      expect(screen.queryByTestId('cp-excess-credit')).not.toBeInTheDocument();
      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      // The payload carries BOTH the conversion rate and the consumed credit source.
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        expect(body.conversionRate).toBe('0.92');
        expect(body.creditSources).toHaveLength(1);
        expect(body.creditSources[0]).toMatchObject({ kind: 'credit', paymentId: 'cn-1', use: 40 });
      });
    });

    it('clears the rate and shows the required-rate error under BOTH fields when the amount-in-account is blanked', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      // Sanity: a valid prefilled rate starts with no error on either field.
      expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cp-amount-in-account-error')).not.toBeInTheDocument();

      // Blanking the converted-amount field parses to NaN, which is not a valid amount to
      // derive a rate from — it falls into the same "unknown rate" branch a blank/invalid rate
      // field already triggers.
      fireEvent.change(screen.getByTestId('cp-amount-in-account-input'), { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('');
        expect(screen.getByTestId('cp-conversion-rate-error')).toHaveTextContent('cpConversionRateRequired');
        expect(screen.getByTestId('cp-amount-in-account-error')).toHaveTextContent('cpConversionRateRequired');
        expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
        expect(screen.getByTestId('cp-confirm')).toBeDisabled();
      });
    });

    // Division-by-zero guard: a fully credit-covered invoice legitimately leaves the
    // invoice-currency cash amount (balance.amount) at 0 — typing in the amount-in-account
    // field must not throw or produce NaN; it must fall into the "unknown rate" branch and
    // clear rateStr, exactly like an invalid amount does.
    it('does not throw and leaves the rate cleared when typing an amount while the invoice amount is fully covered by credit', async () => {
      mockApiFetch = buildApiFetch({
        accounts: FOREIGN_ACCOUNTS,
        sources: [{ id: 's1', kind: 'abono', doc: 'SF-1', date: '2024-03-01', avail: 100 }],
      });
      // No DB rate prefilled — an untouched rate field is the realistic starting point for an
      // invoice that is about to be fully covered by credit (no cash portion to convert yet).
      mockConversion = { rate: null, hasRate: false, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      // Fully consume the credit line: cash drops to 0 (balance.amount === 0).
      fireEvent.click(await screen.findByTestId('cp-credit-row-s1'));
      await waitFor(() => expect(screen.getByTestId('cp-amount-input')).toHaveValue('0.00'));

      // Typing a positive amount here would normally derive a rate (accountAmount / invoiceAmount)
      // — but balance.amount (the divisor) is 0, so the `balance.amount > 0` guard must keep this
      // from throwing/NaN-ing and fall into the "unknown rate" branch instead.
      expect(() => {
        fireEvent.change(screen.getByTestId('cp-amount-in-account-input'), { target: { value: '50' } });
      }).not.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('cp-amount-in-account-input')).toHaveValue('50');
        expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('');
        expect(screen.getByTestId('cp-conversion-rate-error')).toHaveTextContent('cpConversionRateRequired');
        expect(screen.getByTestId('cp-amount-in-account-error')).toHaveTextContent('cpConversionRateRequired');
      });
    });

    it('sends the rate derived from a typed amount-in-account value in the register payload (rate never typed directly)', async () => {
      mockApiFetch = buildApiFetch({ accounts: FOREIGN_ACCOUNTS });
      // No DB rate prefilled — the rate is reached exclusively via the amount-in-account path.
      mockConversion = { rate: null, hasRate: false, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100 });

      await screen.findByTestId('cp-conversion-fields');
      expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('');

      // Typing 46 in the converted-amount field derives rate = 46 / 100 = 0.46.
      fireEvent.change(screen.getByTestId('cp-amount-in-account-input'), { target: { value: '46' } });
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.46'));

      const confirm = screen.getByTestId('cp-confirm');
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).conversionRate).toBe('0.46');
      });
    });
  });

  // ETP-4841: edit mode AND multi-currency, together. Reopening a DRAFT that was saved with a
  // hand-typed conversion rate must show that stored rate back (payment.conversionRate, added to
  // every invoicePayments row by the backend action), not the system spot rate from
  // validate-exchange-rate. The two feature areas were previously tested in isolation — the bug
  // lived exactly in their intersection, where the seeding effect unconditionally overwrote the
  // field with the system rate. The persisted rate is a property of the currency PAIR it was saved
  // for, so it survives a date change and an account switch WITHIN that pair, is replaced by the
  // DB rate of any other foreign pair, and disappears entirely on a same-currency account.
  describe('persisted draft conversion rate in edit mode (ETP-4841)', () => {
    const USD_INVOICE = { ...INVOICE, 'currency$_identifier': 'USD' };
    // Two accounts in the SAVED currency (EUR), one in another foreign currency (GBP), one in the
    // invoice currency (USD). No paymentMethodIds → every account supports every method, so an
    // account switch is never rejected by the method filter.
    const EUR_ACCOUNT = { id: 'acc-eur', label: 'Caja EUR', currency: 'EUR', defaultPaymentMethod: 'Transfer' };
    const EUR_ACCOUNT_2 = { id: 'acc-eur-2', label: 'Banco EUR', currency: 'EUR', defaultPaymentMethod: 'Transfer' };
    const GBP_ACCOUNT = { id: 'acc-gbp', label: 'Cuenta GBP', currency: 'GBP', defaultPaymentMethod: 'Transfer' };
    const USD_ACCOUNT = { id: 'acc-usd', label: 'Cuenta USD', currency: 'USD', defaultPaymentMethod: 'Transfer' };

    /**
     * A draft row exactly as InvoicePaymentHistoryModal receives it from the
     * `invoicePayments` action and forwards as the `payment` prop: a USD invoice paid from the
     * EUR account with a manual rate of 0.89.
     */
    function eurDraft(overrides = {}) {
      return {
        id: 'pay-draft-1',
        documentNo: 'PAY-001',
        paymentDate: '2026-01-20',
        paymentMethod: 'Transfer',
        status: 'RPAP',
        processed: false,
        amount: 100,
        appliedToInvoice: 100,
        accountId: 'acc-eur',
        accountName: 'Caja EUR',
        accountCurrency: 'EUR',
        conversionRate: 0.89,
        ...overrides,
      };
    }

    // Captured setter of the simulated validate-exchange-rate response (see systemRateHook).
    let resolveSystemRate;

    /**
     * A useConversionRate stand-in that models the hook's real async round-trip: it starts with
     * `initial` (usually null — "no response yet") and only produces a rate once the test calls
     * `resolveSystemRate(...)`. This is what makes the LATE-response race testable: a naive fix
     * that seeds the persisted rate but leaves the system rate free to overwrite it later passes
     * every synchronous assertion and still fails here.
     */
    function systemRateHook(initial = null) {
      return () => {
        const [rate, setRate] = useState(initial);
        resolveSystemRate = setRate;
        return { rate, hasRate: rate != null, loading: rate == null };
      };
    }

    /** Picks another account in the (already open) account selector. */
    async function selectAccount(accountId) {
      fireEvent.click(screen.getByTestId('field-account-chip'));
      const accountInput = await screen.findByTestId('field-account');
      fireEvent.focus(accountInput);
      fireEvent.change(accountInput, { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('options-account')).toBeInTheDocument());
      // Options select on mouseDown (fires before blur), not click.
      fireEvent.mouseDown(screen.getByTestId(`option-account-${accountId}`));
    }

    beforeEach(() => {
      resolveSystemRate = undefined;
    });

    // Truth table row 1 — "nothing touched → 0.89, even when validate-exchange-rate responds LATE".
    it('shows the rate stored on the draft instead of the system rate, even when the exchange-rate response lands late', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      mockConversion = systemRateHook(null);
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      const rateInput = screen.getByTestId('cp-conversion-rate-input');
      await waitFor(() => expect(rateInput).toHaveValue('0.89'));
      // The account-currency readout follows the persisted rate: 100 × 0.89 = 89.00 (EUR account).
      const readout = screen.getByTestId('cp-amount-in-account-input');
      await waitFor(() => expect(readout).toHaveValue('89.00'));
      expect(readout.parentElement).toHaveTextContent(/€/);

      // The system spot rate arrives AFTER the account (and therefore the persisted seed) resolved
      // — it must not win.
      act(() => resolveSystemRate(0.92));
      expect(rateInput).toHaveValue('0.89');
      // And the gate is satisfied by the persisted rate alone (no error, both actions enabled).
      expect(screen.queryByTestId('cp-conversion-rate-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('cp-save-draft')).not.toBeDisabled();
      expect(screen.getByTestId('cp-confirm')).not.toBeDisabled();
    });

    // Composition with the amount-in-account bidirectional editing (this change): the persisted
    // rate correctly seeds a consistent converted amount on reopen, AND the now-editable
    // converted-amount field is not "stuck" on the persisted rate — editing it re-derives a new
    // rate exactly like a fresh (non-draft) foreign payment would.
    it('re-derives a new rate when the reopened amount-in-account field is edited (does not stick to the persisted rate)', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      const rateInput = screen.getByTestId('cp-conversion-rate-input');
      const readout = screen.getByTestId('cp-amount-in-account-input');
      // Consistent seed from the persisted rate: 100 × 0.89 = 89.00.
      await waitFor(() => expect(rateInput).toHaveValue('0.89'));
      await waitFor(() => expect(readout).toHaveValue('89.00'));

      // Editing the reopened amount field derives a fresh rate (50 / 100 = 0.5), overriding the
      // persisted 0.89 — the persisted-rate seeding effect must not re-fight this user edit.
      fireEvent.change(readout, { target: { value: '50' } });
      await waitFor(() => expect(rateInput).toHaveValue('0.5'));
      expect(readout).toHaveValue('50');
    });

    // Truth table row 2 — "payment date changed → 0.89 (no reseed)".
    it('keeps the persisted rate when the payment date changes', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      // The system rate is already available here, so a reseed would be visible as 0.92.
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      const rateInput = screen.getByTestId('cp-conversion-rate-input');
      await waitFor(() => expect(rateInput).toHaveValue('0.89'));

      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '2026-02-05' } });
      await waitFor(() => expect(screen.getByTestId('date-field')).toHaveValue('2026-02-05'));
      expect(rateInput).toHaveValue('0.89');
    });

    // Truth table row 3 — "switch to another EUR account (Caja → Banco) → 0.89 (same USD→EUR pair)".
    it('keeps the persisted rate when switching to another account in the same currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT, EUR_ACCOUNT_2] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      await selectAccount('acc-eur-2');
      // The switch really happened (Banco EUR selected)…
      await waitFor(() => expect(screen.getByTestId('field-account-chip')).toHaveTextContent('Banco EUR'));
      // …and the rate is untouched: it belongs to the USD→EUR pair, not to the account.
      expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89');
    });

    // Truth table row 4 — "switch to a GBP account → the DB USD→GBP rate".
    it('reseeds from the DB rate of the new pair when switching to an account in another foreign currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT, GBP_ACCOUNT] });
      // Driven by the target currency: the GBP pair has its own DB rate.
      mockConversion = ({ toCode }) => (toCode === 'GBP'
        ? { rate: 0.75, hasRate: true, loading: false }
        : { rate: 0.92, hasRate: true, loading: false });
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      await selectAccount('acc-gbp');
      // Showing the saved USD→EUR rate on a USD→GBP payment would be a silent accounting error.
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.75'));
    });

    // Truth table row 4 (empty case) — "…or empty if none exists".
    it('clears the rate when switching to a foreign pair that has no DB rate', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT, GBP_ACCOUNT] });
      mockConversion = ({ toCode }) => (toCode === 'GBP'
        ? { rate: null, hasRate: false, loading: false }
        : { rate: 0.92, hasRate: true, loading: false });
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      await selectAccount('acc-gbp');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue(''));
      // Empty rate on a foreign payment blocks both actions again (ETP-4504 B1 gate).
      expect(screen.getByTestId('cp-conversion-rate-error')).toBeInTheDocument();
      expect(screen.getByTestId('cp-save-draft')).toBeDisabled();
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });

    // Truth table row 5 — "switch to a USD account (= invoice currency) → field hidden,
    // conversionRate absent from the submit payload".
    it('hides the conversion field and drops conversionRate from the payload on a same-currency account', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT, USD_ACCOUNT] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      await selectAccount('acc-usd');
      // Account currency === invoice currency → no conversion at all.
      await waitFor(() => expect(screen.queryByTestId('cp-conversion-fields')).not.toBeInTheDocument());

      fireEvent.click(screen.getByTestId('cp-save-draft'));
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        // `conversionRate: undefined` is dropped by JSON.stringify → key absent.
        expect(body).not.toHaveProperty('conversionRate');
        expect(body.fin_financial_account_id).toBe('acc-usd');
        expect(body.paymentId).toBe('pay-draft-1');
      });
    });

    // Truth table row 6 — "back to a EUR account from a USD one → 0.89 again".
    it('restores the persisted rate when coming back to an account in the saved currency', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT, USD_ACCOUNT] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      // Away to the invoice currency (no conversion), then back to the saved pair.
      await selectAccount('acc-usd');
      await waitFor(() => expect(screen.queryByTestId('cp-conversion-fields')).not.toBeInTheDocument());
      await selectAccount('acc-eur');

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));
    });

    // Truth table (draft save) — "Guardar" must re-submit the rate the user saved, unchanged.
    it('re-submits the persisted rate unchanged when saving the reopened draft', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      // A different system rate is available; the payload must still carry the persisted one.
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.89'));

      const saveDraft = screen.getByTestId('cp-save-draft');
      await waitFor(() => expect(saveDraft).not.toBeDisabled());
      fireEvent.click(saveDraft);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        expect(body.process).toBe('draft');
        expect(body.conversionRate).toBe('0.89');
        // Edit mode → the SAME payment is updated, not a new one created.
        expect(body.paymentId).toBe('pay-draft-1');
      });
    });

    // Truth table row 7 — "user retypes the rate by hand → whatever they typed, never overwritten".
    it('never overwrites a manual rate edit made after the persisted seed', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      mockConversion = systemRateHook(null);
      renderModal({ invoiceData: USD_INVOICE, outstanding: 100, payment: eurDraft() });

      await screen.findByTestId('cp-conversion-fields');
      const rateInput = screen.getByTestId('cp-conversion-rate-input');
      await waitFor(() => expect(rateInput).toHaveValue('0.89'));

      // The user corrects the rate by hand…
      fireEvent.change(rateInput, { target: { value: '0.95' } });
      expect(rateInput).toHaveValue('0.95');

      // …and neither a late exchange-rate response nor a date change may clobber it.
      act(() => resolveSystemRate(0.92));
      expect(rateInput).toHaveValue('0.95');
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '2026-02-05' } });
      await waitFor(() => expect(screen.getByTestId('date-field')).toHaveValue('2026-02-05'));
      expect(rateInput).toHaveValue('0.95');

      // The typed rate — not the persisted one — is what gets saved.
      fireEvent.click(screen.getByTestId('cp-save-draft'));
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
        expect(call).toBeTruthy();
        expect(JSON.parse(call[1].body).conversionRate).toBe('0.95');
      });
    });

    // Guard on the isEdit half of the gate: an identical row passed WITHOUT an id (i.e. the
    // "add new payment" path) is not an edit, so the system rate must still drive the field.
    it('ignores conversionRate when the modal is not in edit mode', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({
        invoiceData: USD_INVOICE,
        outstanding: 100,
        payment: eurDraft({ id: undefined }),
      });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.92'));
    });

    // Guard on the "> 0" half of the gate: a legacy/absent stored rate must fall back to the
    // system rate rather than blanking the field.
    it('falls back to the system rate when the draft carries no usable stored rate', async () => {
      mockApiFetch = buildApiFetch({ accounts: [EUR_ACCOUNT] });
      mockConversion = { rate: 0.92, hasRate: true, loading: false };
      renderModal({
        invoiceData: USD_INVOICE,
        outstanding: 100,
        // Older backend (field absent) and an explicit 0 both mean "nothing stored".
        payment: eurDraft({ conversionRate: 0 }),
      });

      await screen.findByTestId('cp-conversion-fields');
      await waitFor(() => expect(screen.getByTestId('cp-conversion-rate-input')).toHaveValue('0.92'));
    });
  });

  // ETP-4504 (Option C): the excess resolution cards ("Dejar a crédito" +
  // "Dar vuelto"/refund) share one gate — `canLeaveCredit` (receipt AND invoice
  // in the org currency). A foreign-currency receipt — or any payment — shows
  // NEITHER card and may only "Igualar"; the excess blocks confirmation until then.
  describe('excess resolution gating by org currency (ETP-4504)', () => {
    const USD_INVOICE = { ...INVOICE, 'currency$_identifier': 'USD' };

    it('offers "Generar crédito a favor" for a receipt whose invoice is in the org currency', async () => {
      // Default beforeEach: org currency EUR === invoice EUR → canLeaveCredit true.
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });

      expect(screen.getByTestId('cp-excess-credit')).toBeInTheDocument();
      expect(screen.getByText('cpLeaveCredit')).toBeInTheDocument();
    });

    it('hides the credit option for a foreign-currency receipt and blocks confirmation until adjusted', async () => {
      // Invoice in USD but org currency is EUR → invoice NOT in org currency →
      // canLeaveCredit false even for a receipt.
      mockOrgCurrency = 'EUR';
      renderModal({ dir: 'in', invoiceData: USD_INVOICE, outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });

      // Neither card renders (shared gate off) — only the inline "adjust the amount" guidance.
      expect(screen.queryByTestId('cp-excess-credit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cp-excess-refund')).not.toBeInTheDocument();
      expect(screen.getByText(/^cpExcessInline/)).toBeInTheDocument();
      // Confirm stays blocked while the excess is unresolved.
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();

      // "Igualar" resets the amount to exactly cover the invoice → confirm re-enables.
      fireEvent.click(screen.getByTestId('cp-equalize'));
      await waitFor(() => expect(screen.getByTestId('cp-confirm')).not.toBeDisabled());
    });

    it('renders BOTH excess cards side by side for an org-currency receipt (dir "in")', async () => {
      // ETP-4504 Option C: credit + refund share the canLeaveCredit gate, so an
      // org-currency receipt shows both cards together (not the old single card).
      renderModal({ dir: 'in', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      expect(screen.getByTestId('cp-excess-credit')).toBeInTheDocument();
      expect(screen.getByTestId('cp-excess-refund')).toBeInTheDocument();
      expect(screen.getByText('cpGiveChange')).toBeInTheDocument();
    });

    it('shows NEITHER card for a payment (dir "out") and blocks confirmation on excess', async () => {
      // Payments never expose a resolution card regardless of currency — only "Igualar".
      renderModal({ dir: 'out', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '1200' } });
      expect(screen.queryByTestId('cp-excess-credit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cp-excess-refund')).not.toBeInTheDocument();
      expect(screen.getByText(/^cpExcessInline/)).toBeInTheDocument();
      expect(screen.getByTestId('cp-confirm')).toBeDisabled();
    });

    // ETP-4314 regression: ExcessBand's `amount` (fmtCur(balance.excessAmount, currency))
    // used a hand-rolled Intl.NumberFormat call missing `useGrouping: true`, so an excess
    // >= 1000 rendered without the thousands separator (e.g. "1500,00 €" instead of
    // "1.500,00 €"). Now delegates to the shared formatCurrency(), which sets it explicitly.
    it('groups thousands in the inline excess amount when the excess is >= 1000', async () => {
      renderModal({ dir: 'out', outstanding: 1000 });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      // outstanding 1000, amount 2500 -> excess 1500.
      fireEvent.change(screen.getByTestId('cp-amount-input'), { target: { value: '2500' } });
      const inlineError = screen.getByText(/^cpExcessInline/);
      expect(inlineError).toHaveTextContent(/1\.500,00/);
      expect(inlineError).toHaveTextContent('€');
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
      it('shows the PIS block when the account is bank-connected, the method is a transfer, dir is "out", and the currency is EUR', async () => {
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

      it('hides the PIS block when the selected account is not bank-connected', async () => {
        mockApiFetch = buildPisApiFetch({
          accounts: [{ id: 'acc-1', label: 'Banco Clásico', bankConnected: false }],
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

    describe('PIS catalog fetch resilience', () => {
      it('degrades gracefully (no crash, no preselected IBAN) when pisSupplierAccounts rejects', async () => {
        // Each per-action POST inside the PIS accounts effect is individually wrapped in
        // `.catch(() => null)`, so a single rejected request must not blow up Promise.all
        // or crash the section — it should just leave that catalog empty.
        const base = buildPisApiFetch();
        mockApiFetch = vi.fn(async (path, opts) => {
          if (path.includes('pisSupplierAccounts')) return Promise.reject(new Error('network error'));
          return base(path, opts);
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });

        expect(await screen.findByTestId('cp-pis-section')).toBeInTheDocument();
        await waitFor(() => expect(
          mockApiFetch.mock.calls.some(c => c[0].includes('pisSupplierAccounts')),
        ).toBe(true));
        // No supplier accounts resolved -> no default IBAN was preselected, so the
        // selector shows its plain (unselected) input rather than a value chip.
        expect(screen.queryByTestId('field-pisIban-chip')).not.toBeInTheDocument();
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
        // Default buildApiFetch() account has no bankConnected flag -> block never renders.
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

    describe('PIS alert — used-credit clause', () => {
      it('appends the cpPisAlertCredit clause when a credit/saldo-a-favor line is applied alongside a PIS transfer', async () => {
        mockApiFetch = buildPisApiFetch({
          sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 200 }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        // Selecting the line auto-applies it, raising balance.usedCredit above 0.
        const row = await screen.findByTestId('cp-credit-row-s1');
        fireEvent.click(row);

        await waitFor(() => expect(screen.getByText(/cpPisAlertCredit/)).toBeInTheDocument());
      });
    });

    // ETP-4314 regressions: both fmtCur() call sites feeding the PIS alert text
    // (`dinero` and `credito`) used to hand-roll Intl.NumberFormat without
    // `useGrouping: true`, dropping the thousands separator for amounts >= 1000.
    // Both now delegate to the shared formatCurrency().
    describe('PIS alert — currency formatting (ETP-4314)', () => {
      it('groups thousands in the "dinero" clause when balance.amount is >= 1000', async () => {
        mockApiFetch = buildPisApiFetch();
        // Default outstanding (from `defaults`) is 1000, prefilling balance.amount.
        renderModal({ dir: 'out', specName: 'purchase-invoice', outstanding: 1000 });
        await screen.findByTestId('cp-pis-section');

        const alert = screen.getByText(/^cpPisAlertTransfer/);
        expect(alert).toHaveTextContent(/1\.000,00/);
        expect(alert).toHaveTextContent('€');
      });

      it('groups thousands in the "credito" clause when balance.usedCredit is >= 1000', async () => {
        mockApiFetch = buildPisApiFetch({
          sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 1500 }],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice', outstanding: 2000 });
        await screen.findByTestId('cp-pis-section');

        // Selecting the line auto-caps usage to min(avail, need) = min(1500, 2000) = 1500.
        const row = await screen.findByTestId('cp-credit-row-s1');
        fireEvent.click(row);

        await waitFor(() => {
          const alert = screen.getByText(/cpPisAlertCredit/);
          expect(alert).toHaveTextContent(/1\.500,00/);
          expect(alert).toHaveTextContent('€');
        });
      });
    });

    describe('PIS iban — hand-typed creation (onCreateRequest)', () => {
      it('creates a hand-typed IBAN when the user types a value with no matching supplier option', async () => {
        mockApiFetch = buildPisApiFetch();
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        // Open the IBAN selector (pre-filled with the default supplier account) and type a
        // value that isn't one of the fetched options.
        fireEvent.click(screen.getByTestId('field-pisIban-chip'));
        const ibanInput = await screen.findByTestId('field-pisIban');
        fireEvent.focus(ibanInput);
        fireEvent.change(ibanInput, { target: { value: 'DE89370400440532013000' } });
        await waitFor(() => expect(screen.getByTestId('options-pisIban')).toBeInTheDocument());

        // The pinned "create" action (its onMouseDown fires before blur) invokes
        // onCreateRequest(query, onCreated), which trims the typed value and — since it's
        // non-empty — calls onCreated(typed, typed), setting pisIban to the typed IBAN.
        fireEvent.mouseDown(screen.getByTestId('action-create-pisIban'));

        await waitFor(() => expect(screen.getByTestId('field-pisIban-chip'))
          .toHaveTextContent('DE89370400440532013000'));
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
      // Real timers on purpose: the component's checks are plain `setTimeout(..., 3000)`, and fake
      // timers deadlock against Testing Library's own `waitFor`/`findBy*` (which also poll via
      // `setTimeout`). These tests wait out the real interval instead, with a per-test timeout
      // generous enough for a couple of checks.

      // Simulates the user coming back from the bank (ETP-4895). Salt Edge redirects the popup to
      // PisReturnCallbackServlet, which resolves the status and creates the payment server-side,
      // and then bounces the popup to our own callback page — which posts this message to the
      // opener. It has to be explicit in every test that expects a status to advance, because the
      // modal no longer asks the backend anything on a timer: while the user is still at their bank
      // there is nothing to ask about. See PIS_RETRY_BUDGET in the component.
      const simulateBankReturn = (paymentId = 'pis-1') => act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'pis-completed', paymentId },
          origin: window.location.origin,
        }));
      });

      it('opens the Salt Edge widget and calls onSaved("deposited") on the return check (ETP-4895)', async () => {
        // 'executed' on the FIRST answer, because by the time the modal asks,
        // PisReturnCallbackServlet has already consulted Salt Edge and reconciled server-side. The
        // check is how the modal learns the outcome, not how the outcome is produced.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['executed'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();


        // The user authorises at the bank and the popup comes back.

        simulateBankReturn();
        // Opened as a popup window (named target + window features), not a browser tab.
        expect(openSpy).toHaveBeenCalledWith(
          'https://saltedge.example/widget/abc',
          'saltEdgePisWidget',
          expect.stringContaining('popup=yes'));
        expect(screen.getByText('cpPisStatusRequested')).toBeInTheDocument();

        // The single check resolves the wait and calls onSaved.
        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'pay-1' }), 'deposited'), { timeout: 4500 });
        expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument();
        // Exactly one status request for the whole transfer.
        expect(mockApiFetch.mock.calls.filter(([u]) => u.includes('pisPaymentStatus')))
          .toHaveLength(1);
      }, 12000);

      it('keeps the modal open on a rejected transfer, because no payment was created (ETP-4895)', async () => {
        // A rejection moves no money, so nothing is recorded — there is no payment row to show and
        // nothing to undo. The user is already in the modal with their data, so it stays open and
        // they simply try again; the outcome is reported as a toast.
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

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        // Waiting ends, but the editable form comes back so the transfer can be retried from here.
        await waitFor(() => expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument(),
          { timeout: 4500 });
        expect(screen.getByTestId('cp-confirm')).toBeInTheDocument();
        // Nothing was registered, so the caller must not be told to refresh anything.
        expect(props.onSaved).not.toHaveBeenCalled();
      }, 8000);

      it('closes on "authorized" — the payment is already registered (ETP-4895)', async () => {
        // The spec lists AUTHORIZED as resolutive ("create payment"), and the backend does create
        // and process it there. The modal used to treat it as still-in-flight and keep waiting, so
        // the payment existed while the user was still staring at a spinner — and could resubmit.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['authorized'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        // Reported as pending, not deposited: the funds have not landed yet.
        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'pending'),
          { timeout: 8000 });
        expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument();
        expect(screen.queryByText('cpPisFailedError')).not.toBeInTheDocument();
      }, 12000);

      it('locks the form while the bank window is open, and frees it after (ETP-4895)', async () => {
        // The values are already on their way to the bank, so editing them here could only make the
        // modal disagree with the transfer being authorized on the other side. The lock lifts as
        // soon as the wait ends — on a rejection the form has to be usable again to try again.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['failed'],
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');
        expect(screen.getByTestId('cp-modal-body')).not.toHaveAttribute('inert');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);

        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();


        // The user authorises at the bank and the popup comes back.

        simulateBankReturn();
        expect(screen.getByTestId('cp-modal-body')).toHaveAttribute('inert');
        // The footer sits outside the lock, so the wait can still be cancelled from here.
        expect(screen.getByTestId('cp-pis-cancel-wait')).toBeInTheDocument();

        await waitFor(() => expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument(),
          { timeout: 4500 });
        expect(screen.getByTestId('cp-modal-body')).not.toHaveAttribute('inert');
      }, 8000);

      it('reopening starts a NEW bank order, because the old session is dead (ETP-4895)', async () => {
        // A Salt Edge widget session is single-use: reopening the original pisPaymentUrl after its
        // window was closed only ever renders "Sesión perdida". Reopen therefore asks the backend
        // to abandon the attempt and start a fresh order, and opens that URL instead.
        const openSpy = vi.spyOn(window, 'open')
          .mockImplementation(() => ({ closed: true, close: vi.fn() }));
        const base = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/first', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['authorizing'],
        });
        mockApiFetch = vi.fn(async (path, opts) => {
          if (path.includes('retryPisPayment')) {
            return { ok: true, json: async () => ({ response: { data: { pisPaymentUrl: 'https://saltedge.example/widget/second', pisPaymentId: 'pis-2' } } }) };
          }
          return base(path, opts);
        });
        renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        // The stubbed popup reports itself closed, so the reopen affordance shows up.
        const reopen = await screen.findByTestId('cp-pis-reopen', {}, { timeout: 6000 });
        fireEvent.click(reopen);

        await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
          'https://saltedge.example/widget/second', 'saltEdgePisWidget', expect.any(String)));
        // It acts on the attempt being abandoned, not on the payment.
        const retryCall = mockApiFetch.mock.calls.find(([u]) => u.includes('retryPisPayment'));
        expect(JSON.parse(retryCall[1].body)).toEqual({ pisPaymentId: 'pis-1' });
        openSpy.mockRestore();
      }, 15000);

      it('asks the backend nothing while the user is still at the bank (ETP-4895)', async () => {
        // The point of the whole change. This used to hit /pisPaymentStatus every 3s for as long as
        // the transfer was outstanding — minutes of requests, none of which could have learned
        // anything: PisReturnCallbackServlet is what resolves the status and creates the payment,
        // and it only runs once the bank redirects the popup back. Until then there is literally
        // nothing to ask about, so nothing is asked.
        const openSpy = vi.spyOn(window, 'open')
          .mockImplementation(() => ({ closed: false, close: vi.fn() }));
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

        // Long enough that the old 3s poll would have fired twice over.
        await new Promise(r => setTimeout(r, 7000));

        const statusCalls = () => mockApiFetch.mock.calls.filter(([u]) => u.includes('pisPaymentStatus'));
        expect(statusCalls()).toHaveLength(0);
        // Still waiting, and still showing the bank window as open — it is idle, not finished.
        expect(screen.getByTestId('cp-pis-waiting')).toBeInTheDocument();

        // And the moment the popup comes back, it does ask.
        simulateBankReturn();
        await waitFor(() => expect(statusCalls().length).toBeGreaterThan(0), { timeout: 4500 });
        openSpy.mockRestore();
      }, 15000);

      it('spins only while a status request is really in flight (ETP-4895)', async () => {
        // The spinner must track real work, never a padded delay: while the user is at their bank
        // nothing is running on our side, so a static dot is the honest signal there. A held-open
        // request proves the spinner appears; releasing it proves the spinner goes away.
        const openSpy = vi.spyOn(window, 'open')
          .mockImplementation(() => ({ closed: false, close: vi.fn() }));
        let releaseStatus;
        const base = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
        });
        mockApiFetch = vi.fn(async (path, opts) => {
          if (path.includes('pisPaymentStatus')) {
            await new Promise(r => { releaseStatus = r; });
            return { ok: true, json: async () => ({ status: 'executed' }) };
          }
          return base(path, opts);
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // Still at the bank: no request, so no spinner.
        expect(screen.queryByTestId('cp-pis-spinner')).not.toBeInTheDocument();

        simulateBankReturn();

        // The request is in flight and held open — the spinner is showing for a real reason.
        expect(await screen.findByTestId('cp-pis-spinner', {}, { timeout: 2000 })).toBeInTheDocument();
        expect(screen.getByText('cpPisVerifying')).toBeInTheDocument();

        // Let it answer: the spinner goes with it, it is not held for a minimum duration.
        await act(async () => { releaseStatus(); });
        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'deposited'));
        expect(screen.queryByTestId('cp-pis-spinner')).not.toBeInTheDocument();
        openSpy.mockRestore();
      }, 12000);

      it('resolves promptly on return, with no dead wait before asking (ETP-4895)', async () => {
        // Reported after the servlet landed: pressing "Proceder" at the bank left the modal sitting
        // on "Iniciado" for ~3s before showing the result. PisReturnCallbackServlet has already
        // consulted Salt Edge and reconciled by the time the popup comes back, so the status is a
        // local read — the delay was a leftover polling cadence pacing a poll that no longer
        // exists. The check must fire on the return, not on a timer.
        const openSpy = vi.spyOn(window, 'open')
          .mockImplementation(() => ({ closed: false, close: vi.fn() }));
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['executed'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        simulateBankReturn();

        // Comfortably under the old PIS_POLL_INTERVAL_MS, so a reintroduced delay fails this.
        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'deposited'),
          { timeout: 1500 });
        openSpy.mockRestore();
      }, 10000);

      it('never closes the bank window out from under the user (ETP-4895)', async () => {
        // The poll used to force-close the Salt Edge popup when it gave up waiting. Authenticating
        // at a real bank — logging in, waiting for an SMS, approving on a phone — legitimately
        // takes minutes, so that aborted the very transfer the user was authorizing. Only our own
        // modal may be closed on a timeout; the bank's window is never touched while it is open.
        const closeSpy = vi.fn();
        const openSpy = vi.spyOn(window, 'open')
          .mockImplementation(() => ({ closed: false, close: closeSpy }));
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

        // No pis-completed on purpose: this is the user still AT the bank, which is exactly when
        // the window must be left alone. (Once they are back the popup only holds our own callback
        // page, and closing that is the point — covered by the auto-close tests below.)
        await new Promise(r => setTimeout(r, 7000));

        expect(closeSpy).not.toHaveBeenCalled();
        expect(screen.getByTestId('cp-pis-waiting')).toBeInTheDocument();
        expect(props.onSaved).not.toHaveBeenCalled();
        openSpy.mockRestore();
      }, 15000);

      it('keeps waiting when a pisPaymentStatus poll rejects — a network blip is not a bank failure (ETP-4895)', async () => {
        // Regression guard. This used to assert the opposite: the poll's catch branch synthesized
        // a literal 'failed' status, which was indistinguishable from a real bank rejection, so a
        // transient network/HTTP error told the user the transfer had failed and stopped polling —
        // stranding a payment that was still in flight. A transport error must now be retried,
        // never reported as a failed transfer.
        const base = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
        });
        mockApiFetch = vi.fn(async (path, opts) => {
          if (path.includes('pisPaymentStatus')) return Promise.reject(new Error('network blip'));
          return base(path, opts);
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        // A transport error is the one case that still retries: it taught us nothing, unlike a
        // successful answer of "not settled yet", which spends the single check (PIS_MAX_CHECKS).
        // Two ticks is enough to prove it retries rather than going terminal on the first error.
        await new Promise(r => setTimeout(r, 7000));

        expect(screen.queryByText('cpPisFailedError')).not.toBeInTheDocument();
        expect(screen.getByTestId('cp-pis-waiting')).toBeInTheDocument();
        expect(mockApiFetch.mock.calls.filter(([p]) => p.includes('pisPaymentStatus')).length)
          .toBeGreaterThan(1);
        expect(props.onSaved).not.toHaveBeenCalled();
      }, 15000);

      it('reports "initiated_info_required" as in progress, never as a failed transfer (ETP-4895)', async () => {
        // The exact status that caused the reported bug: a real value of the AD ref-list
        // "PIS Payment Status" that the old whitelist did not know, so it fell through to the
        // terminal branch and showed "could not be completed" while the transfer was alive.
        // It is not resolutive, so no payment exists yet — but the transfer is alive, so this
        // closes as pending and PisDeferredPaymentService#reconcileAttemptsFor registers it on the
        // next payment-list read. What must never happen is calling it a failure.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['initiated_info_required'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'pending'),
          { timeout: 8000 });
        expect(screen.queryByText('cpPisFailedError')).not.toBeInTheDocument();
      }, 15000);

      it('treats "settled" as success, not as a failure (ETP-4895)', async () => {
        // 'settled' (funds received) is the ideal terminal status, but the old code only accepted
        // 'executed' as success, so a settled transfer took the failure branch.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['settled'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'deposited'),
          { timeout: 8000 });
        expect(screen.queryByText('cpPisFailedError')).not.toBeInTheDocument();
      }, 12000);

      it('treats an unrecognized status as in progress, never as a failure (ETP-4895)', async () => {
        // Forward-compatibility guard: if Salt Edge introduces a new status, the modal must treat
        // it as "not resolved yet" rather than declaring the transfer failed. This is the
        // defaulting choice that makes the whole class of bug non-recurring.
        mockApiFetch = buildPisApiFetch({
          register: { response: { data: { id: 'pay-1', pisPaymentUrl: 'https://saltedge.example/widget/abc', pisPaymentId: 'pis-1' } } },
          pisStatusSequence: ['some_future_saltedge_status'],
        });
        const { props } = renderModal({ dir: 'out', specName: 'purchase-invoice' });
        await screen.findByTestId('cp-pis-section');

        const confirm = screen.getByTestId('cp-confirm');
        await waitFor(() => expect(confirm).not.toBeDisabled());
        fireEvent.click(confirm);
        expect(await screen.findByTestId('cp-pis-waiting')).toBeInTheDocument();

        // The user authorises at the bank and the popup comes back.
        simulateBankReturn();

        await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), 'pending'),
          { timeout: 8000 });
        expect(screen.queryByText('cpPisFailedError')).not.toBeInTheDocument();
      }, 15000);

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
          // auto-closes itself.
          act(() => {
            window.dispatchEvent(new MessageEvent('message', {
              data: { type: 'pis-completed', paymentId: 'pis-1' },
              origin: window.location.origin,
            }));
          });
          fakePopup.closed = true;

          // The return's own check runs and finds the transfer not settled yet, so the wait ends
          // as "in progress" — the point being that it ends that way rather than accusing the user
          // of having closed the bank window, which is what the popup's own auto-close used to
          // look like.
          await waitFor(() => expect(screen.queryByTestId('cp-pis-waiting')).not.toBeInTheDocument(),
            { timeout: 8000 });
          expect(screen.queryByTestId('cp-pis-reopen')).not.toBeInTheDocument();
          expect(screen.queryByText('cpPisWindowClosed')).not.toBeInTheDocument();
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
