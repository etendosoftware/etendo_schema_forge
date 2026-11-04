// @covers tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx
// @covers tools/app-shell/src/components/contract-ui/AutoMatchBounceSection.jsx
// @covers tools/app-shell/src/components/contract-ui/bouncePairs.js
/**
 * The "Rebotes bancarios" section of the automatch modal (bounce pairs, flag `bank-bounce-suggestions`).
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

// `dialog-dismiss` stands for every close the Dialog itself reports (X, Esc, backdrop).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }) => (open ? (
    <div data-testid="dialog">
      <button type="button" data-testid="dialog-dismiss" onClick={() => onOpenChange?.(false)}>x</button>
      {children}
    </div>
  ) : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value, className }) => <span className={className}>{String(value)}</span>,
}));

const applyMock = vi.fn();
// `loading` is read on every render, so a test can put the apply in flight.
const applyState = { loading: false };
vi.mock('@/hooks/useReconciliation', () => ({
  useApplySuggestions: () => ({ apply: applyMock, loading: applyState.loading, error: null }),
}));

const trackViewed = vi.fn();
const trackDismissed = vi.fn();
vi.mock('@/lib/bounceSuggestionsTelemetry.js', () => ({
  trackBounceSuggestionsViewed: (...args) => trackViewed(...args),
  trackBounceSuggestionsDismissed: (...args) => trackDismissed(...args),
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
// The shared Checkbox puts the test id on its <label>; the state lives on the input inside it.
const box = (testId) => within(screen.getByTestId(testId)).getByRole('checkbox');
const checkInput = (key) => box(`automatch-bounce-check-${key}`);

async function clickApply() {
  fireEvent.click(applyButton());
  await vi.waitFor(() => expect(applyMock).toHaveBeenCalled());
}

beforeEach(() => {
  applyState.loading = false;
  applyMock.mockReset().mockResolvedValue({ results: [] });
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
  trackViewed.mockReset();
  trackDismissed.mockReset();
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

describe('AutoMatchSuggestionModal — the Rebotes bancarios section', () => {
  it('renders the pairs below the groups, with their count and the KPI', () => {
    renderModal();
    const section = screen.getByTestId('automatch-bounce-section');
    expect(within(section).getByText('financeReconcileAutomatchBounceTitle')).toBeInTheDocument();
    expect(within(section).getByText('financeReconcileAutomatchBounceHint')).toBeInTheDocument();
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
    expect(checkInput('bp-high')).toHaveAttribute('aria-checked', 'true');
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'false');
    expect(check('bp-review')).toHaveAttribute('aria-label', 'financeReconcileAutomatchBounceCheck');
    const amb = check('bp-amb');
    expect(checkInput('bp-amb')).toBeDisabled();
    expect(checkInput('bp-amb')).toHaveAttribute('aria-checked', 'false');
    expect(amb).toHaveAttribute('aria-label', 'financeReconcileAutomatchBounceAmbiguousCheck');
    fireEvent.click(amb);
    expect(checkInput('bp-amb')).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles a pair', () => {
    renderModal();
    fireEvent.click(check('bp-review'));
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(check('bp-high'));
    expect(checkInput('bp-high')).toHaveAttribute('aria-checked', 'false');
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

  it('"Revisar en el panel" is the shared outline Button as a pill, never the primary one', () => {
    renderModal({ onReviewPair: vi.fn() });
    const reviewBtn = screen.getByTestId('automatch-bounce-review-bp-review');
    expect(reviewBtn.tagName).toBe('BUTTON');
    expect(reviewBtn).toHaveAttribute('type', 'button');
    expect(reviewBtn.className).toContain('rounded-full');
    expect(reviewBtn.className).toContain('border');
    expect(reviewBtn.className).not.toContain('bg-primary');
  });

  it('select-all of pairs checks every selectable pair, then unchecks them; never the ambiguous one', () => {
    renderModal();
    const all = screen.getByTestId('automatch-bounce-select-all');
    expect(box('automatch-bounce-select-all')).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(all);
    expect(checkInput('bp-high')).toHaveAttribute('aria-checked', 'true');
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'true');
    expect(checkInput('bp-amb')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(all);
    expect(checkInput('bp-high')).toHaveAttribute('aria-checked', 'false');
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'false');
    expect(box('automatch-bounce-select-all')).toHaveAttribute('aria-checked', 'false');
    // The transaction group is not touched by the pairs' select-all.
    expect(applyButton()).toHaveTextContent('financeReconcileAutomatchActionApply:{"count":1}');
  });

  it('disables the pairs select-all when only ambiguous pairs are offered', () => {
    renderModal({ groups: [TX, AMBIGUOUS] });
    expect(box('automatch-bounce-select-all')).toBeDisabled();
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
      // The shown pair that is not applied (the ambiguous one cannot be checked).
      bounceDecisions: [{ groupKey: 'bp-amb', decision: 'unchecked' }],
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
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'true');
    expect(checkInput('bp-high')).toHaveAttribute('aria-checked', 'false');
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

// ---------------------------------------------------------------------------
// The shared controls: Checkbox (@/components/ui/checkbox) and Button (@/components/ui/button)
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — the shared Checkbox of the pairs', () => {
  it('puts the test id on the <label> and the state on the checkbox input inside it', () => {
    renderModal();
    const label = check('bp-high');
    expect(label.tagName).toBe('LABEL');
    const input = checkInput('bp-high');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'checkbox');
    expect(input).toBeChecked();
  });

  it('names each inner checkbox from the aria-label of its row', () => {
    renderModal();
    const review = screen.getByTestId('automatch-bounce-row-bp-review');
    expect(within(review).getByRole('checkbox', { name: 'financeReconcileAutomatchBounceCheck' }))
      .toBe(checkInput('bp-review'));
    const amb = screen.getByTestId('automatch-bounce-row-bp-amb');
    expect(within(amb).getByRole('checkbox', { name: 'financeReconcileAutomatchBounceAmbiguousCheck' }))
      .toBe(checkInput('bp-amb'));
    expect(screen.getByRole('checkbox', { name: 'financeReconcileAutomatchBounceSelectAll' }))
      .toBe(box('automatch-bounce-select-all'));
    // A transaction group's checkbox is named after its statement line, so two groups differ.
    expect(screen.getByRole('checkbox', {
      name: `financeReconcileAutomatchGroupCheck:${JSON.stringify({ line: 'Transf. recibida ACME' })}`,
    })).toBe(box(`automatch-group-check-${TX.groupKey}`));
  });

  it('keeps the header "mixed" while any pair is checked, and unchecked once none is', () => {
    renderModal();
    const header = () => box('automatch-bounce-select-all');
    // high checked by default
    expect(header()).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(check('bp-review'));
    fireEvent.click(check('bp-high'));
    // only review checked now: still mixed
    expect(checkInput('bp-review')).toHaveAttribute('aria-checked', 'true');
    expect(header()).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(check('bp-review'));
    expect(header()).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking the label of a disabled ambiguous pair changes nothing (no toggle, same label)', () => {
    const selection = {
      isChecked: vi.fn((g) => g.groupKey === 'bp-high' || g.groupKey === TX.groupKey),
      toggle: vi.fn(),
      setMany: vi.fn(),
    };
    renderModal({ selection });
    const before = applyButton().textContent;
    fireEvent.click(check('bp-amb'));
    expect(selection.toggle).not.toHaveBeenCalled();
    expect(checkInput('bp-amb')).not.toBeChecked();
    expect(applyButton().textContent).toBe(before);
  });
});

describe('AutoMatchSuggestionModal — the Apply button', () => {
  it('is the shared primary Button (bg-primary)', () => {
    renderModal();
    expect(applyButton().tagName).toBe('BUTTON');
    expect(applyButton().className).toContain('bg-primary');
    expect(applyButton()).toBeEnabled();
  });

  it('is disabled with nothing selected and never calls apply', () => {
    renderModal({ groups: [HIGH] });
    fireEvent.click(check('bp-high'));
    expect(applyButton()).toBeDisabled();
    fireEvent.click(applyButton());
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('is disabled and reads "loading" while the apply is in flight', () => {
    applyState.loading = true;
    renderModal();
    expect(applyButton()).toBeDisabled();
    expect(applyButton()).toHaveTextContent('loading');
    expect(applyButton()).not.toHaveTextContent('financeReconcileAutomatchActionApplyAndDiscard');
  });
});

// ---------------------------------------------------------------------------
// The bank reference and the descriptions of a pair row
// ---------------------------------------------------------------------------

const REF_PAIR = {
  ...REVIEW,
  groupKey: 'bp-ref',
  statementLine: { ...REVIEW.statementLine, id: 'O5', referenceNo: 'R-OUT-5' },
  counterpartLine: { ...REVIEW.counterpartLine, id: 'B5', referenceNo: ' R-IN-5 ' },
};
const BLANK_REF_PAIR = {
  ...HIGH,
  groupKey: 'bp-blank',
  statementLine: { ...HIGH.statementLine, id: 'O6', referenceNo: '   ' },
  counterpartLine: { ...HIGH.counterpartLine, id: 'B6', referenceNo: '' },
};
const AMB_REF = {
  ...AMBIGUOUS,
  groupKey: 'bp-amb-ref',
  counterpartLine: { ...AMBIGUOUS.counterpartLine, id: 'B7', referenceNo: 'R-IN-7' },
  candidates: [
    { line: { ...AMBIGUOUS.candidates[0].line, id: 'C7', referenceNo: 'R-C7' } },
    { line: { ...AMBIGUOUS.candidates[1].line, id: 'C8', referenceNo: 'R-C8' } },
  ],
};
const refText = (ref) => `financeReconcileBounceRef:${JSON.stringify({ ref })}`;
const meta = (side, key) => screen.getByTestId(`automatch-bounce-${side}-meta-${key}`);

describe('AutoMatchSuggestionModal — the bank reference of a pair', () => {
  it('shows "date · Ref. X" on both sides of a pair whose lines carry a reference (trimmed)', () => {
    renderModal({ groups: [REF_PAIR] });
    expect(meta('original', 'bp-ref')).toHaveTextContent(`01/05/2026 · ${refText('R-OUT-5')}`);
    expect(meta('line', 'bp-ref')).toHaveTextContent(`04/05/2026 · ${refText('R-IN-5')}`);
  });

  it('shows only the date for a blank, whitespace or missing reference', () => {
    renderModal({ groups: [BLANK_REF_PAIR, REVIEW] });
    expect(meta('original', 'bp-blank').textContent).toBe('02/05/2026');
    expect(meta('line', 'bp-blank').textContent).toBe('02/05/2026');
    expect(meta('original', 'bp-review').textContent).toBe('01/05/2026');
    expect(meta('line', 'bp-review').textContent).toBe('04/05/2026');
    expect(screen.queryByText(/financeReconcileBounceRef/)).toBeNull();
  });

  it('an ambiguous pair: the original side shows every candidate date and never a reference', () => {
    renderModal({ groups: [AMB_REF] });
    expect(meta('original', 'bp-amb-ref').textContent).toBe('01/05/2026 · 03/05/2026');
    expect(meta('original', 'bp-amb-ref')).not.toHaveTextContent('financeReconcileBounceRef');
    // The bounce is one line, so its own reference is shown.
    expect(meta('line', 'bp-amb-ref')).toHaveTextContent(`05/05/2026 · ${refText('R-IN-7')}`);
  });
});

describe('AutoMatchSuggestionModal — pair descriptions (TruncatedText)', () => {
  const LONG = 'TRANSFERENCIA A FAVOR DE PROVEEDORES UNIDOS CONCEPTO 10000268 100-1';
  const LONG_PAIR = {
    ...REVIEW,
    groupKey: 'bp-long',
    statementLine: { ...REVIEW.statementLine, description: LONG },
  };
  const setMetrics = (el, scrollWidth, clientWidth) => {
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  };

  it('renders each side description in its -desc element', () => {
    renderModal({ groups: [LONG_PAIR] });
    expect(screen.getByTestId('automatch-bounce-original-bp-long-desc')).toHaveTextContent(LONG);
    expect(screen.getByTestId('automatch-bounce-line-bp-long-desc')).toHaveTextContent('RECIBO DEVUELTO');
  });

  it('reveals the full description in a tooltip when it is clipped', () => {
    renderModal({ groups: [LONG_PAIR] });
    const desc = screen.getByTestId('automatch-bounce-original-bp-long-desc');
    setMetrics(desc, 640, 200);
    fireEvent.focus(desc);
    expect(screen.getByTestId('automatch-bounce-original-bp-long-desc-tooltip')).toHaveTextContent(LONG);
  });

  it('falls back to the reference when a line has no description', () => {
    const noDesc = {
      ...REF_PAIR,
      groupKey: 'bp-nodesc',
      counterpartLine: { ...REF_PAIR.counterpartLine, description: '' },
    };
    renderModal({ groups: [noDesc] });
    expect(screen.getByTestId('automatch-bounce-line-bp-nodesc-desc')).toHaveTextContent('R-IN-5');
  });
});

// ---------------------------------------------------------------------------
// Ambiguous pairs: two candidates, and two pairs sharing a candidate
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — ambiguous pairs', () => {
  // The "Revisar: 2 salidas posibles" tag of a 2-candidate pair is asserted in "tags a high pair…".
  // Same statement, same day: bounce B9 over [C1, C2] and bounce B10 over [C2, C9]; they share C2.
  // The backend offers both (neo-headless.md §4.12.1.1, "Two such pairs may share a neighbour").
  const SHARED_A = AMBIGUOUS;
  const SHARED_B = {
    ...AMBIGUOUS,
    groupKey: 'bp-amb-2',
    counterpartLine: { id: 'B10', description: 'Abono ACME 2', amount: 80, date: '2026-05-06' },
    candidates: [
      AMBIGUOUS.candidates[1],
      { line: { id: 'C9', description: 'Pago ACME 3', amount: -80, date: '2026-05-04' } },
    ],
  };

  it('renders both pairs that share a candidate, each disabled, with its own candidates', () => {
    renderModal({ groups: [TX, SHARED_A, SHARED_B], kpis: { ...KPIS_ON, bouncePairs: 2 } });
    expect(screen.getByTestId('automatch-bounce-count')).toHaveTextContent('2');
    expect(kpiValue('financeReconcileAutomatchKpiBouncePairs')).toBe('2');
    for (const key of ['bp-amb', 'bp-amb-2']) {
      expect(screen.getByTestId(`automatch-bounce-row-${key}`)).toBeInTheDocument();
      expect(checkInput(key)).toBeDisabled();
      expect(screen.getByTestId(`automatch-bounce-tag-review-${key}`))
        .toHaveTextContent('financeReconcileBounceReasonAmbiguousShort');
    }
    expect(meta('original', 'bp-amb').textContent).toBe('01/05/2026 · 03/05/2026');
    expect(meta('original', 'bp-amb-2').textContent).toBe('03/05/2026 · 04/05/2026');
    // The shared candidate is the first one shown for the second pair.
    expect(screen.getByTestId('automatch-bounce-original-bp-amb-2')).toHaveTextContent('Pago ACME 2');
    // Neither can be checked here, so the pairs' select-all is disabled.
    expect(box('automatch-bounce-select-all')).toBeDisabled();
  });

  it('offers "Revisar en el panel" on both, each for its own pair', () => {
    const onReviewPair = vi.fn();
    renderModal({ groups: [SHARED_A, SHARED_B], onReviewPair });
    fireEvent.click(screen.getByTestId('automatch-bounce-review-bp-amb-2'));
    expect(onReviewPair).toHaveBeenCalledWith(SHARED_B);
    fireEvent.click(screen.getByTestId('automatch-bounce-review-bp-amb'));
    expect(onReviewPair).toHaveBeenLastCalledWith(SHARED_A);
  });
});

// ---------------------------------------------------------------------------
// KPI events (ETP-5581): bounceDecisions in the apply, and the frontend Mixpanel events
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — bounceDecisions in the applySuggestions body', () => {
  it('reports every shown pair that is not applied as unchecked, and leaves the applied ones in groups', async () => {
    renderModal();
    await clickApply();
    const body = applyMock.mock.calls[0][0];
    expect(body.groups).toContainEqual({ kind: 'bouncePair', statementLineId: 'O1', counterpartLineId: 'B1' });
    expect(body.bounceDecisions).toEqual([
      { groupKey: 'bp-review', decision: 'unchecked' },
      { groupKey: 'bp-amb', decision: 'unchecked' },
    ]);
  });

  it('a preselected pair the user unchecked is reported as unchecked', async () => {
    renderModal();
    fireEvent.click(check('bp-high'));
    await clickApply();
    expect(applyMock.mock.calls[0][0].bounceDecisions).toContainEqual({ groupKey: 'bp-high', decision: 'unchecked' });
  });

  it('a pair sent to the panel and left unchecked is reported as sent_to_panel', async () => {
    renderModal({ sentToPanelKeys: new Set(['bp-amb', 'bp-review']) });
    await clickApply();
    expect(applyMock.mock.calls[0][0].bounceDecisions).toEqual([
      { groupKey: 'bp-review', decision: 'sent_to_panel' },
      { groupKey: 'bp-amb', decision: 'sent_to_panel' },
    ]);
  });

  it('a pair sent to the panel but checked when applying is applied, not reported', async () => {
    renderModal({ sentToPanelKeys: new Set(['bp-review']) });
    fireEvent.click(check('bp-review'));
    await clickApply();
    const body = applyMock.mock.calls[0][0];
    expect(body.groups).toContainEqual({ kind: 'bouncePair', statementLineId: 'O2', counterpartLineId: 'B2' });
    expect(body.bounceDecisions).toEqual([{ groupKey: 'bp-amb', decision: 'unchecked' }]);
  });

  it('pairs dismissed with "No es un rebote" are not shown, so not reported', async () => {
    renderModal({ dismissedPairKeys: new Set(['bp-review', 'bp-amb']) });
    await clickApply();
    expect(applyMock.mock.calls[0][0].bounceDecisions).toEqual([]);
  });

  it('carries the key, empty, when every shown pair is applied', async () => {
    renderModal({ groups: [TX, HIGH] });
    await clickApply();
    expect(applyMock.mock.calls[0][0]).toHaveProperty('bounceDecisions', []);
  });

  it('sends no bounceDecisions when the modal shows no pair', async () => {
    renderModal({ groups: [TX], kpis: KPIS_OFF });
    await clickApply();
    expect(applyMock.mock.calls[0][0]).not.toHaveProperty('bounceDecisions');
  });
});

describe('AutoMatchSuggestionModal — bounce_suggestions_viewed', () => {
  it('is emitted once per opening with the shown and preselected pair counts', () => {
    const { rerender, props } = renderModal({ autoOpened: true });
    expect(trackViewed).toHaveBeenCalledTimes(1);
    expect(trackViewed).toHaveBeenCalledWith({ pairsShown: 3, pairsPreselected: 1, autoOpened: true });

    // Re-renders of the same opening (a toggle) emit nothing more.
    fireEvent.click(check('bp-review'));
    rerender(<AutoMatchSuggestionModal {...props} kpis={{ ...KPIS_ON }} />);
    expect(trackViewed).toHaveBeenCalledTimes(1);
  });

  it('is emitted again on a new opening, with how it opened', () => {
    const { rerender, props } = renderModal({ autoOpened: true });
    rerender(<AutoMatchSuggestionModal {...props} open={false} />);
    rerender(<AutoMatchSuggestionModal {...props} open autoOpened={false} />);
    expect(trackViewed).toHaveBeenCalledTimes(2);
    expect(trackViewed).toHaveBeenLastCalledWith({ pairsShown: 3, pairsPreselected: 1, autoOpened: false });
  });

  it('is emitted when the pairs land after the modal opened', () => {
    const { rerender, props } = renderModal({ groups: [] });
    expect(trackViewed).not.toHaveBeenCalled();
    rerender(<AutoMatchSuggestionModal {...props} groups={[TX, HIGH]} />);
    expect(trackViewed).toHaveBeenCalledWith({ pairsShown: 1, pairsPreselected: 1, autoOpened: false });
  });

  it('counts only the pairs still shown (dismissed ones left out)', () => {
    renderModal({ dismissedPairKeys: new Set(['bp-high']) });
    expect(trackViewed).toHaveBeenCalledWith({ pairsShown: 2, pairsPreselected: 0, autoOpened: false });
  });

  it('is not emitted without bounce pairs, nor while closed', () => {
    renderModal({ groups: [TX], kpis: KPIS_OFF });
    renderModal({ open: false });
    expect(trackViewed).not.toHaveBeenCalled();
  });
});

describe('AutoMatchSuggestionModal — bounce_suggestions_dismissed', () => {
  it.each([
    ['Cancelar', 'automatch-modal-cancel'],
    ['Abrir conciliación', 'automatch-modal-open-reconciliation'],
    ['X / Esc / backdrop', 'dialog-dismiss'],
  ])('%s closes and reports the dismissal with the pairs checked at close', (_label, testId) => {
    const { props } = renderModal({ autoOpened: true });
    fireEvent.click(check('bp-review'));
    fireEvent.click(screen.getByTestId(testId));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(trackDismissed).toHaveBeenCalledTimes(1);
    expect(trackDismissed).toHaveBeenCalledWith({ pairsShown: 3, pairsCheckedAtClose: 2, autoOpened: true });
  });

  it('is not reported on an apply', async () => {
    const { props } = renderModal();
    await clickApply();
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(trackDismissed).not.toHaveBeenCalled();
  });

  it('is not reported on "Revisar en el panel" (the host closes the modal)', () => {
    const onReviewPair = vi.fn();
    const { rerender, props } = renderModal({ onReviewPair });
    fireEvent.click(screen.getByTestId('automatch-bounce-review-bp-review'));
    rerender(<AutoMatchSuggestionModal {...props} onReviewPair={onReviewPair} open={false} />);
    expect(onReviewPair).toHaveBeenCalledWith(REVIEW);
    expect(trackDismissed).not.toHaveBeenCalled();
  });

  it('is not reported when the modal had no bounce pair', () => {
    const { props } = renderModal({ groups: [TX], kpis: KPIS_OFF });
    fireEvent.click(screen.getByTestId('automatch-modal-cancel'));
    expect(props.onClose).toHaveBeenCalled();
    expect(trackDismissed).not.toHaveBeenCalled();
  });
});
