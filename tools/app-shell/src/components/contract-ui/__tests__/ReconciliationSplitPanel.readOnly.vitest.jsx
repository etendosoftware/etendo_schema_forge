// ETP-5457 — defense in depth behind the window's "read-only" access tier.
//
// Under `windowReadOnly` every write entry point of the panel is already hidden or disabled, and
// every dialog is forced shut (covered in ReconciliationSplitPanel.vitest.jsx / .difference. /
// .multiCurrency.). On top of that each mutating handler is wrapped in `guardWrite`, so a control
// that ever slips through is a no-op instead of a write. Those handlers are unreachable through
// the real UI under the tier — which is the point — so this file stubs the two dialogs that come
// from ReconciliationDifference.jsx with versions that ALWAYS expose a confirm button, whatever
// their `open` prop, and presses it. Each read-only case has a writable twin proving the very same
// click does reach the mutation when the tier allows it.
//
// Mocks BEFORE imports.

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// The real banner and `differenceState` stay; only the two dialogs are replaced. The stubs report
// the `open` prop they received (so the forced-close contract is visible too) and always render a
// confirm button that invokes the `onConfirm` handed to them.
vi.mock('@/components/contract-ui/ReconciliationDifference.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    DifferenceModal: ({ open, onConfirm, 'data-testid': testId }) => (
      <div data-testid={`stub-${testId}`} data-open={String(!!open)}>
        <button
          type="button"
          data-testid={`stub-${testId}-confirm`}
          onClick={() => onConfirm({ glItemId: 'GL-9', description: 'desc' })}
        >
          confirm
        </button>
      </div>
    ),
    GlItemSetupDialog: ({ open, onConfirm }) => (
      <div data-testid="stub-glitem-setup" data-open={String(!!open)}>
        <button
          type="button"
          data-testid="stub-glitem-setup-confirm"
          onClick={() => onConfirm({ id: 'GL-9', name: 'Comisiones' })}
        >
          confirm
        </button>
      </div>
    ),
  };
});

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
const reconcileDifferenceState = { reconcileDifference: vi.fn(), loading: false };

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useRemoveOperation: () => removeState,
  useReconcileDifference: () => reconcileDifferenceState,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

// A partially reconciled line with a 0,50 € remainder inside the 5% tolerance: the difference
// banner (real component) is offered and `confirmDifference` targets `remainderLineId`.
const LINE_PARTIAL = {
  id: 'LP1', date: '2026-05-13T00:00:00Z', description: 'Partial line',
  status: 'pending', reconcileStatus: 'PARTIAL', partial: true,
  amount: 12.5, reconciledAmount: 12, pendingAmount: 0.5, reconciledPct: 96,
  matchGroupId: 'G1', remainderLineId: 'LP1-rem',
  txns: [{ transactionId: 'T1', documentNo: '1000034', contact: 'ACME', amount: 12, autoCreated: false }],
};

const ACCOUNT_UPDATED = '2026-09-04T18:32:41Z';

function renderPanel(props = {}) {
  const onReconcileSuccess = vi.fn();
  render(
    <ReconciliationSplitPanel
      accountId="ACC-1"
      currency="EUR"
      amountTolerance={5}
      accountUpdated={ACCOUNT_UPDATED}
      onReconcileSuccess={onReconcileSuccess}
      {...props}
    />,
  );
  return { onReconcileSuccess };
}

function selectPartialLine() {
  fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
}

/** Lets an async handler that was (wrongly) invoked settle before asserting it did nothing. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  linesState.lines = [LINE_PARTIAL];
  linesState.total = 1;
  linesState.reload = vi.fn();
  candidatesState.candidates = [];
  reconcileState.reconcile = vi.fn().mockResolvedValue({ reconciliationId: 'R1' });
  removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
  reconcileDifferenceState.reconcileDifference = vi.fn().mockResolvedValue({ transactionId: 'TRX' });
  accountMutations.updateAccount = vi.fn().mockResolvedValue({ id: 'ACC-1' });
  toast.success.mockClear();
  toast.error.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — write handlers guarded by the read-only tier (ETP-5457)', () => {
  describe('post the difference (confirmDifference → reconcileDifference)', () => {
    it('keeps the difference dialog closed and its confirm a no-op under read-only (ETP-5457)', async () => {
      const { onReconcileSuccess } = renderPanel({ windowReadOnly: true });
      selectPartialLine();
      expect(screen.getByTestId('stub-DifferenceModal__d0f4d5')).toHaveAttribute('data-open', 'false');

      fireEvent.click(screen.getByTestId('stub-DifferenceModal__d0f4d5-confirm'));
      await flush();

      expect(reconcileDifferenceState.reconcileDifference).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(linesState.reload).not.toHaveBeenCalled();
      expect(onReconcileSuccess).not.toHaveBeenCalled();
    });

    it('posts the difference from the same confirm without read-only (ETP-5457)', async () => {
      const { onReconcileSuccess } = renderPanel();
      selectPartialLine();
      // Writable: the banner's post action opens the dialog.
      fireEvent.click(screen.getByTestId('recon-difference-open'));
      expect(screen.getByTestId('stub-DifferenceModal__d0f4d5')).toHaveAttribute('data-open', 'true');

      fireEvent.click(screen.getByTestId('stub-DifferenceModal__d0f4d5-confirm'));

      await waitFor(() => expect(reconcileDifferenceState.reconcileDifference).toHaveBeenCalledTimes(1));
      expect(reconcileDifferenceState.reconcileDifference).toHaveBeenCalledWith({
        financialAccountId: 'ACC-1',
        statementLineId: 'LP1-rem',
        glItemId: 'GL-9',
        description: 'desc',
      });
      await waitFor(() => expect(onReconcileSuccess).toHaveBeenCalled());
    });
  });

  describe('store the account difference concept (confirmGlItemSetup → updateAccount)', () => {
    it('keeps the setup dialog closed and its confirm a no-op under read-only (ETP-5457)', async () => {
      const { onReconcileSuccess } = renderPanel({ windowReadOnly: true });
      expect(screen.getByTestId('stub-glitem-setup')).toHaveAttribute('data-open', 'false');

      fireEvent.click(screen.getByTestId('stub-glitem-setup-confirm'));
      await flush();

      expect(accountMutations.updateAccount).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(onReconcileSuccess).not.toHaveBeenCalled();
    });

    it('stores the concept on the account from the same confirm without read-only (ETP-5457)', async () => {
      renderPanel();
      fireEvent.click(screen.getByTestId('stub-glitem-setup-confirm'));

      await waitFor(() => expect(accountMutations.updateAccount).toHaveBeenCalledTimes(1));
      expect(accountMutations.updateAccount).toHaveBeenCalledWith('ACC-1', {
        glItemDifferenceId: 'GL-9',
        updated: ACCOUNT_UPDATED,
      });
    });
  });

  describe('reconcile with a difference (gl-item-required confirm → submitReconcile → reconcile)', () => {
    it('keeps the confirmation closed and its confirm a no-op under read-only (ETP-5457)', async () => {
      const { onReconcileSuccess } = renderPanel({ windowReadOnly: true });
      selectPartialLine();
      expect(screen.getByTestId('stub-DifferenceModal__gl-item-required'))
        .toHaveAttribute('data-open', 'false');

      fireEvent.click(screen.getByTestId('stub-DifferenceModal__gl-item-required-confirm'));
      await flush();

      expect(reconcileState.reconcile).not.toHaveBeenCalled();
      expect(linesState.reload).not.toHaveBeenCalled();
      expect(onReconcileSuccess).not.toHaveBeenCalled();
    });

    it('reconciles from the same confirm without read-only (ETP-5457)', async () => {
      const { onReconcileSuccess } = renderPanel();
      selectPartialLine();
      fireEvent.click(screen.getByTestId('stub-DifferenceModal__gl-item-required-confirm'));

      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
      const [payload] = reconcileState.reconcile.mock.calls[0];
      expect(payload.financialAccountId).toBe('ACC-1');
      expect(payload.statementLineId).toBe('LP1-rem');
      expect(payload.description).toBe('desc');
      await waitFor(() => expect(onReconcileSuccess).toHaveBeenCalled());
    });
  });
});
