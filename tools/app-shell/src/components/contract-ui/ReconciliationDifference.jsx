import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookText, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChipSelect } from '@/components/forms/fields';
import { formatCurrency } from '@/lib/formatCurrency';
import { useGLItemLookup } from '@/hooks/useMovementLookups';
import { cn } from '@/lib/utils';
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal.jsx';

/* eslint-disable react/prop-types */

// Re-exported here so callers have a single entry point for the feature, exactly as
// WriteoffAdjustment.jsx does for writeoffMath.js.
export { differenceState, differenceLimit, isNegligible, DIFFERENCE_EPSILON }
  from './reconciliationDifferenceMath.js';

/**
 * Amber banner offering to close a partially reconciled line's remainder (design option 1B).
 *
 * Sits at the top of the right-hand panel — where the problem actually is — rather than in the
 * bottom action bar, whose "Conciliar" button stays independent: the adjustment is confirmed from
 * the modal, never from there.
 *
 * @param {object} props
 * @param {object} props.info the `differenceState(...)` result
 * @param {string} props.currency ISO code for the remainder
 * @param {() => void} props.onDismiss "Dejar pendiente" — hides the banner for this line, this
 *     session only, and changes no data
 * @param {() => void} props.onPost opens the confirmation modal
 */
export function DifferenceBanner({ info, currency, onDismiss, onPost }) {
  const ui = useUI();
  if (!info?.visible) {
    return null;
  }

  return (
    <div
      className="mx-6 mt-4 flex items-center gap-3.5 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3.5"
      data-testid="recon-difference-banner"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning-border)]">
        <AlertCircle className="h-4 w-4 text-[var(--status-warning-fg)]" data-testid="AlertCircle__recon-diff" />
      </span>
      {/* Title only. The design's subtitle ("El extracto es de X y ya has conciliado Y con Mov. Z")
          was dropped: its three figures are all on screen already — the line total in the left
          panel, and the reconciled amount plus progress in the ReconciledOperationsSection row
          rendered immediately below this banner. That overlap is structural, not incidental: that
          row's condition (PARTIAL && reconciledAmount) is the same one that shows this banner, so
          they always appear together. The design mock did not include that row. The full arithmetic
          still lives in the modal's breakdown, where it matters — right before confirming. */}
      <div className="min-w-0">
        <p className="text-sm font-bold leading-5 tabular-nums text-[hsl(var(--foreground))]">
          {ui('financeReconcileDiffBannerTitle', {
            amount: formatCurrency(currency, Math.abs(info.remainder)),
          })}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-9 px-2 text-[13px] font-semibold leading-[18px] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          data-testid="recon-difference-dismiss"
        >
          {ui('financeReconcileDiffLeavePending')}
        </button>
        {/* Always enabled: the concept is chosen inside the modal, whose own confirm stays disabled
            until one is picked. The account's configured default only preselects it. */}
        <Button
          onClick={onPost}
          className="h-9 gap-1.5 px-3.5 text-[13px] font-semibold bg-[hsl(var(--text-primary))] text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
          data-testid="recon-difference-open"
        >
          <BookText className="h-[15px] w-[15px]" data-testid="BookText__recon-diff" />
          {ui('financeReconcileDiffAction')}
        </Button>
      </div>
    </div>
  );
}

/** One row of the modal's breakdown block. */
function BreakdownRow({ label, amount, currency, emphasis, testId }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3.5 py-2.5',
        emphasis && 'bg-[hsl(var(--muted))]',
      )}
      data-testid={testId}
    >
      <span className="text-[13px] leading-[18px] text-[hsl(var(--muted-foreground))]">{label}</span>
      <span
        className={cn(
          'text-[13px] font-bold leading-[18px] tabular-nums',
          emphasis ? 'text-[var(--status-warning-fg)]' : 'text-[hsl(var(--foreground))]',
        )}
      >
        {formatCurrency(currency, amount)}
      </span>
    </div>
  );
}

/**
 * Confirmation modal for posting the remainder to an accounting concept.
 *
 * The amount is deliberately NOT editable: the server recomputes the remainder from the statement
 * line and ignores anything the client sends, so an editable field here would promise control the
 * backend does not grant. The figure lives in the breakdown's "Diferencia a ajustar" row.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object} props.info the `differenceState(...)` result
 * @param {string} props.currency
 * @param {{id: string, name: string}|null} props.defaultGlItem the account's configured difference
 *     concept, used to preselect the picker
 * @param {boolean} props.busy
 * @param {(payload: {glItemId: string, description: string}) => void} props.onConfirm
 * @param {() => void} props.onClose
 */
export function DifferenceModal({
  open, info, currency, defaultGlItem, busy, onConfirm, onClose, readOnlyGlItem = false,
}) {
  const ui = useUI();
  const [glItem, setGlItem] = useState(defaultGlItem ?? null);
  const [description, setDescription] = useState('');

  // Re-seed on every open: the account default may have changed, and a previous run's description
  // must not leak into the next line's adjustment.
  useEffect(() => {
    if (open) {
      setGlItem(defaultGlItem ?? null);
      setDescription('');
    }
  }, [open, defaultGlItem]);

  const confirm = useCallback(() => {
    onConfirm({ glItemId: glItem?.id ?? '', description: description.trim() });
  }, [onConfirm, glItem, description]);

  const remainder = Math.abs(info?.remainder ?? 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__recon-difference">
      <DialogContent className="max-w-lg bg-card" data-testid="recon-difference-dialog">
        <DialogHeader data-testid="DialogHeader__recon-difference">
          <DialogTitle data-testid="DialogTitle__recon-difference">
            {ui('financeReconcileDiffModalTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__recon-difference">
            {ui('financeReconcileDiffModalBody', {
              amount: formatCurrency(currency, remainder),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] divide-y divide-[hsl(var(--border-subtle))]">
          <BreakdownRow
            label={ui('financeReconcileDiffRowStatement')}
            amount={Math.abs(info?.lineTotal ?? 0)}
            currency={currency}
            testId="recon-difference-row-statement"
            data-testid="BreakdownRow__recon-difference-statement" />
          <BreakdownRow
            label={ui('financeReconcileDiffRowMatched')}
            amount={Math.abs(info?.reconciled ?? 0)}
            currency={currency}
            testId="recon-difference-row-matched"
            data-testid="BreakdownRow__recon-difference-matched" />
          <BreakdownRow
            label={ui('financeReconcileDiffRowDifference')}
            amount={remainder}
            currency={currency}
            emphasis
            testId="recon-difference-row-difference"
            data-testid="BreakdownRow__recon-difference-remainder" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            {ui('financeReconcileDiffConceptLabel')}
          </label>
          {/* Read-only when the destination is the financial account's own setting: the entry always
              goes there, so offering a picker would suggest a per-line choice that does not exist.
              The editable form stays for the banner flow, which is a one-off adjustment. */}
          {readOnlyGlItem ? (
            <div
              className="flex h-10 items-center rounded-md border border-[hsl(var(--border-control))] bg-muted px-3 text-sm text-[hsl(var(--foreground))]"
              data-testid="recon-difference-concept-readonly">
              {glItem?.name || glItem?.id || '—'}
            </div>
          ) : (
            <ChipSelect
              value={glItem}
              onChange={setGlItem}
              useLookup={useGLItemLookup}
              placeholder={ui('financeReconcileDiffConceptPlaceholder')}
              testId="recon-difference-concept"
              data-testid="ChipSelect__recon-difference" />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
            {ui('financeReconcileDiffDescriptionLabel')}
          </label>
          {/* The shared Input defaults to `bg-muted`, and its own `disabled:` state reuses that very
              same background — so an editable field is indistinguishable from a read-only one. Every
              other editable field in this window family overrides it the same way (the FIELD_INPUT
              constant in EditAccountModal / AccountFormStep), which also matches the white
              ChipSelect right above it in this modal. */}
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ui('financeReconcileDiffDescriptionPlaceholder')}
            className="bg-card shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)]"
            data-testid="recon-difference-description" />
        </div>

        <DialogFooter data-testid="DialogFooter__recon-difference">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="border-[hsl(var(--border-control))] bg-card text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted"
            data-testid="recon-difference-cancel">
            {ui('cancel')}
          </Button>
          <Button
            onClick={confirm}
            disabled={busy || !glItem?.id}
            className="gap-1.5 bg-[hsl(var(--text-primary))] text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
            data-testid="recon-difference-confirm">
            <Check className="h-4 w-4" data-testid="Check__recon-difference" />
            {ui('financeReconcileDiffConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks for the accounting account BEFORE a match with a postable difference can be confirmed, when
 * the financial account has none configured (ETP-4965, QA round).
 *
 * Built on {@link LifecycleConfirmModal} so it reads like the rest of this window's blocking
 * prompts (heading, consequence list, amber strip, footer) instead of looking like a form that
 * wandered in. Its `warning` tone: the confirm CONFIGURES something, so a destructive red button
 * would misdescribe it.
 *
 * The chosen account is saved on the FINANCIAL ACCOUNT, not on this reconciliation — every later
 * difference on that account lands there too — so the copy says so rather than letting the user
 * discover it. The caller persists it and closes; confirming the reconciliation is a separate,
 * deliberate second step.
 *
 * @param {{ open: boolean, busy?: boolean, onConfirm: (glItem: object) => void, onClose: () => void }} props
 */
export function GlItemSetupDialog({ open, busy = false, onConfirm, onClose }) {
  const ui = useUI();
  const [glItem, setGlItem] = useState(null);

  // A fresh pick on every open: the previous one was already saved on the account, and leaving it
  // selected would suggest this dialog edits a value it only ever sets once.
  useEffect(() => {
    if (open) setGlItem(null);
  }, [open]);

  if (!open) return null;

  return (
    <LifecycleConfirmModal
      tone="warning"
      title={ui('financeReconcileGlItemSetupTitle')}
      sub={ui('financeReconcileGlItemSetupBody')}
      items={[
        [ui('financeReconcileGlItemSetupItemScopeTitle'),
          ui('financeReconcileGlItemSetupItemScopeBody')],
        [ui('financeReconcileGlItemSetupItemNextTitle'),
          ui('financeReconcileGlItemSetupItemNextBody')],
      ]}
      warning={ui('financeReconcileGlItemSetupHint')}
      confirmLabel={ui('financeReconcileGlItemSetupConfirm')}
      cancelLabel={ui('cancel')}
      confirmDisabled={busy || !glItem?.id}
      onConfirm={() => onConfirm(glItem)}
      onClose={onClose}
      testIdPrefix="recon-glitem-setup"
      data-testid="LifecycleConfirmModal__recon-glitem-setup">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[hsl(var(--foreground))]">
          {ui('financeReconcileDiffConceptLabel')}
        </label>
        <ChipSelect
          value={glItem}
          onChange={setGlItem}
          useLookup={useGLItemLookup}
          placeholder={ui('financeReconcileDiffConceptPlaceholder')}
          testId="recon-glitem-setup-concept"
          data-testid="ChipSelect__recon-glitem-setup" />
      </div>
    </LifecycleConfirmModal>
  );
}
