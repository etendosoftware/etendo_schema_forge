import { render, screen, fireEvent } from '@testing-library/react';
import { formatCurrency } from '@/lib/formatCurrency.js';

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
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  // Mirror the real MoneyAmount's currency-aware formatting (sign + formatCurrency) so tests can
  // assert the statement-line side (left column) actually reflects the account's currency, the
  // same way the real component does — instead of a currency-blind stub that would mask the
  // "hardcoded €" regression this suite exists to catch.
  MoneyAmount: ({ value, currency = 'EUR', className }) => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return <span className={className}>{sign}{formatCurrency(currency, Math.abs(value))}</span>;
  },
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

// Statement-line amount and operation amount are deliberately different values so the two sides
// can be asserted independently (not just because they happen to coincide).
const GROUP_USD_MIXED = {
  groupKey: 'line-3-txn-3',
  statementLine: { id: 'line-3', description: 'USD wire transfer', amount: -750, date: '2026-05-07T00:00:00Z' },
  operations: [{ id: 'txn-3', documentNo: 'F9000001', partnerName: 'Acme US Inc', amount: -300, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
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
    toast.warning.mockReset();
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

  // ── Per-group partial-success outcome (ETP-4951: shared-batch reconciliation) ──
  // applySuggestions now shares ONE reconciliation across the whole batch, so a per-group failure no
  // longer aborts the request — it resolves with `results[]` carrying a mix of success entries and
  // `{ error }` entries. handleApply must read that per-group outcome instead of always showing a
  // flat success toast regardless of what actually happened.

  it('shows a partial-success warning toast when some groups succeeded and some failed', async () => {
    applyMock.mockResolvedValue({
      results: [
        { reconciliationId: 'r1', statementLineId: 'line-1' },
        { error: { message: 'boom' } },
      ],
    });
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('financeReconcileAutomatchToastPartial'),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error toast (not a warning) when every group in the batch failed', async () => {
    applyMock.mockResolvedValue({
      results: [
        { error: { message: 'boom 1' } },
        { error: { message: 'boom 2' } },
      ],
    });
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    // The backend's own reason wins over the generic key: applySuggestions answers 201 even when
    // every group is rejected, so results[].error.message is the ONLY place the cause survives.
    // Reducing it to a bare "could not apply" is what sent QA back with an unactionable toast.
    expect(toast.error).toHaveBeenCalledWith('boom 1');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('still shows the plain success toast when every group in the batch succeeded', async () => {
    applyMock.mockResolvedValue({
      results: [
        { reconciliationId: 'r1', statementLineId: 'line-1' },
        { reconciliationId: 'r1', statementLineId: 'line-2' },
      ],
    });
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
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

  it('operation with positive amount renders with a semantic success color class', () => {
    const positiveOp = { ...GROUP_STANDARD.operations[0], amount: 500 };
    const positiveGroup = { ...GROUP_STANDARD, operations: [positiveOp] };
    renderModal({ groups: [positiveGroup] });
    // MoneyAmount mock renders the value directly; the color class is on the wrapper div.
    expect(document.querySelector('.text-\\[var\\(--status-success-fg\\)\\]')).toBeTruthy();
  });

  it('operation with negative amount renders with a semantic destructive color class', () => {
    renderModal({ groups: [GROUP_STANDARD] }); // GROUP_STANDARD has amount: -500
    expect(document.querySelector('.text-\\[hsl\\(var\\(--destructive\\)\\)\\]')).toBeTruthy();
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

  // ── Currency correctness (ETP-4314 regression) ────────────────────────────────
  // OperationRow's formatSignedAmount() used to hardcode a literal "€" regardless of the
  // account's actual currency, while its sibling StatementContent (via <MoneyAmount>) already
  // used the real account currency — for a USD account the statement side showed "$" and the
  // operation side showed "€" in the very same dialog. Both sides must now agree.
  //
  // Note: `Intl.NumberFormat` (es-ES) inserts a non-breaking space (U+00A0) before the currency
  // symbol; @testing-library's default text normalizer collapses it to a regular space when
  // reading the DOM but does not touch the literal string passed to `getByText`, so expected
  // strings built from `formatCurrency()` are run through the same normalization here.
  const normalizeSpaces = (s) => s.replace(/ /g, ' ');

  it('operation amount uses EUR by default (baseline, account currency defaults to EUR)', () => {
    renderModal({ groups: [GROUP_STANDARD] }); // GROUP_STANDARD op amount is -500, default currency 'EUR'
    // Both the statement line and the operation share the same -500 amount, so both sides render
    // the identical EUR-formatted string.
    const matches = screen.getAllByText(normalizeSpaces(`-${formatCurrency('EUR', 500)}`));
    expect(matches.length).toBe(2);
  });

  it('operation amount uses the account currency (USD), not a hardcoded €, and agrees with the statement-line side', () => {
    renderModal({ currency: 'USD', groups: [GROUP_STANDARD] });

    // GROUP_STANDARD's statement line and operation are both -500, so both sides render the
    // same USD-formatted string — proving the operation column no longer disagrees with the
    // statement column on which currency symbol to use.
    const expectedAmount = normalizeSpaces(`-${formatCurrency('USD', 500)}`);
    const matches = screen.getAllByText(expectedAmount);
    expect(matches.length).toBe(2); // one from StatementContent, one from OperationRow
    matches.forEach((el) => {
      expect(el.textContent).toContain('$');
      expect(el.textContent).not.toContain('€');
    });
  });

  it('statement line and operation row format independent amounts in USD, never falling back to €', () => {
    renderModal({ currency: 'USD', groups: [GROUP_USD_MIXED] });

    const expectedStatementAmount = normalizeSpaces(`-${formatCurrency('USD', 750)}`);
    const expectedOperationAmount = normalizeSpaces(`-${formatCurrency('USD', 300)}`);
    expect(screen.getByText(expectedStatementAmount)).toBeInTheDocument();
    expect(screen.getByText(expectedOperationAmount)).toBeInTheDocument();
    // No money amount anywhere in the dialog should render the EUR symbol for a USD account.
    expect(document.body.textContent).not.toContain('€');
  });

  // ── Missing accounting concept: the edit-account affordance (ETP-4965) ────────
  //
  // A mass automatch cannot ask for an accounting concept line by line, so a group whose
  // within-tolerance difference has no `EM_Aprm_Glitem_Diff` to post against comes back as a
  // per-group `GL_ITEM_REQUIRED` failure. The only thing the user can do about it is configure the
  // concept on the account — hence the modal STAYS OPEN and offers a direct link there, instead of
  // closing over a toast that names a setting the user then has to go hunting for.
  //
  // The button is deliberately conditional on BOTH signals: the failure must have actually
  // happened (`needsGlItem`) and the host must have given us somewhere to navigate
  // (`onEditAccount`). It is not a permanent fixture of the footer.

  const GL_ITEM_REQUIRED_FAILURE = {
    statementLineId: 'line-2',
    code: 'GL_ITEM_REQUIRED',
    differenceAmount: '0.38',
    error: { message: 'A difference GL item is required' },
  };

  const EDIT_ACCOUNT_BUTTON = 'automatch-modal-edit-account';

  it('does not offer the edit-account button before any apply has run', () => {
    renderModal({ onEditAccount: vi.fn() });
    expect(screen.queryByTestId(EDIT_ACCOUNT_BUTTON)).toBeNull();
  });

  it('does not offer the edit-account button after a fully successful apply', async () => {
    applyMock.mockResolvedValue({
      results: [
        { reconciliationId: 'r1', statementLineId: 'line-1' },
        { reconciliationId: 'r1', statementLineId: 'line-2' },
      ],
    });
    const { props } = renderModal({ onEditAccount: vi.fn() });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId(EDIT_ACCOUNT_BUTTON)).toBeNull();
    expect(props.onEditAccount).not.toHaveBeenCalled();
  });

});
