import { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, ChevronDown, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BPChartSVGContent } from '@/windows/custom/businessPartner/BusinessPartnerSidebar';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';

/* eslint-disable react/prop-types */

const PERIOD_OPTIONS = [
  { value: '3M', months: 3 },
  { value: '6M', months: 6 },
];

function PeriodSelector({ period, onChangePeriod, ui }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const label = period === '3M' ? ui('bpLast3Months') : ui('bpLast6Months');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="h-10 flex items-center gap-1 px-3 bg-white border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium text-[#121217]"
      >
        <Calendar className="h-5 w-5 text-[#828FA3] shrink-0" />
        <span className="flex-1 text-left mx-1">{label}</span>
        <ChevronDown className="h-5 w-5 text-[#828FA3] shrink-0" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-50 min-w-full bg-white border border-[#D1D4DB] rounded-lg shadow-md overflow-hidden">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChangePeriod(opt.value); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[#F5F7F9] text-[#121217] ${period === opt.value ? 'font-medium' : 'font-normal'}`}
            >
              {opt.value === '3M' ? ui('bpLast3Months') : ui('bpLast6Months')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, format, color, currencyCode }) {
  const display = format === 'currency' ? formatCurrency(currencyCode ?? 'USD', value) : value;
  return (
    <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
      <p className="text-sm font-normal leading-5 text-[#3F3F50]">{label}</p>
      <p className={`text-[28px] font-medium leading-8 ${color}`}>{display}</p>
    </div>
  );
}

const KPI_CONFIG = {
  revenueThisMonth: { labelKey: 'bpRevenueThisMonth', color: 'text-[#17663A]' },
  expensesThisMonth: { labelKey: 'bpExpensesThisMonth', color: 'text-[#AF0932]' },
};

function ChartLegend() {
  const ui = useUI();
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

function ContactsChart({ labels = [], revenue = [], expenses = [], currencyCode, period = '3M' }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [expanded, setExpanded] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(period);

  useEffect(() => { setExpandedPeriod(period); }, [period]);

  const bcp47 = locale === 'es_ES' ? 'es-ES' : 'en-US';
  const fmt = new Intl.DateTimeFormat(bcp47, { month: 'short' });
  const localizedLabels = labels.map((_, i) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - (labels.length - 1 - i), 1);
    const s = fmt.format(d);
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
  });

  const n = PERIOD_OPTIONS.find((p) => p.value === period)?.months ?? 3;
  const enN = PERIOD_OPTIONS.find((p) => p.value === expandedPeriod)?.months ?? 3;
  const sl = (arr) => arr.slice(-n);
  const enSl = (arr) => arr.slice(-enN);

  return (
    <div>
      {/* Chart header: title + Expandir */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <p className="text-sm font-normal text-[#3F3F50]">{ui('bpSalesPurchases')}</p>
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-sm font-medium underline underline-offset-2 text-[#121217] hover:opacity-70 transition-opacity"
          title={ui('bpExpandChart')}
        >
          {ui('bpExpand')}
          <ArrowUpRight size={16} className="text-[#828FA3]" />
        </button>
      </div>

      {/* Legend */}
      <div className="px-4 mb-2">
        <ChartLegend />
      </div>

      {/* Chart SVG */}
      <div className="px-5">
        <BPChartSVGContent
          labels={sl(localizedLabels)} revenue={sl(revenue)} expenses={sl(expenses)}
          CW={320} CH={200} PX={32} PY={12} PB={22}
          fontSize={9} chartId="contacts-mini" orgCurrency={currencyCode ?? 'USD'}
        />
      </div>

      {/* Expanded dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-4 pr-8">
                <span>{ui('bpSalesPurchases')}</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExpandedPeriod(opt.value)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        expandedPeriod === opt.value
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {opt.value === '3M' ? ui('bpLast3Months') : ui('bpLast6Months')}
                    </button>
                  ))}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <BPChartSVGContent
            labels={enSl(localizedLabels)} revenue={enSl(revenue)} expenses={enSl(expenses)}
            CW={580} CH={280} PX={48} PY={16} PB={28}
            fontSize={12} chartId="contacts-expanded" orgCurrency={currencyCode ?? 'USD'}
          />
          <ChartLegend />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ContactsSidebar({ recordId, token, apiBaseUrl }) {
  const ui = useUI();
  const currencyCode = useCurrency();
  const [kpis, setKpis] = useState(null);
  const [trend, setTrend] = useState(null);
  const [period, setPeriod] = useState('3M');

  useEffect(() => {
    if (!recordId || !token || !apiBaseUrl) return;
    setKpis(null);
    setTrend(null);
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${apiBaseUrl}/bp-stats?businessPartnerId=${recordId}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setKpis(data?.response?.data ?? []))
      .catch(() => setKpis([]));
    fetch(`${apiBaseUrl}/bp-trend?businessPartnerId=${recordId}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setTrend(data?.response?.data ?? { labels: [], revenue: [], expenses: [] }))
      .catch(() => setTrend({ labels: [], revenue: [], expenses: [] }));
  }, [recordId, token, apiBaseUrl]);

  return (
    <div className="flex flex-col gap-3">
      {/* Cabecera: period selector */}
      <div className="pt-2 px-4">
        <PeriodSelector period={period} onChangePeriod={setPeriod} ui={ui} />
      </div>

      {/* Datos: KPI cards */}
      <div className="flex flex-row items-start gap-2 px-4 pb-3">
        {kpis === null ? (
          <>
            <div className="h-16 rounded-lg bg-gray-100 animate-pulse flex-1" />
            <div className="h-16 rounded-lg bg-gray-100 animate-pulse flex-1" />
          </>
        ) : (
          kpis.map(kpi => (
            <KPICard
              key={kpi.key}
              label={ui(KPI_CONFIG[kpi.key]?.labelKey) ?? kpi.label}
              value={kpi.value}
              format={kpi.format}
              color={KPI_CONFIG[kpi.key]?.color ?? 'text-foreground'}
              currencyCode={currencyCode}
            />
          ))
        )}
      </div>

      {/* Separador */}
      <div className="px-4">
        <div className="border-t border-[#E8EAEF]" />
      </div>

      {/* Trend chart */}
      {trend === null ? (
        <div className="px-4 pb-5 animate-pulse">
          <div className="h-52 rounded-xl bg-gray-100" />
        </div>
      ) : (
        <ContactsChart
          labels={trend.labels ?? []}
          revenue={trend.revenue ?? []}
          expenses={trend.expenses ?? []}
          currencyCode={currencyCode}
          period={period}
        />
      )}
    </div>
  );
}
