import { useState } from 'react';
import { ArrowUp, ArrowDown, LineChart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BPChartSVGContent } from './BPChartSVGContent';
import ContactsPeriodButton from './ContactsPeriodButton';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { useContactsFinance, useSyncFinanceRecordId } from './ContactsFinanceContext';

/* eslint-disable react/prop-types */

const PERIOD_MONTHS = { '3M': 3, '6M': 6 };

// ─── KPI derivation ─────────────────────────────────────────────────────────

function findKpi(stats, key) {
  return Array.isArray(stats) ? stats.find(k => k.key === key) : null;
}

// Period-aware trend: % change of the last month vs the first month of the
// selected window (e.g. 3M → Jun vs Apr). Computed from the bp-trend series so
// it stays consistent with the chart and actually changes with the period.
// Returns null when the window has fewer than 2 points or the base month is
// zero / non-finite (no badge is shown in that case).
function windowTrend(arr, months) {
  if (!Array.isArray(arr)) return null;
  const w = arr.slice(-months);
  if (w.length < 2) return null;
  const first = w[0];
  const last = w[w.length - 1];
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
  const t = ((last - first) / Math.abs(first)) * 100;
  return Number.isFinite(t) ? t : null;
}

function buildKpis(stats, trend, period) {
  const revenue = findKpi(stats, 'revenueThisMonth');
  const expenses = findKpi(stats, 'expensesThisMonth');
  const revVal = revenue?.value ?? 0;
  const expVal = expenses?.value ?? 0;
  const months = PERIOD_MONTHS[period] ?? 3;
  const revArr = trend?.revenue ?? [];
  const expArr = trend?.expenses ?? [];
  const netArr = revArr.map((r, i) => (r ?? 0) - (expArr[i] ?? 0));
  const netVal = revVal - expVal;
  return [
    { key: 'netBalance', labelKey: 'bpNetBalance', value: netVal,
      trend: netVal === 0 ? null : windowTrend(netArr, months), positiveTone: netVal >= 0 },
    { key: 'income', labelKey: 'bpRevenue', value: revVal,
      trend: revVal === 0 ? null : windowTrend(revArr, months), positiveTone: true },
    { key: 'expenses', labelKey: 'bpExpenses', value: expVal,
      trend: expVal === 0 ? null : windowTrend(expArr, months), positiveTone: false },
  ];
}

// ─── Trend badge ────────────────────────────────────────────────────────────

function TrendBadge({ trend, period, ui }) {
  if (trend == null) return null;
  const up = trend >= 0;
  const vsLabel = period === '3M' ? ui('bpVsLast3Months') : ui('bpVsLast6Months');
  const Arrow = up ? ArrowUp : ArrowDown;
  const pct = `${up ? '+' : '−'}${Math.abs(Math.round(trend))}%`;
  return (
    <span
      className="flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-normal whitespace-nowrap"
      style={{
        background: up ? 'var(--status-success-bg)' : 'var(--status-destructive-bg)',
        color: up ? 'var(--status-success-fg)' : 'hsl(var(--destructive))',
      }}
    >
      <Arrow
        className="h-4 w-4 shrink-0"
        style={{ color: up ? 'var(--status-success-fg)' : 'hsl(var(--destructive))' }}
        data-testid="Arrow__22ed51" />
      {`${pct} ${vsLabel}`}
    </span>
  );
}

function KpiBlock({ kpi, period, currencyCode, ui }) {
  const valueColor = kpi.positiveTone ? 'var(--status-success-fg)' : 'hsl(var(--destructive))';
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
      <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] truncate">{ui(kpi.labelKey)}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base font-medium leading-6" style={{ color: valueColor }}>
          {formatCurrency(currencyCode ?? 'USD', kpi.value)}
        </span>
        <TrendBadge
          trend={kpi.trend}
          period={period}
          ui={ui}
          data-testid="TrendBadge__22ed51" />
      </div>
    </div>
  );
}

// ─── Chart modal ────────────────────────────────────────────────────────────

function ChartLegend({ ui }) {
  return (
    <div className="flex items-center gap-5">
      <span className="flex items-center gap-2 text-xs font-normal text-[hsl(var(--foreground))]">
        <span className="inline-block w-[14px] h-1 rounded-sm bg-[var(--status-success-fg)]" />
        {ui('bpRevenue')}
      </span>
      <span className="flex items-center gap-2 text-xs font-normal text-[hsl(var(--foreground))]">
        <span className="inline-block w-[14px] h-1 rounded-sm bg-[hsl(var(--destructive))]" />
        {ui('bpExpenses')}
      </span>
    </div>
  );
}

/**
 * "Ventas y compras" dialog (Figma node "Dialog", 720 wide, radius md). ETP-5600: the dialog no
 * longer has its own 3/6-month toggle — the period is chosen only with the summary's period
 * selector and the chart follows that same `period` from ContactsFinanceContext. Order is
 * title, legend, chart. `bg-popover` (the overlay surface token: white in light theme) replaces
 * the core DialogContent default `bg-background`, which is the grey page colour.
 */
function ChartDialog({ open, onOpenChange, trend, period, currencyCode, ui }) {
  const { locale } = useLocaleSwitch();

  const labels = trend?.labels ?? [];
  const revenue = trend?.revenue ?? [];
  const expenses = trend?.expenses ?? [];

  const bcp47 = locale === 'es_ES' ? 'es-ES' : 'en-US';
  const fmt = new Intl.DateTimeFormat(bcp47, { month: 'short' });
  const localizedLabels = labels.map((_, i) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - (labels.length - 1 - i), 1);
    const s = fmt.format(d);
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
  });
  const n = PERIOD_MONTHS[period] ?? 3;
  const sl = (arr) => arr.slice(-n);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="Dialog__22ed51">
      <DialogContent
        className="max-w-[720px] w-full bg-popover text-popover-foreground sm:rounded-md"
        data-testid="DialogContent__22ed51">
        <DialogHeader data-testid="DialogHeader__22ed51">
          <DialogTitle data-testid="DialogTitle__22ed51">
            <span className="block pr-8">{ui('bpSalesPurchases')}</span>
          </DialogTitle>
        </DialogHeader>
        <ChartLegend ui={ui} data-testid="ChartLegend__22ed51" />
        <BPChartSVGContent
          labels={sl(localizedLabels)}
          revenue={sl(revenue)}
          expenses={sl(expenses)}
          CW={672}
          CH={400}
          PX={48}
          PY={16}
          PB={28}
          fontSize={12}
          chartId="contacts-summary-chart"
          orgCurrency={currencyCode ?? 'USD'}
          data-testid="BPChartSVGContent__22ed51" />
      </DialogContent>
    </Dialog>
  );
}

// ─── Widget ─────────────────────────────────────────────────────────────────

/**
 * Horizontal financial summary rendered in the DetailView `headerContent` slot,
 * above the General form (and at the top of ContactsFinancialPanel). Replaces the
 * former right-side sidebar: three KPIs (Net Balance / Income / Expenses) with
 * trend badges, the period selector (ContactsPeriodButton, ETP-5600 — formerly in
 * the tabs bar) and a "View chart" button that opens the trend chart in a dialog.
 */
export default function ContactsSummaryWidget({ data, optionalProvider = false }) {
  const ui = useUI();
  const currencyCode = useCurrency();
  const finance = useContactsFinance({ optional: optionalProvider });
  const [chartOpen, setChartOpen] = useState(false);

  useSyncFinanceRecordId(data?.id, { optional: optionalProvider });

  if (!finance) return null;

  const { stats, trend, period } = finance;

  // Hide entirely until the record is saved — there are no stats for a draft.
  if (!data?.id) return null;

  const loading = stats === null;
  const kpis = buildKpis(stats, trend, period);

  return (
    // ETP-5600 spacing: no top padding (the tabs bar above already has 8px below it) and
    // pb-3 so, with the form card's own 8px padding, the summary sits 20px above the inputs.
    <div className="px-2 pb-3">
      <div className="flex flex-row items-center justify-between gap-5 border border-[hsl(var(--border-subtle))] rounded-lg px-3 py-2 min-h-14">
        {loading ? (
          <>
            <div className="h-10 rounded bg-muted animate-pulse flex-1" />
            <div className="h-10 rounded bg-muted animate-pulse flex-1" />
            <div className="h-10 rounded bg-muted animate-pulse flex-1" />
          </>
        ) : (
          kpis.map((kpi) => (
            <KpiBlock
              key={kpi.key}
              kpi={kpi}
              period={period}
              currencyCode={currencyCode}
              ui={ui}
              data-testid="KpiBlock__22ed51" />
          ))
        )}
        <div className="shrink-0 flex items-center gap-2">
          <ContactsPeriodButton data-testid="ContactsPeriodButton__22ed51" />
          <button
            type="button"
            onClick={() => setChartOpen(true)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 h-8 bg-[hsl(var(--muted))] rounded-lg text-sm font-medium text-[hsl(var(--foreground))] hover:brightness-95 transition-all"
          >
            <LineChart className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="LineChart__22ed51" />
            {ui('bpViewChart')}
          </button>
        </div>
      </div>
      <ChartDialog
        open={chartOpen}
        onOpenChange={setChartOpen}
        trend={trend}
        period={period}
        currencyCode={currencyCode}
        ui={ui}
        data-testid="ChartDialog__22ed51" />
    </div>
  );
}
