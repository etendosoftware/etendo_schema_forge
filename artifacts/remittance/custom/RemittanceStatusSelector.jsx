import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import RemittanceSentDialog from './RemittanceSentDialog.jsx';
import RemittanceCollectDialog from './RemittanceCollectDialog.jsx';
import { RemittanceStatusChip } from './RemittanceStatusChange.jsx';

// The flow's statuses in order and the step that moves a remittance there: the only valid transitions
// today are PR -> SB (markSent) and SB -> CT (markCollected). There is no way back and no PR -> CT in
// the UI.
const FLOW = [
  { status: 'PR', from: null, Dialog: null },
  { status: 'SB', from: 'PR', Dialog: RemittanceSentDialog },
  { status: 'CT', from: 'SB', Dialog: RemittanceCollectDialog },
];

/** The statuses the selector is offered on: a Pendiente de envío or Enviada al banco remittance. */
export const SELECTABLE_STATUSES = new Set(['PR', 'SB']);

/**
 * ETP-6247 — the header status chip as a status selector (the Linear / Jira / Holded pattern), in the
 * window's `topbarExtra` slot. On a Pendiente de envío (PR) or Enviada al banco (SB) remittance it
 * replaces the plain status pill (hidden for those statuses by WINDOW_HIDE_STATUS_PILL_FOR) with the
 * same chip plus a chevron; clicking it opens a popover that lists the three flow statuses as chips:
 * the current one dimmed and marked, the one valid transition clickable, the rest dimmed but listed.
 * Choosing the valid one opens the same dialog as the grid's row menu (RemittanceSentDialog /
 * RemittanceCollectDialog, with the «A → B» chips), which posts the action and refreshes the record
 * through `onRefresh`. On any other status it renders nothing: the plain pill stays as it is.
 */
export default function RemittanceStatusSelector({ data, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(null);
  const current = data?.remittanceStatus;
  if (!data?.id || !SELECTABLE_STATUSES.has(current)) return null;
  const StepDialog = step?.Dialog ?? null;
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={ui('remittanceChangeStatus')}
            title={ui('remittanceChangeStatus')}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-testid="remittance-status-selector">
            <RemittanceStatusChip status={current} data-testid="RemittanceStatusChip__selector" />
            <ChevronDown className="mr-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" data-testid="ChevronDown__selector" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto min-w-[200px] p-2" data-testid="remittance-status-menu">
          <div role="menu" className="flex flex-col gap-1">
            {FLOW.map(({ status, from, Dialog }) => {
              const isCurrent = status === current;
              const allowed = Boolean(Dialog) && from === current;
              return (
                <button
                  key={status}
                  type="button"
                  role="menuitem"
                  disabled={!allowed}
                  aria-current={isCurrent ? 'true' : undefined}
                  data-current={isCurrent ? 'true' : undefined}
                  data-testid={`remittance-status-option-${status}`}
                  onClick={() => { setOpen(false); setStep({ Dialog }); }}
                  className={cn(
                    'flex items-center rounded-lg px-2 py-1.5 text-left transition-colors',
                    allowed ? 'cursor-pointer hover:bg-secondary' : 'cursor-not-allowed opacity-50',
                    isCurrent && 'bg-muted/60',
                  )}>
                  <RemittanceStatusChip status={status} data-testid="RemittanceStatusChip__option" />
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {StepDialog && (
        <StepDialog
          record={data}
          apiBaseUrl={apiBaseUrl}
          onRefresh={onRefresh}
          onClose={() => setStep(null)}
          data-testid="StepDialog__selector" />
      )}
    </>
  );
}
