import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI, useLocaleSwitch } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatDate } from '@/lib/formatSigned';

/**
 * Left-hand column of the cash-close screen (ETP-4795): the list of movements still available to
 * close, each with a checkbox for "this one is physically in the drawer".
 *
 * Purely presentational — filtering and selection arithmetic live in `cashCloseMath.js`; this
 * component only renders what it is handed.
 */

const SKELETON_ROWS = [1, 2, 3, 4];
// One per column: checkbox, date, contact, payment ref, description, amount.
const SKELETON_CELL_KEYS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
const COL_COUNT = SKELETON_CELL_KEYS.length;
// Same elevation the reconciliation panel uses for a selected row. There is no purple token in
// this design system (the handoff's `--purple-50`), so selection reads as muted + elevation.
const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]';

/** A labelled switch, matching the design's filter-bar toggles. */
function ToggleFilter({ label, checked, onCheckedChange, testId }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] leading-[18px] text-[hsl(var(--foreground))]">
      <Switch checked={checked} onCheckedChange={onCheckedChange} data-testid={testId} />
      {label}
    </label>
  );
}

function MovementRow({ movement, checked, onToggle, currency, bcpLocale }) {
  // One signed figure instead of separate in/out columns: green +, red −, like the Movements grid.
  const amount = Number(movement.amount) || 0;

  return (
    <TableRow
      onClick={() => onToggle(movement.id)}
      className={cn(
        'cursor-pointer transition-shadow',
        checked
          ? `z-10 bg-[hsl(var(--muted))] ${ELEVATED_SHADOW}`
          : 'bg-card hover:z-10 hover:bg-card hover:shadow-lg',
      )}
      data-testid={`cash-close-row-${movement.id}`}
    >
      <TableCell
        className="w-10 px-0 pl-3"
        onClick={(e) => e.stopPropagation()}
        data-testid="TableCell__64d56f">
        <Checkbox
          checked={checked}
          onChange={() => onToggle(movement.id)}
          data-testid={`cash-close-check-${movement.id}`} />
      </TableCell>
      <TableCell
        className="w-[104px] whitespace-nowrap text-sm"
        data-testid="TableCell__64d56f">
        {formatDate(movement.transactionDate, bcpLocale)}
      </TableCell>
      <TableCell
        className="max-w-[200px] truncate text-sm font-semibold"
        data-testid="TableCell__64d56f">
        {movement.partnerName || '—'}
      </TableCell>
      <TableCell
        className="w-[104px] truncate text-[13px] text-[hsl(var(--muted-foreground))]"
        data-testid="TableCell__64d56f">
        {movement.documentNo || '—'}
      </TableCell>
      <TableCell
        className="max-w-[220px] truncate text-[13px] text-[hsl(var(--muted-foreground))]"
        data-testid="TableCell__64d56f">
        {movement.description || '—'}
      </TableCell>
      <TableCell className="w-[130px] text-right" data-testid="TableCell__64d56f">
        {amount !== 0
          ? <MoneyAmount
          value={amount}
          currency={currency}
          tone="auto"
          className="font-semibold"
          data-testid="MoneyAmount__64d56f" />
          : <span className="text-[hsl(var(--text-disabled))]">—</span>}
      </TableCell>
    </TableRow>
  );
}

export function CashCloseMovementsPanel({
  movements, visible, marked, currency, loading,
  hideCleared, onHideClearedChange, hideAfter, onHideAfterChange,
  search, onSearchChange,
  allSelected, someSelected, onToggleAll, onToggleOne,
  afterCount, markedCount, markedNet,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const hiddenCount = movements.length - visible.length;

  return (
    // A section of the window surface, not a card: the only chrome is the hairline separating it
    // from the summary column.
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[hsl(var(--border-subtle))]">
      {/* Aviso de movimientos posteriores — solo cuando el usuario los ha hecho visibles */}
      {!hideAfter && afterCount > 0 ? (
        <div
          className="flex items-start gap-2 border-b border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-6 py-3"
          data-testid="cash-close-after-date-banner"
        >
          <AlertTriangle
            className="mt-px h-[18px] w-[18px] shrink-0 text-[var(--status-warning-fg)]"
            data-testid="AlertTriangle__64d56f" />
          <p className="text-[13px] leading-[18px] text-[var(--status-warning-fg)]">
            <b>{ui('financeAccountCashCloseAfterDateWarning', { count: afterCount })}</b>{' '}
            {ui('financeAccountCashCloseAfterDateHint')}
          </p>
        </div>
      ) : null}
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[hsl(var(--border-subtle))] px-6 py-3">
        <button
          type="button"
          aria-label={ui('financeAccountDetailBack')}
          data-testid="cash-close-back"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-[hsl(var(--muted))] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__64d56f" />
        </button>
        <ToggleFilter
          label={ui('financeAccountCashCloseHideCleared')}
          checked={hideCleared}
          onCheckedChange={onHideClearedChange}
          testId="cash-close-hide-cleared"
          data-testid="ToggleFilter__64d56f" />
        <ToggleFilter
          label={ui('financeAccountCashCloseHideAfter')}
          checked={hideAfter}
          onCheckedChange={onHideAfterChange}
          testId="cash-close-hide-after"
          data-testid="ToggleFilter__64d56f" />
        <div className="flex-1" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={ui('financeAccountCashCloseSearchPlaceholder')}
          data-testid="cash-close-search"
          className="h-9 w-60 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-disabled))] shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:ring-offset-1"
        />
      </div>
      {/* Tabla */}
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <Table data-testid="cash-close-table">
          <TableHeader data-testid="TableHeader__64d56f">
            {/* Same header treatment as the Movements grid: sentence case, semibold, foreground
                colour, no fill — not the uppercase small-caps on grey used elsewhere. */}
            <TableRow
              className="h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:leading-4 [&_th]:text-[hsl(var(--foreground))]"
              data-testid="TableRow__64d56f">
              {/* Select-all lives here rather than in the filter bar: sitting directly above the
                  row checkboxes it needs no label to be understood. */}
              <TableHead className="w-10 px-0 pl-3" data-testid="TableHead__64d56f">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={onToggleAll}
                  aria-label={ui('selectAll')}
                  data-testid="cash-close-select-all" />
              </TableHead>
              <TableHead className="w-[104px]" data-testid="TableHead__64d56f">{ui('financeAccountCashCloseColDate')}</TableHead>
              <TableHead data-testid="TableHead__64d56f">{ui('financeAccountCashCloseColContact')}</TableHead>
              <TableHead className="w-[104px]" data-testid="TableHead__64d56f">{ui('financeAccountCashCloseColPaymentRef')}</TableHead>
              <TableHead data-testid="TableHead__64d56f">{ui('financeAccountCashCloseColDescription')}</TableHead>
              <TableHead className="w-[130px] text-right" data-testid="TableHead__64d56f">{ui('financeAccountCashCloseColAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="TableBody__64d56f">
            {loading ? SKELETON_ROWS.map((row) => (
              <TableRow key={`skeleton-${row}`} data-testid="TableRow__64d56f">
                {SKELETON_CELL_KEYS.map((cell) => (
                  <TableCell key={cell} data-testid="TableCell__64d56f"><Skeleton className="h-4 w-full" data-testid="Skeleton__64d56f" /></TableCell>
                ))}
              </TableRow>
            )) : null}

            {!loading && visible.length === 0 ? (
              <TableRow className="hover:bg-transparent" data-testid="TableRow__64d56f">
                <TableCell colSpan={COL_COUNT} className="py-12" data-testid="TableCell__64d56f">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {ui('financeAccountCashCloseEmpty')}
                    </p>
                    <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
                      {ui('financeAccountCashCloseEmptyHint')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {!loading && visible.map((movement) => (
              <MovementRow
                key={movement.id}
                movement={movement}
                checked={marked.has(movement.id)}
                onToggle={onToggleOne}
                currency={currency}
                bcpLocale={bcpLocale}
                data-testid="MovementRow__64d56f" />
            ))}
          </TableBody>
        </Table>

        {!loading && hiddenCount > 0 ? (
          <p
            className="border-b border-[hsl(var(--border-subtle))] px-6 py-3.5 text-xs leading-4 text-[hsl(var(--muted-foreground))]"
            data-testid="cash-close-hidden-note"
          >
            {ui('financeAccountCashCloseHiddenByFilters', { count: hiddenCount })}
          </p>
        ) : null}

        {/* Table footer: what is currently ticked, next to the rows it refers to. */}
        {!loading && movements.length > 0 ? (
          <div
            className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-6 py-3.5 text-[13px] leading-[18px]"
            data-testid="cash-close-marked-footer"
          >
            <span className="text-[hsl(var(--muted-foreground))]">
              {ui('financeAccountCashCloseMarkedSummary', {
                marked: markedCount,
                total: movements.length,
              })}
            </span>
            <MoneyAmount
              value={markedNet}
              currency={currency}
              tone="auto"
              className="font-semibold tabular-nums"
              data-testid="MoneyAmount__64d56f" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
