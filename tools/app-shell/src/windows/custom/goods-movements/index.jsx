import { useState, useMemo } from 'react';
import GeneratedApp from '@generated/goods-movements/generated/web/goods-movements/index.jsx';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import BulkDocumentAction, { buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { buildDocumentRowQuickActionsPostMenu } from '../shared/buildDocumentRowQuickActions.js';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useUI } from '@/i18n';

// ETP-5436 — the list-view counterpart of the kebab Post/Unpost the generated DetailView
// already wires from decisions.json's menuActions. No buildInOutActions/DocAction bulk button
// here (unlike goods-receipt/goods-shipment): M_Movement has no DocStatus, its own completion
// flow is the existing draftMode "Procesar" action, untouched by this addition.
function GoodsMovementsBulkAction(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="movement"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__ecbc47" />
      <BulkDocumentAction
        {...props}
        entity="movement"
        actionMode="neoAction"
        buildActions={buildUnpostActions}
        rowFilter={unpostRowFilter}
        labelKey="unpost"
        data-testid="BulkDocumentActionUnpost__ecbc47" />
    </>
  );
}

// Column definitions (including movementDate dot:false and the processed status
// enumLabels) are driven entirely by decisions.json -> the generated MovementTable.
// This wrapper adds the list-level Post/Unpost bulk actions and row kebab (ETP-5436);
// the detail-view kebab is already wired by the generator from decisions.json.
export default function GoodsMovementsWindow(props) {
  useBulkActionToast();
  const ui = useUI();
  const [refreshKey, setRefreshKey] = useState(0);

  // ETP-5436 — includeUnpost:true (ETP-5378 knob, off by default so goods-receipt/
  // goods-shipment are unaffected): this window's own detail kebab already offers both
  // post and unpost (decisions.json's menuActions), so the row kebab should be
  // symmetric with it — previously it went empty (no "More" button at all —
  // RowQuickActions only renders it when there's at least one visible menu action) on
  // an already-posted row, since buildPostMenuActions only ever returned "post".
  const rowQuickActions = useMemo(() => ({
    enabled: true,
    ...buildDocumentRowQuickActionsPostMenu({
      ui, onRefresh: () => setRefreshKey((k) => k + 1), includeUnpost: true,
    }),
  }), [ui]);

  return (
    <GeneratedApp
      {...props}
      SortIconComponent={SortIcon}
      RefreshIconComponent={RefreshIcon}
      bulkActions={GoodsMovementsBulkAction}
      rowQuickActions={rowQuickActions}
      refreshTrigger={refreshKey}
      data-testid="GeneratedApp__5b4efc"
    />
  );
}
