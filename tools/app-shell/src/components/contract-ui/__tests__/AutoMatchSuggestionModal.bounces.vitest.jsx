// @covers tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx
// @covers tools/app-shell/src/components/contract-ui/AutoMatchBounceSection.jsx
// @covers tools/app-shell/src/components/contract-ui/AutoMatchSelectBox.jsx
/**
 * The "Posibles rebotes" section of the automatch modal (bounce pairs, flag `bank-bounce-suggestions`).
 *
 * The SPA never evaluates the flag: with it off the backend sends groups without `kind` and no
 * `kpis.bouncePairs`, and the modal must be exactly what it was. With it on, the bounce-pair groups
 * render below the reconciliation groups and travel in the SAME applySuggestions call.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

// The key, plus its params as JSON so the variants can be told apart. A `backendError.*` key reads
// as translated (`T(<key>)`), so the coded refusals can be asserted through translateBackendErrorBody.
function fakeUi(key, params) {
  if (key.startsWith('backendError.')) return `T(${key})`;
  if (params && typeof params === 'object' && Object.keys(params).length > 0) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
}

vi.mock('@/i18n', () => ({
  useUI: () => fakeUi,
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
  MoneyAmount: ({ value, className }) => <span className={className}>{String(value)}</span>,
}));

const applyMock = vi.fn();
vi.mock('@/hooks/useReconciliation', () => ({
  useApplySuggestions: () => ({ apply: applyMock, loading: false, error: null }),
}));

// --- Import under test (after mocks) ----------------------------------------

import { AutoMatchSuggestionModal } from '../AutoMatchSuggestionModal.jsx';
import { toast } from 'sonner';

// --- Fixtures ---------------------------------------------------------------

/** A transaction group exactly as the flag-off backend sends it: no `kind`. */
const TX = {
  groupKey: 'line-1-txn-1',
  statementLine: { id: 'line-1', description: 'Transf. recibida ACME', amount: -500, date: '2026-05-06' },
  operations: [{ id: 'txn-1', documentNo: 'F2660006', partnerName: 'ACME', amount: -500, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

const HIGH = {
  kind: 'bouncePair',
  groupKey: 'bp-high',
  origin: 'bounce',
  confidence: 'high',
  signal: 'pis_link',
  signals: ['pis_link'],
  ambiguous: false,
  statementLine: { id: 'O1', description: 'Pago proveedor', amount: -120, date: '2026-05-02' },
  counterpartLine: { id: 'B1', description: 'DEVOLUCION', amount: 120, date: '2026-05-02' },
  operations: [],
  isNew: false,
  difference: 0,
};

const REVIEW = {
  kind: 'bouncePair',
  groupKey: 'bp-review',
  origin: 'bounce',
  confidence: 'review',
  signal: 'return_text',
  signals: ['return_text'],
  ambiguous: false,
  statementLine: { id: 'O2', description: 'Recibo luz', amount: -60, date: '2026-05-01' },
  counterpartLine: { id: 'B2', description: 'RECIBO DEVUELTO', amount: 60, date: '2026-05-04' },
  operations: [],
  isNew: false,
  difference: 0,
};

const AMBIGUOUS = {
  kind: 'bouncePair',
  groupKey: 'bp-amb',
  origin: 'bounce',
  confidence: 'review',
  signal: 'counterparty',
  signals: ['counterparty'],
  ambiguous: true,
  statementLine: null,
  counterpartLine: { id: 'B3', description: 'Abono ACME', amount: 80, date: '2026-05-05' },
  candidates: [
    { line: { id: 'C1', description: 'Pago ACME 1', amount: -80, date: '2026-05-01' } },
    { line: { id: 'C2', description: 'Pago ACME 2', amount: -80, date: '2026-05-03' } },
  ],
  operations: [],
  isNew: false,
  difference: 0,
};

const KPIS_OFF = { pendingLines: 8, groupsFound: 1, opsToLink: 1, willCreate: 0 };
const KPIS_ON = { ...KPIS_OFF, bouncePairs: 3 };

function renderModal(overrides = {}) {
  const props = {
    accountId: 'acc-1',
    accountName: 'Banco Santander',
    groups: [TX, HIGH, REVIEW, AMBIGUOUS],
    kpis: KPIS_ON,
    currency: 'EUR',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  return { ...render(<AutoMatchSuggestionModal {...props} />), props };
}

const applyButton = () => screen.getByTestId('automatch-modal-apply');
const footerText = () => screen.getByTestId('Info__a89979').nextSibling.textContent;
const kpiValue = (label) => screen.getByText(label).nextSibling.textContent;
const check = (key) => screen.getByTestId(`automatch-bounce-check-${key}`);

async function clickApply() {
  fireEvent.click(applyButton());
  await vi.waitFor(() => expect(applyMock).toHaveBeenCalled());
}

beforeEach(() => {
  applyMock.mockReset().mockResolvedValue({ results: [] });
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — flag off (no kind, no kpis.bouncePairs)', () => {
  it('renders no bounce section and no bounce KPI', () => {
    renderModal({ groups: [TX], kpis: KPIS_OFF });
    expect(screen.queryByTestId('automatch-bounce-section')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchKpiBouncePairs')).toBeNull();
    expect(screen.getByTestId('automatch-select-all')).toBeInTheDocument();
  });

  it('keeps the original label, footer and payload, with nothing added to the group', async () => {
    applyMock.mockResolvedValue({ results: [{ groupKey: TX.groupKey }] });
    const { props } = renderModal({ groups: [TX], kpis: KPIS_OFF });
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionApply:{"count":1}');
    expect(footerText()).toBe('financeReconcileAutomatchFooterLink:{"count":1}');

    await clickApply();
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith({
      financialAccountId: 'acc-1',
      groups: [{ statementLineId: 'line-1', operationIds: ['txn-1'] }],
    });
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('financeReconcileAutomatchToastSuccess:{"count":1}');
  });

  it('says "no groups selected" (not "no suggestions") when nothing is checked', () => {
    renderModal({ groups: [TX], kpis: KPIS_OFF });
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    expect(footerText()).toBe('financeReconcileAutomatchFooterNone');
    expect(applyButton()).toBeDisabled();
  });
});

describe('AutoMatchSuggestionModal — the Posibles rebotes section', () => {
  it('renders the pairs below the groups, with their count and the KPI', () => {
    renderModal();
    const section = screen.getByTestId('automatch-bounce-section');
    expect(within(section).getByText('financeReconcileAutomatchBounceTitle')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-bounce-count')).toHaveTextContent('3');
    expect(kpiValue('financeReconcileAutomatchKpiBouncePairs')).toBe('3');
    expect(screen.getByTestId('automatch-bounce-row-bp-high')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-bounce-row-bp-review')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-bounce-row-bp-amb')).toBeInTheDocument();
    // The group block stays: a pair never replaces a transaction group.
    expect(screen.getByText('Transf. recibida ACME')).toBeInTheDocument();
  });

  it('shows the original on the left and the bounce on the right', () => {
    renderModal();
    expect(screen.getByTestId('automatch-bounce-original-bp-review')).toHaveTextContent('Recibo luz');
    expect(screen.getByTestId('automatch-bounce-line-bp-review')).toHaveTextContent('RECIBO DEVUELTO');
    // An ambiguous pair shows its first candidate and every candidate date.
    const amb = screen.getByTestId('automatch-bounce-original-bp-amb');
    expect(amb).toHaveTextContent('Pago ACME 1');
    expect(amb).toHaveTextContent('01/05/2026 · 03/05/2026');
  });

  it('tags a high pair "Confianza alta" and a review pair with its short reason', () => {
    renderModal();
    expect(screen.getByTestId('automatch-bounce-tag-high-bp-high')).toHaveTextContent('financeReconcileBounceTagHigh');
    expect(screen.queryByTestId('automatch-bounce-tag-review-bp-high')).toBeNull();
    expect(screen.getByTestId('automatch-bounce-tag-review-bp-review'))
      .toHaveTextContent(/^financeReconcileBounceTagReview:.*financeReconcileBounceReasonLateShort.*days.*3/);
    expect(screen.getByTestId('automatch-bounce-tag-review-bp-amb'))
      .toHaveTextContent(/^financeReconcileBounceTagReview:.*financeReconcileBounceReasonAmbiguousShort.*count.*2/);
  });

  it('starts with high checked, review unchecked and ambiguous disabled with its aria-label', () => {
    renderModal();
    expect(check('bp-high')).toHaveAttribute('aria-checked', 'true');
    expect(check('bp-review')).toHaveAttribute('aria-checked', 'false');
    expect(check('bp-review')).toHaveAttribute('aria-label', 'financeReconcileAutomatchBounceCheck');
    const amb = check('bp-amb');
    expect(amb).toBeDisabled();
    expect(amb).toHaveAttribute('aria-checked', 'false');
    expect(amb).toHaveAttribute('aria-label', 'financeReconcileAutomatchBounceAmbiguousCheck');
    fireEvent.click(amb);
    expect(amb).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles a pair', () => {
    renderModal();
    fireEvent.click(check('bp-review'));
    expect(check('bp-review')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(check('bp-high'));
    expect(check('bp-high')).toHaveAttribute('aria-checked', 'false');
  });

  it('offers "Revisar en el panel" only with onReviewPair, and only on pairs to review', () => {
    const onReviewPair = vi.fn();
    const { unmount } = renderModal();
    expect(screen.queryByTestId('automatch-bounce-review-bp-review')).toBeNull();
    expect(screen.queryByTestId('automatch-bounce-review-bp-amb')).toBeNull();
    unmount();

    renderModal({ onReviewPair });
    expect(screen.queryByTestId('automatch-bounce-review-bp-high')).toBeNull();
    expect(screen.getByTestId('automatch-bounce-review-bp-review')).toHaveTextContent('financeReconcileAutomatchBounceReview');
    fireEvent.click(screen.getByTestId('automatch-bounce-review-bp-amb'));
    expect(onReviewPair).toHaveBeenCalledWith(AMBIGUOUS);
  });

  it('select-all of pairs checks every selectable pair, then unchecks them; never the ambiguous one', () => {
    renderModal();
    const all = screen.getByTestId('automatch-bounce-select-all');
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(all);
    expect(check('bp-high')).toHaveAttribute('aria-checked', 'true');
    expect(check('bp-review')).toHaveAttribute('aria-checked', 'true');
    expect(check('bp-amb')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(all);
    expect(check('bp-high')).toHaveAttribute('aria-checked', 'false');
    expect(check('bp-review')).toHaveAttribute('aria-checked', 'false');
    expect(all).toHaveAttribute('aria-checked', 'false');
    // The transaction group is not touched by the pairs' select-all.
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionApply:{"count":1}');
  });

  it('disables the pairs select-all when only ambiguous pairs are offered', () => {
    renderModal({ groups: [TX, AMBIGUOUS] });
    expect(screen.getByTestId('automatch-bounce-select-all')).toBeDisabled();
  });

  it('hides the pairs the user dismissed (dismissedPairKeys) from rows, count and KPI', () => {
    renderModal({ dismissedPairKeys: new Set(['bp-review']) });
    expect(screen.queryByTestId('automatch-bounce-row-bp-review')).toBeNull();
    expect(screen.getByTestId('automatch-bounce-count')).toHaveTextContent('2');
    expect(kpiValue('financeReconcileAutomatchKpiBouncePairs')).toBe('2');
  });

  it('hides the whole section when every pair is dismissed', () => {
    renderModal({ groups: [TX, REVIEW], dismissedPairKeys: new Set(['bp-review']) });
    expect(screen.queryByTestId('automatch-bounce-section')).toBeNull();
  });

  it('pairs only: the transaction block (select-all and empty state) steps aside', () => {
    renderModal({ groups: [HIGH, REVIEW], kpis: { ...KPIS_ON, groupsFound: 0 } });
    expect(screen.queryByTestId('automatch-select-all')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchEmpty')).toBeNull();
    expect(screen.queryByText('financeReconcileAutomatchColStatement')).toBeNull();
    expect(screen.getByTestId('automatch-bounce-section')).toBeInTheDocument();
  });

  it('nothing at all: the empty state is still shown', () => {
    renderModal({ groups: [], kpis: KPIS_OFF });
    expect(screen.getByText('financeReconcileAutomatchEmpty')).toBeInTheDocument();
  });
});

describe('AutoMatchSuggestionModal — footer and apply label variants', () => {
  it('groups and pairs checked: link-and-discard footer and the combined label', () => {
    renderModal();
    expect(footerText()).toBe('financeReconcileAutomatchFooterLinkAndDiscard:{"link":1,"lines":2}');
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionApplyAndDiscard:{"groups":1,"pairs":1}');
  });

  it('only groups checked: the original link footer and label', () => {
    renderModal();
    fireEvent.click(check('bp-high'));
    expect(footerText()).toBe('financeReconcileAutomatchFooterLink:{"count":1}');
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionApply:{"count":1}');
  });

  it('only pairs checked: discard footer (two lines a pair) and the discard label', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    fireEvent.click(check('bp-review'));
    expect(footerText()).toBe('financeReconcileAutomatchFooterDiscard:{"count":4}');
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionDiscardPairs:{"count":2}');
  });

  it('nothing checked while pairs are offered: "no suggestions selected" and a disabled apply', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('automatch-select-all'));
    fireEvent.click(check('bp-high'));
    expect(footerText()).toBe('financeReconcileAutomatchFooterNoneSelected');
    expect(applyButton()).toBeDisabled();
  });
});

describe('AutoMatchSuggestionModal — applying pairs', () => {
  it('sends transaction groups first, then the checked pairs, in ONE applySuggestions call', async () => {
    // The backend order puts a pair first: the payload must still lead with the groups.
    renderModal({ groups: [HIGH, TX, REVIEW, AMBIGUOUS] });
    fireEvent.click(check('bp-review'));
    await clickApply();
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][0]).toEqual({
      financialAccountId: 'acc-1',
      groups: [
        { statementLineId: 'line-1', operationIds: ['txn-1'] },
        { kind: 'bouncePair', statementLineId: 'O1', counterpartLineId: 'B1' },
        { kind: 'bouncePair', statementLineId: 'O2', counterpartLineId: 'B2' },
      ],
    });
  });

  it('success: one toast summarising what was reconciled and what was discarded', async () => {
    applyMock.mockResolvedValue({
      results: [
        { groupKey: TX.groupKey },
        { kind: 'bouncePair', statementLineId: 'O1', counterpartLineId: 'B1', discarded: true },
      ],
    });
    const { props } = renderModal();
    await clickApply();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      'financeReconcileAutomatchToastSuccess:{"count":1} financeReconcileAutomatchToastPairsDiscarded:{"count":1,"lines":2}',
    );
    expect(props.onSuccess).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('success with pairs only: the toast names only the discarded pairs', async () => {
    applyMock.mockResolvedValue({ results: [{ kind: 'bouncePair', discarded: true }] });
    renderModal({ groups: [HIGH] });
    await clickApply();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('financeReconcileAutomatchToastPairsDiscarded:{"count":1,"lines":2}');
  });

  it('partial: a warning whose description is the translated coded refusal (ETGO_BounceHasPayment)', async () => {
    applyMock.mockResolvedValue({
      results: [
        { groupKey: TX.groupKey },
        {
          kind: 'bouncePair', statementLineId: 'O1', counterpartLineId: 'B1',
          code: 'HAS_PAYMENT', message: 'One of the lines is the bank movement of a payment',
          error: {
            message: 'One of the lines is the bank movement of a payment', status: 409,
            code: 'HAS_PAYMENT', messageKeys: ['ETGO_BounceHasPayment'],
          },
        },
      ],
    });
    const { props } = renderModal();
    await clickApply();
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalledWith(
      'financeReconcileAutomatchToastSuccess:{"count":1} financeReconcileAutomatchToastSomeFailed:{"count":1}',
      { description: 'T(backendError.bounceHasPayment)' },
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('all failed: an error toast with the translated refusal', async () => {
    applyMock.mockResolvedValue({
      results: [{
        kind: 'bouncePair', code: 'BOUNCE_SUGGESTIONS_OFF',
        error: { message: 'Bounce suggestions are not enabled for this account.', status: 403, messageKeys: ['ETGO_BounceSuggestionsOff'] },
      }],
    });
    renderModal({ groups: [HIGH] });
    await clickApply();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith('T(backendError.bounceSuggestionsOff)');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('all failed with an unkeyed refusal: the backend message is shown', async () => {
    applyMock.mockResolvedValue({ results: [{ kind: 'bouncePair', error: { message: 'Line not found' } }] });
    renderModal({ groups: [HIGH] });
    await clickApply();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith('Line not found');
  });

  it('keeps the pre-existing partial toast when no pair was sent', async () => {
    applyMock.mockResolvedValue({ results: [{ groupKey: 'a' }, { groupKey: 'b', error: { message: 'x' } }] });
    renderModal({ groups: [TX, REVIEW] });
    await clickApply();
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalledWith('financeReconcileAutomatchToastPartial:{"success":1,"failed":1}');
  });
});

describe('AutoMatchSuggestionModal — host-owned selection', () => {
  it('reads and writes the checks through the selection prop', async () => {
    const selection = {
      isChecked: vi.fn((g) => g.groupKey === 'bp-review'),
      toggle: vi.fn(),
      setMany: vi.fn(),
    };
    renderModal({ selection });
    expect(check('bp-review')).toHaveAttribute('aria-checked', 'true');
    expect(check('bp-high')).toHaveAttribute('aria-checked', 'false');
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionDiscardPairs:{"count":1}');

    fireEvent.click(check('bp-high'));
    expect(selection.toggle).toHaveBeenCalledWith(HIGH);
    fireEvent.click(screen.getByTestId('automatch-bounce-select-all'));
    expect(selection.setMany).toHaveBeenCalledWith([HIGH, REVIEW, AMBIGUOUS], true);

    await clickApply();
    expect(applyMock.mock.calls[0][0].groups).toEqual([
      { kind: 'bouncePair', statementLineId: 'O2', counterpartLineId: 'B2' },
    ]);
  });
});
