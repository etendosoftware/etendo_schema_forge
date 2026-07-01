import { render, screen, fireEvent } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params && typeof params === 'object') {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value, className }) => <span className={className}>{value}</span>,
}));

const applyMock = vi.fn();
vi.mock('@/hooks/useReconciliation', () => ({
  useApplySuggestions: () => ({ apply: applyMock, loading: false, error: null }),
}));

// --- Import under test (after mocks) ----------------------------------------

import { AutoMatchSuggestionModal } from '../AutoMatchSuggestionModal.jsx';
import { toast } from 'sonner';

// --- Fixtures ---------------------------------------------------------------

const GROUP_STANDARD = {
  groupKey: 'line-1-txn-1',
  statementLine: { id: 'line-1', description: 'Transf. recibida ACME', amount: -500, date: '2026-05-06T00:00:00Z' },
  operations: [{ id: 'txn-1', documentNo: 'F2660006', partnerName: 'NCA Group Spain SA', amount: -500, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

const GROUP_RULE = {
  groupKey: 'line-2-rule-r1',
  statementLine: { id: 'line-2', description: 'Impuesto IRPF-MOD. 111', amount: -894.2, date: '2026-05-06T00:00:00Z' },
  operations: [{ id: 'new', glItemId: 'AEAT-Hacienda', amount: -894.2, isNew: true }],
  origin: 'rule',
  ruleName: 'Impuestos',
  isNew: true,
  difference: 0,
  createPayment: { ruleId: 'r1', glItemId: 'GL-001', bpartnerId: '', amount: -894.2 },
};

const KPIS = { pendingLines: 12, groupsFound: 6, opsToLink: 10, willCreate: 1 };

function renderModal(overrides = {}) {
  const defaults = {
    accountId: 'acc-1',
    accountName: 'Banco Santander',
    groups: [GROUP_STANDARD, GROUP_RULE],
    kpis: KPIS,
    currency: 'EUR',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
  return { ...render(<AutoMatchSuggestionModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ------------------------------------------------------------------

describe('AutoMatchSuggestionModal', () => {
  beforeEach(() => {
    applyMock.mockReset().mockResolvedValue({});
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('renders nothing when open is false', () => {
    const { container } = renderModal({ open: false });
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull();
  });

  it('renders the modal title', () => {
    renderModal();
    expect(screen.getByText('financeReconcileAutomatchModalTitle')).toBeInTheDocument();
  });

  it('shows account name in KPI strip', () => {
    renderModal();
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();
  });

  it('shows KPI values', () => {
    renderModal();
    expect(screen.getByText('12')).toBeInTheDocument(); // pendingLines
    expect(screen.getByText('6')).toBeInTheDocument();  // groupsFound
  });

  it('shows column headers', () => {
    renderModal();
    expect(screen.getByText('financeReconcileAutomatchColStatement')).toBeInTheDocument();
    expect(screen.getByText('financeReconcileAutomatchColOps')).toBeInTheDocument();
  });

  it('renders statement line descriptions', () => {
    renderModal();
    expect(screen.getByText('Transf. recibida ACME')).toBeInTheDocument();
    expect(screen.getByText('Impuesto IRPF-MOD. 111')).toBeInTheDocument();
  });

  it("shows rule badge with rule name for rule-origin groups", () => {
    renderModal();
    // The rule badge appears in both the group badge and the operation name; at least one must exist.
    expect(screen.getAllByText(/Impuestos/).length).toBeGreaterThan(0);
  });

  it('all groups are checked by default', () => {
    renderModal();
    // SelectBox renders <button aria-checked> elements, not <input type="checkbox">.
    // The two group-level buttons should have aria-checked="true".
    const groupCheckboxes = screen.getAllByTestId(/automatch-group-check-/);
    groupCheckboxes.forEach((cb) => expect(cb).toHaveAttribute('aria-checked', 'true'));
  });

  it('select-all checkbox unchecks all groups', () => {
    renderModal();
    const selectAll = screen.getByTestId('automatch-select-all');
    fireEvent.click(selectAll); // uncheck all
    const groupCheckboxes = screen.getAllByTestId(/automatch-group-check-/);
    groupCheckboxes.forEach((cb) => expect(cb).toHaveAttribute('aria-checked', 'false'));
  });

  it('apply button is disabled when no groups are checked', () => {
    renderModal();
    // Uncheck all
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    expect(screen.getByTestId('automatch-modal-apply')).toBeDisabled();
  });

  it('unchecking a group removes it from apply payload', async () => {
    renderModal();
    const firstGroupCb = screen.getByTestId(`automatch-group-check-${GROUP_STANDARD.groupKey}`);
    fireEvent.click(firstGroupCb); // uncheck standard group

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));
    await vi.waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));

    const payload = applyMock.mock.calls[0][0];
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0].statementLineId).toBe('line-2');
  });

  it('passes createPayment spec for rule groups', async () => {
    renderModal({ groups: [GROUP_RULE] });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));
    await vi.waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    const group = applyMock.mock.calls[0][0].groups[0];
    expect(group.createPayment).toBeDefined();
    expect(group.createPayment.glItemId).toBe('GL-001');
  });

  it('standard groups do not include createPayment', async () => {
    renderModal({ groups: [GROUP_STANDARD] });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));
    await vi.waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    expect(applyMock.mock.calls[0][0].groups[0].createPayment).toBeUndefined();
  });

  it('calls onSuccess and onClose on successful apply', async () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));
    await vi.waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });

  it('shows error toast when apply fails', async () => {
    applyMock.mockRejectedValue(new Error('Server error'));
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('calls onClose when cancel is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no groups', () => {
    renderModal({ groups: [] });
    expect(screen.getByText('financeReconcileAutomatchEmpty')).toBeInTheDocument();
  });

  // ── SelectBox header dash / empty (T7) ────────────────────────────────────────

  it('SelectBox header shows dash (active state) when any groups are checked', () => {
    renderModal();
    const selectAll = screen.getByTestId('automatch-select-all');
    // With groups loaded, at least one is checked by default — the header must show dash.
    expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
  });

  it('SelectBox header shows empty (unchecked) when all groups are deselected', () => {
    renderModal();
    // Uncheck all groups via the select-all toggle.
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    const selectAll = screen.getByTestId('automatch-select-all');
    // No groups selected → no dash, no check → aria-checked = false.
    expect(selectAll).toHaveAttribute('aria-checked', 'false');
  });

  // ── Amount color rendering (T7) ───────────────────────────────────────────────

  it('operation with positive amount renders with green color class', () => {
    const positiveOp = { ...GROUP_STANDARD.operations[0], amount: 500 };
    const positiveGroup = { ...GROUP_STANDARD, operations: [positiveOp] };
    renderModal({ groups: [positiveGroup] });
    // MoneyAmount mock renders the value directly; the color class is on the wrapper div.
    // The OperationRow applies text-[#1E874C] for positive amounts.
    expect(document.querySelector('.text-\\[\\#1E874C\\]')).toBeTruthy();
  });

  it('operation with negative amount renders with red color class', () => {
    renderModal({ groups: [GROUP_STANDARD] }); // GROUP_STANDARD has amount: -500
    // OperationRow applies text-[#D50B3E] for negative amounts.
    expect(document.querySelector('.text-\\[\\#D50B3E\\]')).toBeTruthy();
  });

  // ── Rule group subtitle (T7) ──────────────────────────────────────────────────

  it('rule group shows "Nuevo movimiento (se creará)" subtitle for the proposed operation', () => {
    renderModal({ groups: [GROUP_RULE] });
    // OperationRow renders the ui key 'financeReconcileAutomatchOpNew' as the subtitle
    // for isNew operations (our i18n mock returns the key as-is).
    expect(screen.getByText('financeReconcileAutomatchOpNew')).toBeInTheDocument();
  });

  // ── Cancel button label (T7) ──────────────────────────────────────────────────

  it('cancel button shows the "cancel" i18n key, not a hardcoded string', () => {
    renderModal();
    // The cancel button uses ui('cancel') — the mock returns the key 'cancel'.
    expect(screen.getByTestId('automatch-modal-cancel')).toHaveTextContent('cancel');
  });
});
