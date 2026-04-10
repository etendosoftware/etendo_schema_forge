import { useMemo, useState, useRef } from 'react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Trash2, Plus, Minus, ClipboardList, Pencil } from 'lucide-react';
import PreviousOrdersTab from './PreviousOrdersTab.jsx';

function EditablePrice({ price, originalPrice, uom, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const handleStart = () => {
    setDraft(price.toFixed(2));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleCommit = () => {
    const val = parseFloat(draft);
    if (!isNaN(val) && val >= 0) onChange(val);
    setEditing(false);
  };

  const changed = Math.abs(price - originalPrice) > 0.001;

  if (editing) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-16 rounded border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          autoFocus
        />
        <span className="text-muted-foreground">&euro; / {uom}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {changed && (
        <span className="line-through text-muted-foreground/50">{originalPrice.toFixed(2)}</span>
      )}
      <span className={changed ? 'text-primary font-medium' : ''}>{price.toFixed(2)}</span>
      <span>&euro; / {uom}</span>
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default function CartPanel({
  lines, dispatch, onCreateOrder, onSendOrder, onCancel,
  activeTab, onTabChange, supplierId, onRepeatOrder, previousOrders,
}) {
  const ui = useUI();

  const { subtotal, taxTotal, grandTotal } = useMemo(() => {
    const sub = lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
    const tax = lines.reduce((acc, l) => acc + l.qty * l.unitPrice * l.taxRate, 0);
    return { subtotal: sub, taxTotal: tax, grandTotal: sub + tax };
  }, [lines]);

  const itemCount = lines.reduce((acc, l) => acc + l.qty, 0);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-white">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => onTabChange('cart')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'cart'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          {ui('qpoCart')}
          {lines.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-white">
              {lines.length}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('history')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'history'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          {ui('qpoPreviousOrders')}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'history' ? (
          <PreviousOrdersTab supplierId={supplierId} onRepeatOrder={onRepeatOrder} orders={previousOrders} />
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">{ui('qpoEmptyCart')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{ui('qpoEmptyCartHint')}</p>
          </div>
        ) : (
          <div>
            {/* Clear cart button */}
            <div className="flex justify-end px-4 pt-2">
              <button
                onClick={() => dispatch({ type: 'CLEAR_CART' })}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                {ui('qpoClearCart')}
              </button>
            </div>
            <div className="divide-y divide-border">
              {lines.map(line => (
                <div key={line.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{line.product.name}</p>
                    <EditablePrice
                      price={line.unitPrice}
                      originalPrice={line.product.price}
                      uom={line.product.uom}
                      onChange={(price) => dispatch({ type: 'UPDATE_PRICE', id: line.id, price })}
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_QTY', id: line.id, qty: line.qty - 1 })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-8 text-center text-sm font-medium tabular-nums">{line.qty.toLocaleString()}</span>
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_QTY', id: line.id, qty: line.qty + 1 })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <span className="min-w-16 text-right text-sm font-semibold shrink-0 tabular-nums">
                    {(line.qty * line.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &euro;
                  </span>

                  <button
                    onClick={() => dispatch({ type: 'REMOVE_ITEM', id: line.id })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary + Actions (only on cart tab with items) */}
      {activeTab === 'cart' && lines.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-3 space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{ui('qpoSubtotal')}</span>
              <span className="tabular-nums">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &euro;</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{ui('qpoTax').replace('{rate}', '21')}</span>
              <span className="tabular-nums">{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &euro;</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-1 border-t border-border">
              <span>{ui('qpoTotal')}</span>
              <span className="tabular-nums">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &euro;</span>
            </div>
          </div>

          <div className="flex gap-2 px-4 pb-4">
            <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
              {ui('qpoCancel')}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={onCreateOrder}>
              {ui('qpoCreateOrder')}
            </Button>
            <Button size="sm" className="flex-1" onClick={onSendOrder}>
              {ui('qpoSendOrder')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
