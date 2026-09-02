import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';

/**
 * ETP-5075 — bulk accounting post/unpost from the Receipt-Invoice Link list view.
 *
 * Thin wrapper: all the UI (floating-bar button, "Confirmar" modal, the action dropdown,
 * the per-row `Promise.allSettled` loop and the ok/failed toast) is the shared
 * `BulkDocumentAction`. This file only supplies WHICH actions to offer and WHICH rows each
 * one may touch.
 *
 * `actionMode="neoAction"` is what retargets the per-row call to the generic NEO action
 * endpoint (`POST …/matchedInvoice/{id}/action/post|unpost`) instead of the DocAction one —
 * this window has no DocAction/`documentStatus` at all, its actions are the accounting
 * post/unpost served by `DocumentPostingService`, the same ones the detail kebab uses.
 */

/**
 * `M_MatchInv.Posted` is NOT a boolean: live data holds `Y`, `T`, `E`, `D`, `p`, `i` (the
 * AD "Posted status" domain). Only `Y` means posted — every other state (Error, Period
 * Closed, Invalid Account, …) is genuinely NOT posted and must remain postable.
 */
const isPosted = (row) => row.posted === 'Y' || row.posted === true;

/**
 * Offers an action only when at least one selected row can take it — same shape as
 * `BulkDocumentAction`'s own default `buildActions` does with DR/CO. A mixed selection
 * therefore offers both, and `rowFilter` below keeps each one to its eligible rows.
 */
export const buildPostActions = (rows) => {
  const actions = [];
  if (rows.some((row) => !isPosted(row))) actions.push({ value: 'post', labelKey: 'post' });
  if (rows.some(isPosted)) actions.push({ value: 'unpost', labelKey: 'unpost' });
  return actions;
};

export default function MatchedInvoiceBulkActions(props) {
  const ui = useUI();

  // Pre-blocks the rows the chosen action does not apply to, so a mixed selection reports
  // a clear per-row reason instead of letting the backend reject them with an opaque
  // accounting error. Returning a string counts the row as failed with that message
  // (rowFilter contract — see sales-order's OrderReactivateBulkAction for the precedent).
  const rowFilter = (row, action) => {
    if (action === 'post' && isPosted(row)) return ui('bulkRowAlreadyPosted');
    if (action === 'unpost' && !isPosted(row)) return ui('bulkRowNotPosted');
    return true;
  };

  return (
    <BulkDocumentAction
      {...props}
      entity="matchedInvoice"
      actionMode="neoAction"
      buildActions={buildPostActions}
      rowFilter={rowFilter}
      labelKey="confirmBulk"
    />
  );
}
