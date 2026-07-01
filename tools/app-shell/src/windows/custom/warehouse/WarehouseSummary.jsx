import { useUI } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { useWarehouseStock } from './useWarehouseStock';

function fmtNum(val) {
  return Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function WarehouseSummary({ data, token, apiBaseUrl }) {
  const ui = useUI();
  const currencyCode = useCurrency() ?? 'USD';
  const { loading, error, products } = useWarehouseStock(data?.id, token, apiBaseUrl);

  // products are already filtered to qty > 0 by aggregateProducts, so this is the in-stock count.
  const totalProducts = products.length;
  const totalValuation = products.reduce((sum, p) => sum + (Number(p.valuation) || 0), 0);

  if (loading) return <div className="text-sm text-muted-foreground py-4">{ui('warehouseLoadingStock')}</div>;
  if (error) return <div className="text-sm text-destructive py-4">{ui('warehouseStockError')}</div>;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-[#121217]">{ui('warehouseStockDataTitle')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{ui('warehouseTotalValuation')}</p>
          <p className="text-2xl font-light tabular-nums mb-2">{formatCurrency(currencyCode, totalValuation)}</p>
          <span className="inline-block bg-[#F5F7F9] rounded-lg px-2 py-1 text-xs text-[#3F3F50]">
            {ui('warehouseValuationBadge')}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{ui('warehouseProductsWithStock')}</p>
          <p className="text-2xl font-light tabular-nums mb-2">{fmtNum(totalProducts)}</p>
          <span className="inline-block bg-emerald-50 rounded-lg px-2 py-1 text-xs text-emerald-700">
            {ui('warehouseProductsWithStockBadge')}
          </span>
        </div>
      </div>
    </div>
  );
}
