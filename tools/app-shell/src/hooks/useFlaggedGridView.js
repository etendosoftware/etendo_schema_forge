import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { useGridView } from '@/hooks/useGridView.js';

/**
 * `useGridView` behind the `grid-column-views` flag, for the bespoke grids that wire it by hand.
 * `enabled` is an extra condition (e.g. a resolved spec) ANDed with the flag. Returns the view and
 * the flag, which callers use to decide whether to render the personal-view controls.
 */
export function useFlaggedGridView({ enabled = true, ...options }) {
  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridView = useGridView({ ...options, enabled: gridColumnViews && enabled });
  return { gridView, gridColumnViews };
}
