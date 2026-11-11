import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Maximize2, Box, Calendar, ChevronDown, PanelRightClose } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUI, useLocaleSwitch } from '@/i18n';
import { SIDEBAR_PERIOD_OPTIONS, DEFAULT_SIDEBAR_PERIOD, formatPeriodRange } from './productSidebarPeriod';
import { niceScale } from '@/lib/dashboardNumberFormat';
import { formatStockQuantity } from './stockQuantityFormat';
import { buildXAxisLabels, buildTooltipModel } from './stockChartAxis';
import { buildChartModel, dayFraction, fractionToDay, valueAtDay } from './stockSeries';
import { useStockHistory } from './useStockHistory';
import StockChartTooltip from './StockChartTooltip';
import StockChartLegend from './StockChartLegend';
import StockWarehouseList from './StockWarehouseList';
import { resolveVisible, isolate, activeHighlight, dimmedOpacity, filterVisibleSeries, useSeriesVisibility } from './stockSeriesVisibility';
import { useApiFetch } from '@/auth/useApiFetch.js';
import ProductSidebarCollapsed from './ProductSidebarCollapsed';
import ViewMovementsLink from './ViewMovementsLink';
import { useSidebarCollapsed } from './useSidebarCollapsed';

const DOT_COLORS = ['#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

// Exact range (DD/MM/AAAA – DD/MM/AAAA) covered by the selected period (ETP-5908 RF-05).
function PeriodRangeLabel({ period, className = '' }) {
  return (
    <span
      className={`text-xs font-normal text-muted-foreground ${className}`}
      data-testid="SidebarPeriodRange"
    >
      {formatPeriodRange(period)}
    </span>
  );
}

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
    <div ref={ref} className="relative flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`h-10 flex items-center gap-1 px-3 border border-border-control rounded-lg shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] text-sm font-medium transition-colors
          ${disabled ? 'bg-muted text-disabled cursor-not-allowed' : 'bg-card text-foreground'}`}
      >
        <Calendar
          className={`h-5 w-5 shrink-0 ${disabled ? 'text-disabled' : 'text-muted-foreground'}`}
          data-testid="Calendar__59b33d" />
        <span className="flex-1 text-left mx-1">{ui(current.key)}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 ${disabled ? 'text-disabled' : 'text-muted-foreground'}`}
          data-testid="ChevronDown__59b33d" />
      </button>
      <PeriodRangeLabel period={period} data-testid="PeriodRangeLabel__59b33d" />
      {open && (
        <div className="absolute top-11 left-0 z-50 min-w-full bg-card border border-border-control rounded-lg shadow-md overflow-hidden">
          {SIDEBAR_PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChangePeriod(opt.value); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted text-foreground whitespace-nowrap ${period === opt.value ? 'font-medium' : 'font-normal'}`}
            >
              {ui(opt.key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal availability widget: icon box + label + locations link/badge + big number.
// With `onBadgeClick` the badge is a real button (RF-06: opens the Warehouses tab).
function AvailabilityWidget({ label, value, badge, onBadgeClick, loading = false }) {
  return (
    <div className="flex-1 flex items-center gap-3 pl-3 pr-2 py-2 bg-card border border-border-subtle rounded-lg shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)]">
      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-card border border-border-control rounded-lg shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)]">
        <Box className="w-6 h-6 text-disabled" data-testid="Box__59b33d" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">{badge && onBadgeClick ? `${label} ·` : label}</span>
          {badge && onBadgeClick && (
            <button
              type="button"
              onClick={onBadgeClick}
              className="text-xs text-status-info-foreground underline underline-offset-2 whitespace-nowrap rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              data-testid="AvailabilityLocationsLink"
            >
              {badge}
            </button>
          )}
          {badge && !onBadgeClick && (
            <span className="ml-1 px-2 py-1 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap truncate min-w-0 max-w-full" title={typeof badge === 'string' ? badge : undefined} data-testid="AvailabilityWarehousePill">{badge}</span>
          )}
        </div>
        <span className="text-2xl font-medium tracking-[-0.01em] text-foreground leading-9">
          {loading ? (
            <Skeleton className="my-2 h-5 w-16" aria-hidden="true" data-testid="AvailabilityValueSkeleton" />
          ) : (value === null ? <span className="text-muted-foreground">—</span> : value)}
        </span>
      </div>
    </div>
  );
}

function smoothPath(xs, ys) {
  if (xs.length < 2) return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const d = [`M${xs[0]},${ys[0]}`];
  for (let i = 1; i < xs.length; i++) {
    const cpX = (xs[i - 1] + xs[i]) / 2;
    d.push(`C${cpX},${ys[i - 1]} ${cpX},${ys[i]} ${xs[i]},${ys[i]}`);
  }
  return d.join(' ');
}

function ChartSVG({ range, series, W, H, PAD_X, PAD_Y, gradId, fontSize = 10, PAD_R = PAD_X, highlight = null, onClick, className = 'cursor-crosshair', preserveAspectRatio = 'xMidYMid meet' }) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const ui = useUI();
  const { locale } = useLocaleSwitch();

  // A single unnamed series (aggregated line) keeps the original blue look; named ones are per-warehouse.
  const multi = series.length > 0 && series[0].name != null;

  // Global Y scale spanning every series. Baseline is always 0 (stock can't be negative);
  // niceScale gives a rounded max + ticks, same as the dashboard / sibling charts.
  const allVals = series.flatMap(s => s.points.map(p => p.value));
  const maxVal = Math.max(...allVals, 0);
  const { niceMax, ticks: yTicks } = niceScale(maxVal);

  const plotW = W - PAD_X - PAD_R;
  const toY = v => PAD_Y + (H - PAD_Y * 2) * (1 - Math.max(v, 0) / niceMax);
  // Points sit on a date scale: window start .. today, proportional to their day.
  const toX = day => PAD_X + dayFraction(day, range) * plotW;

  const paths = series.map((s, idx) => {
    const xs = s.points.map(p => toX(p.day));
    const ys = s.points.map(p => toY(p.value));
    const linePath = smoothPath(xs, ys);
    const areaPath = `${linePath} L${xs[xs.length - 1]},${H} L${xs[0]},${H} Z`;
    return { color: s.color, idx, linePath, areaPath, opacity: dimmedOpacity(s.name, highlight), emphasis: highlight != null && s.name === highlight };
  });

  const yLabels = yTicks.map(t => ({ v: t, label: formatStockQuantity(t) }));

  const xLabels = buildXAxisLabels(range, locale);
  const ANCHOR = { start: 'start', middle: 'middle', end: 'end' };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewX = ((e.clientX - rect.left) / rect.width) * W;
    setHoveredDay(fractionToDay((viewX - PAD_X) / plotW, range));
  };

  const hx = hoveredDay !== null ? toX(hoveredDay) : null;
  const tooltipModel = hoveredDay !== null
    ? buildTooltipModel({ series, day: hoveredDay, locale, totalLabel: ui('total'), unitLabel: ui('stockUnitAbbr') })
    : null;

  return (
    <svg viewBox={`0 0 ${W} ${H + 20 + fontSize + 2}`} preserveAspectRatio={preserveAspectRatio} className={`w-full h-full ${className}`}
      onClick={onClick}
      onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredDay(null)}>
      <defs>
        {paths.map((p) => (
          <linearGradient key={p.idx} id={`${gradId}-${p.idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>
      {yLabels.map((yl) => (
        <line key={yl.v} x1={PAD_X} y1={toY(yl.v)} x2={W - PAD_R} y2={toY(yl.v)} stroke="hsl(var(--border-subtle))" strokeWidth="1" strokeDasharray="4,3" />
      ))}
      {yLabels.map((yl) => (
        <text key={yl.label} x={PAD_X - 5} y={toY(yl.v) + 4} textAnchor="end" fontSize={fontSize} fill="hsl(var(--text-disabled))">{yl.label}</text>
      ))}
      {paths.map((p) => (
        <path key={`area-${p.idx}`} d={p.areaPath} fill={`url(#${gradId}-${p.idx})`} opacity={p.opacity} />
      ))}
      {paths.map((p) => (
        <path key={`line-${p.idx}`} d={p.linePath} fill="none" stroke={p.color} strokeWidth={p.emphasis ? 3 : 2} opacity={p.opacity}
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {hoveredDay !== null && (
        <>
          <line x1={hx} y1={PAD_Y} x2={hx} y2={H} stroke="hsl(var(--text-disabled))" strokeWidth="1" strokeDasharray="3,2" />
          {series.map((s) => (
            <circle key={s.name ?? 'single'} cx={hx} cy={toY(valueAtDay(s.points, hoveredDay))} r={multi ? 4 : 5} fill="white" stroke={s.color} strokeWidth="2" />
          ))}
          <StockChartTooltip model={tooltipModel} hx={hx} W={W} PAD_X={PAD_X} PAD_R={PAD_R} PAD_Y={PAD_Y} fontSize={fontSize} data-testid="StockChartTooltip__59b33d" />
        </>
      )}
      {xLabels.map((l) => (
        <g key={l.day} data-testid="StockChartXLabel">
          <text x={toX(l.day)} y={H + 14} textAnchor={ANCHOR[l.anchor]} fontSize={fontSize} fontWeight="400" fill="hsl(var(--text-disabled))">{l.text}</text>
          {l.year && (
            <text x={toX(l.day)} y={H + 14 + fontSize + 2} textAnchor={ANCHOR[l.anchor]} fontSize={fontSize} fontWeight="400" fill="hsl(var(--muted-foreground))">{l.year}</text>
          )}
        </g>
      ))}
    </svg>
  );
}


function StockEmptyState({ onAdjustStock, onReplenish }) {
  const ui = useUI();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-6">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl font-semibold text-foreground text-center">{ui('noStockMovements')}</span>
        <span className="text-xs font-normal text-foreground text-center">{ui('noStockMovementsDesc')}</span>
      </div>
      <div className="flex flex-row items-center gap-3">
        <button
          type="button"
          onClick={onAdjustStock}
          className="flex items-center justify-center px-2 py-1 h-8 bg-card border border-border-control shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] rounded-lg text-sm font-medium text-foreground"
        >
          {ui('adjustStock')}
        </button>
        <button
          type="button"
          onClick={onReplenish}
          className="flex items-center justify-center px-2 py-1 h-8 bg-foreground rounded-lg text-sm font-medium text-primary-foreground"
        >
          {ui('replenishStock')}
        </button>
      </div>
    </div>
  );
}

function PartialHistoryNote({ partial }) {
  const ui = useUI();
  if (!partial) return null;
  return <span className="text-xs text-muted-foreground" data-testid="StockChartPartialNote">{ui('stockHistoryPartial')}</span>;
}

function StockChart({
  transactions, partial = false, currentStock, locationRows = [], locatorToWarehouse = {},
  // Inline chart time window (driven by the sidebar period selector). Modal keeps its own period.
  inlineMonths = 12,
  // Panel period; the modal starts on it each time it opens, then keeps its own state.
  panelPeriod = DEFAULT_SIDEBAR_PERIOD,
  // External control: open modal pre-filtered to a warehouse
  externalOpen, externalWarehouse, onExternalClose,
  // Series visible in the panel (Set of warehouse names) + its toggle handler; owned by ProductSidebar.
  panelVisible, onTogglePanelSeries,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [period, setPeriod] = useState(panelPeriod);
  // Modal visibility: a copy of the panel's set taken on every open; never written back to the panel.
  const [modalVisibleRaw, setModalVisibleRaw] = useState(null);
  const [panelHover, setPanelHover] = useState(null);
  const [modalHover, setModalHover] = useState(null);
  const ui = useUI();

  const isOpen = externalOpen || internalOpen;

  // Every open: inherit the panel period (RF-02) and the panel's visible series (RF-15), or the
  // warehouse requested from outside; changes inside the modal stay local.
  useEffect(() => {
    if (!isOpen) return;
    setPeriod(panelPeriod);
    setModalVisibleRaw(externalOpen && externalWarehouse ? new Set([externalWarehouse]) : new Set(panelVisible));
    setModalHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleOpenChange = (open) => {
    if (!open) {
      setModalVisibleRaw(null);
      setInternalOpen(false);
      onExternalClose?.();
    }
  };

  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);
  const modalMonths = SIDEBAR_PERIOD_OPTIONS.find(o => o.value === period)?.months ?? 6;
  const modelOf = (months) => buildChartModel({
    transactions, currentStock, warehouses: sortedRows, locatorToWarehouse, months, today: new Date(), colors: DOT_COLORS,
  });
  // Inline chart (panel period) and modal chart (its own period): both slice the same loaded history.
  const chart = modelOf(inlineMonths);
  const chartLarge = isOpen ? modelOf(modalMonths) : null;

  if (!chart) return null;

  const legendItems = sortedRows.map((b, i) => ({ name: b.binName, color: DOT_COLORS[i % DOT_COLORS.length] }));
  const large = chartLarge ?? chart;
  const allKeys = sortedRows.map(b => b.binName);
  const panelShown = resolveVisible(panelVisible, allKeys);
  const panelHighlight = activeHighlight(panelHover, panelShown);
  const modalShown = resolveVisible(modalVisibleRaw ?? panelVisible, allKeys);
  const modalHighlight = activeHighlight(modalHover, modalShown);
  const handleModalSelect = (name) => setModalVisibleRaw(isolate(modalShown, name, allKeys));

  return (
    <>
      {/* Mini chart shown in Summary tab */}
      <div className="px-4 pt-2 pb-3 flex flex-col gap-2">
        {/* Title + icon-only expand button */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-sm font-normal text-muted-foreground flex-1">{ui('stockMovement')}</span>
          <button
            type="button"
            onClick={() => setInternalOpen(true)}
            title={ui('expand')}
            aria-label={ui('expand')}
            className="inline-flex items-center justify-center w-6 h-6 rounded-sm text-muted-foreground hover:text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-testid="StockChartExpandButton"
          >
            <Maximize2 size={16} aria-hidden="true" data-testid="Maximize2__59b33d" />
          </button>
        </div>
        <StockChartLegend items={legendItems} visible={panelShown} highlight={panelHighlight} onToggle={onTogglePanelSeries} onHover={setPanelHover} data-testid="StockChartLegend__59b33d" />
        <div style={{ height: 170 }}>
          <ChartSVG
            range={chart.range}
            series={filterVisibleSeries(chart.series, panelShown)}
            highlight={panelHighlight}
            W={340}
            H={100}
            PAD_X={46}
            PAD_R={8}
            PAD_Y={12}
            gradId="sbGrad"
            fontSize={10}
            preserveAspectRatio="none"
            onClick={() => setInternalOpen(true)}
            className="cursor-pointer"
            data-testid="ChartSVG__59b33d" />
        </div>
        <PartialHistoryNote partial={partial} data-testid="PartialHistoryNote__59b33d" />
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
                <div className="flex flex-col gap-0.5">
                  <span>{ui('stockMovement')}</span>
                  <PeriodRangeLabel period={period} data-testid="PeriodRangeLabel__59b33d" />
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {SIDEBAR_PERIOD_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPeriod(opt.value)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === opt.value ? 'bg-card text-status-info-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      {ui(opt.key)}
                    </button>
                  ))}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <StockChartLegend items={legendItems} visible={modalShown} highlight={modalHighlight} onToggle={handleModalSelect} onHover={setModalHover} data-testid="StockChartLegend__59b33d" />
          <PartialHistoryNote partial={partial} data-testid="PartialHistoryNote__59b33d" />
          <div className="flex gap-6 pt-2">
            <div className="flex-1 min-w-0" style={{ height: 300 }}>
              <ChartSVG
                range={large.range}
                series={filterVisibleSeries(large.series, modalShown)}
                highlight={modalHighlight}
                W={600}
                H={250}
                PAD_X={60}
                PAD_Y={16}
                gradId="sbGradLarge"
                fontSize={13}
                data-testid="ChartSVG__59b33d" />
            </div>
            {sortedRows.length > 0 && (
              <StockWarehouseList rows={sortedRows} colors={DOT_COLORS} visible={modalShown} onSelect={handleModalSelect} total={currentStock} data-testid="StockWarehouseList__59b33d" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


// One card per warehouse: series-coloured dot + name + "Available" left / "N u" right (ETP-5908 RF-08/RF-09).
// No reserved data: Etendo does not manage reservations.
function WarehouseCards({ rows, ui, fmt }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-[10px]" data-testid="WarehouseCards">
      {rows.map((b, i) => (
        <div key={b.binName} className="flex flex-col gap-2 bg-muted rounded-lg p-3" data-testid="WarehouseCard">
          <div className="flex items-center gap-1 h-6">
            <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }}
                data-testid="WarehouseCardDot"
              />
            </span>
            <span className="text-xs font-semibold text-muted-foreground truncate" title={b.binName}>{b.binName}</span>
          </div>
          <div className="flex items-center justify-between gap-2 pl-1 text-sm" data-testid="WarehouseCardAvailability">
            <span className="text-muted-foreground">{ui('stockAvailableLabel')}</span>
            <span className="font-semibold text-foreground">{fmt(b.quantityOnHand)} u</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProductSidebar({ recordId, data, token, apiBaseUrl }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const { stockRows, transactions, partial } = useStockHistory(recordId, apiFetch);
  const [activeTab, setActiveTab] = useState('summary');
  // RF-16: collapsed is only different markup; every hook above/below stays mounted, so period, hidden series and history survive.
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  // Focus handoff: the toggled button unmounts, so after a USER toggle focus moves to its counterpart (never on mount).
  const pendingFocus = useRef(null);
  const toggle = (next, focusTestId) => { pendingFocus.current = focusTestId; setCollapsed(next); };
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target) document.querySelector(`[data-testid="${target}"]`)?.focus();
  }, [collapsed]);
  const [period, setPeriod] = useState(DEFAULT_SIDEBAR_PERIOD);
  const [chartTrigger, setChartTrigger] = useState({ open: false, warehouse: null });

  const onHand = stockRows?.reduce((s, r) => s + (Number(r.quantityOnHand) || 0), 0) ?? null;

  const locatorToWarehouse = (stockRows ?? []).reduce((map, r) => {
    if (r.storageBin) map[r.storageBin] = r['warehouse$_identifier'] ?? r.warehouse ?? 'Unknown';
    return map;
  }, {});

  const binMap = (stockRows ?? []).reduce((acc, r) => {
    const binName = r['warehouse$_identifier'] ?? r.warehouse ?? r['storageBin$_identifier'] ?? r.storageBin ?? 'Unknown';
    if (!acc[binName]) acc[binName] = { binName, quantityOnHand: 0 };
    acc[binName].quantityOnHand += Number(r.quantityOnHand) || 0;
    return acc;
  }, {});
  const locationRows = Object.values(binMap).filter(b => b.quantityOnHand > 0);
  const binCount = locationRows.length;

  const fmt = v => (v === null ? null : formatStockQuantity(v));

  let onHandSubtitle = null;
  if (binCount === 1) onHandSubtitle = locationRows[0]?.binName ?? null;
  else if (binCount > 1) onHandSubtitle = ui('stockLocationsCount', { count: binCount });

  const hasChart = transactions !== null && transactions.length > 0;
  // The stock is still being read: the "Available" value shows a placeholder bar instead of a number.
  const stockLoading = stockRows === null || transactions === null;
  const sortedRows = [...locationRows].sort((a, b) => b.quantityOnHand - a.quantityOnHand);
  const navigate = useNavigate();

  // Panel series visibility, shared by the Summary and Warehouses tabs; resets per product / warehouse set.
  const warehouseKeys = sortedRows.map(b => b.binName);
  const [panelVisible, onTogglePanelSeries] = useSeriesVisibility(`${recordId}|${warehouseKeys.join('\u0001')}`, warehouseKeys);

  const inlineMonths = (SIDEBAR_PERIOD_OPTIONS.find(o => o.value === period) ?? SIDEBAR_PERIOD_OPTIONS[0]).months;

  const stockChartProps = {
    transactions,
    partial,
    currentStock: onHand,
    locationRows,
    locatorToWarehouse,
    inlineMonths,
    panelPeriod: period,
    panelVisible,
    onTogglePanelSeries,
    externalOpen: chartTrigger.open,
    externalWarehouse: chartTrigger.warehouse,
    onExternalClose: () => setChartTrigger({ open: false, warehouse: null }),
  };

  // Service/Expense/Resource products are not stockable — no stock section to
  // show (ETP-4606, extended to Expense/Resource in ETP-5091).
  if (['S', 'E', 'R'].includes(data?.productType)) return null;

  if (collapsed) {
    return (
      <ProductSidebarCollapsed
        onOpen={() => toggle(false, 'ProductSidebarCollapseButton')}
        onSelectTab={(tab) => { setActiveTab(tab); toggle(false, `ProductSidebarTab-${tab}`); }}
        data-testid="ProductSidebarCollapsed__59b33d" />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-product-sidebar-collapsed="false">
      {/* ── Inventory overview ── */}
      <div>

        {/* Segmented tabs (pill) — full width, no title */}
        <div className="px-4 pt-2 flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1 p-1 h-10 rounded-xl" style={{ background: 'hsl(var(--muted))' }}>
            {['summary', 'warehouses'].map(tab => (
              <button
                key={tab}
                data-testid={`ProductSidebarTab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className="flex-1 h-8 px-3 text-sm rounded-lg transition-all"
                style={
                  activeTab === tab
                    ? { background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontWeight: 500,
                        boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)' }
                    : { color: 'hsl(var(--foreground))', fontWeight: 400 }
                }
              >
                {tab === 'summary' ? ui('summary') : ui('warehouses')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => toggle(true, 'ProductSidebarOpenButton')}
            title={ui('hidePanel')}
            aria-label={ui('hidePanel')}
            aria-expanded="true"
            className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-testid="ProductSidebarCollapseButton"
          >
            <PanelRightClose size={20} aria-hidden="true" data-testid="PanelRightClose__59b33d" />
          </button>
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
            {(hasChart || stockLoading) && <AvailabilityWidget
              label={ui('stockAvailableLabel')}
              value={stockLoading ? null : fmt(onHand)}
              loading={stockLoading}
              badge={onHandSubtitle}
              onBadgeClick={binCount > 1 ? () => setActiveTab('warehouses') : undefined}
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
            <WarehouseCards rows={sortedRows} ui={ui} fmt={fmt} data-testid="WarehouseCards__59b33d" />
          </div>
        )}
      </div>
      {/* ── Divider ── */}
      {(hasChart || transactions !== null) && (
        <div className="px-4">
          <div className="border-t border-border-subtle" />
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
      {/* ETP-5908: under the chart, in both tabs (once: the hidden chart below is only a modal host) */}
      {hasChart && <ViewMovementsLink period={period} data-testid="ViewMovementsLink__59b33d" />}
      {/* Hidden StockChart for warehouse tab modal trigger */}
      {activeTab === 'warehouses' && hasChart && (
        <div className="hidden">
          <StockChart {...stockChartProps} data-testid="StockChart__59b33d" />
        </div>
      )}
    </div>
  );
}
