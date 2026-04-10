import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '\u20ac', GBP: '\u00a3', JPY: '\u00a5',
  CHF: 'CHF', BRL: 'R$', ARS: '$', MXN: '$', COP: '$', PEN: 'S/',
};

function formatAmount(value, currency) {
  const num = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  const symbol = CURRENCY_SYMBOLS[currency] || currency || '';
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol} ${formatted}` : formatted;
}

const cellStyle = { borderBottom: '0.5px solid hsl(var(--border) / 0.5)' };
const headerCellStyle = {
  ...cellStyle,
  backgroundColor: 'hsl(var(--muted) / 0.35)',
};

/**
 * ApplyToInvoices — CustomLines component for Payment In.
 * Renders as a tab inside DetailView via the CustomLines prop.
 *
 * Props come from DetailView's CustomLines interface:
 *   recordId, data, status, token, apiBaseUrl, api, editing, onRefresh
 */
export default function ApplyToInvoices({
  recordId,
  data,
  status,
  token,
  apiBaseUrl,
  api,
  onRefresh,
}) {
  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [amounts, setAmounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const ui = useUI();

  const businessPartnerId = data?.businessPartner;
  const paymentAmount = data?.amount;
  const isReadOnly = status && status !== 'RPAP';

  const base = useMemo(() => {
    if (!apiBaseUrl) return '';
    return apiBaseUrl.replace(/\/[^/]+$/, '');
  }, [apiBaseUrl]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // Fetch pending invoices when BP changes
  useEffect(() => {
    if (!businessPartnerId || !recordId || !token || !base) {
      setInvoices([]);
      setSelected(new Set());
      setAmounts({});
      return;
    }

    let cancelled = false;

    async function fetchInvoices() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${base}/payment-in/finPayment/${recordId}/action/pendingInvoices?bpartnerId=${businessPartnerId}`,
          { headers },
        );
        if (!res.ok) throw new Error(`Failed to fetch pending invoices (${res.status})`);
        const json = await res.json();
        const rows = json?.response?.data || [];
        if (!cancelled) {
          setInvoices(rows);
          const sel = new Set();
          const defaultAmounts = {};
          for (const inv of rows) {
            sel.add(inv.scheduleId);
            defaultAmounts[inv.scheduleId] = inv.outstandingAmount ?? 0;
          }
          setSelected(sel);
          setAmounts(defaultAmounts);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInvoices();
    return () => { cancelled = true; };
  }, [businessPartnerId, recordId, token, base, headers]);

  // Selection helpers
  const toggleLine = useCallback((scheduleId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(invoices.map((inv) => inv.scheduleId)));
  }, [invoices]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const setApplyAmount = useCallback((scheduleId, value, max) => {
    const num = Math.max(0, Math.min(Number(value) || 0, max));
    setAmounts((prev) => ({ ...prev, [scheduleId]: num }));
  }, []);

  // Computed totals
  const totalApplied = useMemo(() => {
    let sum = 0;
    for (const id of selected) {
      sum += amounts[id] || 0;
    }
    return sum;
  }, [selected, amounts]);

  const currency = invoices[0]?.currency || '';
  const paymentNum = typeof paymentAmount === 'string'
    ? Number.parseFloat(paymentAmount) : (paymentAmount ?? 0);

  // Apply to invoices + Process Payment
  const handleApplyAndProcess = useCallback(async () => {
    const selectedInvoices = invoices
      .filter((inv) => selected.has(inv.scheduleId) && (amounts[inv.scheduleId] || 0) > 0)
      .map((inv) => ({
        scheduleId: inv.scheduleId,
        amount: String(amounts[inv.scheduleId]),
      }));

    if (selectedInvoices.length === 0) {
      toast.error(ui('selectAtLeastOneInvoiceToApply'));
      return;
    }

    if (totalApplied > paymentNum) {
      toast.error(ui('totalAppliedExceedsPaymentAmount'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Step 1: Apply payment to selected invoices
      const applyRes = await fetch(
        `${base}/payment-in/finPayment/${recordId}/action/applyToInvoices`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ invoices: selectedInvoices }),
        },
      );

      if (!applyRes.ok) {
        const errJson = await applyRes.json().catch(() => null);
        throw new Error(errJson?.response?.message || errJson?.message || `Apply failed (${applyRes.status})`);
      }

      // Step 2: Process Payment (aPRMProcessPayment action)
      const processRes = await fetch(
        `${base}/payment-in/finPayment/${recordId}/action/aPRMProcessPayment`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      );

      if (!processRes.ok) {
        const errJson = await processRes.json().catch(() => null);
        throw new Error(errJson?.response?.message || errJson?.message || `Process failed (${processRes.status})`);
      }

      toast.success(ui('paymentRegisteredSuccessfully'));
      onRefresh?.();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }, [invoices, selected, amounts, totalApplied, paymentNum, base, recordId, headers, onRefresh]);

  // No business partner selected
  if (!businessPartnerId) {
    return (
      <div className="px-1 py-6 text-sm text-muted-foreground text-center">
        {ui('selectBusinessPartnerToViewPendingInvoices')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-1 py-6 text-sm text-muted-foreground text-center">
        {ui('loadingInvoices')}
      </div>
    );
  }

  if (error && invoices.length === 0) {
    return (
      <div className="px-1 py-6 text-sm text-center">
        <span className="text-destructive">{error}</span>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="px-1 py-6 text-sm text-muted-foreground text-center">
        {isReadOnly
          ? ui('noInvoicesAppliedToThisPayment')
          : ui('noPendingInvoicesFoundForThisBusinessPartner')}
      </div>
    );
  }

  // Read-only view (processed payments)
  if (isReadOnly) {
    return (
      <div className="w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium" style={headerCellStyle}>{ui('invoiceNumber')}</th>
                <th className="text-left py-2 px-3 font-medium" style={headerCellStyle}>{ui('dueDate')}</th>
                <th className="text-right py-2 px-3 font-medium" style={headerCellStyle}>{ui('totalAmount')}</th>
                <th className="text-right py-2 px-3 font-medium" style={headerCellStyle}>{ui('outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.scheduleId}>
                  <td className="py-2 px-3" style={cellStyle}>
                    <button
                      type="button"
                      className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-sm"
                      onClick={() => navigate(`/sales-invoice/${inv.invoiceId}`)}
                    >
                      {inv.invoiceNo || '-'}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground" style={cellStyle}>
                    {inv.dueDate || '-'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={cellStyle}>
                    {formatAmount(inv.totalAmount, currency)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={cellStyle}>
                    {formatAmount(inv.outstandingAmount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Editable view (draft / RPAP payments)
  return (
    <div className="w-full">
      {/* Select all / Deselect all */}
      <div className="flex items-center gap-3 mb-3 text-xs px-1">
        <button
          type="button"
          className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
          onClick={selectAll}
        >
          {ui('selectAll')}
        </button>
        <span className="text-muted-foreground/40">|</span>
        <button
          type="button"
          className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
          onClick={deselectAll}
        >
          {ui('deselectAll')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left py-2 px-1 font-medium w-8" style={headerCellStyle} />
              <th className="text-left py-2 px-3 font-medium" style={headerCellStyle}>{ui('invoiceNumber')}</th>
              <th className="text-left py-2 px-3 font-medium w-24" style={headerCellStyle}>{ui('dueDate')}</th>
              <th className="text-right py-2 px-3 font-medium w-28" style={headerCellStyle}>{ui('totalAmount')}</th>
              <th className="text-right py-2 px-3 font-medium w-28" style={headerCellStyle}>{ui('outstanding')}</th>
              <th className="text-right py-2 px-3 font-medium w-32" style={headerCellStyle}>{ui('apply')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const isSelected = selected.has(inv.scheduleId);
              const outstanding = inv.outstandingAmount ?? 0;
              return (
                <tr key={inv.scheduleId} className={isSelected ? '' : 'opacity-40'}>
                  <td className="py-2 px-1" style={cellStyle}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleLine(inv.scheduleId)}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-3" style={cellStyle}>
                    <button
                      type="button"
                      className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-sm"
                      onClick={() => navigate(`/sales-invoice/${inv.invoiceId}`)}
                    >
                      {inv.invoiceNo || '-'}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground" style={cellStyle}>
                    {inv.dueDate || '-'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={cellStyle}>
                    {formatAmount(inv.totalAmount, currency)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={cellStyle}>
                    {formatAmount(outstanding, currency)}
                  </td>
                  <td className="py-2 px-3 text-right" style={cellStyle}>
                    <input
                      type="number"
                      min={0}
                      max={outstanding}
                      step="0.01"
                      value={amounts[inv.scheduleId] ?? 0}
                      onChange={(e) => setApplyAmount(inv.scheduleId, e.target.value, outstanding)}
                      disabled={!isSelected}
                      className="w-24 text-right text-sm border border-border rounded px-2 py-1 tabular-nums bg-muted/20 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-30 disabled:bg-transparent"
                      style={{ borderWidth: '0.5px', borderRadius: '4px' }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-medium text-sm">
              <td colSpan={5} className="py-2 px-3 text-right text-muted-foreground">
                {ui('totalToApply')}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                <span className={totalApplied > paymentNum ? 'text-destructive' : ''}>
                  {formatAmount(totalApplied, currency)}
                </span>
                <span className="text-muted-foreground font-normal">
                  {' / '}
                  {formatAmount(paymentNum, currency)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Over-allocation warning */}
      {totalApplied > paymentNum && (
        <div className="mt-2 px-1 text-xs text-destructive">
          {ui('totalAppliedExceedsPaymentAmount')}
        </div>
      )}

      {/* Apply & Process button */}
      <div className="mt-4 flex justify-end px-1">
        <button
          type="button"
          onClick={handleApplyAndProcess}
          disabled={saving || selected.size === 0 || totalApplied > paymentNum}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? ui('processing') : ui('applyAndProcessPayment')}
        </button>
      </div>

      {/* Error from save */}
      {error && (
        <div className="mt-2 px-1 text-xs text-destructive">{error}</div>
      )}
    </div>
  );
}
