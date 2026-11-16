import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { kpiTrend } from './reportVisuals.js';

const fmt = (v) => formatCurrency(null, v);
const PILL_CLASS = {
  improves: 'bg-status-success text-status-success-foreground',
  worsens: 'bg-destructive/10 text-destructive',
};

/** ▲/▼ pill with the change of a figure, green when it is good news, red when it is not. */
export function TrendPill({ trend, up, children, testId }) {
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
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

/** The change against the compared period: points for a percentage, a relative % otherwise. */
function kpiDelta(value, refValue, percent) {
  if (value == null || refValue == null || value === refValue) return null;
  if (percent) return `${fmt(value - refValue)} pp`;
  if (!refValue) return null;
  return `${fmt(((value - refValue) / Math.abs(refValue)) * 100)} %`;
}

function resultTone(result) {
  if (result > 0) return 'border-border/60 bg-card shadow-[inset_3px_0_0_hsl(var(--accent-highlight))]';
  if (result < 0) return 'border-border/60 bg-card shadow-[inset_3px_0_0_hsl(var(--destructive))]';
  return null;
}

function Kpi({ id, label, hint, value, refValue, compare, percent, tone }) {
  const ui = useUI();
  const trend = kpiTrend(id, value, refValue);
  const text = (v) => kpiText(v, percent);
  const delta = compare ? kpiDelta(value, refValue, percent) : null;
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col gap-1', tone || 'border-border/60 bg-card')} data-testid={`DynamicReportKpis__${id}`}>
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <Tooltip delayDuration={200} data-testid="Tooltip__5cc5db">
          <TooltipTrigger asChild data-testid="TooltipTrigger__5cc5db">
            <button type="button" className="rounded-full hover:text-foreground" aria-label={hint} data-testid={`DynamicReportKpis__${id}Info`}>
              <Info className="w-3.5 h-3.5" aria-hidden="true" data-testid="Info__5cc5db" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            className="max-w-xs normal-case tracking-normal font-normal"
            data-testid="TooltipContent__5cc5db">{hint}</TooltipContent>
        </Tooltip>
      </span>
      <span className="text-2xl font-semibold tabular-nums" data-testid={`DynamicReportKpis__${id}Value`}>{text(value)}</span>
      {compare && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta && <TrendPill
            trend={trend}
            up={value > refValue}
            testId={`DynamicReportKpis__${id}Trend`}
            data-testid="TrendPill__5cc5db">{delta}</TrendPill>}
          <span className="tabular-nums">{ui('dynamicReportKpiVs', { value: text(refValue) })}</span>
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
  const { current: c, ref: r } = kpis;
  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="DynamicReportKpis">
        <Kpi
          id="income"
          label={ui('dynamicReportKpiIncome')}
          hint={ui('dynamicReportKpiIncomeHint')}
          value={c.income}
          refValue={r.income}
          compare={compare}
          data-testid="Kpi__5cc5db" />
        <Kpi
          id="expenses"
          label={ui('dynamicReportKpiExpenses')}
          hint={ui('dynamicReportKpiExpensesHint')}
          value={c.expenses}
          refValue={r.expenses}
          compare={compare}
          data-testid="Kpi__5cc5db" />
        <Kpi
          id="result"
          label={ui('dynamicReportKpiResult')}
          hint={ui('dynamicReportKpiResultHint')}
          value={c.result}
          refValue={r.result}
          compare={compare}
          tone={resultTone(c.result)}
          data-testid="Kpi__5cc5db" />
        <Kpi
          id="margin"
          label={ui('dynamicReportKpiMargin')}
          hint={ui('dynamicReportKpiMarginHint')}
          value={c.margin}
          refValue={r.margin}
          compare={compare}
          percent
          data-testid="Kpi__5cc5db" />
      </div>
    </TooltipProvider>
  );
}
