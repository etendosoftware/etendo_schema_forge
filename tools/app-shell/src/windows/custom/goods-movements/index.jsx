import GeneratedApp from '@generated/goods-movements/generated/web/goods-movements/index.jsx';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';

// Column definitions (including movementDate dot:false and the processed status
// enumLabels) are driven entirely by decisions.json -> the generated MovementTable.
// This wrapper only swaps the toolbar sort/refresh icons.
export default function GoodsMovementsWindow(props) {
  return (
    <GeneratedApp
      {...props}
      SortIconComponent={SortIcon}
      RefreshIconComponent={RefreshIcon}
      data-testid="GeneratedApp__5b4efc"
    />
  );
}
