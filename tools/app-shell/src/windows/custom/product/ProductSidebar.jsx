import { useState, useEffect } from 'react';
import { Boxes, Lock, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUI } from '@/i18n';

function formatCompact(v) {
  if (v === null || v === undefined) return null;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

const DOT_COLORS = ['#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

const COLORS = {
  blue:  { bg: 'bg-blue-50',  icon: 'text-blue-500'  },
  green: { bg: 'bg-green-50', icon: 'text-green-500' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-500' },
  red:   { bg: 'bg-red-50',   icon: 'text-red-400'   },
};

function StatCard({ icon: Icon, label, value, subtitle, color = 'blue' }) {
  const c = COLORS[color] ?? COLORS.blue;
  return (
    <div className={`rounded-2xl p-4 ${c.bg}`}>
      <Icon size={18} className={`${c.icon} mb-2`} />
      <div className="text-sm font-medium text-gray-600 mb-0.5">{label}</div>
      <div className="text-3xl font-bold leading-none tracking-tight text-gray-900">
        {value === null ? <span className="text-gray-300">—</span> : value}
      </div>
      {subtitle && <div className="text-sm mt-1.5 text-gray-500">{subtitle}</div>}
    </div>
  );
}

// Mini stat cell for the Warehouses tab
function MiniStat({ label, value, color }) {
  const c = COLORS[color] ?? COLORS.blue;
  return (
    <div className={`rounded-lg px-2.5 py-2 ${c.bg} text-center`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-bold leading-none text-gray-900">{value}</div>
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
    const allKeys = Object.keys(byMonth).sort();
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
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(rawIdx)));
    setHoveredIdx(idx);
  };

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
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-full cursor-crosshair"
      onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredIdx(null)}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke="#f3f4f6" strokeWidth="1" />
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#f3f4f6" strokeWidth="1" />
      {yLabels.map((yl, i) => (
        <text key={i} x={PAD_X - 5} y={toY(yl.v) + 4} textAnchor="end" fontSize={fontSize} fill="#6b7280">{yl.label}</text>
      ))}
      <line x1={PAD_X} y1={toY(0)} x2={W - PAD_X} y2={toY(0)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
      <polygon points={areaPts} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {hoveredIdx !== null && (
        <>
          <line x1={hx} y1={PAD_Y} x2={hx} y2={H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,2" />
          <circle cx={hx} cy={hy} r="5" fill="white" stroke="#3b82f6" strokeWidth="2" />
          <rect x={tooltipX} y={tooltipY} width={TW} height={TH} rx={TR} fill="#1e293b" />
          <text x={tooltipX + TW / 2} y={tooltipY + fontSize + 2} textAnchor="middle" fontSize={fontSize} fill="#94a3b8">{hMonth}</text>
          <text x={tooltipX + TW / 2} y={tooltipY + TH - 4} textAnchor="middle" fontSize={fontSize + 1} fontWeight="700" fill="white">{hVal}</text>
        </>
      )}
      {hoveredIdx === null && (
        <circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r="4" fill="#3b82f6" />
      )}
      {xLabels.map((l, i) => l.text && (
        <text key={i} x={l.x} y={H + 14} textAnchor="middle"
          fontSize={l.bold ? fontSize + 1 : fontSize} fontWeight={l.bold ? '700' : '400'}
          fill={l.bold ? '#4b5563' : '#9ca3af'}>{l.text}</text>
      ))}
    </svg>
  );
}

const PERIOD_OPTIONS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
];

function StockChart({
  transactions, currentStock, locationRows = [], locatorToWarehouse = {},
  // External control: open modal pre-filtered to a warehouse
  externalOpen, externalWarehouse, onExternalClose,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [period, setPeriod] = useState('1A');
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

  const filteredTransactions = selectedWarehouse
    ? transactions.filter(t => locatorToWarehouse[t.storageBin] === selectedWarehouse)
    : transactions;

  const filteredStock = selectedWarehouse
    ? (locationRows.find(r => r.binName === selectedWarehouse)?.quantityOnHand ?? 0)
    : currentStock;

  const chart = buildChartData(transactions, currentStock, 12);
  const selectedPeriod = PERIOD_OPTIONS.find(p => p.label === period);
  const chartLarge = buildChartData(filteredTransactions, filteredStock, selectedPeriod?.months ?? 999);

  if (!chart) return null;

  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);

  return (
    <>
      {/* Mini chart shown in Summary tab */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-gray-800">{ui('stockMovement')}</div>
          <button
            onClick={() => setInternalOpen(true)}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors border border-gray-200 rounded-lg px-3 py-1"
          >
            Expand
          </button>
        </div>
        <div className="text-xs text-gray-400 mb-2">Last 12 months.</div>
        <div style={{ height: 120 }}>
          <ChartSVG {...chart} W={340} H={100} PAD_X={36} PAD_Y={8} gradId="sbGrad" fontSize={10} />
        </div>
      </div>

      {/* Expanded modal */}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-4 pr-8">
                <span>{ui('stockMovement')}</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {PERIOD_OPTIONS.map(opt => (
                    <button key={opt.label} onClick={() => setPeriod(opt.label)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === opt.label ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-6 pt-2">
            <div className="flex-1 min-w-0" style={{ height: 300 }}>
              <ChartSVG {...(chartLarge ?? chart)} W={600} H={250} PAD_X={52} PAD_Y={16} gradId="sbGradLarge" fontSize={13} />
            </div>
            {sortedRows.length > 0 && (
              <div className="w-56 flex-shrink-0 flex flex-col gap-2">
                <div className="text-sm font-semibold text-gray-700">{ui('stockByWarehouse')}</div>
                {sortedRows.map((b, i) => {
                  const isSelected = selectedWarehouse === b.binName;
                  const isDimmed = selectedWarehouse !== null && !isSelected;
                  return (
                    <button key={b.binName} onClick={() => handleWarehouseClick(b.binName)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left
                        ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50 hover:bg-gray-100'}
                        ${isDimmed ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                        <span className="text-sm text-gray-700 truncate">{b.binName}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{b.quantityOnHand.toLocaleString()}</span>
                    </button>
                  );
                })}
                <div className="text-xs text-gray-400 mt-auto pt-2">
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
  const reserved = stockRows?.reduce((s, r) => s + (Number(r.reservedQty) || 0), 0) ?? null;

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

  const available = (onHand !== null && reserved !== null) ? onHand - reserved : null;
  const fmt = v => (v === null ? null : v.toLocaleString());

  const onHandColor = onHand === 0 ? 'red' : 'blue';
  const availableColor = available === null ? 'blue'
    : available <= 0 ? 'red'
    : onHand > 0 && available <= onHand * 0.1 ? 'amber'
    : 'green';

  let onHandSubtitle = null;
  if (binCount === 1) onHandSubtitle = locationRows[0]?.binName ?? null;
  else if (binCount > 1) onHandSubtitle = `${binCount} ${ui('locations')}`;

  const availablePct = onHand > 0 && available !== null ? Math.round((available / onHand) * 100) : null;
  const hasChart = transactions !== null && transactions.length > 0;
  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);

  const stockChartProps = {
    transactions,
    currentStock: onHand,
    locationRows,
    locatorToWarehouse,
    externalOpen: chartTrigger.open,
    externalWarehouse: chartTrigger.warehouse,
    onExternalClose: () => setChartTrigger({ open: false, warehouse: null }),
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ── Inventory overview pill ── */}
      <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm">

        {/* Header inside the pill */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="text-sm font-semibold text-gray-800">{ui('inventoryOverview')}</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {['summary', 'warehouses'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors
                  ${activeTab === tab ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab === 'summary' ? ui('summary') : ui('warehouses')}
              </button>
            ))}
          </div>
        </div>

        {/* Summary tab content */}
        {activeTab === 'summary' && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            <StatCard icon={Boxes} label="On Hand" value={fmt(onHand)} subtitle={onHandSubtitle} color={onHandColor} />
            <StatCard icon={PackageCheck} label="Available" value={fmt(available)} subtitle={availablePct !== null ? `${availablePct}% free` : null} color={availableColor} />
            <StatCard icon={Lock} label="Reserved" value={fmt(reserved)} subtitle={reserved !== null && reserved > 0 ? 'units held' : null} color="amber" />
          </div>
        )}

        {/* Warehouses tab content */}
        {activeTab === 'warehouses' && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* Total on hand */}
            <div className="rounded-xl bg-blue-50/60 border-l-4 border-l-blue-400 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-500 mb-1">Total on hand</div>
              <div className="text-3xl font-bold text-gray-900 leading-none tracking-tight">{fmt(onHand)}</div>
              {binCount > 0 && (
                <div className="text-sm text-gray-500 mt-1.5">
                  {binCount === 1 ? `In ${locationRows[0]?.binName}` : `Distributed in ${binCount} warehouses`}
                </div>
              )}
            </div>

            {/* Per-warehouse cards */}
            {sortedRows.map((b, i) => {
              const wAvailable = b.quantityOnHand - b.reservedQty;
              const wAvailableColor = wAvailable <= 0 ? 'red'
                : b.quantityOnHand > 0 && wAvailable <= b.quantityOnHand * 0.1 ? 'amber'
                : 'green';
              return (
                <div key={b.binName} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
                    <span className="text-sm font-semibold text-gray-700">{b.binName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <MiniStat label="On Hand"  value={fmt(b.quantityOnHand)} color={b.quantityOnHand === 0 ? 'red' : 'blue'} />
                    <MiniStat label="Available" value={fmt(wAvailable)}       color={wAvailableColor} />
                    <MiniStat label="Reserved"  value={fmt(b.reservedQty)}    color="amber" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Stock movement pill (separate) ── */}
      {hasChart && <StockChart {...stockChartProps} />}

      {/* Hidden StockChart for warehouse tab modal trigger */}
      {activeTab === 'warehouses' && hasChart && (
        <div className="hidden">
          <StockChart {...stockChartProps} />
        </div>
      )}
    </div>
  );
}
