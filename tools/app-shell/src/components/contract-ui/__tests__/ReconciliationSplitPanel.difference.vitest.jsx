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
//   3. "Conciliar" on a match with a postable difference never books blind: with no accounting
//      account on the financial account it stops and opens `GlItemSetupDialog` (setting up the
//      ACCOUNT, not this reconciliation) WITHOUT posting anything, and with one configured it asks
//      for a plain confirmation showing that destination read-only. The 400 `GL_ITEM_REQUIRED` is
//      demoted to a race fallback for an account that changed under the panel.
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

// The setup dialog writes the chosen concept onto the FINANCIAL ACCOUNT, so the panel now reaches
// for the account mutations hook. Same identity on every render, so no memo churn.
const accountMutations = { updateAccount: vi.fn() };
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => accountMutations,
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
import { toast } from 'sonner';
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

/**
 * The account's record version as the panel read it. ETP-5073 makes it mandatory on every write,
 * and it has to be the value READ — a fresh re-read before writing would always satisfy the
 * optimistic-locking check and defeat it.
 */
const ACCOUNT_UPDATED = '2026-09-04T18:32:41Z';

function renderPanel(props = {}) {
  return render(
    <ReconciliationSplitPanel
      accountId="ACC-1"
      currency="EUR"
      amountTolerance={AMOUNT_TOLERANCE_PCT}
      accountUpdated={ACCOUNT_UPDATED}
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

/** Presses the bottom action bar's "Conciliar". */
function clickReconcile() {
  fireEvent.click(screen.getByTestId('recon-action-reconcile'));
}

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
  accountMutations.updateAccount = vi.fn().mockResolvedValue({ id: 'ACC-1' });
  toast.success.mockClear();
  toast.error.mockClear();
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

// ── 3. setting the account up, BEFORE anything is posted ──────────────────────
//
// The account has no `glItemDifference`, so there is nowhere to book the 0.38. The old flow found
// that out from the server: it posted, took the 400, and only then asked. That is what these tests
// pin down as gone — the request must not leave the browser at all.

describe('postable difference with no accounting account on the account', () => {
  it('opens the setup dialog instead of the difference confirmation', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    // Not the read-only confirmation: there is no destination to confirm yet.
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
  });

  it('issues NO reconcile call — nothing is posted to find out the concept is missing', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
    expect(reconcileDifferenceState.reconcileDifference).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the confirm disabled until a concept is picked', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    expect(screen.getByTestId('recon-glitem-setup-accept')).toBeDisabled();
  });

  it('saves the picked concept on the ACCOUNT, not on this reconciliation', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    fireEvent.click(screen.getByTestId('recon-glitem-setup-concept-option-GL-2'));
    fireEvent.click(screen.getByTestId('recon-glitem-setup-accept'));

    await waitFor(() => expect(accountMutations.updateAccount).toHaveBeenCalledTimes(1));
    // The difference destination and nothing else, plus the concurrency token the backend
    // requires on every write (ETP-5073) — echoed from what the panel read, never re-fetched.
    expect(accountMutations.updateAccount)
      .toHaveBeenCalledWith('ACC-1', {
        glItemDifferenceId: 'GL-2',
        updated: ACCOUNT_UPDATED,
      });
  });

  it('closes the dialog and reports the save, still without reconciling', async () => {
    const onReconcileSuccess = vi.fn();
    renderPanel({ onReconcileSuccess });
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    fireEvent.click(screen.getByTestId('recon-glitem-setup-concept-option-GL-1'));
    fireEvent.click(screen.getByTestId('recon-glitem-setup-accept'));

    await waitFor(() => expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull());
    expect(toast.success).toHaveBeenCalledWith('financeReconcileGlItemSetupToastSaved');
    // The host owns `glItemDifference`, so it has to re-read the account for the next click to see
    // the concept — that is what this callback is being borrowed for.
    expect(onReconcileSuccess).toHaveBeenCalled();
    // The reconciliation is a separate, deliberate second click.
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
  });

  it('leaves the dialog open and toasts when the account cannot be saved', async () => {
    accountMutations.updateAccount = vi.fn().mockRejectedValue(new Error('Account is read-only'));
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    fireEvent.click(screen.getByTestId('recon-glitem-setup-concept-option-GL-1'));
    fireEvent.click(screen.getByTestId('recon-glitem-setup-accept'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account is read-only'));
    expect(screen.getByTestId('recon-glitem-setup-modal')).toBeInTheDocument();
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
  });

  it('reconciles nothing when the setup is cancelled', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    fireEvent.click(screen.getByTestId('recon-glitem-setup-cancel'));

    await waitFor(() => expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull());
    expect(accountMutations.updateAccount).not.toHaveBeenCalled();
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
  });
});

// ── 4. confirming against the account's configured concept ────────────────────

describe('postable difference with an accounting account configured', () => {
  it('asks for confirmation before booking the entry', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-difference-dialog');
    expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull();
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
  });

  it('shows the destination read-only — it is the account\'s setting, not a per-line choice', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    const readonly = await screen.findByTestId('recon-difference-concept-readonly');
    expect(readonly.textContent).toContain(GL_DIFFERENCE.name);
    // The picker (stubbed as `<testId>-value` + one button per option) must not be offered here.
    expect(screen.queryByTestId('recon-difference-concept-value')).toBeNull();
    expect(screen.queryByTestId('recon-difference-concept-option-GL-1')).toBeNull();
    expect(screen.queryByTestId('recon-difference-concept-option-GL-2')).toBeNull();
  });

  it('confirms with NO glItemId — the backend resolves it from the account', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-difference-dialog');
    // Enabled straight away: the destination is already known, nothing left to fill in.
    expect(screen.getByTestId('recon-difference-confirm')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('recon-difference-confirm'));

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    const [payload] = reconcileState.reconcile.mock.calls[0];
    expect(payload).not.toHaveProperty('glItemId');
    expect(payload.operationIds).toEqual([CAND_NEAR.id]);
    expect(payload.financialAccountId).toBe('ACC-1');
    expect(payload.statementLineId).toBe(LINE.id);
    // The plain reconcile endpoint books the difference; the standalone one is for the banner flow.
    expect(reconcileDifferenceState.reconcileDifference).not.toHaveBeenCalled();
  });

  it('closes without reconciling when the confirmation is cancelled', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-difference-dialog');
    fireEvent.click(screen.getByTestId('recon-difference-cancel'));

    await waitFor(() => expect(screen.queryByTestId('recon-difference-dialog')).toBeNull());
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
  });
});

// ── 5. no postable difference ─────────────────────────────────────────────────

describe('exact match', () => {
  beforeEach(() => {
    candidatesState.candidates = [CAND_EXACT];
  });

  it('reconciles straight away, with no dialog in the way', async () => {
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    const [payload] = reconcileState.reconcile.mock.calls[0];
    expect(payload).not.toHaveProperty('glItemId');
    expect(payload.operationIds).toEqual([CAND_EXACT.id]);
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
    expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('financeReconcileToastSuccess');
  });

  it('still reconciles straight away when the account has no concept configured', async () => {
    renderPanel();
    selectLine();
    clickReconcile();

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull();
  });
});

// ── 6. GL_ITEM_REQUIRED, demoted to a race fallback ───────────────────────────
//
// Only reachable when the account lost (or never had) its concept between the panel's load and the
// click — handleReconcile catches every other case first. The remedy is the same one the proactive
// path offers: configure the account. Never the read-only confirmation, which would show a
// destination that does not exist.

describe('GL_ITEM_REQUIRED as a race fallback', () => {
  it('opens the setup dialog when a direct reconcile comes back asking for a concept', async () => {
    candidatesState.candidates = [CAND_EXACT];
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(glItemRequiredError());
    renderPanel();
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-glitem-setup-modal');
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
  });

  it('swaps the confirmation for the setup dialog when the account changed underneath', async () => {
    // The panel still believes the account has GL-1; the server says otherwise on submit.
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(glItemRequiredError());
    renderPanel({ glItemDifference: GL_DIFFERENCE });
    selectLine();
    clickReconcile();

    await screen.findByTestId('recon-difference-dialog');
    fireEvent.click(screen.getByTestId('recon-difference-confirm'));

    await screen.findByTestId('recon-glitem-setup-modal');
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
    expect(accountMutations.updateAccount).not.toHaveBeenCalled();
  });

  it('still surfaces an unrelated failure as an error, with no dialog', async () => {
    candidatesState.candidates = [CAND_EXACT];
    const err = new Error('Statement line is already reconciled');
    err.status = 409;
    err.body = { error: { message: 'Statement line is already reconciled', status: 409 } };
    reconcileState.reconcile = vi.fn().mockRejectedValueOnce(err);
    renderPanel();
    selectLine();
    clickReconcile();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Statement line is already reconciled'));
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
    expect(screen.queryByTestId('recon-glitem-setup-modal')).toBeNull();
  });
});
