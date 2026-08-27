import { toast } from 'sonner';
import { useUI } from '@/i18n';
import WarehousePage from '@generated/warehouse/generated/web/warehouse/WarehousePage';
import WarehouseSummary from './WarehouseSummary';
import WarehouseTransactionsTable from './WarehouseTransactionsTable';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import WarehouseProductsTab from './WarehouseProductsTab';
import WarehouseCustomTable from './WarehouseCustomTable';
import AccountingTable from '@generated/warehouse/generated/web/warehouse/AccountingTable';
import AccountingForm from '@generated/warehouse/generated/web/warehouse/AccountingForm';

import { useApiFetch } from '@/auth/useApiFetch.js';
async function createDefaultStorageBin(warehouse, { token, apiBaseUrl }, apiFetch) {
  const searchKey = `${warehouse.searchKey}-0-0-0`;
  const res = await apiFetch('/storageBin', {
    method: 'POST',
    token,
    baseUrl: apiBaseUrl,
    body: JSON.stringify({
      warehouse: warehouse.id,
      organization: warehouse.organization,
      searchKey,
      rowX: '0',
      stackY: '0',
      levelZ: '0',
      relativePriority: 50,
      default: true,
      // Fixed system ID for M_InventoryStatus "Available" (OVERISSUE='N').
      // Without this, the DB column default lands new locators on
      // "Undefined" (7B3DC15A20234C418D26EECDC5D59003), which behaves
      // identically but is semantically mislabeled. See ETP-4761.
      inventoryStatus: '2',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || res.statusText);
  }
}

export default function WarehouseWindow(props) {
  const { token, apiBaseUrl } = props;
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);

  const secondaryTabs = [
    { key: 'products', label: ui('warehouseProductsTab'), Panel: WarehouseProductsTab },
    { key: 'productTransactions', label: ui('warehouseTransactionsTab'), Panel: WarehouseTransactionsTable },
    { key: 'accounting', label: ui('warehouseAccountingTab'), Table: AccountingTable, Form: AccountingForm },
  ];

  const handleAfterCreate = async (warehouse, context) => {
    try {
      await createDefaultStorageBin(warehouse, context, apiFetch);
    } catch (err) {
      toast.warning('Warehouse created, but default storage bin could not be created automatically.', {
        description: err.message || undefined,
        duration: 6000,
      });
    }
  };

  const sidebarContent = (data) => (
    <WarehouseSummary
      data={data}
      token={token}
      apiBaseUrl={apiBaseUrl}
      data-testid="WarehouseSummary__f66a03" />
  );

  return (
    <WarehousePage
      {...props}
      onAfterCreate={handleAfterCreate}
      sidebarContent={sidebarContent}
      secondaryTabs={secondaryTabs}
      sidebarClassName="w-[30%] shrink-0 border-l border-[hsl(var(--border-subtle))] overflow-y-auto p-2"
      sidebarAboveTabsOnly
      formScrollPaddingX=""
      contentOverflow="hidden"
      secondaryTabContentPaddingT="p-2 overflow-y-auto max-h-[calc(100vh-380px)]"
      Table={WarehouseCustomTable}
      hidePrint
      hideLink
      listbarPaddingX="px-2"
      listbarPaddingY="py-2"
      tablePaddingX="px-2"
      tablePaddingBottom="pb-2"
      SortIconComponent={SortIcon}
      RefreshIconComponent={RefreshIcon}
      toolbarPaddingX="px-2"
      tabsBarPaddingX="px-2"
      compactSidebarPadding
      noHeaderBorder
      formCardPadding="p-2"
      toolbarBorderBottom
      tabsSeparator
      data-testid="WarehousePage__f66a03" />
  );
}
