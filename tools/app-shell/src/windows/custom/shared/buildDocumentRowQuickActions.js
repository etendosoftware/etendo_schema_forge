import { toast } from 'sonner';
// ETP-5209 rejection-cycle fix — relative import, not the `@/` alias: this module
// is loaded directly by plain `node --test` via
// buildDocumentRowQuickActions.test.js's real `import` (Vite's alias resolution is
// unavailable there), and backendErrors.js is a dependency-free leaf module, so the
// relative path costs nothing. Mirrors the same choice in useInvoiceWindow.js.
import { translateBackendError } from '../../../lib/backendErrors.js';

// ETP-5209 rejection-cycle fix — extracted from goods-receipt/index.jsx and
// goods-shipment/index.jsx, which each hand-rolled an identical ~25-line block:
// the posted/processed Post-eligibility gate, the row-hover kebab entry for the
// Post action, and the toast-and-refresh onMenuActionExecuted handler (Sonar
// flagged 28.29% duplicated lines on the PR that introduced them, against a 3%
// gate). Deliberately a SEPARATE module from useInvoiceWindow.js's
// buildInvoiceRowQuickActions(): that helper builds the WHOLE rowQuickActions
// object for purchase-invoice/sales-invoice (edit/duplicate/email/delete + Post),
// while goods-receipt and goods-shipment each build a differently-shaped
// rowQuickActions object of their own and only need the Post-menu slice spread
// into it. Folding this into useInvoiceWindow.js would force an unrelated,
// already-tested module to grow a second, differently-shaped export.

// Pure, exported standalone for direct unit testing — same gate as the bulk Post
// action (BulkDocumentAction.jsx's buildPostActions/postRowFilter) and the
// decisions.json-driven form-view Post action: a row must be processed AND not
// yet posted for Post to appear.
//
// ETP-5378 added the opt-in `includeUnpost` knob, defaulting to the pre-existing
// behavior so goods-shipment and goods-receipt are untouched: it also emits an
// `unpost` entry once the row IS posted, mirroring goods-receipt's hand-rolled
// form-view menuActions. Off by default because a window that declares no `unpost`
// in its decisions.json must not grow one in the grid only.
export function buildPostMenuActions({ row, includeUnpost = false } = {}) {
  const isPosted = row?.posted === 'Y' || row?.posted === true;
  const isProcessed = row?.processed === 'Y' || row?.processed === true;
  if (!isProcessed) return [];
  if (!isPosted) {
    return [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }];
  }
  if (!includeUnpost) return [];
  return [{
    key: 'unpost',
    labelKey: 'unpost',
    neoAction: 'unpost',
    successKey: 'documentUnposted',
    destructive: true,
  }];
}

// RowQuickActions deliberately never shows a toast itself ("toast/snackbar is the
// host's responsibility"); this is the host-side half for the row-kebab Post
// action, mirroring DetailMoreActionsMenu's runNeoMenuAction for the exact same
// neoAction shape.
export function buildMenuActionExecutedHandler(ui, onRefresh) {
  return (action, result) => {
    // ETP-5378 — widened from `neoAction` only, so a documentAction row entry (e.g.
    // reactivate) also gets its toast and list refresh.
    if (!action.neoAction && !action.documentAction) return;
    if (result?.success === false) {
      // ETP-5360 — forward the AD_MESSAGE keys so translateBackendError can map by identity.
      toast.error(translateBackendError(result?.message, ui, { messageKeys: result?.messageKeys }) || ui?.('actionFailed'));
    } else {
      toast.success((action.successKey ? ui?.(action.successKey) : action.successMessage) || ui?.('actionCompleted'));
    }
    onRefresh?.();
  };
}

// Convenience composite for the common call shape: spread the result into a
// window's own rowQuickActions object literal, e.g.
// `...buildDocumentRowQuickActionsPostMenu({ ui, onRefresh: () => setRefreshKey(k => k + 1) })`.
export function buildDocumentRowQuickActionsPostMenu({
  ui, onRefresh, includeUnpost = false, extraMenuActions = null,
} = {}) {
  return {
    // RowQuickActions calls this with `{ row, data, status }`. With no knob set, hand it
    // buildPostMenuActions ITSELF rather than a wrapper: callers memoize the slice and a
    // fresh closure per call would be a new prop identity on every render (pinned by
    // buildDocumentRowQuickActions.test.js). Only a window that opts into a knob pays
    // for the wrapper.
    //
    // ETP-5378 — `extraMenuActions(row)` lets a window prepend its own entries (the
    // albarán windows put "Confirmar" ahead of Post/Unpost, mirroring the order Pedido
    // de Venta uses). It may return one descriptor, an array, or nothing.
    menuActions: (includeUnpost || extraMenuActions)
      ? ({ row }) => [
        ...normalizeExtra(extraMenuActions, row),
        ...buildPostMenuActions({ row, includeUnpost }),
      ]
      : buildPostMenuActions,
    onMenuActionExecuted: buildMenuActionExecutedHandler(ui, onRefresh),
  };
}

/** Accepts a descriptor, an array of them, or nothing, and always yields an array. */
function normalizeExtra(extraMenuActions, row) {
  if (typeof extraMenuActions !== 'function') return [];
  const extra = extraMenuActions(row);
  if (!extra) return [];
  return Array.isArray(extra) ? extra : [extra];
}
