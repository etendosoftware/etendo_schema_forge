// Compact circular progress indicator used by `percent` list columns.
// 24x24 viewBox, ring inset 8.33% (r = 8, stroke 4 -> ~20px outer diameter).
// The arc starts at 12 o'clock and runs clockwise. The label sits BESIDE the
// circle (never inside it) in a fixed-width box so circles align across rows.
const SIZE = 24;
const STROKE = 4;
const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getArcClass(pct) {
  if (pct >= 100) return 'stroke-[hsl(var(--status-done-badge))]';
  return 'stroke-foreground';
}

export function ProgressCircle({ value, 'data-testid': testId = 'ProgressCircle' }) {
  const num = Number(value);
  const pct = Number.isNaN(num) ? 0 : num;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const arcClass = getArcClass(pct);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-border"
        />
        {clamped > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className={arcClass}
            data-testid={`${testId}-arc`}
          />
        )}
      </svg>
      {/* Fixed width, independent of digit count ("0%" vs "100%"), and text-left so
          the digits start at the same x in every row. */}
      <span className="text-xs leading-4 font-normal tabular-nums text-left w-9 shrink-0 text-foreground">
        {pct}%
      </span>
    </span>
  );
}
