import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + abs[0] + ',' + abs[1] + ' ' + (curr || 'EUR');
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
          display: 'inline-flex', alignItems: 'center', gap: 6,
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
        display: 'inline-flex', alignItems: 'center', gap: 6,
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

function RowDirBadge({ isIn, size = 30 }) {
  const bg = isIn ? '#E2F7EA' : '#FDE2E9';
  const color = isIn ? '#17663A' : '#C5234A';
  const half = Math.round(size * 0.5);
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {isIn
        ? <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>
        : <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>}
    </div>
  );
}

const METHOD_ICONS = {
  transfer: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/></svg>,
  card:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  cash:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>,
  direct:   <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/></svg>,
};

function MethodIcon({ method }) {
  const key = (method || '').toLowerCase();
  const icon = METHOD_ICONS[key] || METHOD_ICONS.transfer;
  return <span style={{ display: 'inline-flex', color: '#9CA3AF' }}>{icon}</span>;
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
  const navigate = useNavigate();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const isSales = specName === 'sales-invoice';
  const paymentWindow = isSales ? 'payment-in' : 'payment-out';

  const handleRowClick = useCallback((p) => {
    onClose();
    navigate(`/${paymentWindow}/${p.id}`);
  }, [navigate, onClose, paymentWindow]);

  const currency = invoiceData?.['currency$_identifier'] || 'EUR';
  const grandTotal = parseFloat(invoiceData?.grandTotalAmount ?? 0);
  const outstandingAmt = parseFloat(invoiceData?.outstandingAmount ?? 0);
  const bpName = invoiceData?.['businessPartner$_identifier'] || invoiceData?.businessPartner || '';
  const docNo = invoiceData?.documentNo || '';
  const isCompleted = invoiceData?.documentStatus === 'CO';

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
      style={{ padding: 24 }}
      onClick={handleClose}
      data-testid="InvoicePaymentHistoryModal__backdrop"
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 720, maxWidth: '100%', maxHeight: '100%', borderRadius: 14, border: '0.5px solid #E3E7EC', boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__panel"
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid #E3E7EC', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RowDirBadge isIn={isSales} size={44} data-testid="RowDirBadge__b82d4f" />
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
        <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderBottom: '0.5px solid #E3E7EC', flexShrink: 0 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', border: '0.5px solid #E5E7EB' }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{ui('importeTotal')}</div>
            <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>{fmt(grandTotal, currency)}</div>
          </div>
          <div style={{
            background: outstandingAmt > 0 ? '#FFFBEB' : '#F0FDF4',
            borderRadius: 10,
            padding: '12px 14px',
            border: `0.5px solid ${outstandingAmt > 0 ? '#FDE68A' : '#BBF7D0'}`,
          }}>
            <div style={{ fontSize: 11, color: outstandingAmt > 0 ? '#92400E' : '#166534', marginBottom: 4 }}>
              {ui('saldoPendiente')}
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
              <RowDirBadge isIn={isSales} size={48} data-testid="RowDirBadge__b82d4f" />
              <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
                {isSales ? ui('noCobroYet') : ui('noPagoYet')}
              </p>
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 80px 95px 115px 118px 14px', gap: 8, padding: '10px 24px 8px', borderBottom: '0.5px solid #E3E7EC' }}>
                <div />
                {[ui('documentNo'), ui('date'), ui('paymentMethodCol'), ui('amount'), ui('statusLabel')].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</div>
                ))}
                <div />
              </div>
              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="InvoicePaymentHistoryModal__list">
                {payments.map((p) => {
                  const methodRaw = p['paymentMethod$_identifier'] || p.paymentMethod || '';
                  const methodKey = methodRaw.toLowerCase().replace(/transferencia|transfer/,'transfer').replace(/tarjeta|card/,'card').replace(/efectivo|cash/,'cash').replace(/domiciliaci[oó]n|direct/,'direct');
                  const amtSign = isSales ? '+ ' : '− ';
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleRowClick(p)}
                      className="hover-row"
                      style={{ display: 'grid', gridTemplateColumns: '26px 1fr 80px 95px 115px 118px 14px', gap: 8, padding: '13px 24px', borderBottom: '0.5px solid #F3F4F6', alignItems: 'center', cursor: 'pointer' }}
                      data-testid="InvoicePaymentHistoryModal__row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <RowDirBadge isIn={isSales} size={26} data-testid="RowDirBadge__b82d4f" />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.documentNo || p.id}
                      </div>
                      <div className="tabular-nums" style={{ fontSize: 12, color: '#6B7280' }}>
                        {fmtDate(p.paymentDate)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6B7280', overflow: 'hidden' }}>
                        <MethodIcon method={methodKey} data-testid="MethodIcon__b82d4f" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{methodRaw || '—'}</span>
                      </div>
                      <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: isSales ? '#17663A' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {amtSign}{fmt(p.amount, currency)}
                      </div>
                      <div>
                        <PaymentStateTag
                          status={p.status || ''}
                          isSales={isSales}
                          ui={ui}
                          data-testid="PaymentStateTag__b82d4f" />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#9CA3AF' }}>
                        <ChevronRight size={14} data-testid="ChevronRight__b82d4f" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {payments.length} {isSales
              ? (payments.length === 1 ? ui('cobroRegistrado') : ui('cobrosRegistrados'))
              : (payments.length === 1 ? ui('pagoRegistrado') : ui('pagosRegistrados'))}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              data-testid="InvoicePaymentHistoryModal__cerrar-btn"
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              {ui('close') || 'Cerrar'}
            </button>
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
      </div>
      {/* Step 2: new payment creation modal */}
      {showPaymentModal && createPortal(
        <NewPaymentEntryModal
          dir={isSales ? 'in' : 'out'}
          specName={specName}
          invoiceId={invoiceId}
          invoiceData={invoiceData}
          outstanding={outstandingAmt}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowPaymentModal(false)}
          onSaved={handlePaymentRegistered}
          data-testid="NewPaymentEntryModal__b82d4f" />,
        document.body,
      )}
    </div>
  );
}
