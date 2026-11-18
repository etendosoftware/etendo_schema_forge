import { ArrowRight } from 'lucide-react';
import { StatusTag } from '@/components/ui/status-tag';
import { useUI } from '@/i18n';

// The chip tone and label of each status a step moves between: the same map the grid chip and the
// detail pill read (decisions.json remittanceStatus.enumVariants / enumValues).
export const STEP_STATUS = {
  PR: { key: 'remittanceStatusPr', tone: 'warning' },
  SB: { key: 'remittanceStatusSb', tone: 'info' },
  CT: { key: 'remittanceStatusCt', tone: 'success' },
};

/** One status as its chip (the shared StatusTag, labelled and toned like the header chip). */
export function RemittanceStatusChip({ status }) {
  const ui = useUI();
  const entry = STEP_STATUS[status];
  return <StatusTag status={status} label={ui(entry.key)} tone={entry.tone} data-testid={`StatusTag__${status}`} />;
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
      <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" data-testid="ArrowRight__status-change" />
      <StatusTag status={to} label={ui(target.key)} tone={target.tone} data-testid="StatusTag__to" />
    </div>
  );
}
