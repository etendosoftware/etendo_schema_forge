import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCurrency } from '@/lib/formatCurrency';
import { PaymentRegisterForm } from './InvoicePaymentModal';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'EUR', n);
}

function ReceiptIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

/**
 * InvoiceCobroModal — quick payment summary modal opened from the list view.
 *
 * Shows total amount, outstanding balance, existing payments, and a form
 * to register a new payment. Works for both sales-invoice (cobros) and
 * purchase-invoice (pagos).
 *
 * Props:
 *   invoiceId    — string, invoice record ID
 *   invoiceData  — object, invoice row data (amounts, status, partner, etc.)
 *   specName     — "sales-invoice" | "purchase-invoice"
 *   apiBaseUrl   — full base URL including spec (e.g. http://host/sws/neo/sales-invoice)
 *   onClose      — callback
 *   onPaymentAdded — optional callback after a payment is registered
 */
export default function InvoiceCobroModal({ invoiceId, invoiceData, specName, apiBaseUrl, onClose, onPaymentAdded }) {
  const ui = useUI();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const currency = invoiceData?.['currency$_identifier'] || 'EUR';
  const grandTotal = parseFloat(invoiceData?.grandTotalAmount ?? 0);
  const outstandingAmt = parseFloat(invoiceData?.outstandingAmount ?? 0);
  const bpName = invoiceData?.['businessPartner$_identifier'] || invoiceData?.businessPartner || '';
  const docNo = invoiceData?.documentNo || '';
  const isCompleted = invoiceData?.documentStatus === 'CO';

  const [payments, setPayments] = useState([]);
  const [scheduleId, setScheduleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const isSales = specName === 'sales-invoice';
  const title = isSales ? ui('invoiceReceipts') : ui('invoicePaymentsTitle');

  const fetchData = useCallback(async () => {
    if (!invoiceId || !base) { setLoading(false); return; }
    try {
      const [paymentsRes, scheduleRes] = await Promise.all([
        apiFetch(`/${specName}/header/${invoiceId}/action/invoicePayments`, { method: 'POST', body: '{}' }),
        apiFetch(`/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=1`),
      ]);
      if (paymentsRes.ok) setPayments((await paymentsRes.json())?.response?.data || []);
      if (scheduleRes.ok) {
        const items = (await scheduleRes.json())?.response?.data || [];
        setScheduleId(items[0]?.finPaymentScheduleID || items[0]?.id || null);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiFetch, base, invoiceId, specName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePaymentSuccess = () => {
    setShowForm(false);
    setLoading(true);
    fetchData();
    onPaymentAdded?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl flex flex-col"
        style={{ width: 480, maxHeight: '80vh', border: '0.5px solid #E5E7EB' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065F46', flexShrink: 0 }}>
              <ReceiptIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{title}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
                {bpName}{docNo ? ` · ${docNo}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '0.5px solid #E5E7EB', background: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
          >
            &times;
          </button>
        </div>

        {/* Summary boxes */}
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderBottom: '0.5px solid #F3F4F6' }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', border: '0.5px solid #E5E7EB' }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{ui('totalAmount')}</div>
            <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>{fmt(grandTotal, currency)}</div>
          </div>
          <div style={{
            background: outstandingAmt > 0 ? '#FFFBEB' : '#F0FDF4',
            borderRadius: 10,
            padding: '12px 14px',
            border: `0.5px solid ${outstandingAmt > 0 ? '#FDE68A' : '#BBF7D0'}`,
          }}>
            <div style={{ fontSize: 11, color: outstandingAmt > 0 ? '#92400E' : '#166534', marginBottom: 4 }}>
              {ui('outstandingLabel')}
            </div>
            <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 600, color: outstandingAmt > 0 ? '#92400E' : '#166534' }}>
              {fmt(outstandingAmt, currency)}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '0 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#9CA3AF', fontSize: 13 }}>
              {ui('loading')}
            </div>
          ) : showForm && scheduleId ? (
            <div style={{ padding: '16px 0' }}>
              <PaymentRegisterForm
                invoiceId={invoiceId}
                invoiceData={invoiceData}
                scheduleId={scheduleId}
                outstanding={outstandingAmt}
                currency={currency}
                specName={specName}
                apiFetch={apiFetch}
                onCancel={() => setShowForm(false)}
                onSuccess={handlePaymentSuccess}
              />
            </div>
          ) : payments.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0', gap: 10 }}>
              <div style={{ width: 48, height: 48, background: '#F3F4F6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
                <ReceiptIcon size={22} />
              </div>
              <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
                {isSales ? ui('noCobroYet') : ui('noPagoYet')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
              {payments.map(p => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid #F3F4F6' }}
                >
                  <div>
                    <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                      {fmt(p.amount, currency)}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      #{p.documentNo || p.id}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: '#D1FAE5', color: '#065F46' }}>
                    {ui('statusPaid')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {payments.length} {isSales ? ui('cobrosRegistrados') : ui('pagosRegistrados')}
          </span>
          {!showForm && outstandingAmt > 0 && isCompleted && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: 'pointer' }}
            >
              + {isSales ? ui('addCobro') : ui('addPago')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
