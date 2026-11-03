import { Ban, EyeOff, RotateCcw } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoneyAmount } from '@/components/ui/money-amount';
import { TruncatedText } from '@/components/ui/truncated-text';
import { formatDate, formatSigned } from '@/lib/formatSigned';
import { cn } from '@/lib/utils';
import { StatusBadge } from './reconciliationBadges.jsx';
import { DISCARDED_STATE } from './bouncePairs.js';

const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]';
/** Pill sizing on top of the shared `Button` variants: the blue primary (default) and the outline. */
const PILL_BTN = 'h-8 gap-1.5 rounded-full px-3 [&_svg]:size-4';
/** The outline variant with the app's standard secondary colours, as in the payment-method modal. */
const SECONDARY_BTN = cn(PILL_BTN, 'border-[hsl(var(--border-control))] bg-card text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted');

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

/**
 * The muted "date · Ref. X" of a statement line, or null when it has neither. What tells two lines
 * of the same text and amount apart (two returns of +0,61 the same day): the bank's own reference.
 */
function lineMeta(ui, line, bcpLocale) {
  if (!line) return null;
  const ref = String(line.referenceNo ?? '').trim();
  const parts = [
    line.date ? formatDate(line.date, bcpLocale) : null,
    ref ? ui('financeReconcileBounceRef', { ref }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Footer label of the line selected in the left panel: a return, an outgoing line, or a discarded line. */
function selectedLineLabel(ui, model) {
  if (model.mode === DISCARDED_STATE) return ui('financeReconcileBounceSelectedLine');
  return model.role === 'bounce'
    ? ui('financeReconcileBounceSelectedBounce')
    : ui('financeReconcileBounceTotalOriginal');
}

function TotalRow({ label, value, meta = null, tone = 'neutral', testId }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 text-sm leading-5" data-testid={testId}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-medium text-[hsl(var(--foreground))]">{label}</span>
        {meta ? (
          <TruncatedText
            text={meta}
            className="w-auto min-w-0 text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]"
            data-testid={testId ? `${testId}-meta` : undefined} />
        ) : null}
      </span>
      <span className={cn(
        'shrink-0 font-semibold tabular-nums',
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
  const ref = String(row.referenceNo ?? '').trim();
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
            className="h-4 w-4 accent-primary"
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
          <div className="flex w-full min-w-0 items-center gap-1.5">
            <StatusBadge kind={model.rowBadge} data-testid={`recon-bounce-badge-${row.id}`} />
            {/* The bank reference, muted: two outgoing lines with the same text and amount are
                told apart by it without a column of their own. */}
            {ref ? (
              <TruncatedText
                text={ui('financeReconcileBounceRef', { ref })}
                className="w-auto min-w-0 text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]"
                data-testid={`recon-bounce-ref-${row.id}`} />
            ) : null}
          </div>
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
 * - Identical-looking lines are told apart without a new column: each row shows the bank
 *   reference (`referenceNo`) muted next to its badge, the full description on hover, and the
 *   footer opens with the selected line itself ("Rebote seleccionado" / "Salida seleccionada" /
 *   "Línea seleccionada") with its date and reference, above the counterpart and the net.
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
          {/* The line selected in the left panel, with its date and bank reference: two returns of
              the same text and amount the same day are otherwise indistinguishable here. */}
          {line ? (
            <TotalRow
              label={selectedLineLabel(ui, model)}
              value={formatSigned(line.amount, currency)}
              meta={lineMeta(ui, line, bcpLocale)}
              testId="recon-bounce-total-selected"
              data-testid="TotalRow__bounce-selected" />
          ) : null}
          {discarded ? null : (
            <TotalRow
              label={otherLabel}
              value={model.other ? formatSigned(model.other.amount, currency) : '—'}
              meta={lineMeta(ui, model.other, bcpLocale)}
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
            <Button
              type="button"
              variant="outline"
              onClick={onDismiss}
              className={SECONDARY_BTN}
              data-testid="recon-bounce-dismiss">
              <EyeOff className="h-4 w-4" data-testid="EyeOff__bounce-dismiss" />
              {ui('financeReconcileBounceDismiss')}
            </Button>
          )}
          {discarded ? (
            <Button
              type="button"
              onClick={onRestore}
              disabled={busy || windowReadOnly || !line?.id}
              className={PILL_BTN}
              data-testid="recon-bounce-restore">
              <RotateCcw className="h-4 w-4" data-testid="RotateCcw__bounce-restore" />
              {ui(model.paired ? 'financeReconcileBounceRestore' : 'financeReconcileBounceRestoreLine')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onDiscard}
              disabled={busy || windowReadOnly || !model.discard}
              className={PILL_BTN}
              data-testid="recon-bounce-discard">
              <Ban className="h-4 w-4" data-testid="Ban__bounce-discard" />
              {ui('financeReconcileBounceDiscard')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BouncePairPanel;
