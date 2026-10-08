import { useCallback, useMemo, useState } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth.js';

/**
 * Responsive layout for the horizontal (header) EntityForm grid — ETP-5513.
 *
 * Why the column count is measured instead of using Tailwind `md:`/`lg:` prefixes:
 * those key off the VIEWPORT, but the header form shares its row with the
 * navigation rail and, on most document windows, a fixed 320 px side panel. At the
 * 1280x720 minimum desktop viewport a `md:grid-cols-4` grid squeezed four ~140 px
 * columns next to the side panel, cutting values and wrapping labels. The number
 * of columns must follow the width the form ACTUALLY has, so it is resolved from
 * the grid container's own width (ResizeObserver).
 *
 * Breakpoints (container width, px):
 *   < 480   -> 2 columns
 *   < 960   -> 3 columns  (1280x720 with a side panel, rail expanded or collapsed)
 *   >= 960  -> 4 columns  (wide screens, or no side panel)
 */
export const FORM_COLUMN_BREAKPOINTS = Object.freeze({ three: 480, four: 960 });

/**
 * Resolve the column count for a horizontal form of the given container width.
 * Returns `null` when the width is unknown (not mounted, jsdom), so the caller
 * keeps its static Tailwind fallback classes.
 */
export function resolveFormColumns(width) {
  if (!(width > 0)) return null;
  if (width < FORM_COLUMN_BREAKPOINTS.three) return 2;
  if (width < FORM_COLUMN_BREAKPOINTS.four) return 3;
  return 4;
}

/** Effective grid span of a field in a grid of `cols` columns (never wider than the grid). */
export function effectiveSpan(field, cols) {
  const span = Number(field?.span) > 1 ? Number(field.span) : 1;
  return cols ? Math.min(span, cols) : span;
}

function isRequiredField(field) {
  return Boolean(field?.required || field?.requiredVisual);
}

/**
 * Split a form's fields into the ones shown in the first `initialRows` rows and the
 * ones revealed by "Show more details".
 *
 * - Only kicks in when the fields overflow `initialRows` rows; otherwise the field
 *   order is returned untouched and nothing is hidden.
 * - On overflow, required fields (red asterisk) are moved first — stable, so the
 *   relative order inside each group is the declared one. The same order is used
 *   collapsed and expanded, so expanding only appends fields, never moves the
 *   visible ones.
 * - Row filling follows CSS grid auto-placement for spans: a field that does not fit
 *   in the remainder of the current row starts the next one.
 *
 * @returns {{ ordered: object[], visible: object[], hiddenCount: number }}
 */
export function partitionInitialRows(fields, cols, initialRows) {
  const list = Array.isArray(fields) ? fields : [];
  if (!cols || !(initialRows > 0)) return { ordered: list, visible: list, hiddenCount: 0 };

  const countVisible = (items) => {
    let row = 1;
    let used = 0;
    for (let i = 0; i < items.length; i += 1) {
      const span = effectiveSpan(items[i], cols);
      if (used + span > cols) {
        row += 1;
        used = 0;
      }
      if (row > initialRows) return i;
      used += span;
    }
    return items.length;
  };

  if (countVisible(list) === list.length) return { ordered: list, visible: list, hiddenCount: 0 };

  const ordered = [...list.filter(isRequiredField), ...list.filter(f => !isRequiredField(f))];
  const visibleCount = countVisible(ordered);
  return {
    ordered,
    visible: ordered.slice(0, visibleCount),
    hiddenCount: ordered.length - visibleCount,
  };
}

/**
 * Measure the grid container and resolve its column count.
 * Returns `[ref, cols]`; `cols` is `null` until measured (or when disabled).
 * A callback ref is used because EntityForm's grid node can mount late (the form
 * renders nothing until it has visible fields) and can be swapped between the
 * plain and image-pinned layouts.
 */
export function useMeasuredFormColumns(enabled) {
  const [ref, width] = useElementWidth(enabled);
  return [ref, resolveFormColumns(width)];
}

/**
 * "Show more details" state for a form limited to `initialRows` rows.
 * The collapsed block opens on its own while one of its hidden fields carries a
 * validation error, so a save blocked by an empty hidden required field always
 * shows the user which field is missing.
 */
export function useInitialRowsCollapse({ fields, cols, initialRows, fieldErrors }) {
  const [userExpanded, setUserExpanded] = useState(false);
  const partition = useMemo(
    () => partitionInitialRows(fields, cols, initialRows),
    [fields, cols, initialRows]
  );
  const hiddenHasError = useMemo(() => {
    if (!partition.hiddenCount || !fieldErrors) return false;
    return partition.ordered.slice(partition.visible.length).some(f => Boolean(fieldErrors[f.key]));
  }, [partition, fieldErrors]);
  const collapsible = partition.hiddenCount > 0;
  const expanded = !collapsible || userExpanded || hiddenHasError;
  const toggle = useCallback(() => setUserExpanded(v => !v), []);
  return {
    collapsible,
    expanded,
    // Expanded or not, `ordered` keeps the same order so the visible fields never move.
    fields: expanded ? partition.ordered : partition.visible,
    toggle,
  };
}
