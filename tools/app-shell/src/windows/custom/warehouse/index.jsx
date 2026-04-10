import { toast } from 'sonner';
import { useUI } from '@/i18n';
import WarehousePage from '@generated/warehouse/generated/web/warehouse/WarehousePage';
import WarehouseSummary from './WarehouseSummary';
import WarehouseProductsTab from './WarehouseProductsTab';
import WarehouseTransactionsTable from './WarehouseTransactionsTable';

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

  const primaryTabs = [
    { key: 'general', label: ui('warehouseSummaryTab') },
    { key: 'products', label: ui('warehouseProductsTab'), Panel: WarehouseProductsTab },
  ];

  const secondaryTabs = [
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
    <WarehouseSummary data={data} token={token} apiBaseUrl={apiBaseUrl} />
  );

  return (
    <WarehousePage
      {...props}
      onAfterCreate={handleAfterCreate}
      sidebarContent={sidebarContent}
      primaryTabs={primaryTabs}
      secondaryTabs={secondaryTabs}
    />
  );
}
