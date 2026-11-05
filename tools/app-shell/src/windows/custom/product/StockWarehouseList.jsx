// "Stock by warehouse" list of the expand modal (ETP-5908 RF-15): clicking a row isolates that warehouse
// (same handler and visible set as the modal legend). Visible rows are highlighted, hidden ones dimmed.
// The footer total is always the sum of ALL warehouses, whatever is visible.
import { useUI } from '@/i18n';
import { formatStockQuantity } from './stockQuantityFormat';

export default function StockWarehouseList({ rows, colors, visible, onSelect, total }) {
  const ui = useUI();
  return (
    <div className="w-56 flex-shrink-0 flex flex-col gap-2" data-testid="StockWarehouseList">
      <div className="text-sm font-semibold text-foreground">{ui('stockByWarehouse')}</div>
      {rows.map((b, i) => {
        const shown = visible.has(b.binName);
        return (
          <button
            key={b.binName}
            type="button"
            aria-pressed={shown}
            onClick={() => onSelect(b.binName)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${shown ? 'bg-status-info' : 'bg-muted'}`}
            data-testid="StockWarehouseRow"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length], opacity: shown ? 1 : 0.25 }} />
              <span className={`text-sm truncate ${shown ? 'text-foreground' : 'text-muted-foreground'}`} title={b.binName}>{b.binName}</span>
            </div>
            <span className={`text-sm flex-shrink-0 ${shown ? 'font-bold text-foreground' : 'font-semibold text-muted-foreground'}`}>{formatStockQuantity(b.quantityOnHand)}</span>
          </button>
        );
      })}
      <div className="text-xs text-disabled mt-auto pt-2" data-testid="StockWarehouseTotal">
        {`${ui('total')}: ${total == null ? '' : formatStockQuantity(total)} ${ui('units')}`}
      </div>
    </div>
  );
}
