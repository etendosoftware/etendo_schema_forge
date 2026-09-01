import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, BarChart2, Check, X, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import {
  formatDashboardAmount,
  formatDashboardAxisTick,
  localeFromUi,
  niceScale,
} from '@/lib/dashboardNumberFormat.js';

const CHART_W = 869;
const CHART_H = 196;
const PAD_X = 74;
const PAD_RIGHT = 4;
const PAD_Y = 10;
const PAD_BOTTOM = 24;

function toBezierPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (curr.x - prev.x) * 0.35;
    d += ` C ${prev.x + cpx},${prev.y} ${curr.x - cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
}

function toBezierFillPath(pts, baseY) {
  if (pts.length === 0) return '';
  return `${toBezierPath(pts)} L ${pts[pts.length - 1].x},${baseY} L ${pts[0].x},${baseY} Z`;
}

/**
 * ETP-5011: computes the growth % shown in the widget's status line, using the
 * first month with real activity as the baseline instead of always values[0].
 * The trailing 12-month window can start with months that have no invoices yet
 * (e.g. a business that only started operating mid-window), and comparing
 * against a hard zero there always collapsed to a misleading "0%" even when
 * revenue clearly grew from that point on. If activity only started in the
 * very last month there is still no meaningful prior point to compare against,
 * so it falls back to 0% in that one case.
 */
export function computeGrowthPct(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const firstActiveIdx = values.findIndex((v) => v > 0);
  const hasBaseline = firstActiveIdx >= 0 && firstActiveIdx < values.length - 1;
  if (!hasBaseline) return 0;
  return Math.round(
    ((values[values.length - 1] - values[firstActiveIdx]) / values[firstActiveIdx]) * 100
  );
}

/**
 * ETP-5011: badge background/text color for the growth status line, extracted
 * out of FinancialTrendChart so its sign check doesn't add to that function's
 * cognitive complexity (mirrors toBezierPath/computeGrowthPct above).
 */
function growthBadgeColors(isNegative) {
  return isNegative
    ? { background: 'var(--status-destructive-bg)', text: 'hsl(var(--destructive))' }
    : { background: 'var(--status-success-bg)', text: 'var(--status-success-fg)' };
}

/** ETP-5011: the growth status icon (red X when declining, green Check otherwise). */
function GrowthStatusIcon({ isNegative }) {
  return isNegative ? (
    <X
      style={{ width: '12.5px', height: '12.5px', color: 'hsl(var(--destructive))' }}
      data-testid="X__14828e" />
  ) : (
    <Check
      style={{ width: '12.5px', height: '12.5px', color: 'var(--status-success-fg)' }}
      data-testid="Check__14828e" />
  );
}

export function FinancialTrendChart({ labels = [], values = [], expenseValues = [], currencyLabel = '' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);
  const [chartType, setChartType] = useState(() => localStorage.getItem('dashboard_chart_type') || 'line');
  const [tooltip, setTooltip] = useState(null);
  const svgWrapperRef = useRef(null);
  const [chartW, setChartW] = useState(CHART_W);

  useEffect(() => {
    const el = svgWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setChartW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasNoData = values.every(v => v === 0);

  const fmtShort = new Intl.DateTimeFormat(numberLocale, { month: 'short' });
  const fmtLong  = new Intl.DateTimeFormat(numberLocale, { month: 'short', year: 'numeric' });

  const getDate = (i) => new Date(new Date().getFullYear(), new Date().getMonth() - (labels.length - 1 - i), 1);

  const axisLabels   = labels.map((_, i) => {
    const s = fmtShort.format(getDate(i));
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
  });
  const tooltipLabel = (i) => {
    const s = fmtLong.format(getDate(i));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const switchChartType = (type) => {
    setChartType(type);
    localStorage.setItem('dashboard_chart_type', type);
  };

  const normalizedExpenses = values.map((_, idx) => {
    const n = Number(expenseValues?.[idx] ?? 0);
    return Number.isFinite(n) ? n : 0;
  });
  const hasExpenses = normalizedExpenses.some((v) => Math.abs(v) > 0);

  const fmtVal = (n) => formatDashboardAmount(n, currencyLabel, numberLocale);

  const growthPct = computeGrowthPct(values);
  // ETP-5011: the status badge (icon + color) used to be hardcoded to green
  // regardless of growthPct's sign — only the text swapped between Up/Down.
  // Drive the icon/color off the same sign the text already uses.
  const isGrowthNegative = growthPct < 0;
  const growthBadge = growthBadgeColors(isGrowthNegative);
  const statusLine = growthPct >= 0
    ? ui('financialTrendGrowthUp').replace('{pct}', Math.abs(growthPct))
    : ui('financialTrendGrowthDown').replace('{pct}', Math.abs(growthPct));

  // Geometry (shared between line and bar)
  const plotW = chartW - PAD_X - PAD_RIGHT;
  const plotH = CHART_H - PAD_Y - PAD_BOTTOM;
  const baseY = PAD_Y + plotH;

  // Y-axis scale (shared between line and bar)
  const allVals = hasExpenses ? [...values, ...normalizedExpenses] : values;
  const maxVal  = Math.max(...allVals, 0);
  const { niceMax, ticks: yTicks } = niceScale(maxVal);

  const toPoint = (v, i, len) => ({
    x: PAD_X + (i / Math.max(len - 1, 1)) * plotW,
    y: PAD_Y + plotH - (Math.max(v, 0) / niceMax) * plotH,
  });

  const revPts = values.map((v, i) => toPoint(v, i, values.length));
  const expPts = hasExpenses ? normalizedExpenses.map((v, i) => toPoint(v, i, normalizedExpenses.length)) : [];

  // Bar chart
  const slotW    = plotW / (values.length || 1);
  const groupW   = slotW * 0.78;
  const innerGap = hasExpenses ? 4 : 0;
  const barW     = hasExpenses ? (groupW - innerGap) / 2 : groupW;

  const showTooltip = (i) => {
    if (i < 0 || i >= values.length) return;
    setTooltip({
      idx: i,
      x: revPts[i].x,
      y: revPts[i].y,
      revenue: values[i],
      expense: hasExpenses ? normalizedExpenses[i] : null,
    });
  };
  const hideTooltip = () => setTooltip(null);

  // Tooltip box renderer (shared)
  const TooltipBox = ({ tx, ty, idx, expense }) => {
    const lines = [
      { text: tooltipLabel(idx), color: 'hsl(var(--muted-foreground))', bold: false },
      { text: `${ui('financialTrendIncomeLegend')}: ${fmtVal(values[idx])}`, color: 'hsl(var(--background))', bold: true },
      ...(hasExpenses && expense != null
        ? [{ text: `${ui('financialTrendExpensesLegend')}: ${fmtVal(expense)}`, color: 'hsl(var(--background))', bold: true }]
        : []),
    ];
    const boxW  = 186;
    const lineH = 16;
    const padV  = 8;
    const boxH  = padV * 2 + lines.length * lineH;
    return (
      <g pointerEvents="none">
        <rect data-testid="financial-trend-tooltip" x={tx} y={ty} width={boxW} height={boxH} rx="8" fill="hsl(var(--foreground))" />
        {lines.map((l, li) => (
          <text
            key={li}
            x={tx + 12}
            y={ty + padV + 12 + li * lineH}
            fontFamily="Inter"
            fontSize="10"
            fontWeight={l.bold ? '500' : '400'}
            fill={l.color}
          >
            {l.text}
          </text>
        ))}
      </g>
    );
  };

  const renderTooltipBox = (tx, ty, idx, expense) => (
    <TooltipBox tx={tx} ty={ty} idx={idx} expense={expense} data-testid="TooltipBox__14828e" />
  );

  const resolveTooltipTy = (anchorY, upperY, boxH) => {
    let ty = anchorY - boxH - 16;
    if (ty < 0) ty = upperY + 16;
    return Math.max(0, Math.min(ty, baseY - boxH));
  };

  const lineTooltipEl = tooltip && (() => {
    const { idx, x, expense } = tooltip;
    const boxW = 186;
    const lineH = 16;
    const padV = 8;
    const numLines = 1 + 1 + (hasExpenses && expense != null ? 1 : 0);
    const boxH = padV * 2 + numLines * lineH;

    const incY = revPts[idx].y;
    const expY = hasExpenses && expPts[idx] ? expPts[idx].y : incY;
    const anchorY = Math.max(incY, expY);
    const upperY  = Math.min(incY, expY);
    const ty = resolveTooltipTy(anchorY, upperY, boxH);
    const tx = Math.min(Math.max(x - boxW / 2, PAD_X), chartW - PAD_RIGHT - boxW);
    return (
      <g pointerEvents="none">
        <line x1={x} y1={0} x2={x} y2={baseY} stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
        <circle cx={revPts[idx].x} cy={revPts[idx].y} r="6" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
        {hasExpenses && expPts[idx] && (
          <circle cx={expPts[idx].x} cy={expPts[idx].y} r="6" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
        )}
        {renderTooltipBox(tx, ty, idx, expense)}
      </g>
    );
  })();

  const barTooltipEl = tooltip && (() => {
    const { idx, x, y, expense } = tooltip;
    const boxW = 186;
    const lineH = 16;
    const padV = 8;
    const numLines = 1 + 1 + (hasExpenses && expense != null ? 1 : 0);
    const boxH = padV * 2 + numLines * lineH;

    // y = tipY = top of the taller bar (smallest y = highest on screen)
    const ty = Math.max(0, Math.min(y - boxH - 8, baseY - boxH));
    const tx = Math.min(Math.max(x - boxW / 2, PAD_X), chartW - PAD_RIGHT - boxW);
    return (
      <g pointerEvents="none">
        <line x1={x} y1={0} x2={x} y2={baseY} stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
        {renderTooltipBox(tx, ty, idx, expense)}
      </g>
    );
  })();

  return (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border-subtle))',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Widget header */}
      <div
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          width: '100%',
          height: '48px',
          background: 'hsl(var(--muted))',
          borderBottom: '1px solid hsl(var(--border-subtle))',
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '12px', lineHeight: '16px', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>
          {ui('financialTrendTitle')}
        </span>
      </div>
      {/* Content */}
      {hasNoData ? (
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex flex-col items-center" style={{ gap: '12px', width: '340px' }}>
            <div className="flex flex-col items-center" style={{ gap: '4px' }}>
              <p style={{ fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
                {ui('financialTrendEmptyTitle')}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                {ui('financialTrendEmptySubtitle')}
              </p>
            </div>
            <div className="flex flex-row items-center" style={{ gap: '12px' }}>
              <button
                type="button"
                onClick={() => navigate('/purchase-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--foreground))', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--background))' }}
                  data-testid="Plus__14828e" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--background))' }}>
                  {ui('newPurchase')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/sales-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--foreground))', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--background))' }}
                  data-testid="Plus__14828e" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--background))' }}>
                  {ui('newSale')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 16px 20px', gap: '8px', width: '100%', flex: 1, minHeight: 0 }}>
        {/* Sub-header row */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexShrink: 0, paddingBottom: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '20px', height: '20px', background: growthBadge.background, borderRadius: '10px', flexShrink: 0 }}>
                <GrowthStatusIcon isNegative={isGrowthNegative} data-testid="GrowthStatusIcon__14828e" />
              </div>
              <span style={{ fontSize: '12px', lineHeight: '16px', color: growthBadge.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {statusLine}
              </span>
            </div>

            {/* Legend */}
            {hasExpenses && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '14px', height: '3px', background: 'var(--status-success-fg)', borderRadius: '2px' }} />
                  <span style={{ fontSize: '12px', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>{ui('financialTrendIncomeLegend')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '14px', height: '3px', background: 'hsl(var(--destructive))', borderRadius: '2px' }} />
                  <span style={{ fontSize: '12px', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>{ui('financialTrendExpensesLegend')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px', gap: '4px', width: '96px', height: '40px', background: 'hsl(var(--muted))', borderRadius: '12px', flexShrink: 0 }}>
            {[['line', LineChart], ['bar', BarChart2]].map(([type, Icon]) => (
              <button
                key={type}
                onClick={() => switchChartType(type)}
                style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  width: '42px', height: '32px',
                  background: chartType === type ? 'hsl(var(--card))' : 'transparent',
                  boxShadow: chartType === type ? '0px 1px 3px hsl(var(--foreground) / 0.1)' : 'none',
                  borderRadius: '8px', border: 'none', cursor: 'pointer',
                }}
              >
                <Icon
                  style={{ width: '18px', height: '18px', color: 'hsl(var(--muted-foreground))' }}
                  data-testid="Icon__14828e" />
              </button>
            ))}
          </div>
        </div>

        {/* SVG wrapper — takes all remaining flex height */}
        <div ref={svgWrapperRef} style={{ height: '196px', flexShrink: 0, position: 'relative' }}>
          {chartType === 'line' ? (
            <svg
              width={chartW}
              height={CHART_H}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              role="img"
            >
              <defs>
                <linearGradient id="trend-income-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--status-success-fg)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--status-success-fg)" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="trend-expense-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid + Y-axis labels */}
              {yTicks.map((val) => {
                const y = PAD_Y + plotH - (val / niceMax) * plotH;
                return (
                  <g key={val}>
                    <line x1={PAD_X} y1={y} x2={chartW - PAD_RIGHT} y2={y} stroke="hsl(var(--border-subtle))" strokeWidth="1.5" strokeDasharray="1 40" strokeLinecap="round" />
                    <text x={PAD_X - 6} y={y + 3} textAnchor="end" fill="hsl(var(--muted-foreground))" style={{ fontSize: '12px', fontFamily: 'Inter', fontWeight: '400' }}>
                      {formatDashboardAxisTick(val, numberLocale)}
                    </text>
                  </g>
                );
              })}

              {/* Expenses area + line */}
              {hasExpenses && (
                <path d={toBezierFillPath(expPts, baseY)} fill="url(#trend-expense-fill)" />
              )}
              {hasExpenses && (
                <path d={toBezierPath(expPts)} fill="none" stroke="hsl(var(--destructive))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* Income area + line */}
              <path d={toBezierFillPath(revPts, baseY)} fill="url(#trend-income-fill)" />
              <path d={toBezierPath(revPts)} fill="none" stroke="var(--status-success-fg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

              {/* X-axis month labels */}
              {axisLabels.map((m, i) => (
                <text
                  key={m}
                  x={PAD_X + (i / Math.max(axisLabels.length - 1, 1)) * plotW}
                  y={CHART_H - 5}
                  textAnchor={i === axisLabels.length - 1 ? 'end' : 'middle'}
                  fill="hsl(var(--muted-foreground))"
                  style={{ fontSize: '12px', fontFamily: 'Inter', fontWeight: '400' }}
                >{m}</text>
              ))}

              {/* Invisible hover columns */}
              {values.map((_, i) => {
                const x        = PAD_X + (i / Math.max(values.length - 1, 1)) * plotW;
                const halfSlot = plotW / Math.max(values.length - 1, 1) / 2;
                return (
                  <rect
                    key={i}
                    x={x - halfSlot}
                    y={PAD_Y}
                    width={halfSlot * 2}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => showTooltip(i)}
                    onMouseLeave={hideTooltip}
                    style={{ cursor: 'crosshair' }}
                  />
                );
              })}

              {/* Frame: left, right, bottom borders */}
              <line x1={PAD_X} y1={0} x2={PAD_X} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />
              <line x1={chartW - PAD_RIGHT} y1={0} x2={chartW - PAD_RIGHT} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />
              <line x1={PAD_X} y1={baseY} x2={chartW - PAD_RIGHT} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />

              {lineTooltipEl}
            </svg>
          ) : (
            <svg
              width={chartW}
              height={CHART_H}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              role="img"
            >
              <defs>
                <linearGradient id="bar-income-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--status-success-fg)" stopOpacity="1" />
                  <stop offset="100%" stopColor="var(--status-success-fg)" stopOpacity="0.12" />
                </linearGradient>
                <linearGradient id="bar-expense-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity="1" />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.12" />
                </linearGradient>
              </defs>
              {yTicks.map((val) => {
                const y = PAD_Y + plotH - (val / niceMax) * plotH;
                return (
                  <g key={val}>
                    <line x1={PAD_X} y1={y} x2={chartW - PAD_RIGHT} y2={y} stroke="hsl(var(--border-subtle))" strokeWidth="1.5" strokeDasharray="1 40" strokeLinecap="round" />
                    <text x={PAD_X - 6} y={y + 3} textAnchor="end" fill="hsl(var(--muted-foreground))" style={{ fontSize: '12px', fontFamily: 'Inter', fontWeight: '400' }}>
                      {formatDashboardAxisTick(val, numberLocale)}
                    </text>
                  </g>
                );
              })}

              {values.map((v, i) => {
                const expense  = hasExpenses ? normalizedExpenses[i] : 0;
                const revH     = Math.max((Math.max(v, 0) / niceMax) * plotH, v > 0 ? 3 : 0);
                const expH     = hasExpenses ? Math.max((Math.max(expense, 0) / niceMax) * plotH, expense > 0 ? 3 : 0) : 0;
                const gw       = hasExpenses ? barW * 2 + innerGap : barW;
                const gx       = PAD_X + i * slotW + (slotW - gw) / 2;
                const cx       = gx + gw / 2;
                const tipY     = hasExpenses ? Math.min(PAD_Y + plotH - revH, PAD_Y + plotH - expH) : PAD_Y + plotH - revH;
                const isLast   = i === values.length - 1;
                return (
                  <g
                    key={i}
                    onMouseEnter={() => setTooltip({ idx: i, x: cx, y: tipY, revenue: v, expense: hasExpenses ? expense : null })}
                    onMouseLeave={hideTooltip}
                    style={{ cursor: 'crosshair' }}
                  >
                    <rect x={gx} y={PAD_Y + plotH - revH} width={barW} height={revH} rx="3" fill="url(#bar-income-gradient)" />
                    {hasExpenses && (
                      <rect x={gx + barW + innerGap} y={PAD_Y + plotH - expH} width={barW} height={expH} rx="3" fill="url(#bar-expense-gradient)" />
                    )}
                    <text x={cx} y={CHART_H - 5} textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '12px', fontFamily: 'Inter', fontWeight: '400' }}>{axisLabels[i]}</text>
                  </g>
                );
              })}

              {/* Frame: left, right, bottom borders */}
              <line x1={PAD_X} y1={0} x2={PAD_X} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />
              <line x1={chartW - PAD_RIGHT} y1={0} x2={chartW - PAD_RIGHT} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />
              <line x1={PAD_X} y1={baseY} x2={chartW - PAD_RIGHT} y2={baseY} stroke="hsl(var(--border-subtle))" strokeWidth="0.5" />

              {barTooltipEl}
            </svg>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
