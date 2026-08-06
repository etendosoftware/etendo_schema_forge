import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import {
  useCashClosePending,
  useConfirmCashClose,
  useSaveCashCloseDraft,
} from '@/hooks/useCashClose.js';
import { CashCloseMovementsPanel } from './CashCloseMovementsPanel.jsx';
import { CashCloseSidePanel } from './CashCloseSidePanel.jsx';
import { CashCloseConfirmDialog } from './CashCloseConfirmDialog.jsx';
import {
  countAfterStatementDate,
  parseDeclaredAmount,
  selectionState,
  summarize,
  toggleAllVisible,
  toggleOne,
  visibleMovements,
} from './cashCloseMath.js';

/**
 * Cash close (ETP-4795) — what the Reconciliation tab shows instead of the bank split panel when
 * the financial account is of type Cash (`'C'`).
 *
 * A cash drawer is not reconciled against a bank statement: the user ticks the movements that are
 * physically in the drawer, declares the counted balance, and confirms. Anything left unticked
 * stays pending for the next close, and any residual between the counted and the calculated
 * balance is posted against the account's accounting concept for differences.
 *
 * All state lives here and is deliberately minimal — every derived figure comes from
 * `cashCloseMath.js`, so the arithmetic is unit-tested without React.
 */
export function CashCloseTab({ account, onCloseSuccess }) {
  const ui = useUI();
  const accountId = account?.id;

  const {
    openingBalance, glItemDifference, draft, movements, loading, reload,
  } = useCashClosePending(accountId);
  const { saveDraft, loading: savingDraft } = useSaveCashCloseDraft();
  const { confirmClose, loading: confirming } = useConfirmCashClose();

  const [marked, setMarked] = useState(() => new Set());
  const [statementDate, setStatementDate] = useState('');
  // Raw string, not a parsed number, so the field can be emptied and typed into freely.
  const [declaredInput, setDeclaredInput] = useState('');
  const [hideCleared, setHideCleared] = useState(false);
  const [hideAfter, setHideAfter] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Seed from the server: an existing draft restores exactly what the user last saved, otherwise
  // the close starts today with an empty declared balance. Keyed on the account so switching
  // accounts never carries the previous drawer's selection over.
  useEffect(() => {
    if (loading) return;
    if (draft) {
      setMarked(new Set(draft.markedIds ?? []));
      setStatementDate(draft.statementDate ?? todayIso());
      setDeclaredInput(formatInitialAmount(draft.declaredBalance));
    } else {
      setMarked(new Set());
      setStatementDate(todayIso());
      setDeclaredInput('');
    }
  }, [accountId, draft, loading]);

  const declared = parseDeclaredAmount(declaredInput);
  const currency = account?.currencyIso || 'EUR';

  const summary = useMemo(
    () => summarize(movements, { marked, openingBalance, declared }),
    [movements, marked, openingBalance, declared],
  );
  const visible = useMemo(
    () => visibleMovements(movements, { marked, statementDate, hideCleared, hideAfter, search }),
    [movements, marked, statementDate, hideCleared, hideAfter, search],
  );
  const afterCount = useMemo(
    () => countAfterStatementDate(movements, statementDate),
    [movements, statementDate],
  );
  const { allSelected, someSelected } = selectionState(visible, marked);

  const busy = savingDraft || confirming;

  const buildPayload = () => ({
    accountId,
    statementDate,
    declaredBalance: declared,
    movementIds: Array.from(marked),
  });

  const handleSaveDraft = async () => {
    try {
      await saveDraft(buildPayload());
      toast.success(ui('financeAccountCashCloseDraftSaved'));
      reload();
    } catch (err) {
      toast.error(err?.message || ui('financeAccountCashCloseError'));
    }
  };

  // A balanced close has nothing to warn about, so it confirms straight away; an unbalanced one
  // always goes through the dialog, which names the amount and the concept it will be posted to.
  const handleConfirmClick = () => {
    if (summary.balanced) {
      runConfirm();
      return;
    }
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    try {
      await confirmClose(buildPayload());
      toast.success(ui('financeAccountCashCloseConfirmed'));
      setConfirmOpen(false);
      reload();
      onCloseSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeAccountCashCloseError'));
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="cash-close-tab">
      {/* One continuous surface: no outer padding and no gap between the columns — they are
          separated by the movements panel's own right hairline, not by a gutter. */}
      <div className="flex flex-1 overflow-hidden bg-card">
        <CashCloseMovementsPanel
          movements={movements}
          visible={visible}
          marked={marked}
          currency={currency}
          loading={loading}
          hideCleared={hideCleared}
          onHideClearedChange={setHideCleared}
          hideAfter={hideAfter}
          onHideAfterChange={setHideAfter}
          search={search}
          onSearchChange={setSearch}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleAll={() => setMarked((prev) => toggleAllVisible(visible, prev))}
          onToggleOne={(id) => setMarked((prev) => toggleOne(prev, id))}
          afterCount={afterCount}
          markedCount={summary.clearedCount}
          markedNet={summary.markedIn + summary.markedOut}
          data-testid="CashCloseMovementsPanel__ccfd67" />

        <CashCloseSidePanel
          currency={currency}
          summary={summary}
          statementDate={statementDate}
          onStatementDateChange={setStatementDate}
          declaredInput={declaredInput}
          onDeclaredInputChange={setDeclaredInput}
          glItemDifference={glItemDifference}
          busy={busy}
          onConfirm={handleConfirmClick}
          onSaveDraft={handleSaveDraft}
          data-testid="CashCloseSidePanel__ccfd67" />
      </div>
      <CashCloseConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        difference={summary.difference}
        currency={currency}
        glItemDifference={glItemDifference}
        busy={confirming}
        onConfirm={runConfirm}
        data-testid="CashCloseConfirmDialog__ccfd67" />
    </div>
  );
}

/** Today as a local `yyyy-mm-dd` string (never via toISOString, which shifts to UTC). */
function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Renders a stored balance into the es-ES text the declared-balance box expects. */
function formatInitialAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2).replace('.', ',');
}
