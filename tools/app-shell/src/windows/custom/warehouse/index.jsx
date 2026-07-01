import { toast } from 'sonner';
import { useUI } from '@/i18n';
import WarehousePage from '@generated/warehouse/generated/web/warehouse/WarehousePage';
import WarehouseSummary from './WarehouseSummary';
import WarehouseTransactionsTable from './WarehouseTransactionsTable';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import WarehouseProductsTab from './WarehouseProductsTab';
import WarehouseCustomTable from './WarehouseCustomTable';

async function createDefaultStorageBin(warehouse, { token, apiBaseUrl }) {
  const searchKey = `${warehouse.searchKey}-0-0-0`;
  const res = await fetch(`${apiBaseUrl}/sws/neo/warehouse/storageBin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse: warehouse.id,
      organization: warehouse.organization,
      searchKey,
      rowX: '0',
      stackY: '0',
      levelZ: '0',
      relativePriority: 50,
      default: true,
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

  const secondaryTabs = [
    { key: 'products', label: ui('warehouseProductsTab'), Panel: WarehouseProductsTab },
    { key: 'productTransactions', label: ui('warehouseTransactionsTab'), Panel: WarehouseTransactionsTable },
  ];

  const handleAfterCreate = async (warehouse, context) => {
    try {
      await createDefaultStorageBin(warehouse, context);
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
      sidebarClassName="w-[30%] shrink-0 border-l border-[#E8EAEF] overflow-y-auto p-2"
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
