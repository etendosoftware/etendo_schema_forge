import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCurrency } from '@/lib/formatCurrency';
import NewPaymentModal from './NewPaymentModal';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'EUR', n);
}

function fmtDate(raw) {
  if (!raw) return '—';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);

function PaymentStateTag({ status, isSales, ui }) {
  const isDeposited = PAID_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span
        data-testid="PaymentStateTag__deposited"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 10px', borderRadius: 6,
          background: '#E2F7EA', color: '#17663A',
          fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {isSales ? ui('cobroDepositado') : ui('pagoDepositado')}
      </span>
    );
  }
  return (
    <span
      data-testid="PaymentStateTag__draft"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 10px', borderRadius: 6,
        background: '#F1F2F4', color: '#55556D',
        fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('draft')}
    </span>
  );
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
 * InvoicePaymentHistoryModal — intermediate popup opened from the "Pendiente de pago" badge
 * in the invoice list (Step 1 of the two-step payment flow).
 *
 * Shows existing payment records for the invoice and offers an "Añadir cobro/pago" button
 * that opens NewPaymentModal (Step 2) for registration.
 *
 * Props:
 *   invoiceId      — string, invoice record ID
 *   invoiceData    — object, invoice row data (amounts, status, partner, etc.)
 *   specName       — "sales-invoice" | "purchase-invoice"
 *   apiBaseUrl     — full base URL including spec (e.g. http://host/sws/neo/sales-invoice)
 *   onClose        — callback when the popup is dismissed
 *   onPaymentAdded — optional callback after a payment is successfully registered
 */
export default function InvoicePaymentHistoryModal({
  invoiceId,
  invoiceData,
  specName,
  apiBaseUrl,
  onClose,
  onPaymentAdded,
}) {
  const ui = useUI();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const currency = invoiceData?.['currency$_identifier'] || 'EUR';
  const grandTotal = parseFloat(invoiceData?.grandTotalAmount ?? 0);
  const outstandingAmt = parseFloat(invoiceData?.outstandingAmount ?? 0);
  const bpName = invoiceData?.['businessPartner$_identifier'] || invoiceData?.businessPartner || '';
  const docNo = invoiceData?.documentNo || '';
  const isCompleted = invoiceData?.documentStatus === 'CO';
  const isSales = specName === 'sales-invoice';

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Track whether a payment was added so we notify the parent on close
  const [paymentWasAdded, setPaymentWasAdded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!invoiceId || !base) { setLoading(false); return; }
    try {
      const res = await apiFetch(
        `/${specName}/header/${invoiceId}/action/invoicePayments`,
        { method: 'POST', body: '{}' },
      );
      if (res.ok) setPayments((await res.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiFetch, base, invoiceId, specName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close NewPaymentModal and refresh the list; keep history open.
  // onPaymentAdded is deferred to handleClose so the invoice table refreshes
  // only when the user dismisses the history popup, not immediately.
  const handlePaymentRegistered = useCallback(() => {
    setShowPaymentModal(false);
    setPaymentWasAdded(true);
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleClose = useCallback(() => {
    if (paymentWasAdded) onPaymentAdded?.();
    onClose();
  }, [onClose, onPaymentAdded, paymentWasAdded]);

  const title = isSales ? ui('invoiceReceipts') : ui('invoicePaymentsTitle');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleClose}
      data-testid="InvoicePaymentHistoryModal__backdrop"
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 520, maxHeight: '82vh', borderRadius: 14, border: '0.5px solid #E3E7EC', boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__panel"
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E3E7EC', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065F46', flexShrink: 0 }}>
              <ReceiptIcon size={20} data-testid="ReceiptIcon__b82d4f" />
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
            onClick={handleClose}
            data-testid="InvoicePaymentHistoryModal__close"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '0.5px solid #E5E7EB', background: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
          >
            &times;
          </button>
        </div>

        {/* Summary boxes */}
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderBottom: '0.5px solid #E3E7EC', flexShrink: 0 }}>
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

        {/* Payment history table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#9CA3AF', fontSize: 13 }}>
              {ui('loading')}
            </div>
          ) : payments.length === 0 ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10 }}
              data-testid="InvoicePaymentHistoryModal__empty"
            >
              <div style={{ width: 48, height: 48, background: '#F3F4F6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
                <ReceiptIcon size={22} />
              </div>
              <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
                {isSales ? ui('noCobroYet') : ui('noPagoYet')}
              </p>
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 140px', gap: 8, padding: '10px 20px 8px', borderBottom: '0.5px solid #E3E7EC' }}>
                {[ui('documentNo'), ui('date'), ui('paymentMethodCol'), ui('amount'), ui('statusLabel')].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="InvoicePaymentHistoryModal__list">
                {payments.map((p) => {
                  const method = p['paymentMethod$_identifier'] || p.paymentMethod || '—';
                  return (
                    <div
                      key={p.id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 140px', gap: 8, padding: '10px 20px', borderBottom: '0.5px solid #F3F4F6', alignItems: 'center' }}
                      data-testid="InvoicePaymentHistoryModal__row"
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.documentNo || p.id}
                      </div>
                      <div className="tabular-nums" style={{ fontSize: 12, color: '#6B7280' }}>
                        {fmtDate(p.paymentDate)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {method}
                      </div>
                      <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                        {fmt(p.amount, currency)}
                      </div>
                      <div>
                        <PaymentStateTag status={p.status || ''} isSales={isSales} ui={ui} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {payments.length} {isSales ? ui('cobrosRegistrados') : ui('pagosRegistrados')}
          </span>
          {outstandingAmt > 0 && isCompleted && (
            <button
              type="button"
              onClick={() => setShowPaymentModal(true)}
              data-testid="InvoicePaymentHistoryModal__add-btn"
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: 'pointer' }}
            >
              + {isSales ? ui('addCobro') : ui('addPago')}
            </button>
          )}
        </div>
      </div>

      {/* Step 2: new payment creation modal */}
      {showPaymentModal && createPortal(
        <NewPaymentModal
          invoiceId={invoiceId}
          invoiceData={invoiceData}
          specName={specName}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowPaymentModal(false)}
          onPaymentAdded={handlePaymentRegistered}
          data-testid="NewPaymentModal__from-history"
        />,
        document.body,
      )}
    </div>
  );
}
