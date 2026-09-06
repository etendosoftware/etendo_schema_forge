import { render, screen, fireEvent } from '@testing-library/react';
import { formatCurrency } from '@/lib/formatCurrency.js';

// --- Mocks ----------------------------------------------------------------

// This suite asserts COUNTS (footer summary, KPI strip, toast pluralisation), so the i18n mock has
// to surface the interpolation params — the sibling suite's `key.replace('{count}', v)` mock silently
// drops them, because the key itself carries no placeholder. Rendering `key p=v` keeps every
// assertion key-based (no hardcoded Spanish/English) while still making the numbers observable.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params && typeof params === 'object') {
      const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ');
      return `${key} ${parts}`;
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

/** Plain 1:1 match, amounts agree — links one operation, creates nothing. */
const GROUP_SUGGESTED = {
  groupKey: 'g-suggested',
  statementLine: { id: 'line-1', description: 'Transf. recibida ACME', amount: -500, date: '2026-05-06T00:00:00Z' },
  operations: [{ id: 'txn-1', documentNo: 'F2660006', partnerName: 'NCA Group Spain SA', amount: -500, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

/** Rule match — no existing movement, the run will create the payment. */
const GROUP_RULE = {
  groupKey: 'g-rule',
  statementLine: { id: 'line-2', description: 'Impuesto IRPF-MOD. 111', amount: -894.2, date: '2026-05-06T00:00:00Z' },
  operations: [{ id: 'new', glItemId: 'AEAT-Hacienda', amount: -894.2, isNew: true }],
  origin: 'rule',
  ruleName: 'Impuestos',
  isNew: true,
  difference: 0,
  createPayment: { ruleId: 'r1', glItemId: 'GL-001', bpartnerId: '', amount: -894.2 },
};

/**
 * The ticket's headline shape: a 27.00 line against a 26.62 movement. The 0.38 leftover is posted to
 * the account's accounting account, so this group both LINKS and CREATES. Three distinct amounts so
 * the statement side, the linked operation and the difference row can each be asserted on its own.
 */
const GROUP_NEAR_AMOUNT = {
  groupKey: 'g-near-amount',
  statementLine: { id: 'line-3', description: 'Pago proveedor XYZ', amount: -27, date: '2026-05-08T00:00:00Z' },
  operations: [{ id: 'txn-3', documentNo: 'F3000003', partnerName: 'Proveedor XYZ SL', amount: -26.62, isNew: false }],
  origin: 'standard',
  isNew: false,
  nearMatch: true,
  difference: -0.38,
};

/** A DATE-only near match: still a difference for the badge, but nothing is posted for it. */
const GROUP_NEAR_DATE = {
  groupKey: 'g-near-date',
  statementLine: { id: 'line-4', description: 'Recibo domiciliado', amount: -120, date: '2026-05-09T00:00:00Z' },
  operations: [{ id: 'txn-4', documentNo: 'F4000004', partnerName: 'Iberdrola SA', amount: -120, isNew: false }],
  origin: 'standard',
  isNew: false,
  nearMatch: true,
  difference: 0,
};

const GL_ITEM_DIFFERENCE = { id: 'GL-DIFF-1', name: 'Diferencias de conciliación' };

// Deliberately NOT derivable from the fixtures above — the KPI strip must show the backend's own
// figure, not one the modal recomputed from whatever happens to be checked.
const KPIS = { pendingLines: 12, groupsFound: 6, opsToLink: 10, willCreate: 7 };

const EDIT_ACCOUNT_BUTTON = 'automatch-modal-edit-account';

const GL_ITEM_REQUIRED_FAILURE = {
  statementLineId: 'line-3',
  code: 'GL_ITEM_REQUIRED',
  differenceAmount: '0.38',
  error: { message: 'A difference GL item is required' },
};

const GL_ITEM_REQUIRED_FAILURE_2 = {
  ...GL_ITEM_REQUIRED_FAILURE,
  statementLineId: 'line-4',
};

/** A rejection that is NOT about the accounting account — the batch must fall back to its message. */
const PLAIN_FAILURE = {
  statementLineId: 'line-1',
  error: { message: 'Statement line is already reconciled: line-1' },
};

/**
 * `Intl.NumberFormat` inserts a non-breaking space before the currency symbol; testing-library's
 * text normalizer collapses it when reading the DOM but not in the expected string, so every
 * expectation built from `formatCurrency()` goes through the same normalization.
 */
const normalizeSpaces = (s) => s.replace(/[  ]/g, ' ');
const money = (value, currency = 'EUR') =>
  normalizeSpaces(`${value < 0 ? '-' : '+'}${formatCurrency(currency, Math.abs(value))}`);

function defaultProps(overrides = {}) {
  return {
    accountId: 'acc-1',
    accountName: 'Banco Santander',
    groups: [GROUP_SUGGESTED, GROUP_RULE],
    kpis: KPIS,
    currency: 'EUR',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    glItemDifference: GL_ITEM_DIFFERENCE,
    ...overrides,
  };
}

function renderModal(overrides = {}) {
  const props = defaultProps(overrides);
  return { ...render(<AutoMatchSuggestionModal {...props} />), props };
}

/** The footer summary text ("will link N / will create M"). */
const footerText = () => screen.getByText(/financeReconcileAutomatchFooter/).textContent;

/** The value rendered under a KPI label (label and value are siblings in one flex column). */
const kpiValue = (labelKey) => screen.getByText(labelKey).parentElement.textContent.replace(labelKey, '');

beforeEach(() => {
  applyMock.mockReset().mockResolvedValue({});
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Type badge per group (ETP-4965 QA round)
//
// The modal used to label ONLY rule-origin groups, so an exact suggestion and a within-tolerance
// near match were indistinguishable — even though applying the second one posts an accounting entry.
// Every group now states its type with the same pill the left panel uses for the same line.
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — group type badge', () => {
  it('renders one badge per group, of the right kind for each shape', () => {
    renderModal({ groups: [GROUP_SUGGESTED, GROUP_RULE, GROUP_NEAR_AMOUNT] });

    expect(screen.getByTestId('automatch-group-kind-suggested')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-group-kind-byRule')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-group-kind-difference')).toBeInTheDocument();
  });

  it('appends the rule name to the by-rule badge', () => {
    renderModal({ groups: [GROUP_RULE] });
    expect(screen.getByTestId('automatch-group-kind-byRule'))
      .toHaveTextContent('financeReconcileAutomatchBadgeByRule Impuestos');
  });

  it('labels a suggestion and a near match with different shared keys', () => {
    renderModal({ groups: [GROUP_SUGGESTED, GROUP_NEAR_AMOUNT] });
    expect(screen.getByTestId('automatch-group-kind-suggested'))
      .toHaveTextContent('financeReconcileBadgeSuggested');
    expect(screen.getByTestId('automatch-group-kind-difference'))
      .toHaveTextContent('financeReconcileBadgeDifference');
  });

  it('badges a DATE-only near match as a difference too', () => {
    // Nothing is posted for it, but the reason it was proposed is still a deviation — calling it a
    // plain suggestion would put it back in the bucket this round split apart.
    renderModal({ groups: [GROUP_NEAR_DATE] });
    expect(screen.getByTestId('automatch-group-kind-difference')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. The synthetic difference operation row
//
// A near match links its operation AND posts the leftover. That second movement was invisible: the
// modal listed only the linked operation, so the user could not tell where the difference would land
// — nor that it could not land anywhere at all.
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — difference operation row', () => {
  it('names the account accounting account and shows the difference amount', () => {
    renderModal({ groups: [GROUP_NEAR_AMOUNT], glItemDifference: GL_ITEM_DIFFERENCE });

    expect(screen.getByText('Diferencias de conciliación')).toBeInTheDocument();
    expect(screen.getByText(money(-0.38))).toBeInTheDocument();
    // Its own subtitle, distinct from a rule group's "new movement" one.
    expect(screen.getByText('financeReconcileAutomatchOpDifference')).toBeInTheDocument();
    // And it is marked as something that will be created.
    expect(screen.getByText('financeReconcileAutomatchBadgeNew')).toBeInTheDocument();
  });

  it('keeps the linked operation alongside the difference row', () => {
    renderModal({ groups: [GROUP_NEAR_AMOUNT] });
    expect(screen.getByText('Proveedor XYZ SL')).toBeInTheDocument();
    expect(screen.getByText(money(-26.62))).toBeInTheDocument();
    // The statement side is untouched by the extra row.
    expect(screen.getByText(money(-27))).toBeInTheDocument();
  });

  it('adds NO difference row for a date-only near match', () => {
    renderModal({ groups: [GROUP_NEAR_DATE], glItemDifference: GL_ITEM_DIFFERENCE });

    // Zero difference posts nothing, so offering a movement row would promise an entry that the
    // backend never creates — the same rule its willCreate delta applies.
    expect(screen.queryByText('Diferencias de conciliación')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchOpDifference')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchDiffNoAccount')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchBadgeNew')).toBeNull();
    // Only the linked operation is listed.
    expect(screen.getByText('Iberdrola SA')).toBeInTheDocument();
  });

  it('adds no difference row to a plain suggestion, whatever the glItemDifference', () => {
    renderModal({ groups: [GROUP_SUGGESTED], glItemDifference: GL_ITEM_DIFFERENCE });
    expect(screen.queryByText('Diferencias de conciliación')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchOpDifference')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Footer summary and KPI strip counts
//
// Counting a near match only as a link is what made the footer promise one movement while the apply
// created two. A date-only near match must NOT inflate that count.
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — footer and KPI counts', () => {
  const MIXED = [GROUP_SUGGESTED, GROUP_RULE, GROUP_NEAR_AMOUNT, GROUP_NEAR_DATE];

  it('counts a mixed batch: 3 links and 2 creations', () => {
    renderModal({ groups: MIXED });
    // Links: the three non-isNew groups. Creations: the rule group + the amount near match.
    expect(footerText()).toContain('financeReconcileAutomatchFooterLink count=3');
    expect(footerText()).toContain('financeReconcileAutomatchFooterCreate count=2');
  });

  it('does not count a date-only near match as a creation', () => {
    renderModal({ groups: [GROUP_NEAR_DATE] });
    expect(footerText()).toContain('financeReconcileAutomatchFooterLink count=1');
    expect(footerText()).not.toContain('financeReconcileAutomatchFooterCreate');
  });

  it('counts an amount near match on BOTH sides', () => {
    renderModal({ groups: [GROUP_NEAR_AMOUNT] });
    expect(footerText()).toContain('financeReconcileAutomatchFooterLink count=1');
    expect(footerText()).toContain('financeReconcileAutomatchFooterCreate count=1');
  });

  it('drops both counts for a group the user unchecks', () => {
    renderModal({ groups: MIXED });
    fireEvent.click(screen.getByTestId(`automatch-group-check-${GROUP_NEAR_AMOUNT.groupKey}`));
    expect(footerText()).toContain('financeReconcileAutomatchFooterLink count=2');
    expect(footerText()).toContain('financeReconcileAutomatchFooterCreate count=1');
  });

  it('falls back to the "nothing selected" summary when everything is unchecked', () => {
    renderModal({ groups: MIXED });
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    expect(screen.getByText('financeReconcileAutomatchFooterNone')).toBeInTheDocument();
  });

  it('renders the backend willCreate KPI', () => {
    // Translated in all three locales but never rendered before this round, so the movements a run
    // generates had no figure anywhere. It is the BACKEND's number: 7, not the 2 the footer derives.
    renderModal({ groups: MIXED });
    expect(kpiValue('financeReconcileAutomatchKpiNew')).toBe('7');
  });

  it('shows 0 for willCreate when the backend omitted it', () => {
    renderModal({ groups: MIXED, kpis: { pendingLines: 12, groupsFound: 6, opsToLink: 10 } });
    expect(kpiValue('financeReconcileAutomatchKpiNew')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// 4. handleApply — naming the cause instead of the outcome
//
// applySuggestions answers 201 even when every group is rejected; the reason travels inside
// results[]. Reducing that to two counters produced a bare "could not apply" for a problem as
// specific and as fixable as an unconfigured accounting account.
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — apply outcome reporting', () => {
  it('falls back to the backend message when the failures are not all about the accounting account', async () => {
    applyMock.mockResolvedValue({
      results: [PLAIN_FAILURE, GL_ITEM_REQUIRED_FAILURE],
    });
    renderModal({ groups: [GROUP_SUGGESTED, GROUP_NEAR_AMOUNT] });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    // Naming the accounting account here would mislead: it is not what stopped the other group.
    expect(toast.error).toHaveBeenCalledWith('Statement line is already reconciled: line-1');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('reports a mixed batch of failure kinds with a partial warning when some groups succeeded', async () => {
    applyMock.mockResolvedValue({
      results: [
        { reconciliationId: 'r1', statementLineId: 'line-2' },
        PLAIN_FAILURE,
        GL_ITEM_REQUIRED_FAILURE,
      ],
    });
    renderModal({ groups: [GROUP_SUGGESTED, GROUP_RULE, GROUP_NEAR_AMOUNT] });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(toast.warning).toHaveBeenCalledWith(
      'financeReconcileAutomatchToastPartial success=1 failed=2');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still reports a clean batch with the success toast', async () => {
    applyMock.mockResolvedValue({
      results: [{ reconciliationId: 'r1', statementLineId: 'line-1' }],
    });
    renderModal({ groups: [GROUP_SUGGESTED] });
    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('financeReconcileAutomatchToastSuccess count=1');
  });
});

// ---------------------------------------------------------------------------
// 5. needsGlItem resets on reopen
//
// The flag is set by a failed apply and used to be never cleared, so a LATER run — on an account
// that had since been configured, or on a different account entirely — still offered the "edit
// account" remedy for a problem that no longer existed.
// ---------------------------------------------------------------------------

