import { Check, Minus, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.jsx';
import { translateBackendError } from '@/lib/backendErrors.js';

const CONFIRM_TITLE_KEYS = { O: 'periodsBulkConfirmOpenTitle', C: 'periodsBulkConfirmCloseTitle' };
const ACTION_LABEL_KEYS = { O: 'periodsBulkOpen', C: 'periodsBulkClose' };
const OK_LABEL_KEYS = { O: 'periodsBulkResultOpened', C: 'periodsBulkResultClosed' };
const SKIPPED_LABEL_KEYS = { O: 'periodsBulkResultAlreadyOpen', C: 'periodsBulkResultAlreadyClosed' };

/**
 * A counted label: `<key>One` when `count` is 1 ("Open 1 period?"), otherwise `<key>` with
 * `{count}` filled in ("Open 3 periods?").
 */
export function countedLabel(ui, key, count) {
  return count === 1 ? ui(`${key}One`) : ui(key).replace('{count}', String(count));
}

/**
 * Confirmation before a bulk open/close (ETP-5682): names every selected period, so the user
 * sees exactly what the action will touch before anything is posted.
 */
export function PeriodsBulkConfirmDialog({ action, periodNames, onConfirm, onCancel }) {
  const ui = useUI();
  const open = Boolean(action);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }} data-testid="Dialog__periodsBulkConfirm">
      {open && (
        <DialogContent className="max-w-md" data-testid="periods-bulk-confirm">
          <DialogHeader data-testid="DialogHeader__periodsBulkConfirm">
            <DialogTitle data-testid="DialogTitle__periodsBulkConfirm">
              {countedLabel(ui, CONFIRM_TITLE_KEYS[action], periodNames.length)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" data-testid="periods-bulk-confirm-body">
            {ui('periodsBulkConfirmBody')}
          </p>
          <p className="text-sm font-medium" data-testid="periods-bulk-confirm-names">{periodNames.join(', ')}</p>
          <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__periodsBulkConfirm">
            <Button type="button" variant="outline" onClick={onCancel} data-testid="periods-bulk-confirm-cancel">
              {ui('cancel')}
            </Button>
            <Button type="button" onClick={onConfirm} data-testid="periods-bulk-confirm-ok">
              {ui(ACTION_LABEL_KEYS[action])}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function OutcomeIcon({ outcome }) {
  if (outcome === 'ok') return <Check className="h-4 w-4 text-[var(--status-success-fg)]" aria-hidden="true" data-testid="Check__periodsBulkResult" />;
  if (outcome === 'failed') return <X className="h-4 w-4 text-destructive" aria-hidden="true" data-testid="X__periodsBulkResult" />;
  return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" data-testid="Minus__periodsBulkResult" />;
}

/**
 * Per-period result of a bulk run, shown only when at least one period failed (a clean run is a
 * toast). One row per period, in the order they were processed, with the translated backend
 * error for the failed ones.
 */
export function PeriodsBulkResultDialog({ action, results, periodName, onClose }) {
  const ui = useUI();
  const open = Boolean(results);
  const describe = (r) => {
    if (r.outcome === 'ok') return ui(OK_LABEL_KEYS[action]);
    if (r.outcome === 'skipped') return ui(SKIPPED_LABEL_KEYS[action]);
    return (r.message && translateBackendError(r.message, ui)) || ui('periodsBulkResultFailed');
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} data-testid="Dialog__periodsBulkResult">
      {open && (
        <DialogContent className="max-w-lg" data-testid="periods-bulk-result">
          <DialogHeader data-testid="DialogHeader__periodsBulkResult">
            <DialogTitle data-testid="DialogTitle__periodsBulkResult">{ui('periodsBulkResultTitle')}</DialogTitle>
          </DialogHeader>
          <ul className="divide-y text-sm" data-testid="periods-bulk-result-list">
            {results.map((r) => (
              <li
                key={r.period.id}
                className="flex items-start gap-3 py-2"
                data-testid={`periods-bulk-result-${r.period.id}`}
                data-outcome={r.outcome}
              >
                <span className="mt-0.5"><OutcomeIcon outcome={r.outcome} data-testid="OutcomeIcon__periodsBulkResult" /></span>
                <span className="w-28 shrink-0 font-medium">{periodName(r.period)}</span>
                <span className={r.outcome === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{describe(r)}</span>
              </li>
            ))}
          </ul>
          <DialogFooter className="pt-2" data-testid="DialogFooter__periodsBulkResult">
            <Button type="button" onClick={onClose} data-testid="periods-bulk-result-close">{ui('close')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
