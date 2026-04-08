import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ICONS = {
  returnReceipt: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
      <path d="M12 15l-3 3 3 3" />
      <path d="M9 18h8" />
    </svg>
  ),
  creditNote: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
};

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i + 1 === current ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        />
      ))}
      <span className="ml-1">Step {current} of {total}</span>
    </div>
  );
}

export default function ReturnWizard({
  open,
  onClose,
  shipmentData,
  lines = [],
  token,
  apiBaseUrl,
  onSuccess,
  onError,
}) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [prices, setPrices] = useState({});
  const [orderCurrency, setOrderCurrency] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open && lines.length > 0) {
      setStep(1);
      setSelected(new Set(lines.map((l) => l.id)));
      const q = {};
      for (const l of lines) q[l.id] = l.movementQuantity || 0;
      setQuantities(q);
      setReason('');
      setPrices({});

      // Fetch order header + lines to get currency and unit prices (shipment lines don't carry prices)
      const orderId = shipmentData?.salesOrder;
      if (orderId && token && apiBaseUrl) {
        const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        // Fetch order header for currency
        fetch(`${base}/sales-order/header/${orderId}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .then(j => {
            const order = j?.response?.data?.[0];
            if (order?.['currency$_identifier']) setOrderCurrency(order['currency$_identifier']);
          })
          .catch(() => {});
        // Fetch order lines for prices
        fetch(`${base}/sales-order/lines?parentId=${orderId}&_limit=200`, { headers })
          .then(r => r.ok ? r.json() : { response: { data: [] } })
          .then(j => {
            const orderLines = j.response?.data || [];
            const priceMap = {};
            for (const ol of orderLines) {
              if (ol.product) priceMap[ol.product] = ol.unitPrice ?? ol.priceActual ?? 0;
            }
            setPrices(priceMap);
          })
          .catch(() => {});
      }
    }
  }, [open, lines, shipmentData, token, apiBaseUrl]);

  const toggleLine = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(lines.map((l) => l.id)));
  }, [lines]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const setQty = useCallback((id, value, max) => {
    const num = Math.max(0, Math.min(Number(value) || 0, max));
    setQuantities((prev) => ({ ...prev, [id]: num }));
  }, []);

  const selectedLines = lines.filter((l) => selected.has(l.id));
  const totalReturnQty = selectedLines.reduce((sum, l) => sum + (quantities[l.id] || 0), 0);
  const currency = orderCurrency || shipmentData?.['currency$_identifier'] || '';

  const getLinePrice = (line) => prices[line.product] ?? 0;
  const getLineAmount = (line) => (quantities[line.id] || 0) * getLinePrice(line);
  const totalAmount = selectedLines.reduce((sum, l) => sum + getLineAmount(l), 0);

  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF', BRL: 'R$', ARS: '$', MXN: '$', COP: '$', PEN: 'S/' };
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
  const fmtAmount = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
  };

  const documentNo = shipmentData?.documentNo || '';
  const bpName = shipmentData?.['businessPartner$_identifier'] || shipmentData?.businessPartner$_identifier || '';

  const handleConfirm = async () => {
    // NOTE: The createReturn action endpoint is pending backend implementation.
    // Once available, it should create a return receipt + credit note in a single transaction.
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const payload = {
        lines: selectedLines.map((l) => ({ lineId: l.id, returnQuantity: quantities[l.id] })),
        reason,
      };
      const res = await fetch(
        `${apiBaseUrl}/goodsShipment/${shipmentData.id}/action/createReturn`,
        { method: 'POST', headers, body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.response?.error?.message || `Request failed (${res.status})`);
      }
      const result = await res.json();
      onClose();
      if (onSuccess) onSuccess(result.response?.data);
    } catch (err) {
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canProceed = selectedLines.length > 0 && selectedLines.every((l) => quantities[l.id] > 0);

  const cellStyle = { borderBottom: '0.5px solid hsl(var(--border) / 0.5)' };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="sm:max-w-[640px] p-0 gap-0 shadow-none"
        style={{ border: '0.5px solid hsl(var(--border))', boxShadow: 'none' }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <StepIndicator current={step} total={2} />
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create return</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Shipment #{documentNo} &middot; {bpName}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Step 1: Review items */}
        {step === 1 && (
          <div className="px-6 pb-2">
            {/* Select all / Deselect all */}
            <div className="flex items-center gap-3 mb-3 text-xs">
              <button
                type="button"
                className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                onClick={selectAll}
              >
                Select all
              </button>
              <span className="text-muted-foreground/40">|</span>
              <button
                type="button"
                className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                onClick={deselectAll}
              >
                Deselect all
              </button>
            </div>

            {/* Lines table */}
            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-2 px-1 font-medium w-8" style={cellStyle} />
                    <th className="text-left py-2 px-2 font-medium" style={cellStyle}>Product</th>
                    <th className="text-right py-2 px-2 font-medium w-24" style={cellStyle}>Delivered</th>
                    <th className="text-right py-2 px-2 font-medium w-28" style={cellStyle}>Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isSelected = selected.has(line.id);
                    const maxQty = line.movementQuantity || 0;
                    return (
                      <tr key={line.id} className={isSelected ? '' : 'opacity-40'}>
                        <td className="py-2 px-1" style={cellStyle}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLine(line.id)}
                            className="rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-2 text-foreground" style={cellStyle}>
                          {line['product$_identifier'] || line.product$_identifier || '—'}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground" style={cellStyle}>
                          {maxQty}
                        </td>
                        <td className="py-2 px-2 text-right" style={cellStyle}>
                          <input
                            type="number"
                            min={0}
                            max={maxQty}
                            value={quantities[line.id] ?? 0}
                            onChange={(e) => setQty(line.id, e.target.value, maxQty)}
                            disabled={!isSelected}
                            className="w-20 text-right text-sm border border-border rounded px-2 py-1 tabular-nums bg-muted/20 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-30 disabled:bg-transparent"
                            style={{ borderWidth: '0.5px', borderRadius: '4px' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reason field */}
            <div className="mt-4">
              <label className="block text-xs text-muted-foreground mb-1">Reason for return</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
                className="w-full text-sm border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground/50"
                style={{ borderWidth: '0.5px' }}
              />
            </div>
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <div className="px-6 pb-2">
            <p className="text-sm text-muted-foreground mb-4">
              The following documents will be created:
            </p>

            {/* Document cards */}
            <div className="flex flex-col gap-2 mb-5">
              <div
                className="flex items-center gap-3 rounded-md px-4 py-3 bg-muted/30"
                style={{ border: '0.5px solid hsl(var(--border) / 0.5)' }}
              >
                <span className="text-blue-600 shrink-0">{ICONS.returnReceipt}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Return Receipt</p>
                  <p className="text-xs text-muted-foreground">Stock movement back to warehouse</p>
                </div>
              </div>
              <div
                className="flex items-center gap-3 rounded-md px-4 py-3 bg-muted/30"
                style={{ border: '0.5px solid hsl(var(--border) / 0.5)' }}
              >
                <span className="text-purple-600 shrink-0">{ICONS.creditNote}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Credit Note</p>
                  <p className="text-xs text-muted-foreground">Linked to original invoice</p>
                </div>
              </div>
            </div>

            {/* Summary table */}
            <div className="max-h-[180px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium" style={cellStyle}>Product</th>
                    <th className="text-right py-2 px-2 font-medium w-20" style={cellStyle}>Qty</th>
                    <th className="text-right py-2 px-2 font-medium w-32" style={cellStyle}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 px-2 text-foreground" style={cellStyle}>
                        {line['product$_identifier'] || line.product$_identifier || '—'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums" style={cellStyle}>
                        {quantities[line.id] || 0}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums" style={cellStyle}>
                        {getLinePrice(line) ? fmtAmount(getLineAmount(line)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td className="py-2 px-2 text-foreground">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totalReturnQty}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totalAmount > 0 ? fmtAmount(totalAmount) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {reason && (
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium">Reason:</span> {reason}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-6 py-4" style={{ borderTop: '0.5px solid hsl(var(--border) / 0.5)' }}>
          {step === 1 && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canProceed} onClick={() => setStep(2)}>
                Next
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={loading}>
                {loading ? 'Creating...' : 'Confirm return'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
