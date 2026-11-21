import { ArrowRightIcon } from '@phosphor-icons/react';
import { StatusTag } from '@/components/ui/status-tag';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';
import decisions from '../decisions.json';
import { useUI } from '@/i18n';

// The chip tone and label of each status a step moves between: the same map the grid chip and the
// detail pill read (decisions.json remittanceStatus.enumVariants / enumValues).
export const STEP_STATUS = {
  PR: { key: 'remittanceStatusPr', tone: 'warning' },
  SB: { key: 'remittanceStatusSb', tone: 'info' },
  CT: { key: 'remittanceStatusCt', tone: 'success' },
};

const STATUS_VARIANTS = decisions.entities.remittance.fields.remittanceStatus.enumVariants;

/**
 * One status as the detail's standard status pill (DocumentStatusPill, the one every window's header renders:
 * 14px text, 4px 8px padding, 8px radius, tone icon), labelled and toned like the header chip. The status selector's
 * trigger and menu and the grid's «Cambiar estado» submenu use it, so the chip keeps its size when the status moves
 * between the selector (PR, SB) and the plain pill (CT, PT, ...).
 */
export function RemittanceStatusChip({ status }) {
  const ui = useUI();
  const entry = STEP_STATUS[status];
  return <DocumentStatusPill status={status} label={ui(entry.key)} enumVariants={STATUS_VARIANTS} testId={`remittance-status-chip-${status}`} />;
}

/**
 * ETP-6247 — «Pendiente de envío → Enviada al banco»: the status change a step of the remittance
 * flow makes, as two status chips (the shared StatusTag, labelled exactly as the chip in the header)
 * with an arrow between them. Shown at the top of the step dialogs.
 */
export default function RemittanceStatusChange({ from, to }) {
  const ui = useUI();
  const source = STEP_STATUS[from];
  const target = STEP_STATUS[to];
  return (
    <div className="flex items-center justify-center gap-3" data-testid="remittance-status-change" data-from={from} data-to={to}>
      <StatusTag status={from} label={ui(source.key)} tone={source.tone} data-testid="StatusTag__from" />
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" data-testid="ArrowRight__status-change" />
      <StatusTag status={to} label={ui(target.key)} tone={target.tone} data-testid="StatusTag__to" />
    </div>
  );
}
