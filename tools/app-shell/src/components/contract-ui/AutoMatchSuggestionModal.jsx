import { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowUpRight, Info, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MoneyAmount } from '@/components/ui/money-amount';
import { useApplySuggestions } from '@/hooks/useReconciliation';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLineDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function RuleTypeBadge({ label, tone = 'default' }) {
  const cls = {
    default: 'bg-[#F5F7F9] text-[#3F3F50]',
    rule: 'bg-[#FFF9EB] text-[#92600A]',
    new: 'bg-[#F0FAFF] text-[#0075AD]',
  }[tone] ?? 'bg-[#F5F7F9] text-[#3F3F50]';
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-1 text-xs font-normal leading-4', cls)}>
      {label}
    </span>
  );
}

function ariaCheckedValue(dash, checked) {
  if (dash) return 'mixed';
  return checked ? 'true' : 'false';
}

function formatSignedAmount(amount) {
  if (amount === 0) return '—';
  const sign = amount < 0 ? '-' : '+';
  return `${sign}${Math.abs(amount).toFixed(2).replace('.', ',')} €`;
}

/**
 * Shared checkbox control so the header select-all and the per-group checkboxes look identical:
 * a 16px box with `rounded-[4px]`, dark when active, showing a check (rows) or a dash (header).
 */
function SelectBox({ checked = false, dash = false, onClick, testId, ariaLabel }) {
  const active = checked || dash;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-checked={ariaCheckedValue(dash, checked)}
      className={cn(
        'flex h-4 w-4 flex-none cursor-pointer items-center justify-center rounded-[4px] border',
        active ? 'border-[#121217] bg-[#121217]' : 'border-[#D1D4DB] bg-white',
      )}
    >
      {dash && <span className="h-[2px] w-2 rounded-full bg-white" />}
      {checked && !dash && <Check
        className="h-3 w-3 text-white"
        strokeWidth={3}
        data-testid="Check__a89979" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function StatementContent({ group, currency }) {
  const ui = useUI();
  const line = group.statementLine ?? {};
  const opCount = (group.operations ?? []).length;
  const amount = Number(line.amount ?? 0);
  const isRule = group.origin === 'rule';

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: name (+ count) + amount */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold leading-5 text-[#121217]">
            {line.description || line.referenceNo || '—'}
          </span>
          {opCount > 0 && (
            <span className="flex-none rounded-lg bg-[#F5F7F9] px-1.5 py-0.5 text-xs text-[#3F3F50]">
              {opCount}
            </span>
          )}
        </div>
        <MoneyAmount
          value={amount}
          currency={currency || 'EUR'}
          tone={amount < 0 ? 'negative' : 'positive'}
          className="flex-none text-sm font-semibold"
          data-testid="MoneyAmount__a89979" />
      </div>
      {/* Rule badge (rule-origin groups only) */}
      {isRule && group.ruleName && (
        <div className="flex">
          <RuleTypeBadge
            label={`${ui('financeReconcileAutomatchBadgeByRule')} ${group.ruleName}`}
            tone="rule"
            data-testid="RuleTypeBadge__a89979" />
        </div>
      )}
      {/* Reference + date */}
      {line.referenceNo && (
        <span className="text-xs leading-4 text-[#6C6C89]">{line.referenceNo}</span>
      )}
      {line.date && (
        <span className="text-xs font-medium leading-4 text-[#6C6C89]">{formatLineDate(line.date)}</span>
      )}
    </div>
  );
}

function OperationRow({ op, isLast }) {
  const ui = useUI();
  const amount = Number(op.amount ?? 0);
  const isNew = op.isNew;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-3',
        !isLast && 'border-b border-[#E8EAEF]',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium leading-5 text-[#121217]">
            {isNew ? (op.name || op.glItemId || '—') : (op.partnerName || op.documentNo || '—')}
          </span>
          <RuleTypeBadge
            label={isNew ? ui('financeReconcileAutomatchBadgeNew') : (op.documentNo || op.typeLabel || '')}
            tone={isNew ? 'new' : 'default'}
            data-testid="RuleTypeBadge__a89979" />
        </div>
        {isNew && (
          <span className="text-xs leading-4 text-[#6C6C89]">
            {ui('financeReconcileAutomatchOpNew')}
          </span>
        )}
      </div>
      <div className="flex-none text-right">
        <div className={cn(
          'text-sm font-semibold leading-5',
          amount < 0 ? 'text-[#D50B3E]' : 'text-[#1E874C]',
        )}>
          {formatSignedAmount(amount)}
        </div>
        {op.date && (
          <div className="text-xs font-medium leading-4 text-[#6C6C89]">{formatLineDate(op.date)}</div>
        )}
      </div>
    </div>
  );
}

function GroupRow({ group, checked, onToggle, currency }) {
  const realOps = group.operations ?? [];
  // Rule-origin groups have no existing transaction — the system will create a payment.
  // For now this is purely visual: show one proposed "New / Create payment" operation with the
  // rule name and the statement-line amount. The actual creation is wired in a later step.
  const ops = group.origin === 'rule'
    ? [{
        id: 'new',
        isNew: true,
        name: group.ruleName,
        amount: Number(group.statementLine?.amount ?? 0),
      }]
    : realOps;

  return (
    <div className="flex flex-row items-stretch overflow-hidden rounded-lg border border-[#E8EAEF]">
      {/* Checkbox sidebar */}
      <div className="flex w-8 flex-none items-start justify-center border-r border-[#E8EAEF] bg-[#F5F7F9] px-1 py-3">
        <SelectBox
          checked={checked}
          onClick={() => onToggle(group.groupKey)}
          testId={`automatch-group-check-${group.groupKey}`}
          data-testid="SelectBox__a89979" />
      </div>
      {/* Statement line (left half) */}
      <div className="flex flex-1 items-start border-r border-[#E8EAEF] bg-white px-3 py-3">
        <div className="w-full">
          <StatementContent group={group} currency={currency} data-testid="StatementContent__a89979" />
        </div>
      </div>
      {/* Operations (right half) */}
      <div className="flex flex-1 flex-col bg-white">
        {ops.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[#6C6C89]">—</div>
        ) : (
          ops.map((op, i) => (
            <OperationRow
              key={op.id ?? i}
              op={op}
              isLast={i === ops.length - 1}
              data-testid="OperationRow__a89979" />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

/**
 * Automatch suggestion modal — two-column layout matching the Figma design:
 * left = bank statement lines (with checkboxes), right = system operations to link.
 *
 * @param {{ accountId, accountName?, groups, kpis, currency?, open, onClose, onSuccess? }} props
 */
export function AutoMatchSuggestionModal({
  accountId,
  accountName = '',
  groups = [],
  kpis = {},
  currency = 'EUR',
  open,
  onClose,
  onSuccess,
}) {
  const ui = useUI();
  const { apply, loading } = useApplySuggestions();

  const allKeys = useMemo(() => new Set(groups.map((g) => g.groupKey)), [groups]);
  const [checked, setChecked] = useState(allKeys);

  // Default to all groups checked whenever the suggestions (re)load — the initial useState only
  // runs on first render, when `groups` is still empty because autoMatch is loading.
  useEffect(() => {
    setChecked(new Set(groups.map((g) => g.groupKey)));
  }, [groups]);

  const allChecked = checked.size === groups.length && groups.length > 0;

  const toggleAll = useCallback(() => {
    setChecked(allChecked ? new Set() : allKeys);
  }, [allChecked, allKeys]);

  const onToggle = useCallback((groupKey) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const checkedGroups = useMemo(
    () => groups.filter((g) => checked.has(g.groupKey)),
    [groups, checked],
  );

  const willCreate = checkedGroups.filter((g) => g.isNew).length;
  const willLink = checkedGroups.filter((g) => !g.isNew).length;

  const handleApply = async () => {
    if (checkedGroups.length === 0 || loading) return;
    try {
      const payload = {
        financialAccountId: accountId,
        groups: checkedGroups.map((g) => ({
          statementLineId: g.statementLine?.id,
          operationIds: (g.operations ?? []).filter((o) => !o.isNew).map((o) => o.id),
          ...(g.createPayment ? { createPayment: g.createPayment } : {}),
        })),
      };
      await apply(payload);
      toast.success(ui('financeReconcileAutomatchToastSuccess', { count: checkedGroups.length }));
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err?.message || ui('financeReconcileAutomatchToastError'));
    }
  };

  const footerSummary = checkedGroups.length === 0
    ? ui('financeReconcileAutomatchFooterNone')
    : [
        willLink > 0 && ui('financeReconcileAutomatchFooterLink', { count: willLink }),
        willCreate > 0 && ui('financeReconcileAutomatchFooterCreate', { count: willCreate }),
      ].filter(Boolean).join(' ');

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__a89979">
      <DialogContent
        className="overflow-hidden p-0"
        style={{
          width: '1248px',
          maxWidth: '96vw',
          background: '#FFFFFF',
          boxShadow: '0px 0px 0px 1px rgba(18,18,23,0.1), 0px 24px 48px rgba(18,18,23,0.03), 0px 10px 18px rgba(18,18,23,0.03), 0px 5px 8px rgba(18,18,23,0.04)',
          borderRadius: '8px',
        }}
        data-testid="automatch-suggestion-modal"
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center px-5 pt-3 pb-2" style={{ height: 48, borderBottom: '1px solid #E8EAEF' }}>
          <DialogTitle
            className="m-0 text-xl font-semibold leading-7 text-[#121217]"
            data-testid="DialogTitle__a89979">
            {ui('financeReconcileAutomatchModalTitle')}
          </DialogTitle>
        </div>

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <div className="mx-5 mt-3 mb-2 flex items-center justify-between rounded-lg bg-[#F5F7F9] px-3 py-2" style={{ height: 52 }}>
          {[
            { label: ui('financeReconcileAutomatchKpiAccount'), value: accountName },
            { label: ui('financeReconcileAutomatchKpiPending'), value: kpis.pendingLines ?? 0 },
            { label: ui('financeReconcileAutomatchKpiGroups'), value: kpis.groupsFound ?? 0 },
            { label: ui('financeReconcileAutomatchKpiOps'), value: kpis.opsToLink ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-1 flex-col">
              <span className="text-xs leading-4 text-[#3F3F50]">{label}</span>
              <span className="text-sm font-medium leading-5 text-[#121217]">{value}</span>
            </div>
          ))}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col" style={{ height: 'calc(703px - 48px - 68px - 64px)', overflow: 'hidden' }}>
          {/* Column headers */}
          <div className="flex flex-row px-5 pb-0 pt-3">
            {/* Left header */}
            <div className="flex flex-1 items-center">
              {/* Select-all sits in a w-8 box so its center lines up with the per-row checkbox
                  sidebar. Shows a dash whenever there is any selection (same control as the rows). */}
              <div className="flex w-8 flex-none items-center justify-center">
                <SelectBox
                  dash={checked.size > 0}
                  onClick={toggleAll}
                  testId="automatch-select-all"
                  ariaLabel={ui('financeReconcileColSelect')}
                  data-testid="SelectBox__a89979" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold leading-6 text-[#121217]">
                  {ui('financeReconcileAutomatchColStatement')}
                </span>
                <span className="rounded-lg border border-[#D1D4DB] bg-[#F5F7F9] px-1.5 py-0.5 text-xs text-[#3F3F50]">
                  {groups.length}
                </span>
              </div>
            </div>
            {/* Right header */}
            <div className="flex flex-1 items-center pl-3">
              <span className="text-base font-semibold leading-6 text-[#121217]">
                {ui('financeReconcileAutomatchColOps')}
              </span>
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#6C6C89]">
                {ui('financeReconcileAutomatchEmpty')}
              </p>
            ) : (
              groups.map((group) => (
                <GroupRow
                  key={group.groupKey}
                  group={group}
                  checked={checked.has(group.groupKey)}
                  onToggle={onToggle}
                  currency={currency}
                  data-testid="GroupRow__a89979" />
              ))
            )}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ height: 64, borderTop: '1px solid #E8EAEF' }}
        >
          {/* Summary info */}
          <div className="flex items-center gap-1 text-sm font-medium text-[#3F3F50]">
            <Info className="h-5 w-5 flex-none text-[#828FA3]" data-testid="Info__a89979" />
            <span>{footerSummary}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              data-testid="automatch-modal-cancel"
              className="flex h-10 items-center justify-center rounded-full px-3 text-sm font-medium text-[#121217] hover:bg-[#F5F7F9]"
            >
              {ui('cancel')}
            </button>

            {/* Open reconciliation */}
            <button
              type="button"
              onClick={onClose}
              data-testid="automatch-modal-open-reconciliation"
              className="flex h-10 items-center gap-1 rounded-full border border-[#D1D4DB] bg-white px-3 text-sm font-medium text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
            >
              <ArrowUpRight className="h-5 w-5 text-[#828FA3]" data-testid="ArrowUpRight__a89979" />
              <span>{ui('financeReconcileAutomatchActionOpen')}</span>
            </button>

            {/* Apply — dark pill */}
            <button
              type="button"
              onClick={handleApply}
              disabled={checkedGroups.length === 0 || loading}
              data-testid="automatch-modal-apply"
              className={cn(
                'flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors',
                checkedGroups.length > 0 && !loading
                  ? 'bg-[#121217] text-white hover:bg-[#FFD500] hover:text-[#121217]'
                  : 'cursor-not-allowed bg-[#D1D4DB] text-[#6C6C89]',
              )}
            >
              <span>
                {loading
                  ? ui('loading')
                  : ui('financeReconcileAutomatchActionApply', { count: checkedGroups.length })}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
