// Compact circular progress indicator used by `percent` list columns.
// Composes ProgressRing (24x24 viewBox, r = 8, stroke 4 -> ~20px outer diameter) with a
// label BESIDE the circle (never inside it) in a fixed-width box so circles align across rows.
import ProgressRing, { clampPercent } from './ProgressRing';

export function ProgressCircle({ value, 'data-testid': testId = 'ProgressCircle' }) {
  const { pct } = clampPercent(value);
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId}>
      <ProgressRing value={value} data-testid={testId} />
      {/* Fixed width, independent of digit count ("0%" vs "100%"), and text-left so
          the digits start at the same x in every row. */}
      <span className="text-xs leading-4 font-normal tabular-nums text-left w-9 shrink-0 text-foreground">
        {pct}%
      </span>
    </span>
  );
}
