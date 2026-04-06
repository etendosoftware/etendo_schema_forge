import { useState, useEffect } from 'react';
import { Boxes, Lock, PackageCheck, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function formatCompact(v) {
  if (v === null || v === undefined) return null;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

const DOT_COLORS = ['#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

const COLORS = {
  blue: { bg: 'bg-blue-50', label: 'text-blue-600', value: 'text-blue-700', icon: 'text-blue-500' },
  green: { bg: 'bg-green-50', label: 'text-green-600', value: 'text-green-700', icon: 'text-green-500' },
  amber: { bg: 'bg-amber-50', label: 'text-amber-600', value: 'text-amber-700', icon: 'text-amber-500' },
  red: { bg: 'bg-red-50', label: 'text-red-500', value: 'text-red-600', icon: 'text-red-400' },
};

function StatCard({ icon: Icon, label, value, subtitle, color = 'blue' }) {
  const c = COLORS[color] ?? COLORS.blue;
  return (
    <div className={`rounded-xl p-4 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={15} className={c.icon} />
        <span className={`text-sm font-semibold ${c.label}`}>{label}</span>
      </div>
      <div className={`text-3xl font-bold leading-none ${c.value}`}>
        {value === null ? <span className="text-gray-300">—</span> : value}
      </div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

// Build chart data: group by month, cumulative sum, anchor to current stock
function buildChartData(transactions, currentStock, maxMonths = 24) {
  const byMonth = transactions.reduce((acc, t) => {
    const d = new Date(t.movementDate);
    if (isNaN(d)) return acc;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + Number(t.movementQuantity || 0);
    return acc;
  }, {});

  const allMonths = Object.keys(byMonth).sort();
  if (allMonths.length === 0) return null;

  const months = allMonths.slice(-maxMonths);
  let cum = 0;
  const rawValues = months.map(m => { cum += byMonth[m] || 0; return cum; });
  if (rawValues.every(v => v === 0)) return null;

  const offset = currentStock != null ? currentStock - rawValues[rawValues.length - 1] : 0;
  const values = rawValues.map(v => v + offset);
  return { months, values };
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ChartSVG({ months, values, W, H, PAD_X, PAD_Y, gradId, fontSize = 10 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);
  const toY = v => PAD_Y + (H - PAD_Y * 2) * (1 - (v - minVal) / range);
  const toX = i => PAD_X + i * xStep;

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPts = `${toX(0)},${H} ${pts} ${toX(values.length - 1)},${H}`;

  const yLabels = [
    { v: maxVal, label: formatCompact(maxVal) },
    { v: Math.round((maxVal + Math.max(minVal, 0)) / 2), label: formatCompact(Math.round((maxVal + Math.max(minVal, 0)) / 2)) },
    ...(minVal < 0 ? [{ v: minVal, label: formatCompact(minVal) }] : []),
  ];

  const n = values.length;
  const showQuarters = n <= 48; // quarters only for ≤4 years

  // Pixel-based year filtering: only show year labels with ≥40px gap between them
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
    if (c.x - lastShownX >= MIN_YEAR_GAP_PX) {
      shownYears.add(c.i);
      lastShownX = c.x;
    }
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
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(rawIdx)));
    setHoveredIdx(idx);
  };

  // Tooltip dimensions and position
  const TW = fontSize * 5, TH = fontSize * 3.2, TR = 4;
  const hx = hoveredIdx !== null ? toX(hoveredIdx) : null;
  const hy = hoveredIdx !== null ? toY(values[hoveredIdx]) : null;
  const tooltipX = hx !== null ? Math.max(PAD_X, Math.min(W - PAD_X - TW, hx - TW / 2)) : null;
  const tooltipY = hy !== null ? Math.max(PAD_Y, hy - TH - 8) : null;

  const hMonth = hoveredIdx !== null ? (() => {
    const [yr, mo] = months[hoveredIdx].split('-');
    return `${MONTH_NAMES[parseInt(mo, 10)]} '${yr.slice(2)}`;
  })() : null;
  const hVal = hoveredIdx !== null ? values[hoveredIdx].toLocaleString() : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      className="w-full h-full cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke="#f3f4f6" strokeWidth="1" />
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#f3f4f6" strokeWidth="1" />
      {yLabels.map((yl, i) => (
        <text key={i} x={PAD_X - 5} y={toY(yl.v) + 4} textAnchor="end" fontSize={fontSize} fill="#6b7280">
          {yl.label}
        </text>
      ))}
      <line x1={PAD_X} y1={toY(0)} x2={W - PAD_X} y2={toY(0)}
        stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
      <polygon points={areaPts} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2.2"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Hover: vertical line + dot + tooltip */}
      {hoveredIdx !== null && (
        <>
          <line x1={hx} y1={PAD_Y} x2={hx} y2={H}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,2" />
          <circle cx={hx} cy={hy} r="5" fill="white" stroke="#3b82f6" strokeWidth="2" />
          <rect x={tooltipX} y={tooltipY} width={TW} height={TH} rx={TR}
            fill="#1e293b" />
          <text x={tooltipX + TW / 2} y={tooltipY + fontSize + 2} textAnchor="middle"
            fontSize={fontSize} fill="#94a3b8">{hMonth}</text>
          <text x={tooltipX + TW / 2} y={tooltipY + TH - 4} textAnchor="middle"
            fontSize={fontSize + 1} fontWeight="700" fill="white">{hVal}</text>
        </>
      )}

      {/* Last dot (when not hovering) */}
      {hoveredIdx === null && (
        <circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r="4" fill="#3b82f6" />
      )}

      {xLabels.map((l, i) => l.text && (
        <text key={i} x={l.x} y={H + 14} textAnchor="middle"
          fontSize={l.bold ? fontSize + 1 : fontSize}
          fontWeight={l.bold ? '700' : '400'}
          fill={l.bold ? '#4b5563' : '#9ca3af'}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

const PERIOD_OPTIONS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1A', months: 12 },
  { label: '2A', months: 24 },
];

function StockChart({ transactions, currentStock, locationRows = [] }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState('1A');

  const chart = buildChartData(transactions, currentStock, 12);

  const selectedPeriod = PERIOD_OPTIONS.find(p => p.label === period);
  const maxMonthsLarge = selectedPeriod?.months ?? 999;
  const chartLarge = buildChartData(transactions, currentStock, maxMonthsLarge);

  if (!chart) return null;

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-700">Stock movement</div>
          <button
            onClick={() => setOpen(true)}
            className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
            title="Ver en grande"
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <div style={{ height: 140 }}>
          <ChartSVG {...chart} W={340} H={120} PAD_X={36} PAD_Y={10} gradId="sbGrad" fontSize={10} />
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-4 pr-8">
                <span>Stock movement</span>
                {/* Period selector */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {PERIOD_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => setPeriod(opt.label)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === opt.label
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
          <div className="flex gap-6 pt-2">
            {/* Chart */}
            <div className="flex-1 min-w-0" style={{ height: 300 }}>
              <ChartSVG {...(chartLarge ?? chart)} W={600} H={250} PAD_X={52} PAD_Y={16} gradId="sbGradLarge" fontSize={13} />
            </div>
            {/* Stock por almacén */}
            {locationRows.length > 0 && (
              <div className="w-56 flex-shrink-0 flex flex-col gap-2">
                <div className="text-sm font-semibold text-gray-700">Stock por almacén</div>
                {locationRows
                  .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
                  .map((b, i) => (
                    <div key={b.binName}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                        <span className="text-sm text-gray-700 truncate">{b.binName}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{b.quantityOnHand.toLocaleString()}</span>
                    </div>
                  ))}
                <div className="text-xs text-gray-400 mt-auto pt-2">
                  Total: {currentStock?.toLocaleString()} units
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
  const [stockRows, setStockRows] = useState(null);
  const [transactions, setTransactions] = useState(null);

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
  const reserved = stockRows?.reduce((s, r) => s + (Number(r.reservedQty) || 0), 0) ?? null;

  // Group stock rows by storage bin — sum all attribute set values per bin
  const binMap = (stockRows ?? []).reduce((acc, r) => {
    const binName = r['storageBin$_identifier'] ?? r.storageBin ?? 'Unknown';
    if (!acc[binName]) acc[binName] = { binName, quantityOnHand: 0, reservedQty: 0 };
    acc[binName].quantityOnHand += Number(r.quantityOnHand) || 0;
    acc[binName].reservedQty += Number(r.reservedQty) || 0;
    return acc;
  }, {});
  const locationRows = Object.values(binMap).filter(b => b.quantityOnHand > 0);
  const binCount = locationRows.length;


  const available = (onHand !== null && reserved !== null) ? onHand - reserved : null;
  const fmt = v => (v === null ? null : v.toLocaleString());

  const onHandColor = onHand === 0 ? 'red' : 'blue';
  const availableColor = available === null ? 'blue'
    : available <= 0 ? 'red'
      : onHand > 0 && available <= onHand * 0.1 ? 'amber'
        : 'green';

  let onHandSubtitle = null;
  if (binCount === 1) {
    const r = locationRows[0];
    onHandSubtitle = r['storageBin$_identifier'] ?? r.storageBin ?? null;
  } else if (binCount > 1) {
    onHandSubtitle = `${binCount} locations`;
  }

  const availablePct = onHand > 0 && available !== null ? Math.round((available / onHand) * 100) : null;
  const availableSubtitle = availablePct !== null ? `${availablePct}% free` : null;

  const hasChart = transactions !== null && transactions.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <StatCard icon={Boxes} label="On Hand" value={fmt(onHand)} subtitle={onHandSubtitle} color={onHandColor} />
      <StatCard icon={PackageCheck} label="Available" value={fmt(available)} subtitle={availableSubtitle} color={availableColor} />
      <StatCard icon={Lock} label="Reserved" value={fmt(reserved)} subtitle={reserved !== null && reserved > 0 ? 'units held' : null} color="amber" />

      {hasChart && <StockChart transactions={transactions} currentStock={onHand} locationRows={locationRows} />}

      {locationRows.length > 0 && (
        <div className="mt-1">
          <div className="text-sm font-semibold text-gray-700 mb-2">Stock por almacén</div>
          <div className="flex flex-col gap-1.5">
            {locationRows
              .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
              .map((b, i) => (
                <div key={b.binName}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                    <span className="text-sm text-gray-700 truncate">{b.binName}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{b.quantityOnHand.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
