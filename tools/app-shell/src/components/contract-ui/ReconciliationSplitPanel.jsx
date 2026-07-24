import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MoreVertical, CircleCheckBig, CheckCircle, X, ChevronDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/ui/money-amount';
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
} from '@/hooks/useReconciliation';

// Amounts that differ by <= this absolute value are treated as balanced.
const RECONCILE_TOLERANCE = 0.01;
const SKELETON_ROWS = [1, 2, 3, 4];
// Stable per-column keys for skeleton cells (avoids array-index keys, Sonar S6479).
const SKELETON_CELL_KEYS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
// Elevation shadow shared by the selected row in both panels.
const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]';
const STATUS_CODES = ['pending', 'suggested', 'byRule', 'difference', 'reconciled'];
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
  };
  const cfg = map[kind] ?? map.pending;
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2 py-0.5 text-xs font-normal', cfg.cls)}>
      {ui(cfg.labelKey)}
    </span>
  );
}

/** Badge kind for a candidate row: reconciled (read-only) → invoice → suggested → pending. */
function badgeKindFor(cand, readOnly) {
  if (readOnly) return 'reconciled';
  if (cand.kind === 'invoice') return 'invoice';
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
  const countFor = (code) => counts[code] ?? 0;
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
      // Always keep a concrete selection — ignore the "clear" (all) action.
      onChange={(v) => onChange(v || value)}
      codes={SOURCE_CODES}
      labelFor={(code) => `${ui(SOURCE_META[code]?.labelKey ?? code)} (${counts[code] ?? 0})`}
      allLabel={ui('financeReconcileSourceLabel')}
      searchPlaceholder={ui('financeReconcileSourceLabel')}
      popoverWidth="w-64"
      data-testid="recon-source-filter" />
  );
}

/** Renders skeleton / empty / data rows for either table body. */
function renderRows({ loading, items, colSpan, emptyTitle, emptyHint, renderRow }) {
  if (loading) {
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
        <TableCell colSpan={colSpan} className="py-12" data-testid="TableCell__d0f4d5">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">{emptyTitle}</p>
            {emptyHint ? <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{emptyHint}</p> : null}
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
 */
function PanelTable({ headCells, loading, items, renderRow, colSpan = 5 }) {
  const ui = useUI();
  return (
    <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
      <Table data-testid="Table__d0f4d5">
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
            emptyTitle: ui('financeAccountMovementsEmpty'),
            emptyHint: null,
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
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn('w-full truncate leading-5', selected ? 'font-semibold' : 'font-normal')}>
              {line.description || line.partnerName || line.referenceNo || '—'}
            </span>
            <StatusBadge kind={badgeKind} data-testid="StatusBadge__d0f4d5" />
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
        <TableCell
          className={cn('h-[62px] w-9 px-0 pr-1', cellBg)}
          data-testid="TableCell__d0f4d5">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] transition-opacity hover:bg-[hsl(var(--muted))]',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <MoreVertical className="h-5 w-5" data-testid="MoreVertical__d0f4d5" />
          </button>
        </TableCell>
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
      <DateRangePopover value={dateRange} onChange={onDateRangeChange} placeholder={ui('financeReconcileFilterDate')} data-testid="DateRangePopover__d0f4d5" />
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
      colSpan={6}
      headCells={(
        <>
          <TableHead className="w-8 px-0 pl-2" data-testid="TableHead__d0f4d5" />
          <TableHead className="w-[108px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDate')}</TableHead>
          <TableHead className="px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDescription')}</TableHead>
          <TableHead className="w-[90px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColProgress')}</TableHead>
          <TableHead className="w-[139px] px-3 text-left" data-testid="TableHead__d0f4d5">{ui('financeReconcileColAmount')}</TableHead>
          <TableHead className="w-9 px-0 pr-1" data-testid="TableHead__d0f4d5" />
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
  onRemoveOperation, reconciledMode = false,
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
        placeholder={ui('financeReconcileFilterDate')}
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
          <TableHead className="w-[121px] px-3 text-left" data-testid="TableHead__d0f4d5">{ui('financeReconcileColPendingBalance')}</TableHead>
          <TableHead className="w-[121px] px-3 text-left" data-testid="TableHead__d0f4d5">{ui('financeReconcileColAmount')}</TableHead>
        </>
      )}
      data-testid="PanelShell__d0f4d5" />
  );
}

/** Bottom action bar with the running totals and the reconcile / placeholder buttons. */
function ReconciliationActionBar({
  currency, selectedSum, remaining, canReconcile, isReconciledLine, reconcileCount, removeCount = 0,
  busy, onCancel, onReconcile,
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
            <span className={cn('font-semibold', Math.abs(remaining) <= RECONCILE_TOLERANCE ? 'text-[var(--status-success-fg)]' : 'text-[hsl(var(--destructive))]')}>
              {formatSigned(remaining, currency)}
            </span>
          </div>
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
        <button
          type="button"
          onClick={onReconcile}
          // A reconciled line shows "Desconciliar (N)" acting on the checked documents (N = checked
          // count, disabled when none); a pending line gates "Conciliar" on a balanced selection.
          disabled={busy || (isReconciledLine ? removeCount === 0 : !canReconcile)}
          data-testid="recon-action-reconcile"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[hsl(var(--foreground))] px-3 text-sm font-medium text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
        >
          <CheckCircle className="h-4 w-4" data-testid="CheckCircle__d0f4d5" />
          {isReconciledLine
            ? ui('financeReconcileActionRemoveCount', { count: removeCount })
            : ui('financeReconcileActionReconcileCount', { count: reconcileCount })}
        </button>
      </div>
    </div>
  );
}


/**
 * Confirmation for un-reconciling documents ("desvincular") — one row or the bulk selection. Always
 * shown (per product decision) because it is destructive; when the selection includes an
 * auto-created invoice payment it also warns that the invoice returns to unpaid.
 */
function RemoveOperationConfirmDialog({ open, count, hasAuto, busy, onConfirm, onClose }) {
  const ui = useUI();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__recon-remove">
      <DialogContent className="max-w-md bg-card" data-testid="recon-remove-dialog">
        <DialogHeader data-testid="DialogHeader__recon-remove">
          <DialogTitle data-testid="DialogTitle__recon-remove">
            {ui('financeReconcileConfirmRemoveOneTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__recon-remove">
            {count > 1
              ? ui('financeReconcileConfirmRemoveManyBody', { count })
              : ui('financeReconcileConfirmRemoveOneBody')}
            {hasAuto ? ` ${ui('financeReconcileRemoveOneAutoHint')}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__recon-remove">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="border-[hsl(var(--border-control))] bg-card text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted"
            data-testid="recon-remove-cancel">
            {ui('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
            data-testid="recon-remove-confirm">
            {ui('financeReconcileActionRemoveOne')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
function PaymentMethodModal({ open, methods, methodId, onSelect, busy, onConfirm, onClose }) {
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
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  const [leftStatus, setLeftStatus] = useState('pending');
  const [leftDateRange, setLeftDateRange] = useState({ presetId: 'last30' });
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSource, setRightSource] = useState('receipts');
  const [rightDateRange, setRightDateRange] = useState({ presetId: 'last30' });
  const [rightSearch, setRightSearch] = useState('');
  const [selectedLineSel, setSelectedLineSel] = useState(null);
  const [selectedOpIds, setSelectedOpIds] = useState(() => new Set());
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState('');

  const leftBounds = useMemo(() => getDateBounds(leftDateRange), [leftDateRange]);
  const rightBounds = useMemo(() => getDateBounds(rightDateRange), [rightDateRange]);

  const { lines, counts: statusCounts, loading: linesLoading, reload: reloadLines } =
    usePendingStatementLines(accountId, {
      dateFrom: toDateParam(leftBounds.from),
      dateTo: toDateParam(leftBounds.to),
    });
  // The selection stores identity (id + matchGroupId); the LIVE line data is re-resolved from the
  // latest `lines` on every render, re-matched by group first so a head-id shift after a split /
  // unlink doesn't lose the selection and the right panel always reflects fresh amounts/txns.
  const selectedLine = useMemo(() => {
    if (!selectedLineSel) return null;
    return lines.find((l) => l.id === selectedLineSel.id
        || (selectedLineSel.matchGroupId && l.matchGroupId === selectedLineSel.matchGroupId))
      || selectedLineSel;
  }, [lines, selectedLineSel]);
  const sourceMeta = SOURCE_META[rightSource] ?? SOURCE_META.receipts;
  const invoiceMode = sourceMeta.kind === 'invoices';
  // For a PARTIAL line, reconcile the REST against its pending remainder sub-line (which carries the
  // group id and no transaction) so the candidate list = available docs, not the already-matched
  // ones. A plain pending / fully-reconciled line uses its own id.
  let candidateLineId = null;
  if (selectedLine) {
    candidateLineId = selectedLine.reconcileStatus === 'PARTIAL' && selectedLine.remainderLineId
      ? selectedLine.remainderLineId
      : selectedLine.id;
  }
  const { candidates, counts: sourceCounts, loading: candLoading } = useCandidateOperations(
    accountId, candidateLineId, sourceMeta.docType,
    invoiceMode ? 'invoices' : null,
    toDateParam(rightBounds.from), toDateParam(rightBounds.to));
  const { reconcile, loading: reconciling } = useReconcileGroup();
  const { removeOperation, loading: removing } = useRemoveOperation();
  // Pending un-reconcile request (single row OR the bulk selection): { ids, hasAuto, count }.
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
      if (leftStatus && (l.state || 'pending') !== leftStatus) return false;
      if (!q) return true;
      return [l.description, l.partnerName, l.referenceNo]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [lines, leftSearch, leftStatus]);

  const visibleTotal = useMemo(
    () => Number(visibleLines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)),
    [visibleLines],
  );

  const visibleCandidates = useMemo(() => {
    // A reconciled line is read-only: the backend already returns ONLY its linked movement(s),
    // so show them verbatim without the sign/date/search filters meant for picking candidates.
    if (selectedLine?.status === 'reconciled') return candidates;
    const q = rightSearch.trim().toLowerCase();
    // Direction AND date range are applied server-side (so the type counts match the list);
    // here we only do the in-memory text search.
    const filtered = q
      ? candidates.filter((c) => [c.documentNo, c.partnerName, c.description]
        .some((v) => (v || '').toLowerCase().includes(q)))
      : candidates;
    // Float SELECTED rows to the very top, then the standard-algorithm
    // suggestions; stable within each group (so checking any row lifts it up,
    // and multiple selected rows all gather at the top).
    return [...filtered].sort((a, b) => {
      const sel = (selectedOpIds.has(b.id) ? 1 : 0) - (selectedOpIds.has(a.id) ? 1 : 0);
      if (sel !== 0) return sel;
      return (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0);
    });
  }, [candidates, rightSearch, selectedOpIds, selectedLine]);

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

  const submitReconcile = async (methodId) => {
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
      } else {
        // An already-existing transaction keeps its own payment and method untouched.
        payload.operationIds = Array.from(selectedOpIds);
      }
      await reconcile(payload);
      toast.success(ui('financeReconcileToastSuccess'));
      setSelectedLineSel(null);
      setSelectedOpIds(new Set());
      setMethodModalOpen(false);
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  const handleReconcile = () => {
    if (!canReconcile) return;
    // A pure existing-transaction match needs no method (each transaction already has one); only
    // creating new invoice payments requires picking one, and only when the account actually has
    // methods configured for this direction — otherwise fall back to the backend's auto-resolve.
    if (invoiceMode && directionMethods.length > 0) {
      const preselected = directionMethods.find((m) => m.isDefault) || directionMethods[0];
      setSelectedMethodId(preselected?.id || '');
      setMethodModalOpen(true);
      return;
    }
    submitReconcile(null);
  };

  const confirmMethodAndReconcile = () => {
    submitReconcile(selectedMethodId);
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

  const requestRemoveSelected = () => {
    if (!selectedLine) return;
    const ids = Array.from(selectedOpIds);
    if (ids.length === 0) return;
    setRemoveRequest({ ids, hasAuto: anyAutoCreated(ids), count: ids.length });
  };

  const confirmRemove = async () => {
    if (!selectedLine || !removeRequest) return;
    try {
      await removeOperation({
        financialAccountId: accountId,
        statementLineId: selectedLine.id,
        transactionIds: removeRequest.ids,
      });
      setRemoveRequest(null);
      toast.success(ui('financeReconcileToastOperationRemoved'));
      setSelectedOpIds(new Set());
      // Keep the line selected (selectedLine re-resolves from the reloaded `lines` by match group).
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
              busy={reconciling || removing}
              onCancel={cancelSelection}
              onReconcile={isReconciledLine ? requestRemoveSelected : handleReconcile}
              data-testid="ReconciliationActionBar__d0f4d5" />
          ) : null}
          data-testid="CandidateOperationsPanel__d0f4d5" />
      </div>
      <RemoveOperationConfirmDialog
        open={!!removeRequest}
        count={removeRequest?.count ?? 0}
        hasAuto={!!removeRequest?.hasAuto}
        busy={removing}
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
        data-testid="PaymentMethodModal__d0f4d5" />
    </div>
  );
}
