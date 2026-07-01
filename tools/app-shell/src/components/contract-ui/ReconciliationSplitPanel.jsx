import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MoreVertical, CircleCheckBig, CheckCircle, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { getDateBounds, toDateParam } from '@/lib/dateRangeBounds';
import { formatDate, formatSigned } from '@/lib/formatSigned';
import {
  usePendingStatementLines,
  useCandidateOperations,
  useReconcileGroup,
  useReactivateReconciliation,
} from '@/hooks/useReconciliation';

// Amounts that differ by <= this absolute value are treated as balanced.
const RECONCILE_TOLERANCE = 0.01;
const SKELETON_ROWS = [1, 2, 3, 4];
// Stable per-column keys for skeleton cells (avoids array-index keys, Sonar S6479).
const SKELETON_CELL_KEYS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
// Elevation shadow shared by the selected row in both panels.
const ELEVATED_SHADOW =
  'shadow-[0px_10px_15px_-3px_rgba(18,18,23,0.08),0px_4px_6px_-2px_rgba(18,18,23,0.05)]';
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
    suggested: { labelKey: 'financeReconcileBadgeSuggested', cls: 'bg-[#F0FAFF] text-[#0075AD]' },
    byRule: { labelKey: 'financeReconcileBadgeByRule', cls: 'bg-[#FFF9EB] text-[#92600A]' },
    difference: { labelKey: 'financeReconcileBadgeDifference', cls: 'bg-[#FEF0F4] text-[#D50B3E]' },
    reconciled: { labelKey: 'financeReconcileBadgeReconciled', cls: 'bg-[#EEFBF4] text-[#17663A]' },
    pending: { labelKey: 'financeReconcileBadgePending', cls: 'bg-[#F5F7F9] text-[#3F3F50]' },
    invoice: { labelKey: 'financeReconcileBadgeInvoice', cls: 'bg-[#FFF9EB] text-[#92600A]' },
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
        className="h-9 w-40 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm text-[#121217] placeholder:text-[#8a8aa3] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1"
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
            <p className="text-sm font-medium text-[#121217]">{emptyTitle}</p>
            {emptyHint ? <p className="max-w-sm text-sm text-[#6C6C89]">{emptyHint}</p> : null}
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
function PanelTable({ headCells, loading, items, renderRow }) {
  const ui = useUI();
  return (
    <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
      <Table data-testid="Table__d0f4d5">
        <TableHeader data-testid="TableHeader__d0f4d5">
          <TableRow
            className="h-11 border-b border-[#E8EAEF] [&_th]:text-xs [&_th]:font-semibold [&_th]:text-[#121217]"
            data-testid="TableRow__d0f4d5">
            {headCells}
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__d0f4d5">
          {renderRows({
            loading,
            items,
            colSpan: 5,
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
      className={cn('h-[62px] px-3 text-sm font-normal text-[#121217]', cellClassName)}
      data-testid="TableCell__d0f4d5">
      {formatDate(date, bcpLocale)}
    </TableCell>
  );
}

/** Right-aligned money cell shared by both panels. */
function MoneyCell({ value, currency, cellClassName, bold = false }) {
  return (
    <TableCell
      className={cn('h-[62px] px-3 text-right align-middle', cellClassName)}
      data-testid="TableCell__d0f4d5">
      <MoneyAmount
        value={Number(value) || 0}
        currency={currency}
        tone="neutral"
        className={cn('text-sm leading-5 text-[#121217]', bold ? 'font-semibold' : 'font-normal')}
        data-testid="MoneyAmount__d0f4d5" />
    </TableCell>
  );
}

/**
 * Outer column shell shared by both panels: the flex wrapper, the toolbar, the
 * scrollable table and an optional footer. Keeps the two panels from repeating
 * the same structural scaffold.
 */
function PanelShell({ className, toolbar, headCells, loading, items, renderRow, footer }) {
  return (
    <div className={cn('flex min-w-[30%] flex-1 flex-col overflow-hidden', className)}>
      {toolbar}
      <PanelTable
        headCells={headCells}
        loading={loading}
        items={items}
        renderRow={renderRow}
        data-testid="PanelTable__d0f4d5" />
      {footer}
    </div>
  );
}

/**
 * Left panel — pending statement lines with single-select radio rows, status
 * badge and a total footer.
 */
function StatementLinesPanel({
  lines, total, loading, currency, bcpLocale, selectedLineId, onSelectLine, search, onSearchChange,
  status, onStatusChange, statusCounts, dateRange, onDateRangeChange, onBack,
}) {
  const ui = useUI();

  const renderRow = (line) => {
    const selected = line.id === selectedLineId;
    // The engine-computed `state` drives the badge (suggested/byRule/difference/reconciled/pending).
    const badgeKind = line.state || (line.status === 'reconciled' ? 'reconciled' : 'pending');
    const cellBg = cn('transition-colors', selected ? 'bg-[#F5F7F9]' : 'bg-white');
    return (
      <TableRow
        key={line.id}
        data-testid={`recon-line-row-${line.id}`}
        onClick={() => onSelectLine(line)}
        className={cn(
          'group relative h-[62px] cursor-pointer border-b border-[#E8EAEF] bg-white transition-shadow',
          selected
            ? `z-20 ${ELEVATED_SHADOW}`
            : 'hover:z-10 hover:bg-white hover:shadow-lg',
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
            className="h-4 w-4 accent-[#121217]"
          />
        </TableCell>
        <DateCell
          date={line.date}
          bcpLocale={bcpLocale}
          cellClassName={cn('w-[108px]', cellBg)}
          data-testid="DateCell__d0f4d5" />
        <TableCell
          className={cn('h-[62px] px-3 py-2 text-sm text-[#121217]', cellBg)}
          data-testid="TableCell__d0f4d5">
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn('w-full truncate leading-5', selected ? 'font-semibold' : 'font-normal')}>
              {line.description || line.partnerName || line.referenceNo || '—'}
            </span>
            <StatusBadge kind={badgeKind} data-testid="StatusBadge__d0f4d5" />
          </div>
        </TableCell>
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
              'flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] transition-opacity hover:bg-[#EDF0F4]',
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:bg-[#F5F7F9] hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__d0f4d5" />
      </button>
      <ReconciliationStatusFilter value={status} onChange={onStatusChange} counts={statusCounts} data-testid="ReconciliationStatusFilter__d0f4d5" />
      <DateRangePopover value={dateRange} onChange={onDateRangeChange} placeholder={ui('financeReconcileFilterDate')} data-testid="DateRangePopover__d0f4d5" />
    </ToolbarShell>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 border-t border-[#E8EAEF] px-4 py-3 text-sm font-semibold text-[#121217]">
      {ui('financeReconcileFooterTotal', { amount: formatSigned(total === 0 ? 0 : (Number(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0).toFixed(2))), currency) })}
    </div>
  );

  return (
    <PanelShell
      className="border-r border-[#E8EAEF]"
      toolbar={toolbar}
      loading={loading}
      items={lines}
      renderRow={renderRow}
      footer={footer}
      headCells={(
        <>
          <TableHead className="w-8 px-0 pl-2" data-testid="TableHead__d0f4d5" />
          <TableHead className="w-[108px] px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDate')}</TableHead>
          <TableHead className="px-3" data-testid="TableHead__d0f4d5">{ui('financeReconcileColDescription')}</TableHead>
          <TableHead className="w-[139px] px-3 text-left" data-testid="TableHead__d0f4d5">{ui('financeReconcileColAmount')}</TableHead>
          <TableHead className="w-9 px-0 pr-1" data-testid="TableHead__d0f4d5" />
        </>
      )}
      data-testid="PanelShell__d0f4d5" />
  );
}

/** Right panel — candidate operations with multi-select checkbox rows. */
function CandidateOperationsPanel({
  line, candidates, loading, currency, bcpLocale, selectedIds, onToggle, search, onSearchChange,
  source, onSourceChange, sourceCounts = {}, dateRange, onDateRangeChange, footer, readOnly = false,
}) {
  const ui = useUI();

  if (!line) {
    return (
      <div className="flex min-w-[30%] flex-1 flex-col items-center justify-center px-0 text-center" data-testid="recon-right-empty">
        <div className="flex w-full flex-col items-center gap-1 px-5">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F7F9] text-[#828FA3]">
            <CircleCheckBig className="h-6 w-6" data-testid="CircleCheckBig__d0f4d5" />
          </div>
          <p className="w-full text-[20px] font-semibold leading-7 text-[#121217]">{ui('financeReconcileRightEmptyTitle')}</p>
          <p className="w-full text-xs leading-4 text-[#282833]">{ui('financeReconcileRightEmptyHint')}</p>
        </div>
      </div>
    );
  }

  const renderRow = (cand) => (
    <TableRow
      key={cand.id}
      data-testid={`recon-cand-row-${cand.id}`}
      className={cn(
        'group relative h-[62px] border-b border-[#E8EAEF] bg-white transition-shadow',
        selectedIds.has(cand.id)
          ? `z-10 bg-[#F5F7F9] ${ELEVATED_SHADOW}`
          : 'hover:z-10 hover:bg-white hover:shadow-lg',
      )}
    >
      <TableCell className="h-[62px] w-8 px-0 pl-2" data-testid="TableCell__d0f4d5">
        {readOnly ? null : (
          <Checkbox
            checked={selectedIds.has(cand.id)}
            onChange={() => onToggle(cand.id)}
            data-testid={`recon-cand-check-${cand.id}`}
          />
        )}
      </TableCell>
      <DateCell
        date={cand.date}
        bcpLocale={bcpLocale}
        cellClassName="w-[104px]"
        data-testid="DateCell__d0f4d5" />
      <TableCell
        className="h-[62px] px-3 py-2 text-sm text-[#121217]"
        data-testid="TableCell__d0f4d5">
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex w-full items-center gap-1 overflow-hidden text-sm leading-5">
            <span className="shrink-0 font-normal text-[#121217]">
              {cand.documentNo || cand.description || '—'}
            </span>
            {cand.partnerName ? (
              <span className="truncate text-xs font-medium leading-4 text-[#6C6C89]">{cand.partnerName}</span>
            ) : null}
          </div>
          <StatusBadge
            kind={badgeKindFor(cand, readOnly)}
            data-testid="StatusBadge__d0f4d5" />
        </div>
      </TableCell>
      <MoneyCell
        value={cand.pendingBalance}
        currency={currency}
        cellClassName="w-[121px]"
        data-testid="MoneyCell__d0f4d5" />
      <MoneyCell
        value={cand.amount}
        currency={currency}
        bold
        cellClassName="w-[121px]"
        data-testid="MoneyCell__d0f4d5" />
    </TableRow>
  );

  const toolbar = (
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
  currency, selectedSum, remaining, canReconcile, isReconciledLine, reconcileCount, busy,
  onCancel, onReconcile,
}) {
  const ui = useUI();
  return (
    <div className="border-t border-[#E8EAEF] bg-white px-0 pt-2 pb-1">
      {/* Selection totals only make sense while building a new reconciliation; a reconciled
          line is already balanced, so the "selected / remaining" rows would be misleading. */}
      {!isReconciledLine && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-3 text-sm leading-5">
            <span className="font-medium text-[#121217]">{ui('financeReconcileBarSelected')}</span>
            <span className="font-semibold text-[#1E874C]">{formatSigned(selectedSum, currency)}</span>
          </div>
          <div className="flex items-center justify-between px-3 text-sm leading-5">
            <span className="font-medium text-[#121217]">{ui('financeReconcileBarRemaining')}</span>
            <span className={cn('font-semibold', Math.abs(remaining) <= RECONCILE_TOLERANCE ? 'text-[#1E874C]' : 'text-[#D50B3E]')}>
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
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#D1D4DB] bg-white px-3 text-sm font-medium text-[#121217] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
        >
          <X className="h-4 w-4" data-testid="X__d0f4d5" />
          {ui('financeReconcileActionCancel')}
        </button>
        <button
          type="button"
          onClick={onReconcile}
          // A reconciled line shows an enabled "Reactivar" button (the action lands in a
          // follow-up task); a pending line gates "Conciliar" on a balanced selection.
          disabled={busy || (isReconciledLine ? false : !canReconcile)}
          data-testid="recon-action-reconcile"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#121217] px-3 text-sm font-medium text-white hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:bg-[#D1D4DB] disabled:text-white disabled:hover:bg-[#D1D4DB] disabled:hover:text-white"
        >
          <CheckCircle className="h-4 w-4" data-testid="CheckCircle__d0f4d5" />
          {isReconciledLine
            ? ui('financeReconcileActionReactivate')
            : ui('financeReconcileActionReconcileCount', { count: reconcileCount })}
        </button>
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for the destructive "Reactivar" (un-reconcile) action.
 * Warns that the reconciliation will be undone and any auto-created payments
 * deleted before handing control back to the caller's {@code onConfirm}.
 */
function ReactivateConfirmDialog({ open, busy, onConfirm, onClose }) {
  const ui = useUI();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__recon-reactivate">
      <DialogContent className="max-w-md" data-testid="recon-reactivate-dialog">
        <DialogHeader data-testid="DialogHeader__recon-reactivate">
          <DialogTitle data-testid="DialogTitle__recon-reactivate">
            {ui('financeReconcileConfirmReactivateTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__recon-reactivate">
            {ui('financeReconcileConfirmReactivateBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__recon-reactivate">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            data-testid="recon-reactivate-cancel">
            {ui('financeReconcileActionCancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
            data-testid="recon-reactivate-confirm">
            {ui('financeReconcileActionReactivate')}
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
 * @param {{ accountId: string|null, currency?: string, onBack?: () => void, onReconcileSuccess?: () => void }} props
 */
export function ReconciliationSplitPanel({ accountId, currency = 'EUR', onBack, onReconcileSuccess }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  const [leftStatus, setLeftStatus] = useState('pending');
  const [leftDateRange, setLeftDateRange] = useState({ presetId: 'last30' });
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSource, setRightSource] = useState('receipts');
  const [rightDateRange, setRightDateRange] = useState({ presetId: 'last30' });
  const [rightSearch, setRightSearch] = useState('');
  const [selectedLine, setSelectedLine] = useState(null);
  const [selectedOpIds, setSelectedOpIds] = useState(() => new Set());

  const leftBounds = useMemo(() => getDateBounds(leftDateRange), [leftDateRange]);
  const rightBounds = useMemo(() => getDateBounds(rightDateRange), [rightDateRange]);

  const { lines, counts: statusCounts, loading: linesLoading, reload: reloadLines } =
    usePendingStatementLines(accountId, {
      dateFrom: toDateParam(leftBounds.from),
      dateTo: toDateParam(leftBounds.to),
    });
  const sourceMeta = SOURCE_META[rightSource] ?? SOURCE_META.receipts;
  const invoiceMode = sourceMeta.kind === 'invoices';
  const { candidates, counts: sourceCounts, loading: candLoading } = useCandidateOperations(
    accountId, selectedLine?.id ?? null, sourceMeta.docType,
    invoiceMode ? 'invoices' : null,
    toDateParam(rightBounds.from), toDateParam(rightBounds.to));
  const { reconcile, loading: reconciling } = useReconcileGroup();
  const { reactivate, loading: reactivating } = useReactivateReconciliation();
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const selectLine = (line) => {
    setSelectedLine(line);
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
    setSelectedLine(null);
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
    // A reconciled line is read-only — nothing is selectable, so never pre-select its rows.
    if (selectedLine?.status === 'reconciled') {
      setSelectedOpIds(new Set());
      return;
    }
    setSelectedOpIds(new Set(candidates.filter((c) => c.suggested).map((c) => c.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLine?.id, candLoading]);

  const selectedSum = useMemo(
    () => Number(
      candidates
        .filter((c) => selectedOpIds.has(c.id))
        .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
        .toFixed(2),
    ),
    [candidates, selectedOpIds],
  );

  const lineAmount = Number(selectedLine?.amount) || 0;
  const remaining = Number((lineAmount - selectedSum).toFixed(2));
  const isReconciledLine = selectedLine?.status === 'reconciled';
  // Invoices must COVER the line (payments are capped at the line amount). Transactions may match
  // PART of the line — the backend splits it and leaves a remainder — as long as they run in the
  // line's direction and do NOT exceed it (over-reconciliation is not supported).
  const lineSign = Math.sign(lineAmount);
  const sumSign = Math.sign(selectedSum);
  const sameDirection = sumSign === 0 || lineSign === 0 || sumSign === lineSign;
  const withinLine = Math.abs(selectedSum) <= Math.abs(lineAmount) + RECONCILE_TOLERANCE;
  const balanced = invoiceMode
    ? Math.abs(selectedSum) + RECONCILE_TOLERANCE >= Math.abs(lineAmount)
    : (sameDirection && withinLine);
  const canReconcile =
    !!selectedLine && selectedOpIds.size > 0 && balanced && !isReconciledLine;

  const handleReconcile = async () => {
    if (!canReconcile) return;
    try {
      const payload = {
        financialAccountId: accountId,
        statementLineId: selectedLine.id,
      };
      if (invoiceMode) {
        payload.invoices = candidates
          .filter((c) => selectedOpIds.has(c.id) && c.kind === 'invoice')
          .map((c) => ({ invoiceId: c.invoiceId, scheduleId: c.scheduleId }));
      } else {
        payload.operationIds = Array.from(selectedOpIds);
      }
      await reconcile(payload);
      toast.success(ui('financeReconcileToastSuccess'));
      setSelectedLine(null);
      setSelectedOpIds(new Set());
      reloadLines();
      onReconcileSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileToastError'));
    }
  };

  // Reactivate (un-reconcile) is destructive — it undoes the reconciliation and deletes any
  // auto-created payments — so it goes through a confirmation dialog before hitting the backend.
  const handleReactivate = () => {
    if (!isReconciledLine || !selectedLine) return;
    setReactivateOpen(true);
  };

  const confirmReactivate = async () => {
    if (!selectedLine) return;
    try {
      await reactivate({
        financialAccountId: accountId,
        statementLineId: selectedLine.id,
      });
      setReactivateOpen(false);
      toast.success(ui('financeReconcileToastReactivated'));
      setSelectedLine(null);
      setSelectedOpIds(new Set());
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
              busy={reconciling || reactivating}
              onCancel={cancelSelection}
              onReconcile={isReconciledLine ? handleReactivate : handleReconcile}
              data-testid="ReconciliationActionBar__d0f4d5" />
          ) : null}
          data-testid="CandidateOperationsPanel__d0f4d5" />
      </div>
      <ReactivateConfirmDialog
        open={reactivateOpen}
        busy={reactivating}
        onConfirm={confirmReactivate}
        onClose={() => setReactivateOpen(false)}
        data-testid="ReactivateConfirmDialog__d0f4d5" />
    </div>
  );
}
