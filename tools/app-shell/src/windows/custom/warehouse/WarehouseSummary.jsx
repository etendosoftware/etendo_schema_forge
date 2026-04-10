import { useState } from 'react';
import { LineChart, BarChart2, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { useWarehouseStock } from './useWarehouseStock';

// Sidebar chart dimensions
const CW = 440;
const CH = 280;
// Modal chart dimensions
const CW_MODAL = 760;
const CH_MODAL = 400;

const PAD_X = 44;
const PAD_Y = 16;
const PAD_BOTTOM = 28;
const BAR_PAD_X = 12;
const BAR_PAD_Y = 10;
const BAR_PAD_BOTTOM = 28;

const RANGE_OPTIONS = [
  { label: '2M', months: 2 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '12M', months: 12 },
];

function buildWindow(monthsBack) {
  const now = new Date();
  return Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

function buildChartData(transactions, monthsBack) {
  const window = buildWindow(monthsBack);
  return window.map(({ year, month }) => {
    let total = 0;
    for (const tx of transactions) {
      const d = new Date(tx.movementDate);
      const ty = d.getFullYear(), tm = d.getMonth();
      if (ty < year || (ty === year && tm <= month)) {
        total += Number(tx.movementQuantity) || 0;
      }
    }
    return Math.max(0, total);
  });
}

function buildLabels(monthsBack) {
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
  return buildWindow(monthsBack).map(({ year, month }) => {
    const s = fmt.format(new Date(year, month, 1));
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
  });
}

function fmtY(val) {
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(0) + 'k';
  return String(Math.round(val));
}

function fmtNum(val) {
  return Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Floating tooltip rendered inside the SVG. */
function SvgTooltip({ x, y, label, value, cw, ui }) {
  const text = ui('warehouseTooltipUnits', { label, n: fmtNum(value) });
  const TW = Math.min(text.length * 6.2 + 16, 200);
  const TH = 22;
  const tx = Math.min(Math.max(x - TW / 2, 4), cw - TW - 4);
  // Flip below the point if there isn't enough room above
  const ty = y - TH - 8 < 4 ? y + 10 : y - TH - 8;
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={TW} height={TH} rx="4" fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x={tx + TW / 2} y={ty + TH / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="500" fill="hsl(var(--popover-foreground))">
        {text}
      </text>
    </g>
  );
}

/** Pure SVG chart — accepts explicit dimensions so it can be used at any size. */
function StockSvg({ values, labels, chartType, cw, ch }) {
  const ui = useUI();
  const [hovered, setHovered] = useState(null); // { i, x, y }
  const n = values.length;
  const showLine = chartType === 'line' && n > 1;

  // Line chart geometry
  const maxVal = Math.max(...values, 0);
  const range = maxVal || 1;
  const plotW = cw - PAD_X * 2;
  const plotH = ch - PAD_Y - PAD_BOTTOM;

  const toPoint = (v, i) => ({
    x: n === 1 ? PAD_X + plotW / 2 : PAD_X + (i / (n - 1)) * plotW,
    y: PAD_Y + plotH - (v / range) * plotH,
  });
  const pts = values.map((v, i) => toPoint(v, i));
  const toPolyline = (p) => p.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const toFillPath = (p) => [
    `M ${p[0].x},${p[0].y}`,
    ...p.slice(1).map((pt) => `L ${pt.x},${pt.y}`),
    `L ${p[p.length - 1].x},${PAD_Y + plotH}`,
    `L ${p[0].x},${PAD_Y + plotH}`,
    'Z',
  ].join(' ');

  // Bar chart geometry
  const barPlotW = cw - PAD_X - BAR_PAD_X;
  const barPlotH = ch - BAR_PAD_Y - BAR_PAD_BOTTOM;
  const barMaxVal = Math.max(...values, 1);
  const barSlotW = barPlotW / n;
  const barW = Math.min(barSlotW * 0.65, 56);
  const barGap = (barSlotW - barW) / 2;
  const lastIdx = n - 1;

  const gradId = `wh-stock-grad-${cw}`; // unique per size to avoid SVG id collision

  if (showLine) {
    return (
      <svg viewBox={`0 0 ${cw} ${ch}`} className="w-full h-auto" role="img" aria-label="Stock trend">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD_Y + plotH - frac * plotH;
          return (
            <g key={frac}>
              <line x1={PAD_X} y1={y} x2={cw - PAD_X} y2={y} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 4" />
              <text x={PAD_X - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">
                {fmtY(frac * maxVal)}
              </text>
            </g>
          );
        })}
        <path d={toFillPath(pts)} fill={`url(#${gradId})`} />
        <polyline points={toPolyline(pts)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={hovered?.i === i ? 5 : 3}
            fill="hsl(var(--background))" stroke="#10b981" strokeWidth="2"
            style={{ cursor: 'default', transition: 'r 0.1s' }}
            onMouseEnter={() => setHovered({ i, x: p.x, y: p.y })}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {labels.map((m, i) => (
          <text
            key={i}
            x={n === 1 ? PAD_X + plotW / 2 : PAD_X + (i / (n - 1)) * plotW}
            y={ch - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {m}
          </text>
        ))}
        {hovered && (
          <SvgTooltip x={hovered.x} y={hovered.y} label={labels[hovered.i]} value={values[hovered.i]} cw={cw} ui={ui} />
        )}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${cw} ${ch}`} className="w-full h-auto" role="img" aria-label="Stock bar chart">
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = BAR_PAD_Y + barPlotH - frac * barPlotH;
        return (
          <g key={frac}>
            <line x1={PAD_X} y1={y} x2={cw - BAR_PAD_X} y2={y} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 4" />
            <text x={PAD_X - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">
              {fmtY(frac * barMaxVal)}
            </text>
          </g>
        );
      })}
      {values.map((v, i) => {
        const bH = Math.max((v / barMaxVal) * barPlotH, v > 0 ? 3 : 0);
        const x = PAD_X + i * barSlotW + barGap;
        const y = BAR_PAD_Y + barPlotH - bH;
        const tipX = x + barW / 2;
        const tipY = y;
        return (
          <g key={i}
            onMouseEnter={() => setHovered({ i, x: tipX, y: tipY })}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'default' }}
          >
            <rect x={x} y={y} width={barW} height={bH} rx="3"
              fill={hovered?.i === i ? '#10b981' : (i === lastIdx ? '#10b981' : 'rgba(16,185,129,0.35)')}
              opacity={hovered?.i === i && i !== lastIdx ? 0.6 : 1}
            />
            <text x={tipX} y={ch - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
              {labels[i]}
            </text>
          </g>
        );
      })}
      {hovered && (
        <SvgTooltip x={hovered.x} y={hovered.y} label={labels[hovered.i]} value={values[hovered.i]} cw={cw} />
      )}
    </svg>
  );
}

function StockChart({ transactions }) {
  const ui = useUI();
  const [chartType, setChartType] = useState(
    () => localStorage.getItem('warehouse_chart_type') || 'line',
  );
  const [monthsBack, setMonthsBack] = useState(
    () => { const v = Number(localStorage.getItem('warehouse_chart_range')); return [2, 3, 6, 12].includes(v) ? v : 6; },
  );
  const [maximized, setMaximized] = useState(false);

  const switchType = (t) => { setChartType(t); localStorage.setItem('warehouse_chart_type', t); };
  const switchRange = (m) => { setMonthsBack(m); localStorage.setItem('warehouse_chart_range', String(m)); };

  const values = buildChartData(transactions, monthsBack);
  const labels = buildLabels(monthsBack);
  const hasData = values.some((v) => v > 0);

  const toolbar = (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center border rounded-md overflow-hidden">
        {RANGE_OPTIONS.map(({ label, months }) => (
          <button
            key={months}
            onClick={() => switchRange(months)}
            className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${monthsBack === months ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center border rounded-md overflow-hidden">
        <button
          onClick={() => switchType('line')}
          className={`p-1 transition-colors ${chartType === 'line' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          title="Line chart"
        >
          <LineChart className="h-3 w-3" />
        </button>
        <button
          onClick={() => switchType('bar')}
          className={`p-1 transition-colors ${chartType === 'bar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          title="Bar chart"
        >
          <BarChart2 className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={() => setMaximized(true)}
        className="p-1 border rounded-md text-muted-foreground hover:bg-muted transition-colors"
        title="Expand chart"
      >
        <Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{ui('warehouseStockTrend')}</span>
          {toolbar}
        </div>
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-10 text-center">{ui('warehouseNoMovementData')}</p>
        ) : (
          <StockSvg values={values} labels={labels} chartType={chartType} cw={CW} ch={CH} />
        )}
      </div>

      <Dialog open={maximized} onOpenChange={setMaximized}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-sm font-medium">{ui('warehouseStockTrend')}</DialogTitle>
              {toolbar}
            </div>
          </DialogHeader>
          {!hasData ? (
            <p className="text-xs text-muted-foreground py-10 text-center">{ui('warehouseNoMovementData')}</p>
          ) : (
            <StockSvg values={values} labels={labels} chartType={chartType} cw={CW_MODAL} ch={CH_MODAL} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function WarehouseSummary({ data, token, apiBaseUrl }) {
  const ui = useUI();
  const { loading, error, products, transactions } = useWarehouseStock(data?.id, token, apiBaseUrl);

  const totalProducts = products.length;
  const totalUnits = products.reduce((sum, p) => sum + p.qty, 0);

  if (loading) return <div className="text-sm text-muted-foreground py-4">{ui('warehouseLoadingStock')}</div>;
  if (error) return <div className="text-sm text-destructive py-4">{ui('warehouseStockError')}</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{ui('warehouseProducts')}</p>
          <p className="text-2xl font-light tabular-nums">{fmtNum(totalProducts)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{ui('warehouseTotalUnits')}</p>
          <p className="text-2xl font-light tabular-nums">{fmtNum(totalUnits)}</p>
        </div>
      </div>
      <StockChart transactions={transactions} />
    </div>
  );
}
