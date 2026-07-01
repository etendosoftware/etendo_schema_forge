import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, LineChart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BPChartSVGContent } from './BPChartSVGContent';
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
        background: up ? '#EEFBF4' : '#FEF0F4',
        color: up ? '#17663A' : '#D50B3E',
      }}
    >
      <Arrow
        className="h-4 w-4 shrink-0"
        style={{ color: up ? '#1E874C' : '#D50B3E' }}
        data-testid="Arrow__22ed51" />
      {`${pct} ${vsLabel}`}
    </span>
  );
}

function KpiBlock({ kpi, period, currencyCode, ui }) {
  const valueColor = kpi.positiveTone ? '#17663A' : '#AF0932';
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
      <span className="text-xs font-normal text-[#3F3F50] truncate">{ui(kpi.labelKey)}</span>
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

const PERIOD_TOGGLE = [
  { value: '3M', labelKey: 'bpLast3Months' },
  { value: '6M', labelKey: 'bpLast6Months' },
];

function ChartLegend({ ui }) {
  return (
    <div className="flex items-center gap-5">
      <span className="flex items-center gap-2 text-xs font-normal text-[#121217]">
        <span className="inline-block w-[14px] h-1 rounded-sm bg-[#26A95F]" />
        {ui('bpRevenue')}
      </span>
      <span className="flex items-center gap-2 text-xs font-normal text-[#121217]">
        <span className="inline-block w-[14px] h-1 rounded-sm bg-[#F3164E]" />
        {ui('bpExpenses')}
      </span>
    </div>
  );
}

function ChartDialog({ open, onOpenChange, trend, period, currencyCode, ui }) {
  const { locale } = useLocaleSwitch();
  const [chartPeriod, setChartPeriod] = useState(period);
  useEffect(() => { setChartPeriod(period); }, [period, open]);

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
  const n = PERIOD_MONTHS[chartPeriod] ?? 3;
  const sl = (arr) => arr.slice(-n);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="Dialog__22ed51">
      <DialogContent className="max-w-2xl w-full" data-testid="DialogContent__22ed51">
        <DialogHeader data-testid="DialogHeader__22ed51">
          <DialogTitle data-testid="DialogTitle__22ed51">
            <div className="flex items-center justify-between gap-4 pr-8">
              <span>{ui('bpSalesPurchases')}</span>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {PERIOD_TOGGLE.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setChartPeriod(opt.value)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      chartPeriod === opt.value
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {ui(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <BPChartSVGContent
          labels={sl(localizedLabels)}
          revenue={sl(revenue)}
          expenses={sl(expenses)}
          CW={580}
          CH={280}
          PX={48}
          PY={16}
          PB={28}
          fontSize={12}
          chartId="contacts-summary-chart"
          orgCurrency={currencyCode ?? 'USD'}
          data-testid="BPChartSVGContent__22ed51" />
        <ChartLegend ui={ui} data-testid="ChartLegend__22ed51" />
      </DialogContent>
    </Dialog>
  );
}

// ─── Widget ─────────────────────────────────────────────────────────────────

/**
 * Horizontal financial summary rendered in the DetailView `headerContent` slot,
 * above the General form. Replaces the former right-side sidebar: three KPIs
 * (Net Balance / Income / Expenses) with trend badges, plus a "View chart"
 * button that opens the trend chart in a dialog.
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
    <div className="px-2 pt-2">
      <div className="flex flex-row items-center justify-between gap-5 border border-[#E8EAEF] rounded-lg px-3 py-2 min-h-14">
        {loading ? (
          <>
            <div className="h-10 rounded bg-gray-100 animate-pulse flex-1" />
            <div className="h-10 rounded bg-gray-100 animate-pulse flex-1" />
            <div className="h-10 rounded bg-gray-100 animate-pulse flex-1" />
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
        <button
          type="button"
          onClick={() => setChartOpen(true)}
          className="shrink-0 flex items-center gap-1 px-2 py-1 h-8 bg-[#F5F7F9] rounded-lg text-sm font-medium text-[#121217] hover:brightness-95 transition-all"
        >
          <LineChart className="h-5 w-5 text-[#828FA3]" data-testid="LineChart__22ed51" />
          {ui('bpViewChart')}
        </button>
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
