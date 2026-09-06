import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Status pill shared by the reconciliation split panel and the automatch suggestion modal.
 *
 * It lives here rather than inside either consumer because the two surfaces describe the SAME
 * classification and must not drift: a line the left panel calls "Con diferencia" has to look and
 * read the same when the automatch modal proposes it. Before ETP-4965's QA round the modal had its
 * own private badge with its own palette and only ever labelled rule matches, so an exact suggestion
 * and a within-tolerance one were indistinguishable there.
 *
 * @param {{ kind?: string, label?: string }} props `kind` picks the palette and the default text;
 *   `label` overrides only the text, for the cases that need a value appended (the modal's
 *   "Por regla: {nombre}"). An unknown kind falls back to the neutral "pending" styling.
 */
export function StatusBadge({ kind, label }) {
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
      {label ?? ui(cfg.labelKey)}
    </span>
  );
}

/**
 * The badge kind for an automatch suggestion group. A near match outranks the rule origin because a
 * group can only be one or the other, and the near match is the one with an accounting consequence.
 *
 * @param {{ nearMatch?: boolean, origin?: string }} group one entry of the autoMatch `groups` array
 * @returns {string} a {@link StatusBadge} kind
 */
export function automatchBadgeKind(group) {
  if (group?.nearMatch) return 'difference';
  if (group?.origin === 'rule') return 'byRule';
  return 'suggested';
}

export default StatusBadge;
