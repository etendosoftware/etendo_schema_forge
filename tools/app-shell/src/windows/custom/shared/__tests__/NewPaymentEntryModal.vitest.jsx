import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  DateField: ({ value, onChange }) => (
    <input type="date" value={value || ''} onChange={(e) => onChange?.(e.target.value)} data-testid="date-field" />
  ),
}));

// apiFetch is provided per-test via a module-level mock fn so each test can
// shape the catalog + submit responses independently.
let mockApiFetch;
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => (...args) => mockApiFetch(...args),
}));

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
      expect(screen.getByText('cpBadgeCollection')).toBeInTheDocument();
    });

    it('shows the payment title for dir "out"', () => {
      mockApiFetch = buildApiFetch();
      renderModal({ dir: 'out' });
      expect(screen.getByText('cpNewPayment')).toBeInTheDocument();
      expect(screen.getByText('cpBadgePayment')).toBeInTheDocument();
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

    it('shows the credit section when sources are present', async () => {
      mockApiFetch = buildApiFetch({
        sources: [{ id: 's1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', avail: 200 }],
      });
      renderModal();
      // Split-adaptive design: a "credit" source renders the credit group title.
      expect(await screen.findByText('cpCreditGroupTitle')).toBeInTheDocument();
    });
  });

  describe('confirm enablement', () => {
    it('enables Confirmar on an exact balance', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const confirm = screen.getByText('cpConfirm').closest('button');
      // Confirm is gated on `loading`; wait until the catalog fetch settles.
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
      // The credit/refund radios appear in the excess band.
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
      // Prefilled with today on mount → enabled (exact balance).
      await waitFor(() => expect(confirm).not.toBeDisabled());

      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });
      expect(confirm).toBeDisabled();
    });

    it('shows the paymentDateRequired error when saving a draft with an empty date', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });

      fireEvent.click(screen.getByTestId('cp-save-draft'));

      // The useUI mock returns the key as-is, so assert the i18n key.
      expect(await screen.findByText('paymentDateRequired')).toBeInTheDocument();
    });

    it('does not POST registerPayment when saving with an empty date', async () => {
      renderModal();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      fireEvent.change(screen.getByTestId('date-field'), { target: { value: '' } });

      fireEvent.click(screen.getByTestId('cp-save-draft'));

      await waitFor(() => expect(screen.getByText('paymentDateRequired')).toBeInTheDocument());
      const registerCall = mockApiFetch.mock.calls.find(c => c[0].includes('registerPayment'));
      expect(registerCall).toBeFalsy();
    });
  });
});
