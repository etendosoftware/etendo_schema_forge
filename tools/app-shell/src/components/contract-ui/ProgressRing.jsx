// Label-less SVG progress ring. The arc starts at 12 o'clock and runs clockwise.
// Shared by ProgressCircle (grid cells: ring + label) and the document header
// progress badges (ring inside a DocumentStatusPill).
//
// Variants:
// - 'default': theme tokens (track stroke-border, arc stroke-foreground, green at 100%).
//   Used on theme-aware surfaces such as the grid.
// - 'current': the ring inherits `currentColor` from its host, with the track at 20%
//   opacity. Used inside DocumentStatusPill, whose background/text are FIXED hex colours
//   that do not follow the theme (theme tokens would vanish on the light pill in dark mode).
//   The arc still turns theme-invariant green at 100%.
const DEFAULT_SIZE = 24;
const TRACK_OPACITY = 0.2;
const DONE_ARC_CLASS = 'stroke-[hsl(var(--status-done-badge))]';

export function clampPercent(value) {
  const num = Number(value);
  const pct = Number.isNaN(num) ? 0 : num;
  return { pct, clamped: Math.min(Math.max(pct, 0), 100) };
}

// default variant: stroke = size / 6, radius = size / 3 (24 -> stroke 4, r 8).
// current variant: a thin ring (16 -> stroke 2, r 6.5) so the hole stays readable.
function getGeometry(size, variant) {
  if (variant === 'current') {
    const strokeWidth = size / 8;
    return { strokeWidth, radius: (size - strokeWidth) / 2 - 0.5 };
  }
  return { strokeWidth: size / 6, radius: size / 3 };
}

function getTrackProps(variant) {
  if (variant === 'current') return { stroke: 'currentColor', strokeOpacity: TRACK_OPACITY };
  return { className: 'stroke-border' };
}

function getArcProps(variant, pct) {
  if (pct >= 100) return { className: DONE_ARC_CLASS };
  if (variant === 'current') return { stroke: 'currentColor' };
  return { className: 'stroke-foreground' };
}

/**
 * Props:
 * - value: percentage 0..100 (NaN -> 0, clamped for the arc).
 * - size (default 24): svg width/height and viewBox edge.
 * - variant (default 'default'): 'default' | 'current' (see header).
 * - strokeWidth / radius: optional overrides of the geometry derived from size + variant.
 * - data-testid (default 'ProgressRing'): base id; the arc is `${base}-arc`. Not rendered on the svg.
 * - ringTestId: optional data-testid rendered on the svg itself.
 */
export default function ProgressRing({
  value,
  size = DEFAULT_SIZE,
  variant = 'default',
  strokeWidth: strokeWidthProp,
  radius: radiusProp,
  ringTestId,
  'data-testid': testId = 'ProgressRing',
}) {
  const { pct, clamped } = clampPercent(value);
  const geometry = getGeometry(size, variant);
  const strokeWidth = strokeWidthProp ?? geometry.strokeWidth;
  const radius = radiusProp ?? geometry.radius;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
      data-testid={ringTestId}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        {...getTrackProps(variant)}
      />
      {clamped > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${center} ${center})`}
          {...getArcProps(variant, pct)}
          data-testid={`${testId}-arc`}
        />
      )}
    </svg>
  );
}
