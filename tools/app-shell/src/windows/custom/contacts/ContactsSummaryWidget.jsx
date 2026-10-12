import { useRef, useState } from 'react';
import { LineChart } from 'lucide-react';
import { IconicArrowUpIcon, IconicArrowDownIcon } from '@/components/ui/custom-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusTag } from '@/components/ui/status-tag';
import { BPChartSVGContent } from './BPChartSVGContent';
import ContactsPeriodButton from './ContactsPeriodButton';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { useContactsFinance, useSyncFinanceRecordId, PERIOD_MONTHS } from './ContactsFinanceContext';

/* eslint-disable react/prop-types */

// ─── KPI derivation ─────────────────────────────────────────────────────────

function findKpi(stats, key) {
  return Array.isArray(stats) ? stats.find(k => k.key === key) : null;
}

function finiteOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ETP-5600: the variation of a period block comes from bp-stats (`months`-aware):
// current window = last N calendar months, previous = the N months before. It is
// shown only when the backend reports a previous window (`hasPrevious`) and the
// trend is a finite number — never a "0%" / "∞" placeholder.
function blockTrend(block) {
  if (!block?.hasPrevious) return null;
  const t = Number(block.trend);
  return Number.isFinite(t) ? t : null;
}

// Net balance variation, computed client-side from the two blocks:
// (revCur − expCur) vs (revPrev − expPrev). Hidden when the previous net is 0
// (no base to compare to); the base uses Math.abs so a negative previous net
// still yields the real direction of the change.
function netTrend(revenue, expenses) {
  if (!revenue?.hasPrevious && !expenses?.hasPrevious) return null;
  const cur = finiteOr(revenue?.value) - finiteOr(expenses?.value);
  const prev = finiteOr(revenue?.previousValue) - finiteOr(expenses?.previousValue);
  if (prev === 0) return null;
  const t = ((cur - prev) / Math.abs(prev)) * 100;
  return Number.isFinite(t) ? t : null;
}

// Amounts are the selected period's totals (bp-stats `revenue` / `expenses`,
// net of VAT), so they follow the period selector. `goodWhenUp` drives the chip
// colour: a rise is good for revenue and net balance, bad for expenses.
function buildKpis(stats) {
  const revenue = findKpi(stats, 'revenue');
  const expenses = findKpi(stats, 'expenses');
  const revVal = finiteOr(revenue?.value);
  const expVal = finiteOr(expenses?.value);
  const netVal = revVal - expVal;
  return [
    { key: 'netBalance', labelKey: 'bpNetBalance', value: netVal,
      trend: netTrend(revenue, expenses), positiveTone: netVal >= 0, goodWhenUp: true },
    { key: 'income', labelKey: 'bpRevenue', value: revVal,
      trend: blockTrend(revenue), positiveTone: true, goodWhenUp: true },
    { key: 'expenses', labelKey: 'bpExpenses', value: expVal,
      trend: blockTrend(expenses), positiveTone: false, goodWhenUp: false },
  ];
}

// ─── Trend badge ────────────────────────────────────────────────────────────

// Direction icons: the Figma "Iconic" arrows (24-grid, filled, currentColor), so the
// arrow takes the chip's text colour (#17663A / #D50B3E).
const TREND_ICONS = { up: IconicArrowUpIcon, down: IconicArrowDownIcon };

/**
 * Variation chip (Figma "Badge sm", pill, no border): 24px high, 4px/8px padding,
 * gap 0, 16px icon then Inter 400 12/16 text. The ARROW follows the real
 * direction of the change; the COLOUR follows whether that change is good or
 * bad for the KPI (`goodWhenUp`), via the shared StatusTag success/destructive
 * tones (#EEFBF4/#17663A, #FEF0F4/#D50B3E). A change that rounds to 0% is hidden
 * like a missing one: a "0%" chip carries no information (ETP-5600).
 */
function TrendBadge({ trend, goodWhenUp, period, ui }) {
  if (trend == null) return null;
  const rounded = Math.abs(Math.round(trend));
  if (rounded === 0) return null;
  const up = trend > 0;
  const sign = up ? '+' : '\u2212';
  const vsLabel = period === '6M' ? ui('bpVsLast6Months') : ui('bpVsLast3Months');
  const Arrow = up ? TREND_ICONS.up : TREND_ICONS.down;
  const good = up === goodWhenUp;
  // StatusTag (core) does not spread extra props, so the testid lives on a wrapper.
  return (
    <span className="inline-flex shrink-0" data-testid="StatusTag__22ed51">
      <StatusTag
        tone={good ? 'success' : 'destructive'}
        className="h-6 shrink-0 tracking-[-0.005em]"
        label={(
          <>
            <Arrow className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="Arrow__22ed51" />
            <span>{`${sign}${rounded}% ${vsLabel}`}</span>
          </>
        )} />
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
          goodWhenUp={kpi.goodWhenUp}
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
  const contentRef = useRef(null);

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
        className="max-w-[720px] w-full bg-popover text-popover-foreground sm:rounded-md focus:outline-none"
        // ETP-5600 (CP-5): opening the dialog must not land focus on the close X, which
        // drew a focus ring before any keyboard interaction. Focus moves to the content
        // itself instead (Radix sets tabIndex=-1) so screen readers land inside the dialog;
        // `focus:outline-none` keeps the content from drawing a ring of its own.
        ref={contentRef}
        onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus(); }}
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
  const kpis = buildKpis(stats);

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
