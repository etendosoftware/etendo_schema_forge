import { useState } from 'react';
import { useUI } from '@/i18n';
import { niceScale, formatDashboardAxisTick, toBezierPath, toBezierFillPath } from '@/lib/dashboardNumberFormat';
import { formatCurrency } from '@/lib/formatCurrency';

export function BPChartSVGContent({
  labels = [], revenue = [], expenses = [],
  CW, CH, PX, PY, PB, fontSize = 9, chartId = 'bp', orgCurrency = 'USD',
}) {
  const ui = useUI();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const plotW = CW - PX * 2;
  const plotH = CH - PY - PB;

  const allVals = [...revenue, ...expenses];
  const maxVal = Math.max(...allVals, 0);
  const { niceMax, ticks: yTicks } = niceScale(maxVal);
  const baseY = PY + plotH;

  const toPoint = (v, i, len) => ({
    x: PX + (len <= 1 ? plotW / 2 : (i / (len - 1)) * plotW),
    y: PY + plotH - (v / niceMax) * plotH,
  });

  const revPts = revenue.map((v, i) => toPoint(v, i, revenue.length));
  const expPts = expenses.map((v, i) => toPoint(v, i, expenses.length));

  const hasData = allVals.some((v) => v > 0);

  const handleMouseMove = (e) => {
    const n = revenue.length;
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const viewX = ((e.clientX - rect.left) / rect.width) * CW;
    const rawIdx = n <= 1 ? 0 : ((viewX - PX) * (n - 1)) / plotW;
    setHoveredIdx(Math.max(0, Math.min(n - 1, Math.round(rawIdx))));
  };

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
      aria-label={ui('bpSalesPurchasesChartAria')}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <defs>
        <linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--status-success-fg)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--status-success-fg)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={expGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity="0.2" />
          <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {yTicks.map((val) => {
        const y = PY + plotH - (val / niceMax) * plotH;
        return (
          <g key={val}>
            <line x1={PX} y1={y} x2={CW - PX} y2={y}
              stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" />
            <text x={PX - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={fontSize}>
              {formatDashboardAxisTick(val)}
            </text>
          </g>
        );
      })}

      <path d={toBezierFillPath(expPts, baseY)} fill={`url(#${expGradId})`} />
      <path d={toBezierPath(expPts)} fill="none"
        stroke="hsl(var(--destructive))" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {hoveredIdx !== null && expPts[hoveredIdx] && (
        <circle cx={expPts[hoveredIdx].x} cy={expPts[hoveredIdx].y}
          r={3.5} fill="hsl(var(--background))" stroke="hsl(var(--destructive))" strokeWidth="1.5" />
      )}

      <path d={toBezierFillPath(revPts, baseY)} fill={`url(#${revGradId})`} />
      <path d={toBezierPath(revPts)} fill="none"
        stroke="var(--status-success-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {hoveredIdx !== null && revPts[hoveredIdx] && (
        <circle cx={revPts[hoveredIdx].x} cy={revPts[hoveredIdx].y}
          r={4} fill="hsl(var(--background))" stroke="var(--status-success-fg)" strokeWidth="1.5" />
      )}

      {labels.map((lbl, i) => {
        const x = PX + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
        return (
          <text key={`${lbl}-${i}`} x={x} y={CH - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={fontSize}>
            {lbl}
          </text>
        );
      })}

      {!hasData && (
        <text x={CW / 2} y={PY + plotH / 2 + 4} textAnchor="middle" className="fill-muted-foreground" fontSize={fontSize}>
          {ui('bpNoInvoiceData')}
        </text>
      )}

      {hoveredIdx !== null && hx !== null && (
        <>
          <line x1={hx} y1={PY} x2={hx} y2={PY + plotH}
            stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeDasharray="3 2" />
          <rect x={tooltipX} y={tooltipY} width={TW} height={TH} rx={TR} fill="hsl(var(--foreground))" opacity="0.95" />
          <text x={tooltipX + TW / 2} y={tooltipY + fontSize + 2}
            textAnchor="middle" fontSize={fontSize} fill="hsl(var(--muted-foreground))">
            {labels[hoveredIdx]}
          </text>
          <circle cx={tooltipX + 8} cy={tooltipY + fontSize * 2.6} r={fontSize * 0.4} fill="var(--status-success-fg)" />
          <text x={tooltipX + 15} y={tooltipY + fontSize * 2.6 + fontSize * 0.38}
            fontSize={fontSize} fontWeight="600" fill="hsl(var(--background))">
            {formatCurrency(orgCurrency, revenue[hoveredIdx] ?? 0)}
          </text>
          <circle cx={tooltipX + 8} cy={tooltipY + fontSize * 4.2} r={fontSize * 0.4} fill="hsl(var(--destructive))" />
          <text x={tooltipX + 15} y={tooltipY + fontSize * 4.2 + fontSize * 0.38}
            fontSize={fontSize} fontWeight="600" fill="hsl(var(--background))">
            {formatCurrency(orgCurrency, expenses[hoveredIdx] ?? 0)}
          </text>
        </>
      )}
    </svg>
  );
}
