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

function MiniCheck({ checked, onChange }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(); } }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        borderRadius: 3,
        border: checked ? 'none' : '1px solid #D1D5DB',
        backgroundColor: checked ? '#f59e0b' : '#fff',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background-color 150ms, border-color 150ms',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

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
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: i + 1 === current ? '#f59e0b' : 'rgba(156,163,175,0.3)' }}
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
        <div className="px-6 pt-5 pb-4" style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #E5E7EB', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
          <StepIndicator current={step} total={2} />
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create Return from Shipment</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Shipment #{documentNo} &middot; {bpName}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Step 1: Review items */}
        {step === 1 && (
          <div className="px-6 pb-4 border-b border-border">
            {/* Lines table */}
            <div className="max-h-[280px] overflow-y-auto" style={{ marginTop: 16 }}>
              <table className="w-full" style={{ fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em' }}>
                    <th className="text-left px-1" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>
                      <MiniCheck
                        checked={selected.size === lines.length && lines.length > 0}
                        onChange={() => { selected.size === lines.length ? deselectAll() : selectAll(); }}
                      />
                    </th>
                    <th className="text-left px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Product</th>
                    <th className="text-right px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Delivered</th>
                    <th className="text-right px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isSelected = selected.has(line.id);
                    const maxQty = line.movementQuantity || 0;
                    return (
                      <tr key={line.id} className={isSelected ? '' : 'opacity-40'}>
                        <td className="px-1" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6 }}>
                          <MiniCheck
                            checked={isSelected}
                            onChange={() => toggleLine(line.id)}
                          />
                        </td>
                        <td className="px-2 text-foreground" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line['product$_identifier'] || line.product$_identifier || '—'}
                        </td>
                        <td className="px-2 text-right tabular-nums text-muted-foreground" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6 }}>
                          {maxQty}
                        </td>
                        <td style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6, textAlign: 'right', paddingLeft: 8, paddingRight: 8 }}>
                          <input
                            type="number"
                            min={0}
                            max={maxQty}
                            value={quantities[line.id] ?? 0}
                            onChange={(e) => setQty(line.id, e.target.value, maxQty)}
                            disabled={!isSelected}
                            className="border border-border rounded tabular-nums bg-muted/20 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-30 disabled:bg-transparent"
                            style={{ width: 70, textAlign: 'center', borderWidth: '0.5px', borderRadius: 4, fontSize: 13, paddingTop: 4, paddingBottom: 4, paddingLeft: 4, paddingRight: 4, marginLeft: 'auto', display: 'block' }}
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
          <div className="px-6 pb-4 border-b border-border">
            <p className="text-sm text-muted-foreground mb-4" style={{ paddingTop: 16 }}>
              The following documents will be created:
            </p>

            {/* Document cards */}
            <div className="flex flex-col mb-5" style={{ gap: 8 }}>
              <div
                className="flex items-center gap-3"
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}
              >
                <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#EFF6FF' }}>
                  <span className="text-blue-600">{ICONS.returnReceipt}</span>
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Return Receipt</p>
                  <p className="text-xs text-muted-foreground">Stock movement back to warehouse</p>
                </div>
              </div>
              <div
                className="flex items-center gap-3"
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}
              >
                <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3E8FF' }}>
                  <span className="text-purple-600">{ICONS.creditNote}</span>
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Credit Note</p>
                  <p className="text-xs text-muted-foreground">Linked to original invoice</p>
                </div>
              </div>
            </div>

            <div className="border-b border-border mb-4" />

            {/* Summary table */}
            <div className="max-h-[180px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em' }}>
                    <th className="text-left px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Product</th>
                    <th className="text-right px-2 w-20" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Qty</th>
                    <th className="text-right px-2 w-32" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>Amount</th>
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
        <DialogFooter className="px-6 pt-5 pb-4" style={{ backgroundColor: '#F8F9FA', borderTop: '1px solid #E5E7EB' }}>
          {step === 1 && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" className="bg-amber-400 text-black hover:bg-amber-500 border-transparent font-medium" disabled={!canProceed} onClick={() => setStep(2)}>
                Next
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button size="sm" className="bg-amber-400 text-black hover:bg-amber-500 border-transparent font-medium" onClick={handleConfirm} disabled={loading}>
                {loading ? 'Creating...' : 'Confirm return'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
