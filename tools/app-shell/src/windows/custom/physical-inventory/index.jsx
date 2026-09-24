import { useMemo, useState } from 'react';
import InventoryTable from '@generated/physical-inventory/generated/web/physical-inventory/InventoryTable';
import GeneratedApp from '@generated/physical-inventory/generated/web/physical-inventory/index.jsx';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import BulkDocumentAction, { buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';
import { buildDocumentRowQuickActionsPostMenu } from '../shared/buildDocumentRowQuickActions.js';

const COLUMNS = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', dot: false, required: true },
  { key: 'name', column: 'Name', type: 'string', required: true },
  {
    key: 'warehouse',
    column: 'M_Warehouse_ID',
    type: 'custom',
    required: true,
    render: (row) => {
      const label = row['warehouse$_identifier'] ?? row.warehouse ?? null;
      if (!label) return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <span className="inline-flex items-center px-2 py-1 bg-[hsl(var(--muted))] rounded-lg text-xs font-normal text-[hsl(var(--muted-foreground))] whitespace-nowrap">
          {label}
        </span>
      );
    },
  },
  { key: 'processed', column: 'Processed', type: 'status', required: true, enumLabels: { 'true': 'statusProcessed', 'false': 'statusDraft' } },
  { key: 'posted', column: 'Posted', type: 'boolean', required: true, badge: true, badgeLabels: { true: { en_US: 'Posted', es_ES: 'Contabilizado' }, false: { en_US: 'Not posted', es_ES: 'Sin contabilizar' } }, badgeVariants: { true: 'green', false: 'orange' } },
];

function CustomInventoryTable(props) {
  return <InventoryTable columns={COLUMNS} {...props} data-testid="InventoryTable__4ca591" />;
}

// ETP-5360 — only hide the kebab when there is no record yet (nothing to act
// on for an unsaved header). Previously also hid it whenever
// `processed === true`, but that is exactly the state the decisions.json
// `post` menuAction needs (`visibleWhenFieldTrue: "processed"`) to become
// eligible, so the whole kebab — Post included — could never appear.
function hideMenuActions({ data }) {
  return !data?.id;
}

// ETP-5360 — bulk Contabilizar/Descontabilizar in the grid multi-select
// toolbar, mirroring goods-shipment/goods-receipt (the closest analogous
// inventory-type document). `entity="inventory"` matches
// `entities.header.name` in decisions.json.
function InventoryBulkActions(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="inventory"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__4ca591" />
      <BulkDocumentAction
        {...props}
        entity="inventory"
        actionMode="neoAction"
        buildActions={buildUnpostActions}
        rowFilter={unpostRowFilter}
        labelKey="unpost"
        data-testid="BulkDocumentActionUnpost__4ca591" />
    </>
  );
}

export default function PhysicalInventoryWindow(props) {
  const ui = useUI();
  const [refreshKey, setRefreshKey] = useState(0);

  // ETP-5360 — row-hover kebab Post only (not Unpost), same precedent as
  // goods-shipment/goods-receipt: Unpost stays reachable from the detail
  // kebab (decisions.json menuActions) and the bulk toolbar above.
  const rowQuickActions = useMemo(() => ({
    enabled: true,
    ...buildDocumentRowQuickActionsPostMenu({ ui, onRefresh: () => setRefreshKey(k => k + 1) }),
  }), [ui]);

  return (
    <GeneratedApp
      {...props}
      Table={CustomInventoryTable}
      hideMoreMenu={hideMenuActions}
      SortIconComponent={SortIcon}
      RefreshIconComponent={RefreshIcon}
      bulkActions={InventoryBulkActions}
      rowQuickActions={rowQuickActions}
      refreshTrigger={refreshKey}
      data-testid="GeneratedApp__4ca591" />
  );
}
