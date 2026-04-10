import { useUI } from '@/i18n';
import { useWarehouseStock } from './useWarehouseStock';

export default function WarehouseProductsTab({ data, token, apiBaseUrl }) {
  const ui = useUI();
  const { loading, error, products } = useWarehouseStock(data?.id, token, apiBaseUrl);

  if (loading) return <div className="text-sm text-muted-foreground p-6">{ui('warehouseLoadingProducts')}</div>;
  if (error) return <div className="text-sm text-destructive p-6">{ui('warehouseProductsError', { error })}</div>;
  if (products.length === 0) return <div className="text-sm text-muted-foreground p-6">{ui('warehouseNoStock')}</div>;

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-2 px-4 font-medium">{ui('warehouseProduct')}</th>
            <th className="text-left py-2 px-4 font-medium">{ui('warehouseUom')}</th>
            <th className="text-right py-2 px-4 font-medium">{ui('warehouseQtyOnHand')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 px-4">{p.label}</td>
              <td className="py-2 px-4 text-muted-foreground">{p.uom}</td>
              <td className="py-2 px-4 text-right tabular-nums">{p.qty.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
