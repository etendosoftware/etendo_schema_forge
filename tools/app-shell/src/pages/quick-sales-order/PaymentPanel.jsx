import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, ArrowRightLeft, ChevronUp } from 'lucide-react';

const ICONS = { Banknote, CreditCard, ArrowRightLeft };

export default function PaymentPanel({
  visible,
  grandTotal,
  paymentMethod,
  onPaymentMethodChange,
  amountTendered,
  onAmountChange,
  onConfirm,
  onBack,
  methods,
}) {
  const ui = useUI();
  const change = amountTendered - grandTotal;

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        maxHeight: visible ? '320px' : '0px',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{ui('qsoPayment')}</span>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
            {ui('qsoBackToCart')}
          </button>
        </div>

        {/* Payment method toggle */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {ui('qsoPaymentMethod')}
          </label>
          <div className="flex gap-2">
            {methods.map(m => {
              const Icon = ICONS[m.icon] || Banknote;
              const isActive = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onPaymentMethodChange(m.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-white text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {ui(m.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Amount tendered */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {ui('qsoAmountTendered')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountTendered || ''}
                onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                placeholder="0.00"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">&euro;</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAmountChange(grandTotal)}
              className="shrink-0"
            >
              {ui('qsoExactAmount')}
            </Button>
          </div>
        </div>

        {/* Change */}
        {amountTendered > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">{ui('qsoChange')}</span>
            <span className={`text-lg font-bold ${change >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {change.toFixed(2)} &euro;
            </span>
          </div>
        )}

        {/* Confirm */}
        <Button
          className="w-full"
          disabled={amountTendered < grandTotal}
          onClick={onConfirm}
        >
          {ui('qsoConfirmPayment')}
        </Button>
      </div>
    </div>
  );
}
