// Hover tooltip of the stock chart (ETP-5908 RF-12), drawn inside the chart <svg>: dark box, date on
// top, one row per visible warehouse (colour square, name, quantity) and a bold Total row when the
// model carries one. Content comes from buildTooltipModel (stockChartAxis.js).

const CHAR_W = 0.6; // average glyph width as a fraction of the font size (SVG cannot measure text)

/** Shortens `name` to at most `maxChars` characters, ending in an ellipsis when it was cut. */
export function truncateName(name, maxChars) {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1)).trimEnd()}\u2026`;
}

function measure(model, fontSize, maxWidth) {
  const rows = model.total ? [...model.rows, { name: model.total.label, valueText: model.total.valueText }] : model.rows;
  const pad = 8;
  const square = fontSize * 0.7;
  const charPx = CHAR_W * fontSize;
  const valueW = Math.max(1, ...rows.map(r => r.valueText.length)) * charPx;
  const fixedW = pad * 2 + square + 6 + 14 + valueW;
  // Name budget: whatever is left once colour square, gap and the quantity column are reserved.
  const maxNameChars = Math.max(3, Math.floor((maxWidth - fixedW) / charPx));
  const shown = rows.map(r => truncateName(r.name, maxNameChars));
  const nameW = Math.max(1, ...shown.map(n => n.length)) * charPx;
  const width = Math.min(Math.max(fixedW + nameW, model.title.length * charPx + pad * 2), maxWidth);
  const rowH = fontSize * 1.6;
  // Date line first (inside the box), then one row per warehouse, then divider + Total.
  const height = pad + rowH * (1 + model.rows.length) + (model.total ? rowH + 6 : 0) + pad;
  return { width, height, pad, square, rowH, maxNameChars };
}

export default function StockChartTooltip({ model, hx, W, PAD_X, PAD_R, PAD_Y, fontSize }) {
  const { width, height, pad, square, rowH, maxNameChars } = measure(model, fontSize, Math.max(60, W - PAD_X - PAD_R));
  const right = hx + 8 + width <= W - PAD_R;
  const x = Math.max(PAD_X, right ? hx + 8 : hx - 8 - width);
  const y = PAD_Y;
  const valueX = x + width - pad;
  const dateY = y + pad + fontSize; // baseline of the date line: fully inside the box, top padding above
  const rowY = (i) => y + pad + rowH * (i + 1) + fontSize - 3;
  const dividerY = y + pad + rowH * (model.rows.length + 1) + 1;

  return (
    <g data-testid="StockChartTooltip" pointerEvents="none">
      <rect x={x} y={y} width={width} height={height} rx={6} fill="hsl(var(--foreground))" />
      <text x={x + pad} y={dateY} fontSize={fontSize} fill="white" fillOpacity="0.72" data-testid="StockChartTooltipDate">{model.title}</text>
      {model.rows.map((r, i) => (
        <g key={r.name} data-testid="StockChartTooltipRow">
          <rect x={x + pad} y={rowY(i) - square + 1} width={square} height={square} rx={1.5} fill={r.color} />
          <text x={x + pad + square + 6} y={rowY(i)} fontSize={fontSize} fill="white">
            {truncateName(r.name, maxNameChars)}
            {r.name.length > maxNameChars && <title>{r.name}</title>}
          </text>
          <text x={valueX} y={rowY(i)} fontSize={fontSize} textAnchor="end" fill="white">{r.valueText}</text>
        </g>
      ))}
      {model.total && (
        <g data-testid="StockChartTooltipTotal">
          <line x1={x + pad} y1={dividerY} x2={valueX} y2={dividerY} stroke="hsl(var(--text-disabled))" strokeOpacity="0.5" strokeWidth="1" />
          <text x={x + pad} y={rowY(model.rows.length) + 8} fontSize={fontSize} fontWeight="700" fill="white">{model.total.label}</text>
          <text x={valueX} y={rowY(model.rows.length) + 8} fontSize={fontSize} fontWeight="700" textAnchor="end" fill="white">{model.total.valueText}</text>
        </g>
      )}
    </g>
  );
}
