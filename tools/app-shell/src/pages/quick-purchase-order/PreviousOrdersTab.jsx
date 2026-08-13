import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, Package } from 'lucide-react';

export default function PreviousOrdersTab({ supplierId, onRepeatOrder, orders: allOrders = [] }) {
  const ui = useUI();

  const orders = useMemo(() => {
    if (!supplierId) return allOrders;
    return allOrders.filter(o => o.supplierId === supplierId);
  }, [supplierId, allOrders]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Package
          className="h-10 w-10 text-muted-foreground/30 mb-3"
          data-testid="Package__1c6dc4" />
        <p className="text-sm font-medium text-muted-foreground">{ui('qpoNoPreviousOrders')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{ui('qpoNoPreviousOrdersHint')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {orders.map(order => (
        <div key={order.id} className="px-4 py-3">
          {/* Order header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold">{order.documentNo}</span>
              <span className="text-xs text-muted-foreground ml-2">{order.date}</span>
            </div>
            <Badge
              variant={order.status === 'delivered' ? 'secondary' : order.status === 'voided' ? 'destructive' : 'outline'}
              className="text-[10px]"
              data-testid="Badge__1c6dc4">
              {order.status}
            </Badge>
          </div>

          {/* Supplier name (only when showing all) */}
          {!supplierId && (
            <p className="text-xs text-muted-foreground mb-1.5">{order.supplierName}</p>
          )}

          {/* Line summary */}
          <div className="space-y-0.5 mb-2">
            {(order.lines || []).map((line, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate flex-1">{line.name || '—'}</span>
                <span className="shrink-0 ml-2">x{(line.qty ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Footer: total + repeat */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{(order.total ?? 0).toFixed(2)} &euro;</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onRepeatOrder(order)}
              data-testid="Button__1c6dc4">
              <RotateCcw className="h-3 w-3" data-testid="RotateCcw__1c6dc4" />
              {ui('qpoRepeatOrder')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
