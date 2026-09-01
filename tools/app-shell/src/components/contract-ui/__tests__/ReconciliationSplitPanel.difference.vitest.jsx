// ETP-4965 — "Con diferencia" in the reconciliation panel.
//
// A 1:1 match whose amount and/or date deviation falls inside the account's configured tolerances
// is now detected, proposed and — on "Conciliar" — posted to the configured accounting concept in
// one step. This file covers the three UI consequences:
//
//   1. the near-match candidate row wears the RED "Con diferencia" badge, not the blue
//      "Con sugerencia" one — the badge is the only thing telling the user that confirming will
//      write an accounting entry;
//   2. the action bar stops shouting "Restante por conciliar" in red for a gap that is about to be
//      resolved automatically, and says so instead;
//   3. a 400 `GL_ITEM_REQUIRED` opens the accounting-concept picker and the retry carries the
//      chosen `glItemId`, rather than dead-ending in a red toast with an English sentence.
//
// Mocks BEFORE imports.

// Radix <Dialog> / <DropdownMenu> rely on Pointer Capture + scrollIntoView, neither implemented by
// jsdom (same polyfill block as ReconciliationSplitPanel.vitest.jsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// Echoes the key so no test hardcodes Spanish/English copy, and serializes the interpolation vars
// so an amount the call site passed is still assertable (real keys carry their `{placeholder}`s in
// the locale VALUE, so a plain key echo would render nothing of what was passed).
const uiCalls = [];
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    uiCalls.push({ key, vars });
    if (!vars) return key;
    const interpolated = key.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    const rendered = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${interpolated} [${rendered}]`;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

// The accounting-concept picker, stubbed to expose the real lookup options as buttons (same stub
// style as ReconciliationDifference.vitest.jsx) so a test can pick a SPECIFIC concept by id.
vi.mock('@/components/forms/fields', () => ({
  ChipSelect: ({ value, onChange, useLookup, testId, placeholder }) => {
    const { results } = useLookup('');
    return (
      <div>
        <span data-testid={`${testId}-value`}>{value?.id ?? ''}</span>
        <span data-testid={`${testId}-placeholder`}>{placeholder}</span>
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`${testId}-option-${r.id}`}
            onClick={() => onChange(r)}
          >
            {r.name}
          </button>
        ))}
      </div>
    );
  },
}));

const GL_ITEMS = [
  { id: 'GL-1', name: 'Comisiones bancarias' },
  { id: 'GL-2', name: 'Diferencias de cambio' },
];
vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ results: GL_ITEMS, loading: false }),
}));

const linesState = {
  lines: [], total: 0, counts: {}, loading: false, reload: vi.fn(), draftReconciliationCount: 0,
};
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn(), loading: false };
const removeState = { removeOperation: vi.fn(), loading: false };
const reactivateSelectedState = { reactivateSelected: vi.fn(), loading: false };
const reconcileDifferenceState = { reconcileDifference: vi.fn(), loading: false };

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useRemoveOperation: () => removeState,
  useReactivateSelected: () => reactivateSelectedState,
  useReconcileDifference: () => reconcileDifferenceState,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

// The ticket's own numbers: a 27.00 inflow line against a 26.62 movement. The 0.38 gap is 1.41% of
// the line, comfortably inside the account's 5% amount tolerance (limit 1.35).
const LINE = {
  id: 'L1', date: '2026-05-10T00:00:00Z', description: 'Transferencia ACME',
  status: 'pending', amount: 27,
};

// A near-match candidate as the backend now emits it: it IS in `suggestedIds` (so the panel
// pre-selects it, same as any automatch proposal) but it also carries the near-match flag — and
// that flag has to win, or the row looks like an exact suggestion and hides the pending adjustment.
const CAND_NEAR = {
  id: 'C1', date: '2026-05-12T00:00:00Z', documentNo: 'MOV-1', partnerName: 'ACME',
  amount: 26.62, pendingBalance: 26.62, status: 'pending', suggested: true, nearMatch: true,
};

// An ordinary exact suggestion, for contrast: same amount as the line, nothing to post.
const CAND_EXACT = {
  id: 'C2', date: '2026-05-10T00:00:00Z', documentNo: 'MOV-2', partnerName: 'Globex',
  amount: 27, pendingBalance: 27, status: 'pending', suggested: true,
};

const AMOUNT_TOLERANCE_PCT = 5;

function renderPanel(props = {}) {
  return render(
    <ReconciliationSplitPanel
      accountId="ACC-1"
      currency="EUR"
      amountTolerance={AMOUNT_TOLERANCE_PCT}
      onReconcileSuccess={vi.fn()}
      {...props}
    />,
  );
}

/**
 * Selects the statement line. That is what resolves the right panel's candidates AND pre-selects
 * the suggested ones, so every scenario below starts from the state the automatch leaves behind.
 */
function selectLine(id = LINE.id) {
  fireEvent.click(screen.getByTestId(`recon-line-radio-${id}`));
}

/** A rejected reconcile carrying the backend's machine-readable code, as useNeoPost now builds it. */
function glItemRequiredError() {
  const err = new Error('An accounting concept is required for the 0.38 difference');
  err.status = 400;
  err.code = 'GL_ITEM_REQUIRED';
  err.body = {
    error: { message: 'An accounting concept is required for the 0.38 difference', status: 400 },
    code: 'GL_ITEM_REQUIRED',
    differenceAmount: '0.38',
  };
  return err;
}

/** The account's configured difference concept, as `FinancialAccountHandler` reports it. */
const GL_DIFFERENCE = { id: 'GL-1', name: 'Comisiones bancarias' };

/** The amount cell sitting next to the "Restante por conciliar" label. */
function remainingAmountCell() {
  return screen.getByText('financeReconcileBarRemaining').nextElementSibling;
}

beforeEach(() => {
  linesState.lines = [LINE];
  linesState.total = 1;
  linesState.counts = {};
  linesState.loading = false;
  linesState.reload = vi.fn();
  linesState.draftReconciliationCount = 0;
  // One candidate by default, so the pre-selection is unambiguous: exactly the near match.
  candidatesState.candidates = [CAND_NEAR];
  candidatesState.loading = false;
  reconcileState.reconcile = vi.fn().mockResolvedValue({ reconciliationId: 'R1' });
  reconcileState.loading = false;
  removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
  reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({ reactivated: true });
  reconcileDifferenceState.reconcileDifference = vi.fn().mockResolvedValue({ transactionId: 'T' });
  uiCalls.length = 0;
});

// ── 1. the badge ──────────────────────────────────────────────────────────────

describe('near-match candidate badge', () => {
  beforeEach(() => {
    candidatesState.candidates = [CAND_NEAR, CAND_EXACT];
  });

  it('renders the "Con diferencia" badge on a near-match candidate row', () => {
    renderPanel();
    selectLine();

    const row = screen.getByTestId(`recon-cand-row-${CAND_NEAR.id}`);
    expect(row.textContent).toContain('financeReconcileBadgeDifference');
  });

  it('lets the near-match flag win over the plain `suggested` marker', () => {
    renderPanel();
    selectLine();

    // The backend marks a near-match as suggested TOO (it IS proposed by the automatch), so the row
    // would otherwise render the blue "Con sugerencia" pill and hide that an entry will be posted.
    const row = screen.getByTestId(`recon-cand-row-${CAND_NEAR.id}`);
    expect(row.textContent).not.toContain('financeReconcileBadgeSuggested');
  });

  it('leaves an ordinary exact suggestion on the "Con sugerencia" badge', () => {
    renderPanel();
    selectLine();

    const row = screen.getByTestId(`recon-cand-row-${CAND_EXACT.id}`);
    expect(row.textContent).toContain('financeReconcileBadgeSuggested');
    expect(row.textContent).not.toContain('financeReconcileBadgeDifference');
  });

  it('uses the destructive palette for the difference badge, not the informational one', () => {
    renderPanel();
    selectLine();

    const badge = screen.getByText('financeReconcileBadgeDifference');
    expect(badge.className).toContain('--status-destructive-bg');
    expect(badge.className).not.toContain('--status-info-bg');
  });
});

// ── 2. the action-bar copy ────────────────────────────────────────────────────

describe('action bar within tolerance', () => {
  it('announces that the shortfall will be posted, instead of only flagging it red', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();

    // 27.00 − 26.62 = 0.38 — not balanced, but inside 5% of 27.00 (1.35). Left as a bare red
    // "Restante por conciliar" it reads as an error, for something about to be posted automatically.
    const notice = await screen.findByTestId('recon-action-difference-notice');
    expect(notice.textContent).toContain('financeReconcileBarDifferenceNotice');
    expect(remainingAmountCell().className).not.toContain('--destructive');
  });

  it('names the amount and the configured concept in that notice', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();

    await screen.findByTestId('recon-action-difference-notice');
    const call = uiCalls.filter((c) => c.key === 'financeReconcileBarDifferenceNotice').pop();
    expect(call).toBeDefined();
    // The canonical formatCurrency output, never a hand-rolled formatter — 0,38 € under es_ES.
    expect(String(call.vars?.amount)).toContain('0,38');
    expect(call.vars?.concept).toBe(GL_DIFFERENCE.name);
  });

  it('says the concept will be chosen on reconciling when the account has none', async () => {
    renderPanel();
    selectLine();

    const notice = await screen.findByTestId('recon-action-difference-notice');
    expect(notice.textContent).toContain('financeReconcileBarDifferenceNoticeNoConcept');
  });

  it('still lets the line be reconciled while the gap is within tolerance', () => {
    renderPanel();
    selectLine();

    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  it('keeps the red remaining amount when the gap is outside the tolerance', async () => {
    // 27.00 − 10.00 = 17.00, way past the 1.35 limit: nothing will be posted, so the red remaining
    // line is the honest message and must stay.
    candidatesState.candidates = [{ ...CAND_NEAR, id: 'C9', amount: 10, pendingBalance: 10 }];
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();

    await waitFor(() =>
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument());
    expect(screen.queryByTestId('recon-action-difference-notice')).toBeNull();
    expect(remainingAmountCell().className).toContain('--destructive');
  });

  it('shows no notice when the account has no amount tolerance', async () => {
    // 0% is "the feature is off", not "a cent of slack" — nothing will be posted here either.
    renderPanel({ amountTolerance: 0, glItemDifference: GL_DIFFERENCE });
    selectLine();

    await waitFor(() =>
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument());
    expect(screen.queryByTestId('recon-action-difference-notice')).toBeNull();
  });

  it('shows no notice once the selection balances exactly', async () => {
    candidatesState.candidates = [CAND_EXACT];
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();

    await waitFor(() =>
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument());
    expect(screen.queryByTestId('recon-action-difference-notice')).toBeNull();
  });

  it('shows no notice for over-coverage — that stays an error, not an adjustment', async () => {
    // 27.00 − 27.20 = −0.20: small enough in magnitude, but the wrong direction entirely. Posting a
    // "negative difference" here would invent money, so the case is deliberately out of scope.
    candidatesState.candidates = [{ ...CAND_NEAR, id: 'C8', amount: 27.2, pendingBalance: 27.2 }];
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();

    await waitFor(() =>
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument());
    expect(screen.queryByTestId('recon-action-difference-notice')).toBeNull();
  });
});

// ── 3. the GL_ITEM_REQUIRED retry ─────────────────────────────────────────────

describe('GL_ITEM_REQUIRED retry', () => {
  it('opens the accounting-concept picker instead of only red-toasting', async () => {
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(glItemRequiredError());
    renderPanel();
    selectLine();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    await waitFor(() =>
      expect(screen.getByTestId('recon-difference-dialog')).toBeInTheDocument());
  });

  it('retries the SAME reconcile payload with the chosen glItemId', async () => {
    reconcileState.reconcile = vi.fn()
      .mockRejectedValueOnce(glItemRequiredError())
      .mockResolvedValueOnce({ reconciliationId: 'R1' });
    renderPanel();
    selectLine();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    await waitFor(() =>
      expect(screen.getByTestId('recon-difference-dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('recon-difference-concept-option-GL-1'));
    fireEvent.click(screen.getByTestId('recon-difference-confirm'));

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(2));
    const [firstPayload] = reconcileState.reconcile.mock.calls[0];
    const [retryPayload] = reconcileState.reconcile.mock.calls[1];
    expect(firstPayload.glItemId).toBeUndefined();
    expect(firstPayload.operationIds).toEqual([CAND_NEAR.id]);
    expect(retryPayload).toEqual({ ...firstPayload, glItemId: 'GL-1' });
  });

  it('does not retry while no concept has been chosen', async () => {
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(glItemRequiredError());
    renderPanel();
    selectLine();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    await waitFor(() =>
      expect(screen.getByTestId('recon-difference-dialog')).toBeInTheDocument());
    // Never confirm an adjustment without a destination account.
    expect(screen.getByTestId('recon-difference-confirm')).toBeDisabled();
    expect(reconcileState.reconcile).toHaveBeenCalledTimes(1);
  });

  it('still surfaces an unrelated failure as an error, with no picker', async () => {
    const err = new Error('Statement line is already reconciled');
    err.status = 409;
    err.body = { error: { message: 'Statement line is already reconciled', status: 409 } };
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(err);
    renderPanel();
    selectLine();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
  });
});
