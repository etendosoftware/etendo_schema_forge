import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { useWarehouseStock } from './useWarehouseStock';

function fmtQty(val) {
  const n = Number(val);
  return isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}


export default function WarehouseProductsTab({ parentId, token, apiBaseUrl, onCount }) {
  const ui = useUI();
  const currencyCode = useCurrency();
  const { loading, error, products } = useWarehouseStock(parentId, token, apiBaseUrl);

  useEffect(() => {
    if (!loading && !error) {
      onCount?.(products.length);
    }
  }, [loading, error, products.length]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__215b73" />
        {ui('warehouseLoadingStock')}
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-sm text-destructive">{ui('warehouseStockError')}</p>;
  }

  if (products.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground text-center">{ui('warehouseNoStock')}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/50">
          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{ui('warehouseProduct')}</th>
          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{ui('warehouseUom')}</th>
          <th className="text-right py-2 pr-4 font-medium text-muted-foreground">{ui('warehouseValuation')}</th>
          <th className="text-right py-2 font-medium text-muted-foreground">{ui('warehouseStock')}</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
            <td className="py-3 pr-4 font-medium text-[#121217]">{p.label}</td>
            <td className="py-3 pr-4 text-muted-foreground">{p.uom || '—'}</td>
            <td className="py-3 pr-4 text-right tabular-nums text-[#121217]">
              {p.valuation ? formatCurrency(currencyCode, p.valuation) : '—'}
            </td>
            <td className="py-3 text-right tabular-nums text-[#121217]">{fmtQty(p.qty)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
