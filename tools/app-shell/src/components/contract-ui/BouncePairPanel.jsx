import { Ban, EyeOff, RotateCcw } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/ui/money-amount';
import { TruncatedText } from '@/components/ui/truncated-text';
import { formatDate, formatSigned } from '@/lib/formatSigned';
import { cn } from '@/lib/utils';
import { StatusBadge } from './reconciliationBadges.jsx';
import { DISCARDED_STATE } from './bouncePairs.js';

const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]';
const SECONDARY_BTN = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]';
const PRIMARY_BTN = 'inline-flex h-8 items-center gap-1.5 rounded-full bg-[hsl(var(--foreground))] px-3 text-sm font-medium text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground';

/** Notice palette: high confidence green, to review amber, discarded grey. */
function noticeClass(model) {
  if (model.mode === DISCARDED_STATE) return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return model.reason.high
    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
    : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]';
}

/** The sentences of the notice, already translated. */
function noticeText(ui, model, bcpLocale) {
  if (model.mode === DISCARDED_STATE) {
    if (!model.paired) return ui('financeReconcileBounceDiscardedAloneNotice');
    const at = model.link?.discardedAt;
    return at
      ? ui('financeReconcileBounceDiscardedNotice', { date: formatDate(at, bcpLocale) })
      : ui('financeReconcileBounceDiscardedNoticeNoDate');
  }
  const { reason } = model;
  let headline;
  if (reason.high) {
    headline = reason.signalKey
      ? ui('financeReconcileBounceNoticeHigh', { signal: ui(reason.signalKey) })
      : ui('financeReconcileBounceNoticeHighPlain');
  } else {
    headline = ui('financeReconcileBounceNoticeReview', { reason: ui(reason.longKey, reason.params) });
  }
  return [
    headline,
    model.selectable && !model.chosenId ? ui('financeReconcileBounceNoticeChoose') : null,
    ui('financeReconcileBounceNoticeEffect'),
  ].filter(Boolean).join(' ');
}

/** The read-only label above the rows, in the place of the candidate panel's type selector. */
function sourceLabel(ui, model) {
  const count = model.rows.length;
  if (model.mode === DISCARDED_STATE) return ui('financeReconcileBounceSourceDiscarded', { count });
  return model.role === 'bounce'
    ? ui('financeReconcileBounceSourceOriginals', { count })
    : ui('financeReconcileBounceSourceBounces', { count });
}

function TotalRow({ label, value, tone = 'neutral', testId }) {
  return (
    <div className="flex items-center justify-between px-3 text-sm leading-5" data-testid={testId}>
      <span className="font-medium text-[hsl(var(--foreground))]">{label}</span>
      <span className={cn(
        'font-semibold tabular-nums',
        tone === 'success' && 'text-[var(--status-success-fg)]',
        tone === 'destructive' && 'text-[hsl(var(--destructive))]',
        tone === 'neutral' && 'text-[hsl(var(--foreground))]',
      )}>
        {value}
      </span>
    </div>
  );
}

function PairRow({ row, model, onChoose, currency, bcpLocale }) {
  const ui = useUI();
  const chosen = row.id === model.chosenId;
  const amount = Number(row.amount) || 0;
  return (
    <TableRow
      data-testid={`recon-bounce-row-${row.id}`}
      onClick={model.selectable ? () => onChoose(row.id) : undefined}
      className={cn(
        'group relative h-[62px] border-b border-[hsl(var(--border-subtle))] bg-card transition-shadow',
        model.selectable && 'cursor-pointer',
        chosen && model.selectable ? `z-10 bg-[hsl(var(--muted))] ${ELEVATED_SHADOW}` : 'hover:bg-card',
      )}
    >
      <TableCell className="h-[62px] w-8 px-0 pl-2" data-testid="TableCell__bounce-pair">
        {model.selectable ? (
          <input
            type="radio"
            name="recon-bounce-original"
            aria-label={ui('financeReconcileBounceChooseOriginal')}
            checked={chosen}
            onChange={() => onChoose(row.id)}
            onClick={(e) => e.stopPropagation()}
            data-testid={`recon-bounce-radio-${row.id}`}
            className="h-4 w-4 accent-[hsl(var(--foreground))]"
          />
        ) : null}
      </TableCell>
      <TableCell
        className="h-[62px] w-[104px] px-3 text-sm font-normal text-[hsl(var(--foreground))]"
        data-testid="TableCell__bounce-pair">
        {formatDate(row.date, bcpLocale)}
      </TableCell>
      <TableCell className="h-[62px] px-3 py-2 text-sm text-[hsl(var(--foreground))]" data-testid="TableCell__bounce-pair">
        <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
          <TruncatedText
            text={row.description || row.partnerName || row.referenceNo || '—'}
            className="leading-5"
            data-testid={`recon-bounce-desc-${row.id}`} />
          <StatusBadge kind={model.rowBadge} data-testid={`recon-bounce-badge-${row.id}`} />
        </div>
      </TableCell>
      <TableCell className="h-[62px] w-[121px] px-3 text-right align-middle" data-testid="TableCell__bounce-pair">
        <MoneyAmount
          value={amount}
          currency={currency}
          tone="neutral"
          className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]"
          data-testid="MoneyAmount__bounce-pair" />
      </TableCell>
    </TableRow>
  );
}

function netTone(net) {
  if (net == null) return 'neutral';
  return Math.abs(net) < 0.005 ? 'success' : 'destructive';
}

/**
 * The right panel of the bank reconciliation for a line of a possible bounce pair, or for a
 * discarded line (ETP-5581). Same structure as the candidate operations panel it replaces: a
 * toolbar, a notice, the rows and a footer with the totals and the actions.
 *
 * - A line of a detected pair lists its counterpart line(s): the possible outgoing lines when the
 *   selected line is the bounce (a radio each when the pair is ambiguous), or the bounce line. The
 *   notice says why the pair is proposed, the footer shows the pair's net effect, and the actions
 *   are "No es un rebote" (hides it for the session, persists nothing) and "Descartar par".
 * - A discarded line lists the line it was discarded with and offers "Restaurar par" (or
 *   "Restaurar línea" for a line discarded on its own).
 *
 * Discard and restore are writes: disabled under the window's read-only tier (the caller's handlers
 * are guarded too). "No es un rebote" changes no data and stays available.
 *
 * Presentational: `model` comes from `bouncePanelModel` (bouncePairs.js).
 *
 * @param {{ model: object, line: object, currency: string, bcpLocale: string,
 *   onChoose: (lineId: string) => void, onDismiss: () => void, onDiscard: () => void,
 *   onRestore: () => void, busy?: boolean, windowReadOnly?: boolean }} props
 */
export function BouncePairPanel({
  model, line, currency, bcpLocale, onChoose, onDismiss, onDiscard, onRestore,
  busy = false, windowReadOnly = false,
}) {
  const ui = useUI();
  const discarded = model.mode === DISCARDED_STATE;
  const otherLabel = model.role === 'bounce'
    ? ui('financeReconcileBounceTotalOriginal')
    : ui('financeReconcileBounceTotalBounce');
  return (
    <div className="flex min-w-[30%] flex-1 flex-col overflow-hidden" data-testid="recon-bounce-panel">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <span
          className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium leading-6 text-[hsl(var(--foreground))]"
          data-testid="recon-bounce-source">
          {sourceLabel(ui, model)}
        </span>
      </div>
      <p
        role="status"
        className={cn('mx-2 mb-2 rounded-lg px-3 py-2 text-[13px] leading-[18px]', noticeClass(model))}
        data-testid="recon-bounce-notice">
        {noticeText(ui, model, bcpLocale)}
      </p>
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <Table className="table-fixed" data-testid="Table__bounce-pair">
          <TableHeader data-testid="TableHeader__bounce-pair">
            <TableRow
              className="h-11 border-b border-[hsl(var(--border-subtle))] [&_th]:text-xs [&_th]:font-semibold [&_th]:text-[hsl(var(--foreground))]"
              data-testid="TableRow__bounce-pair-head">
              <TableHead className="w-8 px-0 pl-2" data-testid="TableHead__bounce-pair" />
              <TableHead className="w-[104px] px-3" data-testid="TableHead__bounce-pair">{ui('financeReconcileColDate')}</TableHead>
              <TableHead className="px-3" data-testid="TableHead__bounce-pair">{ui('financeReconcileColInfo')}</TableHead>
              <TableHead className="w-[121px] px-3 text-right" data-testid="TableHead__bounce-pair">{ui('financeReconcileColAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="TableBody__bounce-pair">
            {model.rows.map((row) => (
              <PairRow
                key={row.id}
                row={row}
                model={model}
                onChoose={onChoose}
                currency={currency}
                bcpLocale={bcpLocale}
                data-testid="PairRow__bounce-pair" />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-[hsl(var(--border-subtle))] bg-card px-0 pt-2 pb-1" data-testid="recon-bounce-footer">
        <div className="flex flex-col gap-1">
          {discarded ? null : (
            <TotalRow
              label={otherLabel}
              value={model.other ? formatSigned(model.other.amount, currency) : '—'}
              testId="recon-bounce-total-other"
              data-testid="TotalRow__bounce-other" />
          )}
          {model.net == null && discarded ? null : (
            <TotalRow
              label={ui('financeReconcileBounceTotalNet')}
              value={model.net == null ? '—' : formatSigned(model.net, currency)}
              tone={netTone(model.net)}
              testId="recon-bounce-total-net"
              data-testid="TotalRow__bounce-net" />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          {discarded ? <span /> : (
            <button
              type="button"
              onClick={onDismiss}
              className={SECONDARY_BTN}
              data-testid="recon-bounce-dismiss">
              <EyeOff className="h-4 w-4" data-testid="EyeOff__bounce-dismiss" />
              {ui('financeReconcileBounceDismiss')}
            </button>
          )}
          {discarded ? (
            <button
              type="button"
              onClick={onRestore}
              disabled={busy || windowReadOnly || !line?.id}
              className={PRIMARY_BTN}
              data-testid="recon-bounce-restore">
              <RotateCcw className="h-4 w-4" data-testid="RotateCcw__bounce-restore" />
              {ui(model.paired ? 'financeReconcileBounceRestore' : 'financeReconcileBounceRestoreLine')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy || windowReadOnly || !model.discard}
              className={PRIMARY_BTN}
              data-testid="recon-bounce-discard">
              <Ban className="h-4 w-4" data-testid="Ban__bounce-discard" />
              {ui('financeReconcileBounceDiscard')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BouncePairPanel;
