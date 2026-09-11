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
export function buildPostMenuActions({ row } = {}) {
  const isPosted = row?.posted === 'Y' || row?.posted === true;
  const isProcessed = row?.processed === 'Y' || row?.processed === true;
  if (isPosted || !isProcessed) return [];
  return [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }];
}

// RowQuickActions deliberately never shows a toast itself ("toast/snackbar is the
// host's responsibility"); this is the host-side half for the row-kebab Post
// action, mirroring DetailMoreActionsMenu's runNeoMenuAction for the exact same
// neoAction shape.
export function buildMenuActionExecutedHandler(ui, onRefresh) {
  return (action, result) => {
    if (!action.neoAction) return;
    if (result?.success === false) {
      toast.error(translateBackendError(result?.message, ui) || ui?.('actionFailed'));
    } else {
      toast.success((action.successKey ? ui?.(action.successKey) : action.successMessage) || ui?.('actionCompleted'));
    }
    onRefresh?.();
  };
}

// Convenience composite for the common call shape: spread the result into a
// window's own rowQuickActions object literal, e.g.
// `...buildDocumentRowQuickActionsPostMenu({ ui, onRefresh: () => setRefreshKey(k => k + 1) })`.
export function buildDocumentRowQuickActionsPostMenu({ ui, onRefresh } = {}) {
  return {
    menuActions: buildPostMenuActions,
    onMenuActionExecuted: buildMenuActionExecutedHandler(ui, onRefresh),
  };
}
