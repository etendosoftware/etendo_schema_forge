import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, Package } from 'lucide-react';

export default function PreviousOrdersTab({ customerId, onRepeatOrder, orders: allOrders = [] }) {
  const ui = useUI();

  const orders = useMemo(() => {
    if (!customerId) return allOrders;
    return allOrders.filter(o => o.customerId === customerId);
  }, [customerId, allOrders]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">{ui('qsoNoPreviousOrders')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{ui('qsoNoPreviousOrdersHint')}</p>
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
            >
              {order.status}
            </Badge>
          </div>

          {/* Customer name (only when showing all) */}
          {!customerId && (
            <p className="text-xs text-muted-foreground mb-1.5">{order.customerName}</p>
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
            >
              <RotateCcw className="h-3 w-3" />
              {ui('qsoRepeatOrder')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
