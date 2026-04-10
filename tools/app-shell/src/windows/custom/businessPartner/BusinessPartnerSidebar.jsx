import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUI, useLocaleSwitch } from '@/i18n';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(value);
}

function formatY(v) {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

function MiniKPICard({ label, value, trend, format, accentColor }) {
  const display = format === 'currency' ? formatCurrency(value) : value;
  const hasTrend = trend !== null && trend !== 0;
  const up = trend > 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
      <p className={`text-xl font-bold ${accentColor}`}>{display}</p>
      {hasTrend ? (
        <span className={`flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-emerald-600' : 'text-destructive'}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {up ? '+' : ''}{trend.toFixed(1)}%
        </span>
      ) : (
        <span className="h-4" />
      )}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
];

function BPChartSVGContent({
  labels = [], revenue = [], expenses = [],
  CW, CH, PX, PY, PB, fontSize = 9, chartId = 'bp',
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const plotW = CW - PX * 2;
  const plotH = CH - PY - PB;

  const allVals = [...revenue, ...expenses];
  const maxVal = Math.max(...allVals, 0);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const toPoint = (v, i, len) => ({
    x: PX + (len <= 1 ? plotW / 2 : (i / (len - 1)) * plotW),
    y: PY + plotH - ((v - minVal) / range) * plotH,
  });

  const revPts = revenue.map((v, i) => toPoint(v, i, revenue.length));
  const expPts = expenses.map((v, i) => toPoint(v, i, expenses.length));

  const toLine = (pts) =>
    pts.length === 0 ? '' : pts.map((p) => `${p.x},${p.y}`).join(' ');

  const toArea = (pts) => {
    if (pts.length === 0) return '';
    return [
      `M ${pts[0].x},${pts[0].y}`,
      ...pts.slice(1).map((p) => `L ${p.x},${p.y}`),
      `L ${pts[pts.length - 1].x},${PY + plotH}`,
      `L ${pts[0].x},${PY + plotH}`,
      'Z',
    ].join(' ');
  };

  const hasData = allVals.some((v) => v > 0);

  const handleMouseMove = (e) => {
    const n = revenue.length;
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const viewX = ((e.clientX - rect.left) / rect.width) * CW;
    const rawIdx = n <= 1 ? 0 : ((viewX - PX) * (n - 1)) / plotW;
    setHoveredIdx(Math.max(0, Math.min(n - 1, Math.round(rawIdx))));
  };

  // Tooltip geometry
  const TW = fontSize * 11;
  const TH = fontSize * 5.5;
  const TR = 4;
  const hx = hoveredIdx !== null && revPts[hoveredIdx] ? revPts[hoveredIdx].x : null;
  const tooltipX = hx !== null
    ? Math.max(PX, Math.min(CW - PX - TW, hx - TW / 2))
    : null;
  const hRevY = hoveredIdx !== null && revPts[hoveredIdx] ? revPts[hoveredIdx].y : null;
  const hExpY = hoveredIdx !== null && expPts[hoveredIdx] ? expPts[hoveredIdx].y : null;
  const topY = Math.min(hRevY ?? Infinity, hExpY ?? Infinity);
  const tooltipY = hoveredIdx !== null ? Math.max(PY, topY - TH - 10) : null;

  const revGradId = `${chartId}-rev-grad`;
  const expGradId = `${chartId}-exp-grad`;

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className="w-full h-auto cursor-crosshair"
      role="img"
      aria-label="Sales and purchases trend"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <defs>
        <linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={expGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity="0.2" />
          <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((frac) => {
        const y = PY + plotH - frac * plotH;
        const val = minVal + frac * range;
        return (
          <g key={frac}>
            <line x1={PX} y1={y} x2={CW - PX} y2={y}
              stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" />
            <text x={PX - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={fontSize}>
              {formatY(val)}
            </text>
          </g>
        );
      })}

      <path d={toArea(expPts)} fill={`url(#${expGradId})`} />
      <polyline points={toLine(expPts)} fill="none"
        stroke="hsl(var(--destructive))" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />
      {expPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y}
          r={hoveredIdx === i ? 3.5 : 2}
          fill="hsl(var(--background))" stroke="hsl(var(--destructive))" strokeWidth="1.5" />
      ))}

      <path d={toArea(revPts)} fill={`url(#${revGradId})`} />
      <polyline points={toLine(revPts)} fill="none"
        stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {revPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y}
          r={hoveredIdx === i ? 4 : 2.5}
          fill="hsl(var(--background))" stroke="#10b981" strokeWidth="1.5" />
      ))}

      {labels.map((lbl, i) => {
        const x = PX + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
        return (
          <text key={i} x={x} y={CH - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={fontSize}>
            {lbl}
          </text>
        );
      })}

      {!hasData && (
        <text x={CW / 2} y={PY + plotH / 2 + 4} textAnchor="middle" className="fill-muted-foreground" fontSize={fontSize}>
          No invoice data
        </text>
      )}

      {/* Hover tooltip */}
      {hoveredIdx !== null && hx !== null && (
        <>
          <line x1={hx} y1={PY} x2={hx} y2={PY + plotH}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" />
          <rect x={tooltipX} y={tooltipY} width={TW} height={TH} rx={TR} fill="#1e293b" opacity="0.95" />
          {/* Month label */}
          <text x={tooltipX + TW / 2} y={tooltipY + fontSize + 2}
            textAnchor="middle" fontSize={fontSize} fill="#94a3b8">
            {labels[hoveredIdx]}
          </text>
          {/* Revenue row */}
          <circle cx={tooltipX + 8} cy={tooltipY + fontSize * 2.6} r={fontSize * 0.4} fill="#10b981" />
          <text x={tooltipX + 15} y={tooltipY + fontSize * 2.6 + fontSize * 0.38}
            fontSize={fontSize} fontWeight="600" fill="white">
            {formatCurrency(revenue[hoveredIdx] ?? 0)}
          </text>
          {/* Expenses row */}
          <circle cx={tooltipX + 8} cy={tooltipY + fontSize * 4.2} r={fontSize * 0.4} fill="#ef4444" />
          <text x={tooltipX + 15} y={tooltipY + fontSize * 4.2 + fontSize * 0.38}
            fontSize={fontSize} fontWeight="600" fill="white">
            {formatCurrency(expenses[hoveredIdx] ?? 0)}
          </text>
        </>
      )}
    </svg>
  );
}

function ChartLegend() {
  const ui = useUI();
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        {ui('bpRevenue')}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
        {ui('bpExpenses')}
      </span>
    </div>
  );
}

function BPTrendChart({ labels = [], revenue = [], expenses = [] }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState('6M');

  // Translate backend English month abbreviations (Jan, Feb…) to current locale
  const bcp47 = locale === 'es_ES' ? 'es-ES' : 'en-US';
  const fmt = new Intl.DateTimeFormat(bcp47, { month: 'short' });
  const localizedLabels = labels.map((_, i) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - (labels.length - 1 - i), 1);
    const s = fmt.format(d);
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
  });

  const n = PERIOD_OPTIONS.find((p) => p.label === period)?.months ?? 6;
  const sl = (arr) => arr.slice(-n);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-foreground">{ui('bpSalesPurchases')}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] text-muted-foreground">{ui('bpLast6Months')}</p>
          <button
            onClick={() => setExpanded(true)}
            className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Expand chart"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      <BPChartSVGContent
        labels={localizedLabels} revenue={revenue} expenses={expenses}
        CW={320} CH={200} PX={32} PY={12} PB={22}
        fontSize={9} chartId="bp-mini"
      />

      <ChartLegend />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-4 pr-8">
                <span>{ui('bpSalesPurchases')}</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setPeriod(opt.label)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        period === opt.label
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <BPChartSVGContent
            labels={sl(localizedLabels)} revenue={sl(revenue)} expenses={sl(expenses)}
            CW={580} CH={280} PX={48} PY={16} PB={28}
            fontSize={12} chartId="bp-expanded"
          />
          <ChartLegend />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BusinessPartnerSidebar({ recordId, token, apiBaseUrl }) {
  const ui = useUI();
  const [kpis, setKpis] = useState(null);
  const [trend, setTrend] = useState(null);

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

  const kpiConfig = {
    revenueThisMonth: { label: ui('bpRevenueThisMonth'), accent: 'text-emerald-600' },
    expensesThisMonth: { label: ui('bpExpensesThisMonth'), accent: 'text-foreground' },
  };

  return (
    <div className="flex flex-col gap-4">
      {kpis === null ? (
        <div className="grid grid-cols-2 gap-2 animate-pulse">
          <div className="h-20 rounded-xl bg-gray-100" />
          <div className="h-20 rounded-xl bg-gray-100" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {kpis.map(kpi => (
            <MiniKPICard
              key={kpi.key}
              label={kpiConfig[kpi.key]?.label ?? kpi.label}
              value={kpi.value}
              trend={kpi.trend || null}
              format={kpi.format}
              accentColor={kpiConfig[kpi.key]?.accent ?? 'text-foreground'}
            />
          ))}
        </div>
      )}

      {trend === null ? (
        <div className="animate-pulse">
          <div className="h-52 rounded-xl bg-gray-100" />
        </div>
      ) : (
        <BPTrendChart
          labels={trend.labels ?? []}
          revenue={trend.revenue ?? []}
          expenses={trend.expenses ?? []}
        />
      )}
    </div>
  );
}
