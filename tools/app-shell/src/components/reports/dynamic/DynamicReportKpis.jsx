import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon } from '@phosphor-icons/react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { kpiCards } from './reportVisuals.js';

const fmt = (v) => formatCurrency(null, v);
const PILL_CLASS = {
  improves: 'bg-status-success text-status-success-foreground',
  worsens: 'bg-destructive/10 text-destructive',
};

/** ▲/▼ pill with the change of a figure, green when it is good news, red when it is not. */
export function TrendPill({ trend, up, children, testId }) {
  const Arrow = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', PILL_CLASS[trend] || 'bg-muted text-muted-foreground')}
      data-testid={testId}
    >
      <Arrow className="w-3 h-3" aria-hidden="true" data-testid="Arrow__5cc5db" />
      {children}
    </span>
  );
}

function kpiText(v, percent) {
  if (v == null) return '—';
  return percent ? `${fmt(v)} %` : fmt(v);
}

const TONE_CLASS = {
  positive: 'border-border/60 bg-card shadow-[inset_3px_0_0_hsl(var(--accent-highlight))]',
  negative: 'border-border/60 bg-card shadow-[inset_3px_0_0_hsl(var(--destructive))]',
};

function Kpi({ card: { id, value, refValue, percent, delta, trend, up, tone }, label, hint, compare }) {
  const ui = useUI();
  const text = (v) => kpiText(v, percent);
  return (
    <div className={cn('min-w-0 rounded-xl border p-4 flex flex-col gap-1', TONE_CLASS[tone] || 'border-border/60 bg-card')} data-testid={`DynamicReportKpis__${id}`}>
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <Tooltip delayDuration={200} data-testid="Tooltip__5cc5db">
          <TooltipTrigger asChild data-testid="TooltipTrigger__5cc5db">
            <button type="button" className="rounded-full hover:text-foreground" aria-label={hint} data-testid={`DynamicReportKpis__${id}Info`}>
              <InfoIcon className="w-3.5 h-3.5" aria-hidden="true" data-testid="Info__5cc5db" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            className="max-w-xs normal-case tracking-normal font-normal"
            data-testid="TooltipContent__5cc5db">{hint}</TooltipContent>
        </Tooltip>
      </span>
      <span className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap" data-testid={`DynamicReportKpis__${id}Value`}>{text(value)}</span>
      {compare && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-xs text-muted-foreground">
          {delta && <TrendPill
            trend={trend}
            up={up}
            testId={`DynamicReportKpis__${id}Trend`}
            data-testid="TrendPill__5cc5db">{`${fmt(delta.amount)} ${delta.unit}`}</TrendPill>}
          <span className="tabular-nums whitespace-nowrap">{ui('dynamicReportKpiVs', { value: text(refValue) })}</span>
        </span>
      )}
    </div>
  );
}

/**
 * ETP-6080 — the four headline figures of a result report above its tree: income, expenses, result
 * and margin, each with its change against the compared period when comparing.
 */
export default function DynamicReportKpis({ kpis, compare }) {
  const ui = useUI();
  const cards = kpiCards(kpis, compare);
  const [income, expenses, result, margin] = cards;
  const shared = { compare, 'data-testid': 'Kpi__5cc5db' };
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5" data-testid="DynamicReportKpis">
        <Kpi
          card={income}
          label={ui('dynamicReportKpiIncome')}
          hint={ui('dynamicReportKpiIncomeHint')}
          {...shared}
          data-testid="Kpi__5cc5db" />
        <Kpi
          card={expenses}
          label={ui('dynamicReportKpiExpenses')}
          hint={ui('dynamicReportKpiExpensesHint')}
          {...shared}
          data-testid="Kpi__5cc5db" />
        <Kpi
          card={result}
          label={ui('dynamicReportKpiResult')}
          hint={ui('dynamicReportKpiResultHint')}
          {...shared}
          data-testid="Kpi__5cc5db" />
        <Kpi
          card={margin}
          label={ui('dynamicReportKpiMargin')}
          hint={ui('dynamicReportKpiMarginHint')}
          {...shared}
          data-testid="Kpi__5cc5db" />
      </div>
    </TooltipProvider>
  );
}
