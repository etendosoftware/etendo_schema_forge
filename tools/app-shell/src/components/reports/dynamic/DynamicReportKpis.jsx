import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
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
      <Arrow className="w-3 h-3" aria-hidden="true" />
      {children}
    </span>
  );
}

function Kpi({ id, label, value, refValue, compare, percent, tone }) {
  const ui = useUI();
  const trend = kpiTrend(id, value, refValue);
  const text = (v) => (v == null ? '—' : percent ? `${fmt(v)} %` : fmt(v));
  const delta = compare && value != null && refValue != null && value !== refValue
    ? (percent ? `${fmt(value - refValue)} pp` : (refValue ? `${fmt(((value - refValue) / Math.abs(refValue)) * 100)} %` : null))
    : null;
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col gap-1', tone || 'border-border/60 bg-card')} data-testid={`DynamicReportKpis__${id}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums" data-testid={`DynamicReportKpis__${id}Value`}>{text(value)}</span>
      {compare && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta && <TrendPill trend={trend} up={value > refValue} testId={`DynamicReportKpis__${id}Trend`}>{delta}</TrendPill>}
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
  const resultTone = c.result > 0
    ? 'border-accent-highlight bg-accent-highlight/25'
    : c.result < 0 ? 'border-destructive/40 bg-destructive/5' : null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="DynamicReportKpis">
      <Kpi id="income" label={ui('dynamicReportKpiIncome')} value={c.income} refValue={r.income} compare={compare} tone="border-primary/30 bg-primary/5" />
      <Kpi id="expenses" label={ui('dynamicReportKpiExpenses')} value={c.expenses} refValue={r.expenses} compare={compare} />
      <Kpi id="result" label={ui('dynamicReportKpiResult')} value={c.result} refValue={r.result} compare={compare} tone={resultTone} />
      <Kpi id="margin" label={ui('dynamicReportKpiMargin')} value={c.margin} refValue={r.margin} compare={compare} percent />
    </div>
  );
}
