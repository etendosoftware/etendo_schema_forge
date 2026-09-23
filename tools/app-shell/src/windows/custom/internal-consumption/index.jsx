import { useMemo, useState } from 'react';
import GeneratedApp from '@generated/internal-consumption/generated/web/internal-consumption/index.jsx';
import BulkDocumentAction, { buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';
import { buildDocumentRowQuickActionsPostMenu } from '../shared/buildDocumentRowQuickActions.js';

// ETP-5445 — bulk Contabilizar/Descontabilizar in the grid multi-select
// toolbar, mirroring physical-inventory (ETP-5360). `entity="internalConsumption"`
// matches `entities.header.name` in decisions.json.
function InternalConsumptionBulkActions(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="internalConsumption"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__b7e2c1" />
      <BulkDocumentAction
        {...props}
        entity="internalConsumption"
        actionMode="neoAction"
        buildActions={buildUnpostActions}
        rowFilter={unpostRowFilter}
        labelKey="unpost"
        data-testid="BulkDocumentActionUnpost__b7e2c1" />
    </>
  );
}

// Thin wrapper over the generated page: everything the generator emits
// (Void via moreMenuContent, the lines bottom panel, the detail Post/Unpost
// menuActions, the list toolbar options) is preserved; this only adds the grid
// bulk actions and the row-hover Post/Unpost kebab.
export default function InternalConsumptionWindow(props) {
  const ui = useUI();
  const [refreshKey, setRefreshKey] = useState(0);

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    ...buildDocumentRowQuickActionsPostMenu({
      ui,
      onRefresh: () => setRefreshKey(k => k + 1),
      includeUnpost: true,
    }),
  }), [ui]);

  return (
    <GeneratedApp
      {...props}
      bulkActions={InternalConsumptionBulkActions}
      rowQuickActions={rowQuickActions}
      refreshTrigger={refreshKey}
      data-testid="GeneratedApp__b7e2c1" />
  );
}
