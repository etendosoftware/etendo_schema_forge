import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Box, Calendar, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { niceScale, formatDashboardAxisTick } from '@/lib/dashboardNumberFormat';

const DOT_COLORS = ['#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

// Time-range dropdown shown above the summary. Mirrors the Contacts PeriodSelector.
// Drives the inline stock-movement chart window (see `inlineMonths`).
const SIDEBAR_PERIOD_OPTIONS = [
  { value: '3M', key: 'last3Months', months: 3 },
  { value: '6M', key: 'last6Months', months: 6 },
  { value: '12M', key: 'last12Months', months: 12 },
];

function SidebarPeriodSelector({ period, onChangePeriod, ui, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = SIDEBAR_PERIOD_OPTIONS.find(o => o.value === period) ?? SIDEBAR_PERIOD_OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`h-10 flex items-center gap-1 px-3 border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium transition-colors
          ${disabled ? 'bg-[#F5F7F9] text-[#828FA3] cursor-not-allowed' : 'bg-white text-[#121217]'}`}
      >
        <Calendar
          className={`h-5 w-5 shrink-0 ${disabled ? 'text-[#C1C7D0]' : 'text-[#828FA3]'}`}
          data-testid="Calendar__59b33d" />
        <span className="flex-1 text-left mx-1">{ui(current.key)}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 ${disabled ? 'text-[#C1C7D0]' : 'text-[#828FA3]'}`}
          data-testid="ChevronDown__59b33d" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-50 min-w-full bg-white border border-[#D1D4DB] rounded-lg shadow-md overflow-hidden">
          {SIDEBAR_PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChangePeriod(opt.value); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[#F5F7F9] text-[#121217] whitespace-nowrap ${period === opt.value ? 'font-medium' : 'font-normal'}`}
            >
              {ui(opt.key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal availability widget: icon box + label + locations badge + big number.
function AvailabilityWidget({ label, value, badge }) {
  return (
    <div className="flex-1 flex items-center gap-3 pl-3 pr-2 py-2 bg-white border border-[#E8EAEF] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)]">
      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)]">
        <Box className="w-6 h-6 text-[#828FA3]" data-testid="Box__59b33d" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#3F3F50]">{label}</span>
          {badge && (
            <span className="px-2 py-1 rounded-full bg-[#F5F7F9] text-xs text-[#3F3F50] whitespace-nowrap">{badge}</span>
          )}
        </div>
        <span className="text-2xl font-medium tracking-[-0.01em] text-[#121217] leading-9">
          {value === null ? <span className="text-gray-300">—</span> : value}
        </span>
      </div>
    </div>
  );
}

// Build chart data: group by month, cumulative sum, anchor to current stock
function buildChartData(transactions, currentStock, maxMonths = 12) {
  if (!transactions || transactions.length === 0) return null;

  // Group all transactions by YYYY-MM key
  const byMonth = {};
  for (const t of transactions) {
    const d = new Date(t.movementDate);
    if (isNaN(d)) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + Number(t.movementQuantity || 0);
  }

  let months;
  if (maxMonths >= 999) {
    // "All time": use actual transaction date range, extended to current month
    const allKeys = Object.keys(byMonth).sort((a, b) => a.localeCompare(b));
    if (allKeys.length === 0) return null;
    months = allKeys;
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (months[months.length - 1] < nowKey) months = [...months, nowKey];
  } else {
    // Fixed window: generate exactly maxMonths months back from today (inclusive)
    const now = new Date();
    months = [];
    for (let i = maxMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }

  let cum = 0;
  const rawValues = months.map(m => { cum += byMonth[m] || 0; return cum; });

  // Anchor: shift so the last point equals currentStock
  const offset = currentStock != null ? currentStock - rawValues[rawValues.length - 1] : 0;
  const values = rawValues.map(v => v + offset);

  // Hide chart only if there's truly nothing to show (no movements and no stock)
  if (values.every(v => v === 0)) return null;
  return { months, values };
}

// Build the month axis used by the per-warehouse series (same fixed-window logic as buildChartData).
function buildMonthAxis(maxMonths) {
  const now = new Date();
  const months = [];
  for (let i = maxMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// One cumulative series per warehouse, anchored to each warehouse's current stock.
// `warehouses` is sortedRows ([{ binName, quantityOnHand }]); series order + color match the legend.
function buildWarehouseSeries(transactions, warehouses, locatorToWarehouse, maxMonths = 12) {
  if (!transactions || transactions.length === 0 || !warehouses || warehouses.length === 0) return null;

  const months = buildMonthAxis(maxMonths);

  const series = warehouses.map((w, i) => {
    // Bucket this warehouse's movements by month
    const byMonth = {};
    for (const t of transactions) {
      if (locatorToWarehouse[t.storageBin] !== w.binName) continue;
      const d = new Date(t.movementDate);
      if (isNaN(d)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + Number(t.movementQuantity || 0);
    }

    let cum = 0;
    const rawValues = months.map(m => { cum += byMonth[m] || 0; return cum; });

    // Anchor: shift so the last point equals this warehouse's current stock
    const offset = w.quantityOnHand != null ? w.quantityOnHand - rawValues[rawValues.length - 1] : 0;
    const values = rawValues.map(v => v + offset);

    return { name: w.binName, color: DOT_COLORS[i % DOT_COLORS.length], values };
  });

  return { months, series };
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function smoothPath(xs, ys) {
  if (xs.length < 2) return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const d = [`M${xs[0]},${ys[0]}`];
  for (let i = 1; i < xs.length; i++) {
    const cpX = (xs[i - 1] + xs[i]) / 2;
    d.push(`C${cpX},${ys[i - 1]} ${cpX},${ys[i]} ${xs[i]},${ys[i]}`);
  }
  return d.join(' ');
}

function ChartSVG({ months, values, series, W, H, PAD_X, PAD_Y, gradId, fontSize = 10, PAD_R = PAD_X, preserveAspectRatio = 'xMidYMid meet' }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Single-series (modal) vs multi-series (per-warehouse). Single keeps the original blue look.
  const multi = Array.isArray(series) && series.length > 0;
  const seriesList = multi ? series : [{ name: null, color: '#3b82f6', values }];
  const pointCount = seriesList[0].values.length;

  // Global Y scale spanning every series. Baseline is always 0 (stock can't be negative);
  // niceScale gives a rounded max + ticks, same as the dashboard / sibling charts.
  const allVals = seriesList.flatMap(s => s.values);
  const maxVal = Math.max(...allVals, 0);
  const { niceMax, ticks: yTicks } = niceScale(maxVal);

  const xStep = (W - PAD_X - PAD_R) / Math.max(pointCount - 1, 1);
  const toY = v => PAD_Y + (H - PAD_Y * 2) * (1 - Math.max(v, 0) / niceMax);
  const toX = i => PAD_X + i * xStep;

  const paths = seriesList.map((s, idx) => {
    const xs = s.values.map((_, i) => toX(i));
    const ys = s.values.map(v => toY(v));
    const linePath = smoothPath(xs, ys);
    const areaPath = `${linePath} L${xs[xs.length - 1]},${H} L${xs[0]},${H} Z`;
    return { color: s.color, idx, linePath, areaPath };
  });

  const yLabels = yTicks.map(t => ({ v: t, label: formatDashboardAxisTick(t) }));

  const n = pointCount;
  const showQuarters = n <= 48;

  const MIN_YEAR_GAP_PX = 40;
  const yearBoundaries = months.reduce((acc, m, i) => {
    const [yr, mo] = m.split('-');
    const moNum = parseInt(mo, 10);
    const prevYr = i > 0 ? months[i - 1].split('-')[0] : null;
    if (moNum === 1 || prevYr !== yr) acc.push({ i, yr, x: toX(i) });
    return acc;
  }, []);

  const shownYears = new Set();
  let lastShownX = -Infinity;
  for (const c of yearBoundaries) {
    if (c.x - lastShownX >= MIN_YEAR_GAP_PX) { shownYears.add(c.i); lastShownX = c.x; }
  }

  const xLabels = months.map((m, i) => {
    const [yr, mo] = m.split('-');
    const moNum = parseInt(mo, 10);
    const prevYr = i > 0 ? months[i - 1].split('-')[0] : null;
    const isYearBoundary = moNum === 1 || prevYr !== yr;
    if (isYearBoundary) {
      if (!shownYears.has(i)) return { x: toX(i), text: null };
      return { x: toX(i), text: `'${yr.slice(2)}`, bold: true };
    }
    if (showQuarters && (moNum === 4 || moNum === 7 || moNum === 10))
      return { x: toX(i), text: MONTH_NAMES[moNum], bold: false };
    return { x: toX(i), text: null };
  });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const viewX = (mouseX / rect.width) * W;
    const rawIdx = (viewX - PAD_X) / xStep;
    const idx = Math.max(0, Math.min(pointCount - 1, Math.round(rawIdx)));
    setHoveredIdx(idx);
  };

  const hx = hoveredIdx !== null ? toX(hoveredIdx) : null;
  const hMonth = hoveredIdx !== null ? (() => {
    const [yr, mo] = months[hoveredIdx].split('-');
    return `${MONTH_NAMES[parseInt(mo, 10)]} '${yr.slice(2)}`;
  })() : null;

  // Single-series tooltip box (modal — unchanged)
  const TW = fontSize * 5, TH = fontSize * 3.2, TR = 4;
  const hy = hoveredIdx !== null ? toY(seriesList[0].values[hoveredIdx]) : null;
  const tooltipX = hx !== null ? Math.max(PAD_X, Math.min(W - PAD_X - TW, hx - TW / 2)) : null;
  const tooltipY = hy !== null ? Math.max(PAD_Y, hy - TH - 8) : null;
  const hVal = hoveredIdx !== null ? seriesList[0].values[hoveredIdx].toLocaleString() : null;

  // Multi-series tooltip box (one row per warehouse)
  const rowH = fontSize * 1.6;
  const MTW = fontSize * 7, MTH = rowH * (seriesList.length + 1) + 6;
  const mTipX = hx !== null ? Math.max(PAD_X, Math.min(W - PAD_R - MTW, hx + 8)) : null;
  const mTipY = Math.max(PAD_Y, PAD_Y + 2);

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio={preserveAspectRatio} className="w-full h-full cursor-crosshair"
      onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredIdx(null)}>
      <defs>
        {paths.map((p) => (
          <linearGradient key={p.idx} id={`${gradId}-${p.idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>
      {yLabels.map((yl) => (
        <line key={yl.v} x1={PAD_X} y1={toY(yl.v)} x2={W - PAD_R} y2={toY(yl.v)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
      ))}
      {yLabels.map((yl) => (
        <text key={yl.label} x={PAD_X - 5} y={toY(yl.v) + 4} textAnchor="end" fontSize={fontSize} fill="#9ca3af">{yl.label}</text>
      ))}
      {paths.map((p) => (
        <path key={`area-${p.idx}`} d={p.areaPath} fill={`url(#${gradId}-${p.idx})`} />
      ))}
      {paths.map((p) => (
        <path key={`line-${p.idx}`} d={p.linePath} fill="none" stroke={p.color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {hoveredIdx !== null && !multi && (
        <>
          <line x1={hx} y1={PAD_Y} x2={hx} y2={H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,2" />
          <circle cx={hx} cy={hy} r="5" fill="white" stroke="#3b82f6" strokeWidth="2" />
          <rect x={tooltipX} y={tooltipY} width={TW} height={TH} rx={TR} fill="#1e293b" />
          <text x={tooltipX + TW / 2} y={tooltipY + fontSize + 2} textAnchor="middle" fontSize={fontSize} fill="#94a3b8">{hMonth}</text>
          <text x={tooltipX + TW / 2} y={tooltipY + TH - 4} textAnchor="middle" fontSize={fontSize + 1} fontWeight="700" fill="white">{hVal}</text>
        </>
      )}
      {hoveredIdx !== null && multi && (
        <>
          <line x1={hx} y1={PAD_Y} x2={hx} y2={H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,2" />
          {seriesList.map((s) => (
            <circle key={s.name} cx={hx} cy={toY(s.values[hoveredIdx])} r="4" fill="white" stroke={s.color} strokeWidth="2" />
          ))}
          <rect x={mTipX} y={mTipY} width={MTW} height={MTH} rx={4} fill="#1e293b" />
          <text x={mTipX + 6} y={mTipY + fontSize + 2} fontSize={fontSize} fill="#94a3b8">{hMonth}</text>
          {seriesList.map((s, idx) => (
            <g key={s.name}>
              <rect x={mTipX + 6} y={mTipY + rowH * (idx + 1) + 1} width={8} height={3} rx={1} fill={s.color} />
              <text x={mTipX + 18} y={mTipY + rowH * (idx + 1) + fontSize} fontSize={fontSize} fontWeight="600" fill="white">
                {s.values[hoveredIdx].toLocaleString()}
              </text>
            </g>
          ))}
        </>
      )}
      {xLabels.map((l, i) => l.text && (
        <text key={i} x={l.x} y={H + 14} textAnchor="middle"
          fontSize={l.bold ? fontSize + 1 : fontSize} fontWeight={l.bold ? '700' : '400'}
          fill={l.bold ? '#4b5563' : '#9ca3af'}>{l.text}</text>
      ))}
    </svg>
  );
}


function StockEmptyState({ onAdjustStock, onReplenish }) {
  const ui = useUI();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-6">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl font-semibold text-[#121217] text-center">{ui('noStockMovements')}</span>
        <span className="text-xs font-normal text-[#282833] text-center">{ui('noStockMovementsDesc')}</span>
      </div>
      <div className="flex flex-row items-center gap-3">
        <button
          type="button"
          onClick={onAdjustStock}
          className="flex items-center justify-center px-2 py-1 h-8 bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] rounded-lg text-sm font-medium text-[#121217]"
        >
          {ui('adjustStock')}
        </button>
        <button
          type="button"
          onClick={onReplenish}
          className="flex items-center justify-center px-2 py-1 h-8 bg-[#121217] rounded-lg text-sm font-medium text-white"
        >
          {ui('replenishStock')}
        </button>
      </div>
    </div>
  );
}

function StockChart({
  transactions, currentStock, locationRows = [], locatorToWarehouse = {},
  // Inline chart time window (driven by the sidebar period selector). Modal keeps its own period.
  inlineMonths = 12,
  // External control: open modal pre-filtered to a warehouse
  externalOpen, externalWarehouse, onExternalClose,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [period, setPeriod] = useState('6M');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const ui = useUI();

  const isOpen = externalOpen || internalOpen;

  // Sync external warehouse selection when opening from outside
  useEffect(() => {
    if (externalOpen) {
      setSelectedWarehouse(externalWarehouse ?? null);
    }
  }, [externalOpen, externalWarehouse]);

  const handleOpenChange = (open) => {
    if (!open) {
      setSelectedWarehouse(null);
      setInternalOpen(false);
      onExternalClose?.();
    }
  };

  const handleWarehouseClick = (name) => {
    setSelectedWarehouse(prev => prev === name ? null : name);
  };

  const chart = buildChartData(transactions, currentStock, inlineMonths);

  if (!chart) return null;

  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);

  // Per-warehouse series for the inline chart (one line per warehouse, colors match the legend)
  const seriesChart = buildWarehouseSeries(transactions, sortedRows, locatorToWarehouse, inlineMonths);

  // Per-warehouse series for the modal, driven by its own period selector
  const modalMonths = SIDEBAR_PERIOD_OPTIONS.find(o => o.value === period)?.months ?? 6;
  const seriesLarge = buildWarehouseSeries(transactions, sortedRows, locatorToWarehouse, modalMonths);
  // When a warehouse is selected, isolate its series; fall back to aggregated single line if needed
  const displaySeries = selectedWarehouse && seriesLarge
    ? { ...seriesLarge, series: seriesLarge.series.filter(s => s.name === selectedWarehouse) }
    : seriesLarge;
  const chartLargeFallback = !seriesLarge ? buildChartData(transactions, currentStock, modalMonths) : null;

  return (
    <>
      {/* Mini chart shown in Summary tab */}
      <div className="px-4 pt-2 pb-3 flex flex-col gap-2">
        {/* Title + Expandir */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-sm font-normal text-[#3F3F50] flex-1">{ui('stockMovement')}</span>
          <button
            onClick={() => setInternalOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#121217] underline underline-offset-2 shrink-0"
          >
            {ui('expand')} <ExternalLink size={16} className="text-[#828FA3]" data-testid="ExternalLink__59b33d" />
          </button>
        </div>
        {/* Warehouse legend */}
        {sortedRows.length > 0 && (
          <div className="flex items-center gap-5 flex-wrap">
            {sortedRows.map((b, i) => (
              <div key={b.binName} className="flex items-center gap-2">
                <span className="flex-shrink-0 rounded-sm" style={{ width: 14, height: 4, backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                <span className="text-xs font-normal text-[#121217]">{b.binName}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 170 }}>
          <ChartSVG
            months={seriesChart?.months ?? chart.months}
            series={seriesChart?.series}
            values={chart.values}
            W={340}
            H={100}
            PAD_X={36}
            PAD_R={8}
            PAD_Y={12}
            gradId="sbGrad"
            fontSize={10}
            preserveAspectRatio="none"
            data-testid="ChartSVG__59b33d" />
        </div>
      </div>
      {/* Expanded modal */}
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        data-testid="Dialog__59b33d">
        <DialogContent className="max-w-4xl w-full" data-testid="DialogContent__59b33d">
          <DialogHeader data-testid="DialogHeader__59b33d">
            <DialogTitle data-testid="DialogTitle__59b33d">
              <div className="flex items-center justify-between gap-4 pr-8">
                <span>{ui('stockMovement')}</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {SIDEBAR_PERIOD_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPeriod(opt.value)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === opt.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {ui(opt.key)}
                    </button>
                  ))}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-6 pt-2">
            <div className="flex-1 min-w-0" style={{ height: 300 }}>
              <ChartSVG
                months={displaySeries?.months ?? chartLargeFallback?.months ?? chart.months}
                series={displaySeries?.series}
                values={chartLargeFallback?.values ?? chart.values}
                W={600}
                H={250}
                PAD_X={52}
                PAD_Y={16}
                gradId="sbGradLarge"
                fontSize={13}
                data-testid="ChartSVG__59b33d" />
            </div>
            {sortedRows.length > 0 && (
              <div className="w-56 flex-shrink-0 flex flex-col gap-2">
                <div className="text-sm font-semibold text-[#121217]">{ui('stockByWarehouse')}</div>
                {sortedRows.map((b, i) => {
                  const isSelected = selectedWarehouse === b.binName;
                  const isDimmed = selectedWarehouse !== null && !isSelected;
                  return (
                    <button key={b.binName} onClick={() => handleWarehouseClick(b.binName)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left
                        ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-[#F5F7F9] hover:bg-gray-100'}
                        ${isDimmed ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                        <span className="text-sm text-[#555B6D] truncate">{b.binName}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#121217] flex-shrink-0">{b.quantityOnHand.toLocaleString()}</span>
                    </button>
                  );
                })}
                <div className="text-xs text-[#828FA3] mt-auto pt-2">
                  {selectedWarehouse
                    ? `${locationRows.find(r => r.binName === selectedWarehouse)?.quantityOnHand?.toLocaleString() ?? 0} ${ui('units')}`
                    : `${ui('total')}: ${currentStock?.toLocaleString()} ${ui('units')}`}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


export default function ProductSidebar({ recordId, data, token, apiBaseUrl }) {
  const ui = useUI();
  const [stockRows, setStockRows] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [period, setPeriod] = useState('3M');
  const [chartTrigger, setChartTrigger] = useState({ open: false, warehouse: null });

  useEffect(() => {
    if (!recordId || !token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${apiBaseUrl}/stock?parentId=${recordId}&_startRow=0&_endRow=200`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setStockRows(data?.response?.data ?? []))
      .catch(() => setStockRows([]));

    fetch(`${apiBaseUrl}/transactions?parentId=${recordId}&_startRow=0&_endRow=500`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setTransactions(data?.response?.data ?? []))
      .catch(() => setTransactions([]));
  }, [recordId, token, apiBaseUrl]);

  const onHand = stockRows?.reduce((s, r) => s + (Number(r.quantityOnHand) || 0), 0) ?? null;

  const locatorToWarehouse = (stockRows ?? []).reduce((map, r) => {
    if (r.storageBin) map[r.storageBin] = r['warehouse$_identifier'] ?? r.warehouse ?? 'Unknown';
    return map;
  }, {});

  const binMap = (stockRows ?? []).reduce((acc, r) => {
    const binName = r['warehouse$_identifier'] ?? r.warehouse ?? r['storageBin$_identifier'] ?? r.storageBin ?? 'Unknown';
    if (!acc[binName]) acc[binName] = { binName, quantityOnHand: 0, reservedQty: 0 };
    acc[binName].quantityOnHand += Number(r.quantityOnHand) || 0;
    acc[binName].reservedQty += Number(r.reservedQty) || 0;
    return acc;
  }, {});
  const locationRows = Object.values(binMap).filter(b => b.quantityOnHand > 0);
  const binCount = locationRows.length;

  const fmt = v => (v === null ? null : v.toLocaleString());

  let onHandSubtitle = null;
  if (binCount === 1) onHandSubtitle = locationRows[0]?.binName ?? null;
  else if (binCount > 1) onHandSubtitle = `${binCount} ${ui('locations')}`;

  const hasChart = transactions !== null && transactions.length > 0;
  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);
  const navigate = useNavigate();

  const inlineMonths = (SIDEBAR_PERIOD_OPTIONS.find(o => o.value === period) ?? SIDEBAR_PERIOD_OPTIONS[0]).months;

  const stockChartProps = {
    transactions,
    currentStock: onHand,
    locationRows,
    locatorToWarehouse,
    inlineMonths,
    externalOpen: chartTrigger.open,
    externalWarehouse: chartTrigger.warehouse,
    onExternalClose: () => setChartTrigger({ open: false, warehouse: null }),
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Inventory overview ── */}
      <div>

        {/* Segmented tabs (pill) — full width, no title */}
        <div className="px-4 pt-2">
          <div className="flex items-center gap-1 p-1 h-10 rounded-xl" style={{ background: '#F5F7F9' }}>
            {['summary', 'warehouses'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 h-8 px-3 text-sm rounded-lg transition-all"
                style={
                  activeTab === tab
                    ? { background: '#FFFFFF', color: '#121217', fontWeight: 500,
                        boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)' }
                    : { color: '#121217', fontWeight: 400 }
                }
              >
                {tab === 'summary' ? ui('summary') : ui('warehouses')}
              </button>
            ))}
          </div>
        </div>

        {/* Summary tab content */}
        {activeTab === 'summary' && (
          <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <SidebarPeriodSelector
              period={period}
              onChangePeriod={setPeriod}
              ui={ui}
              disabled={!hasChart}
              data-testid="SidebarPeriodSelector__59b33d" />
            {hasChart && <AvailabilityWidget
              label={ui('onHand')}
              value={fmt(onHand)}
              badge={onHandSubtitle}
              data-testid="AvailabilityWidget__59b33d" />}
          </div>
        )}

        {/* Warehouses tab content */}
        {activeTab === 'warehouses' && (
          <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <SidebarPeriodSelector
              period={period}
              onChangePeriod={setPeriod}
              ui={ui}
              disabled={!hasChart}
              data-testid="SidebarPeriodSelector__59b33d" />
            {sortedRows.length > 0 && <div className="flex flex-col gap-[10px]">
              {sortedRows.map((b, i) => {
                const wAvailable = b.quantityOnHand - b.reservedQty;
                return (
                  <div key={b.binName} className="flex flex-col gap-3 bg-[#F5F7F9] rounded-lg p-3">
                    <div className="flex items-center gap-1 h-6">
                      <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                      </span>
                      <span className="text-xs font-semibold text-[#3F3F50] truncate">{b.binName}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-normal text-[#555B6D]">{ui('available')}</span>
                        <span className="text-sm font-medium text-[#121217]">{fmt(wAvailable)}</span>
                      </div>
                      <div className="border-t border-[rgba(18,18,23,0.05)]" />
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-normal text-[#555B6D]">{ui('reserved')}</span>
                        <span className="text-sm font-medium text-[#121217]">{fmt(b.reservedQty)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
          </div>
        )}
      </div>
      {/* ── Divider ── */}
      {(hasChart || transactions !== null) && (
        <div className="px-4">
          <div className="border-t border-[#E8EAEF]" />
        </div>
      )}
      {/* ── Stock movement or empty state ── */}
      {hasChart
        ? <StockChart {...stockChartProps} data-testid="StockChart__59b33d" />
        : transactions !== null && <StockEmptyState
        onAdjustStock={() => navigate('/physical-inventory/new')}
        onReplenish={() => navigate('/purchase-order/new')}
        data-testid="StockEmptyState__59b33d" />
      }
      {/* Hidden StockChart for warehouse tab modal trigger */}
      {activeTab === 'warehouses' && hasChart && (
        <div className="hidden">
          <StockChart {...stockChartProps} data-testid="StockChart__59b33d" />
        </div>
      )}
    </div>
  );
}
