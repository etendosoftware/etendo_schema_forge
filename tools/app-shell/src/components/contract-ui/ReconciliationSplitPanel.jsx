import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleCheckBig, CheckCircle, X, ChevronDown, Minus, RotateCcw, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Same cartel Movimientos and Cobros/Pagos use for their reactivate/delete confirmations, so every
// lifecycle confirmation in the app looks identical (DetailView.jsx imports its payment sibling the
// same way).
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal';
import {
  WriteoffBreakdown, WriteoffToggleRow, writeoffState,
} from './WriteoffAdjustment.jsx';
import {
  DifferenceBanner, DifferenceModal, differenceState,
} from './ReconciliationDifference.jsx';
import {
  STATUS_CODES, countForStatus, matchesStatus,
} from './reconciliationStatusFilter.js';
import { Skeleton } from '@/components/ui/skeleton';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { ListProgressBar } from './ListProgressBar.jsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/ui/money-amount';
import { TruncatedText } from '@/components/ui/truncated-text';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChipSelect } from '@/components/forms/fields';
import { cn } from '@/lib/utils';
import { getDateBounds, toDateParam } from '@/lib/dateRangeBounds';
import { formatDate, formatSigned } from '@/lib/formatSigned';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  usePendingStatementLines,
  useCandidateOperations,
  useReconcileGroup,
  useRemoveOperation,
  useReactivateSelected,
  useReconcileDifference,
} from '@/hooks/useReconciliation';

// Amounts that differ by <= this absolute value are treated as balanced.
const RECONCILE_TOLERANCE = 0.01;
const SKELETON_ROWS = [1, 2, 3, 4];
// Stable per-column keys for skeleton cells (avoids array-index keys, Sonar S6479).
const SKELETON_CELL_KEYS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
// Elevation shadow shared by the selected row in both panels.
const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]';
// i18n label key per status code, shared by the filter and the row badges.
const STATUS_LABEL_KEY = {
  pending: 'financeReconcileFilterStatusPending',
  suggested: 'financeReconcileFilterStatusSuggested',
  byRule: 'financeReconcileFilterStatusByRule',
  difference: 'financeReconcileFilterStatusDifference',
  reconciled: 'financeReconcileFilterStatusReconciled',
};

/** Pill badge for line/candidate status. Suggested → blue, reconciled → green, else grey. */
function StatusBadge({ kind }) {
  const ui = useUI();
  // Figma badge palette: grey / blue / amber / red / green (all full pills).
  const map = {
    suggested: { labelKey: 'financeReconcileBadgeSuggested', cls: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)]' },
    byRule: { labelKey: 'financeReconcileBadgeByRule', cls: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]' },
    difference: { labelKey: 'financeReconcileBadgeDifference', cls: 'bg-[var(--status-destructive-bg)] text-[hsl(var(--destructive))]' },
    reconciled: { labelKey: 'financeReconcileBadgeReconciled', cls: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]' },
    pending: { labelKey: 'financeReconcileBadgePending', cls: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' },
    invoice: { labelKey: 'financeReconcileBadgeInvoice', cls: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]' },
    partial: { labelKey: 'financeReconcileBadgePartial', cls: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]' },
  };
  const cfg = map[kind] ?? map.pending;
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2 py-0.5 text-xs font-normal', cfg.cls)}>
      {ui(cfg.labelKey)}
    </span>
  );
}

/**
 * Badge kind for a candidate row: reconciled (read-only) → invoice → near match → suggested →
 * pending.
 *
 * `nearMatch` outranks `suggested` because the backend sets BOTH on a within-tolerance 1:1 hit
 * (ETP-4965): it is a suggestion, but one carrying a real amount/date deviation, and the red badge
 * is the only thing that says so before the user reconciles.
 */
function badgeKindFor(cand, readOnly) {
  if (readOnly) return 'reconciled';
  if (cand.kind === 'invoice') return 'invoice';
  if (cand.nearMatch) return 'difference';
  return cand.suggested ? 'suggested' : 'pending';
}

function ToolbarShell({ children, search, onSearchChange, testIdPrefix }) {
  const ui = useUI();
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      {children}
      <div className="flex-1" />
      <input
        type="search"
        placeholder={ui('financeReconcileSearchPlaceholder')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        data-testid={`${testIdPrefix}-search`}
        className="h-9 w-40 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-disabled))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:ring-offset-1"
      />
    </div>
  );
}

function ReconciliationStatusFilter({ value, onChange, counts = {} }) {
  const ui = useUI();
  // Summed over the states each code covers, not read straight off `counts` — the "Pendiente" entry
  // is a superset, so its own bucket would under-report the rows it shows (ETP-5033).
  const countFor = (code) => countForStatus(counts, code);
  return (
    <DistinctValuesFilter
      value={value}
      onChange={onChange}
      codes={STATUS_CODES}
      labelFor={(code) => `${ui(STATUS_LABEL_KEY[code] ?? STATUS_LABEL_KEY.pending)} (${countFor(code)})`}
      allLabel={`${ui('financeReconcileFilterStatusAll')} (${counts.all ?? 0})`}
      searchPlaceholder={ui('financeReconcileFilterStatusSearchPlaceholder')}
      popoverWidth="w-60"
      data-testid="DistinctValuesFilter__d0f4d5" />
  );
}

// Single "Tipo de transacción" selector (Figma): one dropdown with four mutually-exclusive
// sources. Each maps to a candidate kind (invoice vs existing transaction) and a direction
// (docType receipts/payments → isReceipt / issotrx).
const SOURCE_CODES = ['salesInvoices', 'purchaseInvoices', 'receipts', 'payments'];
const SOURCE_META = {
  salesInvoices: { kind: 'invoices', docType: 'receipts', labelKey: 'financeReconcileSourceSalesInvoices' },
  purchaseInvoices: { kind: 'invoices', docType: 'payments', labelKey: 'financeReconcileSourcePurchaseInvoices' },
  receipts: { kind: 'transactions', docType: 'receipts', labelKey: 'financeReconcileSourceReceipts' },
  payments: { kind: 'transactions', docType: 'payments', labelKey: 'financeReconcileSourcePayments' },
};

function ReconciliationSourceFilter({ value, onChange, counts = {} }) {
  const ui = useUI();
  return (
    <DistinctValuesFilter
      value={value}
      onChange={onChange}
      codes={SOURCE_CODES}
      labelFor={(code) => `${ui(SOURCE_META[code]?.labelKey ?? code)} (${counts[code] ?? 0})`}
      searchPlaceholder={ui('financeReconcileSourceLabel')}
      popoverWidth="w-64"
      data-testid="recon-source-filter" />
  );
}

/** Renders skeleton / empty / data rows for either table body. */
/**
 * Skeleton / empty / data body for either panel.
 *
 * The empty state deliberately mirrors the right panel's own ("Selecciona un movimiento"):
 * a circled icon, then the title, then a hint. Plain centered text in a table this tall read
 * as a rendering failure rather than an intentional state — the panel is full height, so a
 * single line of copy floating in it looks broken.
 */
function renderRows({ loading, items, colSpan, emptyTitle, emptyHint, renderRow }) {
  // Only the true initial fetch (no rows yet) wipes the body into skeleton rows — a later
  // refresh (the left toolbar's refresh button, or reselecting a line for the right panel)
  // already has rows to show, same reasoning as MovementsTable / StatementsTable.
  if (loading && items.length === 0) {
    return SKELETON_ROWS.map((n) => (
      <TableRow key={n} data-testid="TableRow__d0f4d5">
        {SKELETON_CELL_KEYS.slice(0, colSpan).map((cellKey) => (
          <TableCell key={cellKey} data-testid="TableCell__d0f4d5">
            <Skeleton className="h-4 w-full" data-testid="Skeleton__d0f4d5" />
          </TableCell>
        ))}
      </TableRow>
    ));
  }
  if (items.length === 0) {
    return (
      <TableRow className="hover:bg-transparent" data-testid="TableRow__d0f4d5">
        <TableCell colSpan={colSpan} className="py-16" data-testid="TableCell__d0f4d5">
          <div className="flex flex-col items-center gap-1 text-center" data-testid="recon-rows-empty">
            {/* Same 40px circled icon the right panel uses, so the two empty states in one
                screen read as one design rather than two. */}
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--text-disabled))]">
              <SearchX className="h-6 w-6" data-testid="SearchX__d0f4d5" />
            </div>
            <p className="text-[20px] font-semibold leading-7 text-[hsl(var(--foreground))]">{emptyTitle}</p>
            {emptyHint ? (
              <p className="max-w-sm text-xs leading-4 text-[hsl(var(--foreground))]">{emptyHint}</p>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return items.map(renderRow);
}

/**
 * Scrollable table scaffold shared by both panels: a sticky-styled header row
 * (the per-panel columns are passed as `headCells`) and the skeleton/empty/data
 * body produced by {@link renderRows}.
 *
 * `table-fixed` is load-bearing, not cosmetic. Both panels declare a fixed width on every column
 * except the free-text one (Descripción / Información), and rely on `truncate` to clip it. Under
 * the default auto layout a table grows to fit its widest cell, so one long statement description
 * ("TRANSFERENCIA INMEDIATA A FAVOR DE … CONCEPTO Factura Nº …") stretched the table past the
 * panel and pushed Progreso and Importe out of view behind a horizontal scrollbar — the exact QA
 * report on ETP-4921. With a fixed layout the declared widths win, the free column absorbs
 * whatever is left, and `truncate` finally has a bound to ellipsise against.
 */
function PanelTable({ headCells, loading, items, renderRow, colSpan = 5 }) {
  const ui = useUI();
  // A refresh over rows that are already on screen dims instead of collapsing into skeletons —
  // see renderRows' matching `items.length === 0` gate.
  const dimWhileRefreshing = loading && items.length > 0 ? 'opacity-70' : '';
  return (
    <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
      <Table
        className={cn('table-fixed transition-opacity duration-200', dimWhileRefreshing)}
        data-testid="Table__d0f4d5">
        <TableHeader data-testid="TableHeader__d0f4d5">
          <TableRow
            className="h-11 border-b border-[hsl(var(--border-subtle))] [&_th]:text-xs [&_th]:font-semibold [&_th]:text-[hsl(var(--foreground))]"
            data-testid="TableRow__d0f4d5">
            {headCells}
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__d0f4d5">
          {renderRows({
            loading,
            items,
            colSpan,
            // Its own key rather than the Movimientos tab's `financeAccountMovementsEmpty`
            // ("Aún no hay movimientos", paired there with a "+ Nuevo movimiento" hint):
            // in the reconciliation panels the list is always the result of a filter, so
            // "not found" is the accurate wording and the hint does not apply.
            emptyTitle: ui('financeReconcileEmpty'),
            // The list here is ALWAYS a filter result (status + date range + search), so the
            // hint names the way out instead of the "+ Nuevo movimiento" nudge the Movimientos
            // tab pairs with its own empty copy.
            emptyHint: ui('financeReconcileEmptyHint'),
            renderRow,
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Date cell shared by both panels (per-panel width/background via cellClassName). */
function DateCell({ date, bcpLocale, cellClassName }) {
  return (
    <TableCell
      className={cn('h-[62px] px-3 text-sm font-normal text-[hsl(var(--foreground))]', cellClassName)}
      data-testid="TableCell__d0f4d5">
      {formatDate(date, bcpLocale)}
    </TableCell>
  );
}

/**
 * Right-aligned money cell shared by both panels. When `secondaryValue` is given (a foreign
 * candidate's account-currency equivalent), it renders as a smaller line underneath — the
 * "show the EUR total alongside the other currency" requirement.
 */
function MoneyCell({
  value, currency, cellClassName, bold = false, secondaryValue, secondaryCurrency, baseOnTop = false,
}) {
  const primaryCls = cn('text-sm leading-5 text-[hsl(var(--foreground))]', bold ? 'font-semibold' : 'font-normal');
  const mutedCls = 'text-xs leading-4 text-[hsl(var(--muted-foreground))]';
  const hasBase = secondaryValue != null;
  // When `baseOnTop`, the account-currency (EUR) equivalent is shown ON TOP and prominent, with the
  // invoice's own (foreign) currency small underneath — the account currency is what reconciles the
  // line, so it leads. Otherwise the primary `value` leads and the base sits underneath (muted).
  const foreignLine = (
    <MoneyAmount
      value={Number(value) || 0}
      currency={currency}
      tone="neutral"
      className={baseOnTop && hasBase ? mutedCls : primaryCls}
      data-testid="MoneyAmount__d0f4d5" />
  );
  // MoneyAmount doesn't forward extra props (no data-testid), so the base testid goes on this
  // wrapping span (it always marks the account-currency amount, whichever position it's in).
  const baseLine = hasBase ? (
    <span data-testid="recon-cand-amount-base">
      <MoneyAmount
        value={Number(secondaryValue) || 0}
        currency={secondaryCurrency}
        tone="neutral"
        className={baseOnTop ? primaryCls : mutedCls}
        data-testid="MoneyAmount-secondary__d0f4d5" />
    </span>
  ) : null;
  return (
    <TableCell
      className={cn('h-[62px] px-3 text-right align-middle', cellClassName)}
      data-testid="TableCell__d0f4d5">
      <div className="flex flex-col items-end">
        {baseOnTop && hasBase ? baseLine : foreignLine}
        {baseOnTop && hasBase ? foreignLine : baseLine}
      </div>
    </TableCell>
  );
}

/**
 * Outer column shell shared by both panels: the flex wrapper, the toolbar, the
 * scrollable table and an optional footer. Keeps the two panels from repeating
 * the same structural scaffold.
 */
function PanelShell({ className, toolbar, headCells, loading, items, renderRow, footer, colSpan = 5 }) {
  return (
    <div className={cn('flex min-w-[30%] flex-1 flex-col overflow-hidden', className)}>
      {toolbar}
      <PanelTable
        headCells={headCells}
        loading={loading}
        items={items}
        renderRow={renderRow}
        colSpan={colSpan}
        data-testid="PanelTable__d0f4d5" />
      {footer}
    </div>
  );
}

/**
 * Left panel — pending statement lines with single-select radio rows, status
 * badge and a total footer.
 */
/**
 * "Progreso" cell (handoff Opción A2): a thin 4px bar = reconciled / total of a partially-reconciled
 * line, with a hover tooltip showing the amount still pending ("X € por conciliar"). Rendered only
 * when the line has something reconciled (`reconciledAmount != 0`); otherwise the cell is empty.
 * No green, no "% chip" on the row — the bar carries the signal (ETP-4502 iteration 5).
 */
function ProgressCell({ line, currency, cellClassName }) {
  const ui = useUI();
  const reconciled = Number(line.reconciledAmount) || 0;
  if (reconciled === 0) {
    return <TableCell className={cn('h-[62px] w-[90px] px-3', cellClassName)} data-testid="TableCell__d0f4d5" />;
  }
  const pct = Math.min(100, Math.max(0, Number(line.reconciledPct) || 0));
  const pending = Math.abs(Number(line.pendingAmount) || 0);
  const tip = ui('financeReconcilePendingLabel', { amount: formatCurrency(currency, pending) });
  return (
    <TableCell className={cn('h-[62px] w-[90px] px-3', cellClassName)} data-testid="TableCell__d0f4d5">
      <div className="group relative flex items-center" data-testid={`recon-progress-${line.id}`}>
        <div className="h-1 w-full overflow-hidden rounded-[2px] bg-[hsl(var(--border))]">
          <span className="block h-full bg-[hsl(var(--foreground))]" style={{ width: `${pct}%` }} />
        </div>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[hsl(var(--text-primary))] px-2 py-1 text-[11px] font-semibold leading-4 text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100"
          data-testid={`recon-progress-tip-${line.id}`}
        >
          {tip}
        </span>
      </div>
    </TableCell>
  );
}

function StatementLinesPanel({
  lines, total, loading, currency, bcpLocale, selectedLineId, onSelectLine, search, onSearchChange,
  status, onStatusChange, statusCounts, dateRange, onDateRangeChange, onBack,
}) {
  const ui = useUI();

  const renderRow = (line) => {
    const selected = line.id === selectedLineId;
    // The engine-computed `state` drives the badge (suggested/byRule/difference/reconciled/pending).
    const badgeKind = line.state || (line.status === 'reconciled' ? 'reconciled' : 'pending');
    const cellBg = cn('transition-colors', selected ? 'bg-[hsl(var(--muted))]' : 'bg-card');
    return (
      <TableRow
        key={line.id}
        data-testid={`recon-line-row-${line.id}`}
        onClick={() => onSelectLine(line)}
        className={cn(
          'group relative h-[62px] cursor-pointer border-b border-[hsl(var(--border-subtle))] bg-card transition-shadow',
          selected
            ? `z-20 ${ELEVATED_SHADOW}`
            : 'hover:z-10 hover:bg-card hover:shadow-lg',
        )}
      >
        <TableCell
          className={cn('h-[62px] w-8 px-0 pl-2', cellBg)}
          onClick={(e) => e.stopPropagation()}
          data-testid="TableCell__d0f4d5">
          <input
            type="radio"
            name="recon-statement-line"
            aria-label={ui('financeReconcileColSelect')}
            checked={selected}
            onChange={() => onSelectLine(line)}
            data-testid={`recon-line-radio-${line.id}`}
            className="h-4 w-4 accent-[hsl(var(--foreground))]"
          />
        </TableCell>
        <DateCell
          date={line.date}
          bcpLocale={bcpLocale}
          cellClassName={cn('w-[108px]', cellBg)}
          data-testid="DateCell__d0f4d5" />
        <TableCell
          className={cn('h-[62px] px-3 py-2 text-sm text-[hsl(var(--foreground))]', cellBg)}
          data-testid="TableCell__d0f4d5">
          <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
            {/* Statement descriptions routinely run past the column ("TRANSFERENCIA INMEDIATA A
                FAVOR DE … CONCEPTO Factura Nº …"). They are clipped with an ellipsis and the full
                text is offered on hover, so the columns that carry the decision — Progreso and
                Importe — keep their space instead of being pushed off the panel (ETP-4921 QA). */}
            <TruncatedText
              text={line.description || line.partnerName || line.referenceNo || '—'}
              className={cn('leading-5', selected ? 'font-semibold' : 'font-normal')}
              data-testid={`recon-line-desc-${line.id}`} />
            <div className="flex items-center gap-1">
              <StatusBadge kind={badgeKind} data-testid="StatusBadge__d0f4d5" />
              {line.partial ? (
                <StatusBadge kind="partial" data-testid="StatusBadge-partial__d0f4d5" />
              ) : null}
            </div>
          </div>
        </TableCell>
        <ProgressCell
          line={line}
          currency={currency}
          cellClassName={cellBg}
          data-testid="ProgressCell__d0f4d5" />
        <MoneyCell
          value={line.amount}
          currency={currency}
          bold
          cellClassName={cn('w-[139px]', cellBg)}
          data-testid="MoneyCell__d0f4d5" />
      </TableRow>
    );
  };

  const toolbar = (
    <ToolbarShell
      search={search}
      onSearchChange={onSearchChange}
      testIdPrefix="recon-left"
      data-testid="ToolbarShell__d0f4d5">
      <button
        type="button"
        aria-label={ui('financeAccountDetailBack')}
        data-testid="recon-toolbar-back"
        onClick={onBack}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-[hsl(var(--muted))] hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__d0f4d5" />
      </button>
      <ReconciliationStatusFilter value={status} onChange={onStatusChange} counts={statusCounts} data-testid="ReconciliationStatusFilter__d0f4d5" />
      <DateRangePopover value={dateRange} onChange={onDateRangeChange} placeholder={ui('dateRangeAnyTime')} data-testid="DateRangePopover__d0f4d5" />
    </ToolbarShell>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border-subtle))] px-4 py-3 text-sm font-semibold text-[hsl(var(--foreground))]">
      {ui('financeReconcileFooterTotal', { amount: formatSigned(total === 0 ? 0 : (Number(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0).toFixed(2))), currency) })}
    </div>
  );

  return (
    <PanelShell
      className="border-r border-[hsl(var(--border-subtle))]"
      toolbar={toolbar}
      loading={loading}
      items={lines}
      renderRow={renderRow}
      footer={footer}
      colSpan={5}
      headCells={(
        <>
          <TableHead className="w-8 px-0 pl-2" data-testid="TableHead__d0f4d5" />
          <TableHead className="w-[108px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDate')}</TableHead>
          <TableHead className="px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDescription')}</TableHead>
          <TableHead className="w-[90px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColProgress')}</TableHead>
          {/* Right-aligned to sit over its own figures: MoneyCell renders `text-right`, so a
              left-aligned header put the label at the opposite edge of the column from the
              amount it names — the same rule the generic DataTable applies to any numeric
              column, which this hand-rolled table does not inherit. */}
          <TableHead className="w-[139px] px-3 text-right" data-testid="TableHead__d0f4d5">{ui('financeReconcileColAmount')}</TableHead>
        </>
      )}
      data-testid="PanelShell__d0f4d5" />
  );
}

/** Right panel — candidate operations with multi-select checkbox rows. */
/**
 * Amber pill flagging an invoice whose currency differs from the financial account's — the visual
 * cue for a multi-currency reconciliation (AC5). Only rendered for foreign-currency candidates.
 */
function CurrencyBadge({ code }) {
  return (
    <span
      className="shrink-0 rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] font-semibold leading-4 text-[var(--status-warning-fg)]"
      data-testid="recon-cand-currency-badge">
      {code}
    </span>
  );
}

/**
 * Right-panel "conciliado" block (handoff Opción A2): for a line that already has matched documents,
 * a clickable header (% reconciled + a short 90px bar + reconciled amount + chevron) that
 * collapses/expands the list of already-reconciled documents, each with an "unlink" (desvincular)
 * button. Rendered above the candidate filters; the bar is neutral (no green). See ETP-4502 it.5.
 */
function ReconciledOperationsSection({ line, currency, onRemove, open, onToggle }) {
  const ui = useUI();
  const txns = line.txns || [];
  if (txns.length === 0) {
    return null;
  }
  const pct = Math.min(100, Math.max(0, Number(line.reconciledPct) || 0));
  const reconciled = Math.abs(Number(line.reconciledAmount) || 0);
  return (
    <div className="border-b border-[hsl(var(--border-subtle))]" data-testid="recon-matched-block">
      <button
        type="button"
        onClick={onToggle}
        className={cn('flex w-full items-center justify-between gap-3 px-6', open ? 'py-3.5' : 'py-2.5')}
        data-testid="recon-matched-toggle"
      >
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-[hsl(var(--foreground))]">
            {ui('financeReconcilePctConciliated', { pct })}
          </span>
          <span className="h-1 w-[90px] overflow-hidden rounded-[2px] bg-[hsl(var(--border))]">
            <span className="block h-full bg-[hsl(var(--foreground))]" style={{ width: `${pct}%` }} />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums text-[hsl(var(--foreground))]">
            {formatCurrency(currency, reconciled)}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform', open ? '' : '-rotate-90')}
            data-testid="recon-matched-chevron" />
        </div>
      </button>
      {open ? (
        <div className="pb-3" data-testid="recon-matched-list">
          {txns.map((t) => (
            <div
              key={t.transactionId || t.documentNo}
              className="flex items-center justify-between gap-3 border-t border-[hsl(var(--border-subtle))] px-6 py-2.5"
              data-testid={`recon-matched-row-${t.transactionId}`}
            >
              <div className="flex min-w-0 flex-col items-start gap-0.5">
                <div className="flex min-w-0 items-center gap-1 text-sm leading-5">
                  <span className="font-semibold text-[hsl(var(--foreground))]">{t.documentNo || '—'}</span>
                  {t.contact ? (
                    <span className="truncate text-[hsl(var(--muted-foreground))]">{t.contact}</span>
                  ) : null}
                </div>
                <StatusBadge kind="invoice" data-testid="StatusBadge__matched" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold tabular-nums text-[hsl(var(--foreground))]">
                  {formatCurrency(currency, Math.abs(Number(t.amount) || 0))}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(t)}
                  aria-label={ui('financeReconcileActionRemoveOne')}
                  title={ui('financeReconcileActionRemoveOne')}
                  data-testid={`recon-unlink-${t.transactionId}`}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-border bg-card text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                >
                  <Minus className="h-4 w-4" data-testid="Minus__d0f4d5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CandidateOperationsPanel({
  line, candidates, loading, currency, bcpLocale, selectedIds, onToggle, search, onSearchChange,
  source, onSourceChange, sourceCounts = {}, dateRange, onDateRangeChange, footer, readOnly = false,
  onRemoveOperation, reconciledMode = false, differenceBanner = null,
}) {
  const ui = useUI();
  // Holded parity: while the "conciliado" block is expanded, the candidate list below is frozen for
  // selection (you're browsing/unlinking what's already matched, not picking new docs).
  const [matchedExpanded, setMatchedExpanded] = useState(false);
  useEffect(() => {
    setMatchedExpanded(false);
  }, [line?.id]);
  const candidatesFrozen = matchedExpanded;

  if (!line) {
    return (
      <div className="flex min-w-[30%] flex-1 flex-col items-center justify-center px-0 text-center" data-testid="recon-right-empty">
        <div className="flex w-full flex-col items-center gap-1 px-5">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--text-disabled))]">
            <CircleCheckBig className="h-6 w-6" data-testid="CircleCheckBig__d0f4d5" />
          </div>
          <p className="w-full text-[20px] font-semibold leading-7 text-[hsl(var(--foreground))]">{ui('financeReconcileRightEmptyTitle')}</p>
          <p className="w-full text-xs leading-4 text-[hsl(var(--foreground))]">{ui('financeReconcileRightEmptyHint')}</p>
        </div>
      </div>
    );
  }

  const renderRow = (cand) => {
    // Foreign-currency invoice: its amounts are in the invoice currency (not the account's), so
    // render them with that currency and flag the row with a badge (AC5).
    const candForeign = !!cand.currency && cand.currency !== currency;
    const candCurrency = cand.currency || currency;
    // Foreign candidate WITH a known account-currency equivalent → show EUR on top, foreign below.
    const hasBase = candForeign && cand.amountBase != null;
    return (
      <TableRow
        key={cand.id}
        data-testid={`recon-cand-row-${cand.id}`}
        className={cn(
          'group relative h-[62px] border-b border-[hsl(var(--border-subtle))] bg-card transition-shadow',
          selectedIds.has(cand.id)
            ? `z-10 bg-[hsl(var(--muted))] ${ELEVATED_SHADOW}`
            : 'hover:z-10 hover:bg-card hover:shadow-lg',
          candidatesFrozen && 'opacity-50',
        )}
      >
        <TableCell className="h-[62px] w-8 px-0 pl-2" data-testid="TableCell__d0f4d5">
          {/* Checkbox shown for both pending (which docs to reconcile) and reconciled (which to
              un-reconcile) lines; disabled only while the partial-line "conciliado" block is expanded. */}
          <Checkbox
            checked={selectedIds.has(cand.id)}
            disabled={candidatesFrozen}
            onChange={() => { if (!candidatesFrozen) onToggle(cand.id); }}
            data-testid={`recon-cand-check-${cand.id}`}
          />
        </TableCell>
        <DateCell
          date={cand.date}
          bcpLocale={bcpLocale}
          cellClassName="w-[104px]"
          data-testid="DateCell__d0f4d5" />
        <TableCell
          className="h-[62px] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
          data-testid="TableCell__d0f4d5">
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex w-full items-center gap-1 overflow-hidden text-sm leading-5">
              <span className="shrink-0 font-normal text-[hsl(var(--foreground))]">
                {cand.documentNo || cand.description || '—'}
              </span>
              {cand.partnerName ? (
                <span className="truncate text-xs font-medium leading-4 text-[hsl(var(--muted-foreground))]">{cand.partnerName}</span>
              ) : null}
              {candForeign ? <CurrencyBadge code={cand.currency} data-testid="CurrencyBadge__d0f4d5" /> : null}
            </div>
            <StatusBadge
              kind={badgeKindFor(cand, readOnly)}
              data-testid="StatusBadge__d0f4d5" />
          </div>
        </TableCell>
        <MoneyCell
          value={cand.pendingBalance}
          currency={candCurrency}
          cellClassName="w-[121px]"
          secondaryValue={candForeign ? cand.amountBase : undefined}
          secondaryCurrency={cand.baseCurrency || currency}
          baseOnTop={hasBase}
          data-testid="MoneyCell__d0f4d5" />
        {reconciledMode ? (
          // Reconciled line: amount + a per-row individual un-link ("−"). cand.id is the transaction id.
          (<TableCell className="h-[62px] w-[140px] px-3 text-right align-middle" data-testid="TableCell__d0f4d5">
            <div className="flex items-center justify-end gap-2">
              <MoneyAmount
                value={Number(cand.amount) || 0}
                currency={candCurrency}
                tone="neutral"
                className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]"
                data-testid="MoneyAmount__d0f4d5" />
              <button
                type="button"
                onClick={() => onRemoveOperation({ transactionId: cand.id })}
                aria-label={ui('financeReconcileActionRemoveOne')}
                title={ui('financeReconcileActionRemoveOne')}
                data-testid={`recon-unlink-${cand.id}`}
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg border border-border bg-card text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              >
                <Minus className="h-4 w-4" data-testid="Minus__d0f4d5" />
              </button>
            </div>
          </TableCell>)
        ) : (
          <MoneyCell
            value={cand.amount}
            currency={candCurrency}
            bold
            cellClassName="w-[121px]"
            secondaryValue={candForeign ? cand.amountBase : undefined}
            secondaryCurrency={cand.baseCurrency || currency}
            baseOnTop={hasBase}
            data-testid="MoneyCell__d0f4d5" />
        )}
      </TableRow>
    );
  };

  const toolbar = (
    <>
      {/* Difference banner (design option 1B): the first thing in the panel, so the offer to close
          the remainder sits where the problem is. Composed by the parent, which owns the dismiss
          state and the modal. */}
      {differenceBanner}
      {/* "Conciliado" block: matched documents of a PARTIAL line (with per-row unlink), above the
          remainder candidates. A FULLY reconciled line does NOT use this block — its documents are
          shown directly in the candidate list below, with checkboxes (no redundant % header). */}
      {line.reconcileStatus === 'PARTIAL' && Number(line.reconciledAmount) ? (
        <ReconciledOperationsSection
          line={line}
          currency={currency}
          onRemove={onRemoveOperation}
          open={matchedExpanded}
          onToggle={() => setMatchedExpanded((v) => !v)}
          data-testid="ReconciledOperationsSection__d0f4d5" />
      ) : null}
      <ToolbarShell
      search={search}
      onSearchChange={onSearchChange}
      testIdPrefix="recon-right"
      data-testid="ToolbarShell__d0f4d5">
      {/* Single transaction-type selector (sales/purchase invoices, receipts, payments).
          Reconciled lines are read-only, so it is hidden there. */}
      {readOnly ? null : (
        <ReconciliationSourceFilter
          value={source}
          onChange={onSourceChange}
          counts={sourceCounts}
          data-testid="ReconciliationSourceFilter__d0f4d5" />
      )}
      <DateRangePopover
        value={dateRange}
        onChange={onDateRangeChange}
        placeholder={ui('dateRangeAnyTime')}
        data-testid="DateRangePopover__d0f4d5" />
      </ToolbarShell>
    </>
  );

  return (
    <PanelShell
      toolbar={toolbar}
      loading={loading}
      items={candidates}
      renderRow={renderRow}
      footer={footer}
      headCells={(
        <>
          <TableHead className="w-8 px-0 pl-2" data-testid="TableHead__d0f4d5" />
          <TableHead className="w-[104px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDate')}</TableHead>
          <TableHead className="px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColInfo')}</TableHead>
          {/* Both money columns render through MoneyCell (`text-right`) — see the left panel's
              own Importe header for why these follow it. */}
          <TableHead className="w-[121px] px-3 text-right" data-testid="TableHead__d0f4d5">{ui('financeReconcileColPendingBalance')}</TableHead>
          <TableHead className="w-[121px] px-3 text-right" data-testid="TableHead__d0f4d5">{ui('financeReconcileColAmount')}</TableHead>
        </>
      )}
      data-testid="PanelShell__d0f4d5" />
  );
}

/** Bottom action bar with the running totals and the reconcile / placeholder buttons. */
function ReconciliationActionBar({
  currency, selectedSum, remaining, canReconcile, isReconciledLine, reconcileCount, removeCount = 0,
  busy, onCancel, onReconcile, onReactivate, differenceNotice = null,
}) {
  const ui = useUI();
  return (
    <div className="border-t border-[hsl(var(--border-subtle))] bg-card px-0 pt-2 pb-1">
      {/* Selection totals only make sense while building a new reconciliation; a reconciled
          line is already balanced, so the "selected / remaining" rows would be misleading.
          Both totals are already in the account currency (foreign candidates contribute their
          `amountBase` equivalent — see candidateBaseAmount), so this doubles as the EUR-style
          total when the selection mixes currencies. */}
      {!isReconciledLine && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-3 text-sm leading-5">
            <span className="font-medium text-[hsl(var(--foreground))]">{ui('financeReconcileBarSelected')}</span>
            <span className="font-semibold text-[var(--status-success-fg)]">{formatSigned(selectedSum, currency)}</span>
          </div>
          <div className="flex items-center justify-between px-3 text-sm leading-5">
            <span className="font-medium text-[hsl(var(--foreground))]">{ui('financeReconcileBarRemaining')}</span>
            {/* A within-tolerance shortfall is NOT an error: it gets posted to the account's
                accounting concept the moment the user reconciles (ETP-4965). Painting it in the
                destructive red reserved for "you cannot reconcile this" told the opposite story and
                is why the difference case read as a dead end. */}
            <span className={cn('font-semibold', Math.abs(remaining) <= RECONCILE_TOLERANCE || differenceNotice ? 'text-[var(--status-success-fg)]' : 'text-[hsl(var(--destructive))]')}>
              {formatSigned(remaining, currency)}
            </span>
          </div>
          {differenceNotice && (
            <p
              className="px-3 text-xs leading-4 text-[hsl(var(--muted-foreground))]"
              data-testid="recon-action-difference-notice"
            >
              {differenceNotice}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          data-testid="recon-action-cancel"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]"
        >
          <X className="h-4 w-4" data-testid="X__d0f4d5" />
          {ui('financeReconcileActionCancel')}
        </button>
        {/* On a reconciled line the primary action ("Desconciliar (N)") gets a chevron exposing the
            lighter alternative, "Reactivar": same checked selection, but the reconciliation is kept
            in draft (transactions stay linked) instead of being deleted, so it can be re-processed
            as-is later. A pending line keeps the plain "Conciliar" button. */}
        <div className="inline-flex items-stretch overflow-hidden rounded-full">
          <button
            type="button"
            onClick={onReconcile}
            // A reconciled line shows "Desconciliar (N)" acting on the checked documents (N = checked
            // count, disabled when none); a pending line gates "Conciliar" on a balanced selection.
            disabled={busy || (isReconciledLine ? removeCount === 0 : !canReconcile)}
            data-testid="recon-action-reconcile"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 bg-[hsl(var(--foreground))] px-3 text-sm font-medium text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground',
              isReconciledLine && onReactivate ? 'rounded-l-full' : 'rounded-full',
            )}
          >
            <CheckCircle className="h-4 w-4" data-testid="CheckCircle__d0f4d5" />
            {isReconciledLine
              ? ui('financeReconcileActionRemoveCount', { count: removeCount })
              : ui('financeReconcileActionReconcileCount', { count: reconcileCount })}
          </button>
          {isReconciledLine && onReactivate && (
            <>
              <div className="w-px bg-primary-foreground/20" />
              <DropdownMenu data-testid="DropdownMenu__d0f4d5">
                <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__d0f4d5">
                  <button
                    type="button"
                    disabled={busy || removeCount === 0}
                    data-testid="recon-action-reconcile-more"
                    aria-label={ui('financeReconcileActionReactivateSelected')}
                    className="inline-flex h-8 items-center rounded-r-full bg-[hsl(var(--foreground))] px-2 text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
                  >
                    <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown-more__d0f4d5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" data-testid="DropdownMenuContent__d0f4d5">
                  <DropdownMenuItem
                    onClick={onReactivate}
                    className="gap-2"
                    data-testid="recon-action-reactivate"
                  >
                    <RotateCcw className="h-4 w-4" data-testid="RotateCcw__d0f4d5" />
                    {ui('financeReconcileActionReactivateSelected')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/*
 * ── Copy matrix for the un-reconcile cartel ────────────────────────────────────────────────────
 * The two un-reconcile actions (Desconciliar / the lighter Reactivar) share one cartel and differ
 * only in wording, so every string is resolved from a lookup keyed by the action instead of being
 * branched inline — the same pattern `MovementLifecycleConfirmModal` uses for its own two actions
 * (`SUB_KEY_BY_ACTION` / `TITLE_KEY_BY_ACTION`). Keeps {@link RemoveOperationConfirmDialog} a thin
 * render with no copy logic in it.
 */

/** `reactivate` (a boolean prop, for the caller's convenience) → the key used by every map below. */
const REMOVE_ACTION = { reactivate: 'reactivate', remove: 'remove' };

/** Bulk selections name the count; a single document doesn't. */
const SUB_KEY_BY_ACTION = {
  reactivate: {
    one: 'financeReconcileConfirmReactivateOneBody',
    many: 'financeReconcileConfirmReactivateManyBody',
  },
  remove: {
    one: 'financeReconcileConfirmRemoveOneBody',
    many: 'financeReconcileConfirmRemoveManyBody',
  },
};

const TITLE_KEY_BY_ACTION = {
  reactivate: 'financeReconcileConfirmReactivateTitle',
  remove: 'financeReconcileConfirmRemoveOneTitle',
};

const CONFIRM_LABEL_KEY_BY_ACTION = {
  reactivate: 'financeReconcileActionReactivateSelected',
  remove: 'financeReconcileActionRemoveOne',
};

/** First bullet is always the reconciliation itself — only its description changes per action. */
const ITEM_RECONCILIATION_DESC_KEY_BY_ACTION = {
  reactivate: 'financeReconcileConfirmItemReactivateDesc',
  remove: 'financeReconcileConfirmItemRemoveDesc',
};

/**
 * Only Reactivar's warning varies with another draft being open — Desconciliar has a single wording
 * (it never confirms the other draft), so both of its entries deliberately point at the same key.
 */
const WARNING_KEY_BY_ACTION = {
  reactivate: {
    otherDraft: 'financeReconcileReactivateOtherDraftWarning',
    default: 'financeReconcileConfirmReactivateWarning',
  },
  remove: {
    otherDraft: 'financeReconcileConfirmRemoveWarning',
    default: 'financeReconcileConfirmRemoveWarning',
  },
};

/** Icon + its testid travel together so the rendered markup is identical for either action. */
const CONFIRM_ICON_BY_ACTION = {
  reactivate: { Icon: RotateCcw, testId: 'RotateCcw__recon-remove' },
  remove: { Icon: Minus, testId: 'Minus__recon-remove' },
};

/** Stable no-op used to swallow the confirm while a request is already in flight. */
const NOOP = () => {};

/** One bullet per effect that actually applies to this selection. Order is part of the contract. */
function resolveUnreconcileItems(ui, action, { hasAuto, reactivate, warnOtherDraft }) {
  const items = [[
    ui('reactivarItem1Title'),
    ui(ITEM_RECONCILIATION_DESC_KEY_BY_ACTION[action]),
  ]];
  if (hasAuto) {
    items.push([
      ui('financeReconcileConfirmItemPaymentTitle'),
      ui('financeReconcileConfirmItemPaymentDesc'),
    ]);
  }
  // Core allows only ONE editable reconciliation per account, so reactivating this one will first
  // CONFIRM the draft already open — i.e. a line left pending by an earlier "Reactivar" goes back to
  // reconciled. Surfaced BEFORE confirming, not after.
  if (reactivate && warnOtherDraft) {
    items.push([
      ui('financeReconcileConfirmItemOtherDraftTitle'),
      ui('financeReconcileConfirmItemOtherDraftDesc'),
    ]);
  }
  return items;
}

/**
 * Resolves every string the un-reconcile cartel shows, for one action × selection.
 *
 * @param {(key: string, params?: object) => string} ui translator from `useUI()`
 * @param {{ count: number, hasAuto: boolean, reactivate: boolean, warnOtherDraft: boolean }} state
 * @returns {{ title: string, sub: string, items: Array<[string, string]>, warning: string,
 *   confirmLabel: string, confirmIcon: { Icon: Function, testId: string } }}
 */
function resolveUnreconcileDialogCopy(ui, { count, hasAuto, reactivate, warnOtherDraft }) {
  const action = reactivate ? REMOVE_ACTION.reactivate : REMOVE_ACTION.remove;
  const subKeys = SUB_KEY_BY_ACTION[action];
  return {
    title: ui(TITLE_KEY_BY_ACTION[action]),
    sub: count > 1 ? ui(subKeys.many, { count }) : ui(subKeys.one),
    items: resolveUnreconcileItems(ui, action, { hasAuto, reactivate, warnOtherDraft }),
    warning: ui(WARNING_KEY_BY_ACTION[action][warnOtherDraft ? 'otherDraft' : 'default']),
    confirmLabel: ui(CONFIRM_LABEL_KEY_BY_ACTION[action]),
    confirmIcon: CONFIRM_ICON_BY_ACTION[action],
  };
}

/**
 * Confirmation for un-reconciling documents — one row or the bulk selection, Desconciliar or the
 * lighter Reactivar. Always shown (per product decision) because both are destructive to some degree.
 *
 * <p>Reuses the SAME cartel Movimientos and Cobros/Pagos already show for their reactivate/delete
 * actions ({@link LifecycleConfirmModal}), so every lifecycle confirmation across the app looks
 * identical: red title + sub, one bullet per real consequence, a yellow warning box, and a
 * destructive confirm button. The consequences are passed as an explicit {@code items} list because
 * they don't map onto that component's Conciliación/Transacción/Asiento triad. All wording comes
 * from {@link resolveUnreconcileDialogCopy}.
 */
function RemoveOperationConfirmDialog({
  open, count, hasAuto, reactivate, warnOtherDraft, busy, onConfirm, onClose,
}) {
  const ui = useUI();
  if (!open) return null;

  const { title, sub, items, warning, confirmLabel, confirmIcon } =
    resolveUnreconcileDialogCopy(ui, { count, hasAuto, reactivate, warnOtherDraft });
  const { Icon: ConfirmIcon, testId: confirmIconTestId } = confirmIcon;

  return (
    <LifecycleConfirmModal
      title={title}
      sub={sub}
      items={items}
      warning={warning}
      confirmLabel={confirmLabel}
      cancelLabel={ui('cancel')}
      confirmIcon={<ConfirmIcon
        width={15}
        height={15}
        strokeWidth={2.2}
        data-testid={confirmIconTestId} />}
      onConfirm={busy ? NOOP : onConfirm}
      onClose={onClose}
      testIdPrefix="recon-remove"
      data-testid="LifecycleConfirmModal__recon-remove" />
  );
}

/**
 * Invoice candidates are no longer filtered by payment method — every unpaid invoice is a valid
 * candidate — so the method is chosen here, once, right before creating the payment(s), via the
 * same chip selector used for other lookups in this window (e.g. "Concepto contable" in the New
 * Movement modal — {@link ChipSelect} from `@/components/forms/fields`). A single method applies
 * to every invoice in this reconcile action (an already-selected existing transaction keeps its
 * own payment/method untouched, see {@link ReconciliationFlowSupport} on the backend). Methods are
 * pre-filtered to the line's direction (payin for receipts, payout for payments) from the
 * account's configured methods.
 */
function PaymentMethodModal({ open, methods, methodId, onSelect, busy, onConfirm, onClose,
  writeoff, onWriteoffChange, writeoffInfo, currency, isReceipt }) {
  const ui = useUI();
  const selectedMethod = methods.find((m) => m.id === methodId) || null;
  // ChipSelect expects a useLookup(query) hook (server-backed elsewhere); the method list is
  // already loaded and short, so this just filters it locally — no round-trip needed.
  const useMethodLookup = useCallback((query) => {
    const q = query.trim().toLowerCase();
    return { results: q ? methods.filter((m) => m.name.toLowerCase().includes(q)) : methods };
  }, [methods]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__recon-payment-method">
      <DialogContent className="max-w-md bg-card" data-testid="recon-payment-method-dialog">
        <DialogHeader data-testid="DialogHeader__recon-payment-method">
          <DialogTitle data-testid="DialogTitle__recon-payment-method">
            {ui('financeReconcileMethodModalTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__recon-payment-method">
            {ui('financeReconcileMethodModalBody')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <ChipSelect
            value={selectedMethod}
            onChange={(item) => onSelect(item?.id ?? '')}
            useLookup={useMethodLookup}
            placeholder={ui('cpPaymentMethod')}
            testId="recon-payment-method"
            data-testid="ChipSelect__recon-payment-method" />
        </div>
        {/* ETP-4797. Absent unless the selection actually leaves a gap — a balanced match keeps the
            modal exactly as it was. Restricted to a single invoice on purpose: the backend
            allocates the line greedily across invoices, so with several selected only the boundary
            one ends up partial, and the "Σ invoices − statement" figure shown here would not be
            what gets written off. */}
        {writeoffInfo?.visible && (
          <div className="flex flex-col gap-4 pb-2">
            <WriteoffBreakdown
              fundedLabel={ui('writeoffBreakdownStatement')}
              fundedAmount={writeoffInfo.fundedAmount}
              invoiceLabel={writeoffInfo.invoiceLabel}
              invoiceAmount={writeoffInfo.invoiceAmount}
              difference={writeoffInfo.amount}
              currency={currency}
              data-testid="recon-writeoff-breakdown" />
            <WriteoffToggleRow
              checked={writeoff}
              onCheckedChange={onWriteoffChange}
              amount={writeoffInfo.amount}
              currency={currency}
              isReceipt={isReceipt}
              blocked={writeoffInfo.blocked}
              limit={writeoffInfo.limit}
              data-testid="recon-writeoff-toggle" />
          </div>
        )}
        <DialogFooter data-testid="DialogFooter__recon-payment-method">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            // Matches the app's standard secondary-button formula (e.g. the "Cancelar" back
            // button in list windows like Reglas de matcheo) instead of the shared Button's
            // theme-token outline colors.
            className="border-[hsl(var(--border-control))] bg-card text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted"
            data-testid="recon-payment-method-cancel">
            {/* Just closes this modal (no selection to cancel) — the generic "Cancelar", not
                the action bar's "Cancelar selección". */}
            {ui('cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy || !methodId}
            // Matches the primary-action hover elsewhere in the app (e.g. "Confirmar" in the New
            // Movement modal) — the shared Button's default variant hovers to primary/90, not the
            // Figma yellow.
            className="bg-[hsl(var(--text-primary))] text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground"
            data-testid="recon-payment-method-confirm">
            {ui('financeReconcileMethodModalConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The line id the candidate list is fetched for.
 *
 * For a PARTIAL line that is its pending REMAINDER sub-line — the one carrying the group id and
 * no transaction — so the candidates are the documents still available, not the ones already
 * matched. A plain pending or fully-reconciled line uses its own id.
 *
 * @param {object|null} selectedLine
 * @returns {string|null} null when no line is selected
 */
function resolveCandidateLineId(selectedLine) {
  if (!selectedLine) return null;
  return selectedLine.reconcileStatus === 'PARTIAL' && selectedLine.remainderLineId
    ? selectedLine.remainderLineId
    : selectedLine.id;
}

/**
 * Which candidate operations the right panel shows, and in what order.
 *
 * Three rules, in this order:
 *
 *  1. A RECONCILED line is read-only. The backend already returns only its linked movement(s),
 *     so they are shown verbatim — the sign / date / search filters exist for PICKING candidates
 *     and would only hide what the user came to look at.
 *  2. Text search runs in memory. Direction and date range are applied server-side, so that the
 *     type counts in the filter match the list; only the free-text query is left to do here.
 *  3. Selected rows float to the very top, then the standard algorithm's suggestions. Stable
 *     within each group, so checking any row lifts it up and several selected rows gather
 *     together instead of shuffling.
 *
 * Module-level and pure: it is a named rule, it needs nothing from the component but its
 * arguments, and keeping the filter + comparator out of the component body is what holds
 * `ReconciliationSplitPanel` under Sonar's cognitive-complexity ceiling (javascript:S3776).
 *
 * @param {{ candidates: Array<object>, selectedLine: object|null, search: string,
 *   selectedOpIds: Set<string> }} args
 * @returns {Array<object>}
 */
function resolveVisibleCandidates({ candidates, selectedLine, search, selectedOpIds }) {
  if (selectedLine?.status === 'reconciled') return candidates;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((c) => [c.documentNo, c.partnerName, c.description]
      .some((v) => (v || '').toLowerCase().includes(q)))
    : candidates;
  return [...filtered].sort((a, b) => {
    const sel = (selectedOpIds.has(b.id) ? 1 : 0) - (selectedOpIds.has(a.id) ? 1 : 0);
    if (sel !== 0) return sel;
    return (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0);
  });
}

/**
 * Manual bank reconciliation split panel (T6).
 *
 * Left: pending statement lines (single-select). Right: candidate operations for
 * the selected line (multi-select). Bottom: running totals + reconcile action,
 * enabled only when the selected operations balance the line within tolerance.
 *
 * Composes the backend at /sws/neo/bank-reconciliation — it never reimplements
 * Etendo's reconciliation logic; the POST just hands the grouped ids over.
 *
 * @param {{ accountId: string|null, currency?: string, paymentMethods?: Array<object>, onBack?: () => void, onReconcileSuccess?: () => void }} props
 */
export function ReconciliationSplitPanel({
  accountId, currency = 'EUR', paymentMethods = [], onBack, onReconcileSuccess,
  // ETP-4797: FIN_Financial_Account.Writeofflimit. Null/absent means "no limit configured", NOT
  // "nothing may be written off" — see ReconciliationHandler.assertWithinWriteoffLimit.
  writeoffLimit = null,
  // EM_ETGO_Amount_Tolerance (a PERCENTAGE) — caps the remainder that may be posted to an
  // accounting concept. Unlike writeoffLimit above, 0/absent here means "no difference may be
  // posted", so the difference banner stays hidden until an admin configures it. Same column the
  // automatch engine reads with the opposite convention — see ReconciliationDifferenceSupport.
  amountTolerance = null,
  // The account's configured difference concept ({id, name}), used to preselect the modal's picker.
  // Absent → the banner renders with its action disabled and an explanation.
  glItemDifference = null,
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  const [leftStatus, setLeftStatus] = useState('pending');
  // Last 12 months, not 30 days: a statement line often has to be matched against an
  // invoice or payment months older than itself, and the 30-day window hid those
  // candidates by default. `last12m` is a preset dateRangeBounds and DateRangePopover
  // both already support, so nothing else changes.
  //
  // The trigger text comes from this preset, NOT from the placeholder. It used to
  // be the other way round: the placeholder was `financeReconcileFilterDate`,
  // whose es_ES value happens to read the same as `dateRangeLast12Months`. The
  // all-time option (`dateRangeAllTime`) is encoded as a `null` value, which is
  // indistinguishable from "nothing chosen", so computeTriggerLabel fell through
  // to the placeholder and the button kept naming a 12-month window even though
  // the filter had widened (ETP-4956). The placeholder is now
  // `dateRangeAnyTime`, matching every other DateRangePopover call site.
  const [leftDateRange, setLeftDateRange] = useState({ presetId: 'last12m' });
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSource, setRightSource] = useState('receipts');
  const [rightDateRange, setRightDateRange] = useState({ presetId: 'last12m' });
  const [rightSearch, setRightSearch] = useState('');
  const [selectedLineSel, setSelectedLineSel] = useState(null);
  const [selectedOpIds, setSelectedOpIds] = useState(() => new Set());
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  // ETP-4797. Opt-in and reset on every open (see handleReconcile) so a previous match can never
  // silently carry a write-off into the next one.
  const [writeoff, setWriteoff] = useState(false);
  // "Dejar pendiente" only hides the banner — it changes no data, the line stays partial. Scoped to
  // the current selection and reset whenever it changes (see the effect below), so reselecting the
  // line brings the offer back, per the design's `bannerDismissed` state model.
  const [diffDismissed, setDiffDismissed] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);

  const leftBounds = useMemo(() => getDateBounds(leftDateRange), [leftDateRange]);
  const rightBounds = useMemo(() => getDateBounds(rightDateRange), [rightDateRange]);

  const {
    lines, counts: statusCounts, draftReconciliationCount, loading: linesLoading,
    reload: reloadLines,
  } = usePendingStatementLines(accountId, {
    dateFrom: toDateParam(leftBounds.from),
    dateTo: toDateParam(leftBounds.to),
  });
  // The selection stores identity (id + matchGroupId); the LIVE line data is re-resolved from the
  // latest `lines` on every render, re-matched by group first so a head-id shift after a split /
  // unlink doesn't lose the selection and the right panel always reflects fresh amounts/txns.
  const selectedLine = useMemo(() => {
    if (!selectedLineSel) return null;
    const live = lines.find((l) => l.id === selectedLineSel.id
        || (selectedLineSel.matchGroupId && l.matchGroupId === selectedLineSel.matchGroupId));
    if (!live) {
      // While a reload is in flight this means nothing — `lines` is momentarily stale — so the
      // stored selection is kept, which is what stops a head-id shift after a split from dropping
      // it. Once the load has settled, the absence is real and the selection is gone.
      return linesLoading ? selectedLineSel : null;
    }
    // The line is still loaded, but `lines` holds EVERY state: the left table renders the
    // client-side filtered `visibleLines`. Un-reconciling sends a line from "Conciliadas" back to
    // "Pendiente", so it drops out of the table while remaining in `lines` — and the right panel
    // went on rendering its candidates and action bar with nothing selected on the left. Mirror the
    // table's own status predicate (`visibleLines` below), including its null/empty = "Todos" case.
    // Search is deliberately NOT mirrored: typing to look something up is a transient view change,
    // not the line moving.
    if (!matchesStatus(live.state, leftStatus)) {
      return null;
    }
    return live;
  }, [lines, selectedLineSel, linesLoading, leftStatus]);
  const sourceMeta = SOURCE_META[rightSource] ?? SOURCE_META.receipts;
  const invoiceMode = sourceMeta.kind === 'invoices';
  const candidateLineId = resolveCandidateLineId(selectedLine);
  const { candidates, counts: sourceCounts, loading: candLoading } = useCandidateOperations(
    accountId, candidateLineId, sourceMeta.docType,
    invoiceMode ? 'invoices' : null,
    toDateParam(rightBounds.from), toDateParam(rightBounds.to));
  const { reconcile, loading: reconciling } = useReconcileGroup();
  const { removeOperation, loading: removing } = useRemoveOperation();
  const { reactivateSelected, loading: reactivating } = useReactivateSelected();
  const { reconcileDifference, loading: postingDifference } = useReconcileDifference();
  // Whether the remainder of the selected line may be posted to an accounting concept. Recomputed
  // (and re-validated) server-side on confirm — this only decides what to offer.
  const differenceInfo = useMemo(() => differenceState({
    line: selectedLine,
    amountTolerance,
    dismissed: diffDismissed,
  }), [selectedLine, amountTolerance, diffDismissed]);
  // Same idiom CandidateOperationsPanel uses for its own per-line state: keyed on the line id, so a
  // list reload (which rebuilds the object) does not spuriously re-show a dismissed banner.
  useEffect(() => {
    setDiffDismissed(false);
  }, [selectedLine?.id]);
  // Pending un-reconcile request (single row OR the bulk selection):
  // { ids, hasAuto, count, mode }. `mode: 'reactivate'` picks the lighter draft-preserving action.
  const [removeRequest, setRemoveRequest] = useState(null);

  const selectLine = (line) => {
    setSelectedLineSel(line);
    setSelectedOpIds(new Set());
    // Default the type selector to the matching transaction direction for the line.
    setRightSource((Number(line?.amount) || 0) < 0 ? 'payments' : 'receipts');
  };

  const changeSource = (next) => {
    setRightSource(next);
    setSelectedOpIds(new Set());
  };

  const toggleOp = (id) => {
    setSelectedOpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectedLineSel(null);
    setSelectedOpIds(new Set());
  };

  const visibleLines = useMemo(() => {
    const q = leftSearch.trim().toLowerCase();
    return lines.filter((l) => {
      // Client-side state filter (null/empty = "Todos"); the backend already computed l.state.
      // Membership, not equality: "Pendiente" covers every non-reconciled state (ETP-5033).
      if (!matchesStatus(l.state, leftStatus)) return false;
      if (!q) return true;
      return [l.description, l.partnerName, l.referenceNo]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [lines, leftSearch, leftStatus]);

  const visibleTotal = useMemo(
    () => Number(visibleLines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)),
    [visibleLines],
  );

  const visibleCandidates = useMemo(
    () => resolveVisibleCandidates({ candidates, selectedLine, search: rightSearch, selectedOpIds }),
    [candidates, rightSearch, selectedOpIds, selectedLine],
  );

  // Pre-select the candidates the standard algorithm suggests, so a clean match
  // is one click away. Depends on the line id + loading state (not the candidates
  // array reference) to avoid an infinite loop when the hook returns a new array
  // reference on every render (common in tests and after background refreshes).
  useEffect(() => {
    // A fully-reconciled line's candidates ARE its linked documents (bulk un-reconcile) — pre-check
    // them all by default. A pending/partial line pre-selects the algorithm's suggestions.
    if (selectedLine?.status === 'reconciled') {
      setSelectedOpIds(new Set(candidates.map((c) => c.id)));
      return;
    }
    setSelectedOpIds(new Set(candidates.filter((c) => c.suggested).map((c) => c.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLine?.id, candLoading]);

  // A foreign-currency candidate's amount/pendingBalance is in the INVOICE currency; the backend
  // also emits `amountBase` (that same amount converted to the account currency, at the rate the
  // invoice would actually reconcile with — see ReconciliationHandler.appendAccountEquivalent).
  // Summing `amountBase` for foreign rows (and the plain amount for same-currency ones, which is
  // already in the account currency) lets one statement line match several invoices of different
  // currencies at once: the same greedy allocation the same-currency flow always used, generalized.
  const candidateBaseAmount = (cand) => {
    const isForeign = !!cand?.currency && cand.currency !== currency;
    if (!isForeign) return Number(cand?.amount) || 0;
    return cand?.amountBase != null ? Number(cand.amountBase) : null;
  };

  const selectedSum = useMemo(() => {
    let sum = 0;
    for (const c of candidates) {
      if (!selectedOpIds.has(c.id)) continue;
      const base = candidateBaseAmount(c);
      if (base == null) continue; // unknown rate — excluded from the total, stays "remaining"
      sum += base;
    }
    return Number(sum.toFixed(2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, selectedOpIds, currency]);

  // For a PARTIAL line the user reconciles the REMAINDER, not the full line: base the balance /
  // "restante por conciliar" on the pending amount (keeping the line's sign) instead of the total.
  const lineFull = Number(selectedLine?.amount) || 0;
  const isPartialLine = selectedLine?.reconcileStatus === 'PARTIAL';
  const lineAmount = isPartialLine
    ? Math.sign(lineFull) * Math.abs(Number(selectedLine?.pendingAmount) || 0)
    : lineFull;
  const remaining = Number((lineAmount - selectedSum).toFixed(2));
  const isReconciledLine = selectedLine?.status === 'reconciled';

  // Invoices and transactions both may match PART of the line — the backend splits it and
  // leaves a remainder pending — but they differ on the UPPER bound:
  // - Transactions are existing, fixed-amount entities that can't be partially "used", so their
  //   sum must not EXCEED the line (Core has no mechanism to shrink an existing transaction).
  // - Invoices are flexible: the amount paid per invoice is ours to decide, so a selection whose
  //   outstanding total exceeds the line is fine — the backend simply pays the last invoice (in
  //   date order) only partially with whatever the line has left (same as picking a single
  //   invoice bigger than the line, e.g. line=100 vs. invoice=120, which already worked before
  //   this iteration). Invoice candidates already carry the line's own sign (see
  //   ReconciliationHandler.buildInvoiceCandidates), so sameDirection naturally holds.
  const lineSign = Math.sign(lineAmount);
  const sumSign = Math.sign(selectedSum);
  const sameDirection = sumSign === 0 || lineSign === 0 || sumSign === lineSign;
  const withinLine = Math.abs(selectedSum) <= Math.abs(lineAmount) + RECONCILE_TOLERANCE;
  const balanced = invoiceMode ? sameDirection : (sameDirection && withinLine);
  const canReconcile =
    !!selectedLine && selectedOpIds.size > 0 && balanced && !isReconciledLine;

  // Invoices are no longer filtered by payment method — the method is picked once, right before
  // creating the payment(s), from the account's methods configured for the line's own direction.
  const directionMethods = useMemo(() => {
    const isReceiptDirection = lineAmount >= 0;
    return paymentMethods.filter((m) => (isReceiptDirection ? m.payinAllow : m.payoutAllow));
  }, [paymentMethods, lineAmount]);

  // The single selected invoice, or null. Only a one-invoice selection gets the write-off offer:
  // `createInvoicePayments` allocates the line greedily, so with several invoices only the boundary
  // one is settled partially and "Σ invoices − line" would overstate what actually gets written off.
  const soleInvoice = useMemo(() => {
    const picked = candidates.filter((c) => selectedOpIds.has(c.id) && c.kind === 'invoice');
    return picked.length === 1 ? picked[0] : null;
  }, [candidates, selectedOpIds]);

  const writeoffInfo = useMemo(() => {
    const fundedAmount = Math.abs(lineAmount);
    const invoiceAmount = Math.abs(selectedSum);
    const state = writeoffState({
      difference: invoiceAmount - fundedAmount,
      limit: writeoffLimit,
      eligible: invoiceMode && !!soleInvoice,
    });
    return {
      ...state,
      fundedAmount,
      invoiceAmount,
      limit: writeoffLimit,
      // Matches the mockup's "Factura 10000037 · Laura Morat". Both keys come straight from
      // ReconciliationHandler's invoice candidate row (documentNo / partnerName).
      invoiceLabel: soleInvoice
        ? [soleInvoice.documentNo, soleInvoice.partnerName].filter(Boolean).join(' · ')
        : '',
    };
  }, [invoiceMode, soleInvoice, lineAmount, selectedSum, writeoffLimit]);

  /**
   * Whether the current shortfall is one the backend will post to an accounting concept instead of
   * leaving as a pending remainder (ETP-4965). `amountTolerance` is a PERCENTAGE of the line, and 0
   * / absent means the feature is off — the same convention
   * `AutoMatchSupport.differenceTolerance` applies server-side. Only advisory: the server recomputes
   * this and is the boundary.
   */
  const differenceNotice = useMemo(() => {
    const pct = Number(amountTolerance) || 0;
    if (invoiceMode || isReconciledLine || pct <= 0) return null;
    if (!selectedLine || selectedOpIds.size === 0) return null;
    const gap = Math.abs(remaining);
    if (gap <= RECONCILE_TOLERANCE) return null;
    // Over-coverage stays an error: out of scope, and the reconcile button is disabled anyway.
    if (Math.sign(remaining) !== Math.sign(lineAmount)) return null;
    if (gap > Math.abs(lineAmount) * pct / 100) return null;
    const amount = formatCurrency(currency, gap);
    return glItemDifference?.name
      ? ui('financeReconcileBarDifferenceNotice', { amount, concept: glItemDifference.name })
      : ui('financeReconcileBarDifferenceNoticeNoConcept', { amount });
  }, [amountTolerance, invoiceMode, isReconciledLine, selectedLine, selectedOpIds, remaining,
      lineAmount, currency, glItemDifference, ui]);

  // Set when the backend answers GL_ITEM_REQUIRED: the match carries a postable difference but the
  // account has no concept configured, so the user picks one and we resubmit. Shape matches
  // `differenceState` so DifferenceModal renders unchanged.
  const [glItemPrompt, setGlItemPrompt] = useState(null);

  const submitReconcile = async (methodId, glItemId) => {
    try {
      const payload = {
        // For a PARTIAL line, reconcile the remainder against its pending sub-line
        // (`candidateLineId` = remainderLineId), NOT the group head (which already has a
        // transaction and would 409 "already reconciled").
        financialAccountId: accountId,
        statementLineId: candidateLineId,
      };
      if (invoiceMode) {
        payload.invoices = candidates
          .filter((c) => selectedOpIds.has(c.id) && c.kind === 'invoice')
          .map((c) => ({ invoiceId: c.invoiceId, scheduleId: c.scheduleId }));
        if (methodId) payload.paymentMethodId = methodId;
        // Only sent when the toggle was actually offered AND accepted; the backend re-checks the
        // limit regardless, since a disabled switch is a convenience, not a boundary.
        if (writeoff && writeoffInfo.visible && !writeoffInfo.blocked) {
          payload.writeoffDifference = true;
        }
      } else {
        // An already-existing transaction keeps its own payment and method untouched.
        payload.operationIds = Array.from(selectedOpIds);
      }
      if (glItemId) payload.glItemId = glItemId;
      await reconcile(payload);
      toast.success(ui('financeReconcileToastSuccess'));
      setSelectedLineSel(null);
      setSelectedOpIds(new Set());
      setMethodModalOpen(false);
      setWriteoff(false);
      setGlItemPrompt(null);
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      // The match leaves a postable difference and the account has no concept configured. Ask for
      // one and resubmit rather than dead-ending on a toast — the reconcile is one field away.
      if (err?.code === 'GL_ITEM_REQUIRED') {
        setMethodModalOpen(false);
        setGlItemPrompt({
          methodId: methodId ?? null,
          remainder: Number(err?.body?.differenceAmount ?? remaining) || remaining,
          lineTotal: lineAmount,
          reconciled: selectedSum,
        });
        return;
      }
      // A 409 on the group head names the pending sub-line the caller should have targeted; retarget
      // the selection there instead of leaving the user on a line they cannot act on.
      const retargetId = err?.body?.remainderLineId;
      if (retargetId && retargetId !== candidateLineId) {
        setSelectedLineSel({ id: retargetId, matchGroupId: selectedLine?.matchGroupId ?? null });
        setSelectedOpIds(new Set());
        reloadLines();
      }
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  // Only ever bound to the "Conciliar" button, whose `disabled` is exactly `busy || !canReconcile`
  // (see the non-reconciled branch of ReconciliationActionBar) — so by the time this runs,
  // `canReconcile` is already guaranteed true; a runtime re-check here was unreachable dead code.
  const handleReconcile = () => {
    // A pure existing-transaction match needs no method (each transaction already has one); only
    // creating new invoice payments requires picking one, and only when the account actually has
    // methods configured for this direction — otherwise fall back to the backend's auto-resolve.
    if (invoiceMode && directionMethods.length > 0) {
      const preselected = directionMethods.find((m) => m.isDefault) || directionMethods[0];
      setSelectedMethodId(preselected?.id || '');
      setWriteoff(false);
      setMethodModalOpen(true);
      return;
    }
    submitReconcile(null);
  };

  const confirmMethodAndReconcile = () => {
    submitReconcile(selectedMethodId);
  };

  /**
   * Posts the remainder to the chosen accounting concept. Targets `remainderLineId` (the pending
   * sub-line), never the merged head. No amount is sent: the backend recomputes it and would ignore
   * one anyway.
   */
  const confirmDifference = async ({ glItemId, description }) => {
    try {
      await reconcileDifference({
        financialAccountId: accountId,
        statementLineId: candidateLineId,
        glItemId,
        ...(description ? { description } : {}),
      });
      toast.success(ui('financeReconcileDiffToastSuccess'));
      setDiffModalOpen(false);
      setSelectedLineSel(null);
      setSelectedOpIds(new Set());
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  // Whether any of the given transaction ids is an auto-created payment (drives the confirm hint that
  // the invoice returns to unpaid). Matched-doc auto-created flags live on selectedLine.txns.
  const anyAutoCreated = (ids) => {
    const set = new Set(ids);
    return (selectedLine?.txns || []).some((t) => set.has(t.transactionId) && t.autoCreated);
  };

  // Un-reconcile ("desvincular") — always confirmed (destructive: removes auto-created payments and
  // returns invoices to unpaid). One row (per-row "−") OR the bulk checked selection (bottom button).
  const requestRemoveOne = (txn) => {
    const id = txn?.transactionId;
    if (!selectedLine || !id) return;
    setRemoveRequest({ ids: [id], hasAuto: anyAutoCreated([id]), count: 1 });
  };

  // Only bound to the "Desconciliar (N)" button, disabled whenever `removeCount` (= this same
  // `selectedOpIds.size`) is 0 — so `ids` is already guaranteed non-empty here.
  const requestRemoveSelected = () => {
    const ids = Array.from(selectedOpIds);
    setRemoveRequest({ ids, hasAuto: anyAutoCreated(ids), count: ids.length });
  };

  /**
   * "Reactivar" — the lighter alternative behind the primary button's chevron. Same checked
   * selection as Desconciliar; only the confirm copy and the endpoint differ. Only reachable from
   * the `recon-action-reactivate` dropdown item, which only exists once a line is selected and its
   * trigger is disabled whenever `selectedOpIds` is empty — so `selectedLine` and a non-empty `ids`
   * are already guaranteed here.
   */
  const requestReactivateSelected = () => {
    const ids = Array.from(selectedOpIds);
    setRemoveRequest({
      ids, hasAuto: anyAutoCreated(ids), count: ids.length, mode: 'reactivate',
    });
  };

  // Only wired to RemoveOperationConfirmDialog's confirm button, itself only rendered while
  // `open={!!removeRequest}` — so `removeRequest` (and, transitively, `selectedLine`, which every
  // setter of it already required) is already guaranteed non-null here.
  const confirmRemove = async () => {
    // Named for the ACTION being confirmed — distinct from the outer `reactivating` (its request is
    // in flight), which would otherwise be shadowed here.
    const isReactivateAction = removeRequest.mode === 'reactivate';
    try {
      const payload = {
        financialAccountId: accountId,
        statementLineId: selectedLine.id,
        transactionIds: removeRequest.ids,
      };
      const result = isReactivateAction
        ? await reactivateSelected(payload)
        : await removeOperation(payload);
      setRemoveRequest(null);
      // Core's own removal utilities commit mid-flow, so a batch of several ids can genuinely
      // partially succeed — the backend reports the real per-transaction outcome (never an
      // all-or-nothing throw), so surface it instead of assuming the whole request succeeded.
      const failedCount = result?.failedTransactionIds?.length ?? 0;
      const removedCount = result?.transactionIds?.length ?? 0;
      // The backend now travels the CAUSE alongside the count (a closed accounting period being by
      // far the commonest, and the only one the user can act on). Previously it stayed in the server
      // log and this branch fell back to `financeReconcileToastError` — whose copy reads "Error al
      // conciliar", the wrong action entirely for an un-reconcile.
      const reason = result?.failureReason;
      if (failedCount > 0 && removedCount > 0) {
        toast.warning(ui('financeReconcileToastOperationPartiallyRemoved', {
          removed: removedCount,
          total: removedCount + failedCount,
          failed: failedCount,
        }), reason ? { description: reason } : undefined);
      } else if (failedCount > 0) {
        toast.error(ui(isReactivateAction
          ? 'financeReconcileToastOperationReactivateError'
          : 'financeReconcileToastOperationRemoveError'),
        reason ? { description: reason } : undefined);
      } else {
        toast.success(ui(isReactivateAction
          ? 'financeReconcileToastOperationReactivated'
          : 'financeReconcileToastOperationRemoved'));
      }
      setSelectedOpIds(new Set());
      // Keep the line selected (selectedLine re-resolves from the reloaded `lines` by match group).
      // Always reload — even on partial/total failure — so the UI reflects the true DB state rather
      // than assuming nothing happened.
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Spans BOTH columns, unlike the toolbar: the header's refresh button reloads the whole
          tab, so the indicator belongs above the split rather than inside the left panel. Only
          once lines are on screen — the first fetch shows the panel's own skeleton rows. */}
      {linesLoading && lines.length > 0 ? (
        <ListProgressBar testId="reconciliation-progress-bar" data-testid="ListProgressBar__d0f4d5" />
      ) : null}
      <div className="flex flex-1 overflow-hidden">
        <StatementLinesPanel
          lines={visibleLines}
          total={visibleTotal}
          loading={linesLoading}
          currency={currency}
          bcpLocale={bcpLocale}
          selectedLineId={selectedLine?.id ?? null}
          onSelectLine={selectLine}
          status={leftStatus}
          onStatusChange={setLeftStatus}
          statusCounts={statusCounts}
          dateRange={leftDateRange}
          onDateRangeChange={setLeftDateRange}
          search={leftSearch}
          onSearchChange={setLeftSearch}
          onBack={onBack}
          data-testid="StatementLinesPanel__d0f4d5" />
        <CandidateOperationsPanel
          line={selectedLine}
          candidates={visibleCandidates}
          loading={candLoading}
          currency={currency}
          bcpLocale={bcpLocale}
          selectedIds={selectedOpIds}
          onToggle={toggleOp}
          onRemoveOperation={requestRemoveOne}
          reconciledMode={isReconciledLine}
          readOnly={isReconciledLine}
          differenceBanner={
            <DifferenceBanner
              info={differenceInfo}
              currency={currency}
              onDismiss={() => setDiffDismissed(true)}
              onPost={() => setDiffModalOpen(true)}
              data-testid="DifferenceBanner__d0f4d5" />
          }
          source={rightSource}
          onSourceChange={changeSource}
          sourceCounts={sourceCounts}
          dateRange={rightDateRange}
          onDateRangeChange={setRightDateRange}
          search={rightSearch}
          onSearchChange={setRightSearch}
          footer={selectedLine ? (
            <ReconciliationActionBar
              currency={currency}
              selectedSum={selectedSum}
              remaining={remaining}
              canReconcile={canReconcile}
              isReconciledLine={isReconciledLine}
              reconcileCount={selectedOpIds.size}
              removeCount={selectedOpIds.size}
              busy={reconciling || removing || reactivating}
              onCancel={cancelSelection}
              onReconcile={isReconciledLine ? requestRemoveSelected : handleReconcile}
              onReactivate={isReconciledLine ? requestReactivateSelected : undefined}
              differenceNotice={differenceNotice}
              data-testid="ReconciliationActionBar__d0f4d5" />
          ) : null}
          data-testid="CandidateOperationsPanel__d0f4d5" />
      </div>
      {/* ETP-4965: the same modal the "post the difference" banner uses, reached from the other
          direction — the user pressed Conciliar on a match with a postable difference and the
          account has no concept configured, so the backend asked for one. Reused rather than
          duplicated: its `info` only needs {lineTotal, reconciled, remainder}. */}
      <DifferenceModal
        open={!!glItemPrompt}
        info={glItemPrompt}
        currency={currency}
        defaultGlItem={glItemDifference}
        busy={reconciling}
        onConfirm={({ glItemId }) => submitReconcile(glItemPrompt?.methodId ?? null, glItemId)}
        onClose={() => setGlItemPrompt(null)}
        data-testid="DifferenceModal__gl-item-required" />
      <RemoveOperationConfirmDialog
        open={!!removeRequest}
        count={removeRequest?.count ?? 0}
        hasAuto={!!removeRequest?.hasAuto}
        reactivate={removeRequest?.mode === 'reactivate'}
        warnOtherDraft={draftReconciliationCount > 0}
        busy={removing || reactivating}
        onConfirm={confirmRemove}
        onClose={() => setRemoveRequest(null)}
        data-testid="RemoveOperationConfirmDialog__d0f4d5" />
      <PaymentMethodModal
        open={methodModalOpen}
        methods={directionMethods}
        methodId={selectedMethodId}
        onSelect={setSelectedMethodId}
        busy={reconciling}
        onConfirm={confirmMethodAndReconcile}
        onClose={() => setMethodModalOpen(false)}
        writeoff={writeoff}
        onWriteoffChange={setWriteoff}
        writeoffInfo={writeoffInfo}
        currency={currency}
        isReceipt={lineAmount >= 0}
        data-testid="PaymentMethodModal__d0f4d5" />
      <DifferenceModal
        open={diffModalOpen}
        info={differenceInfo}
        currency={currency}
        defaultGlItem={glItemDifference}
        busy={postingDifference}
        onConfirm={confirmDifference}
        onClose={() => setDiffModalOpen(false)}
        data-testid="DifferenceModal__d0f4d5" />
    </div>
  );
}
