import { ChevronDown, ChevronRight } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * RowExpandToggle — the circular outline chevron button that expands / collapses a
 * table row (ETP-5593). Before this component the same button was copied inline in
 * InlineLinesPanel, AmortizationLinesTable, MovementsTable, StatementsTable and
 * ReconciliationListTable; the chart-of-accounts tree uses it too.
 *
 * - `orientation="vertical"` (default): a down chevron that rotates 180deg when
 *   expanded — the sub-row opens below.
 * - `orientation="horizontal"`: a right chevron that rotates 90deg (points down)
 *   when expanded — tree folders.
 *
 * The button does not stop click propagation unless `stopPropagation` is set, so a
 * row whose own click opens the record must pass it.
 *
 * @param {{
 *   expanded: boolean;
 *   onToggle: (event: import('react').MouseEvent) => void;
 *   label?: string;            // aria-label; defaults to ui('collapse') / ui('expand')
 *   orientation?: 'vertical'|'horizontal';
 *   stopPropagation?: boolean;
 *   iconTestId?: string;
 *   className?: string;
 * }} props  Any other prop (e.g. `data-testid`, `disabled`) goes to the <button>.
 */
export function RowExpandToggle({
  expanded,
  onToggle,
  label,
  orientation = 'vertical',
  stopPropagation = false,
  iconTestId = 'RowExpandToggle__icon',
  className = '',
  ...rest
}) {
  const ui = useUI();
  const horizontal = orientation === 'horizontal';
  const Icon = horizontal ? ChevronRight : ChevronDown;
  const expandedRotation = horizontal ? 'rotate(90deg)' : 'rotate(180deg)';

  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onToggle?.(e);
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-transform hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] ${className}`.trim()}
      style={{ transform: expanded ? expandedRotation : undefined }}
      aria-label={label ?? ui(expanded ? 'collapse' : 'expand')}
      aria-expanded={expanded}
      {...rest}
    >
      <Icon className="h-4 w-4" data-testid={iconTestId} />
    </button>
  );
}

export default RowExpandToggle;
