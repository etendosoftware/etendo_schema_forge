/**
 * Shared chrome for the hover quick-actions overlay used on:
 *  - header list rows (`RowQuickActions`) — ETP-3914
 *  - line rows in `InlineLinesPanel`      — ETP-3908
 *
 * Flip `QUICK_ACTIONS_USE_PILL` to `false` to drop the white pill + shadow + ring
 * on both surfaces simultaneously and render the action icons "bare".
 */
export const QUICK_ACTIONS_USE_PILL = false;

export const QUICK_ACTIONS_PILL_CLASS = QUICK_ACTIONS_USE_PILL
  ? 'bg-card rounded-lg shadow-sm ring-1 ring-border/40'
  : '';
