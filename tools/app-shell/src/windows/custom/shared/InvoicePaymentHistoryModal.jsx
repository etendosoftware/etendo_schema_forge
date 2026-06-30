import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';

function addThousandDots(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return out;
}

/** Short currency suffix: "€" for EUR (or unknown), otherwise the ISO code. */
function curSuffix(curr) {
  return !curr || curr === 'EUR' ? '€' : curr;
}

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + addThousandDots(abs[0]) + ',' + abs[1] + ' ' + curSuffix(curr);
}

function fmtDate(raw) {
  if (!raw) return '—';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Processed APRM statuses. PWNC ("Withdrawn not Cleared") and RPAE ("Awaiting
// Execution") are the processed states for payments-out / deferred accounts —
// without them a confirmed purchase payment was mislabeled as "Borrador".
const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE']);

function PaymentStateTag({ status, processed, isSales, ui }) {
  // The `processed` flag from the backend is the source of truth; the status
  // whitelist is a fallback for rows that don't carry it.
  const isDeposited = processed === true || PAID_STATUSES.has(status);
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

function getCountLabel(isSales, count, ui) {
  if (isSales) {
    return count === 1 ? ui('cobroRegistrado') : ui('cobrosRegistrados');
  }
  return count === 1 ? ui('pagoRegistrado') : ui('pagosRegistrados');
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
  const partyLabel = isSales ? ui('customer') : ui('vendor');
  const canAddPayment = outstandingAmt > 0 && isCompleted;

  // Table layout: Nº documento · Fecha · Método · Estado · Importe (right).
  // 760px modal − 48px side padding − 48px column gaps = 664px to distribute.
  // Fixed columns: Fecha 110 + Método 170 + Estado 150 + Importe 120 = 550px.
  // 1fr (Nº documento) = 664 − 550 = 114px — enough for typical doc numbers.
  const GRID = '1fr 110px 170px 150px 120px';
  const HCELL = { fontSize: 12, lineHeight: '16px', fontWeight: 600, color: '#121217', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  let historyBody;
  if (loading) {
    historyBody = (
      <div style={{ textAlign: 'center', padding: '36px 0', color: '#9CA3AF', fontSize: 13 }}>
        {ui('loading')}
      </div>
    );
  } else if (payments.length === 0) {
    historyBody = (
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10 }}
        data-testid="InvoicePaymentHistoryModal__empty"
      >
        <RowDirBadge isIn={isSales} size={48} data-testid="RowDirBadge__b82d4f" />
        <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
          {isSales ? ui('noCobroYet') : ui('noPagoYet')}
        </p>
      </div>
    );
  } else {
    historyBody = (
      <div>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 24px', borderBottom: '1px solid #E8EAEF' }}>
          <div style={HCELL}>{ui('documentNo')}</div>
          <div style={HCELL}>{ui('date')}</div>
          <div style={HCELL}>{ui('paymentMethodCol')}</div>
          <div style={HCELL}>{ui('statusLabel')}</div>
          <div style={HCELL}>{ui('amount')}</div>
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
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '11px 24px', borderBottom: '1px solid #F1F2F4', alignItems: 'center', cursor: 'pointer' }}
                data-testid="InvoicePaymentHistoryModal__row"
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#121217', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.documentNo || p.id}
                </div>
                <div className="tabular-nums" style={{ fontSize: 14, color: '#121217' }}>
                  {fmtDate(p.paymentDate)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', padding: '2px 8px', borderRadius: 360, background: '#F5F7F9', color: '#3F3F50', fontSize: 12, lineHeight: '16px' }}>
                    <MethodIcon method={methodKey} data-testid="MethodIcon__b82d4f" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{methodRaw || '—'}</span>
                  </span>
                </div>
                <div>
                  <PaymentStateTag
                    status={p.status || ''}
                    processed={p.processed}
                    isSales={isSales}
                    ui={ui}
                    data-testid="PaymentStateTag__b82d4f" />
                </div>
                <div className="tabular-nums" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: isSales ? '#17663A' : '#C5234A', whiteSpace: 'nowrap' }}>
                  {amtSign}{fmt(p.amount, currency)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      style={{ padding: 24 }}
      onClick={handleClose}
      data-testid="InvoicePaymentHistoryModal__backdrop"
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 760, maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 0 0 1px rgba(18,18,23,0.1), 0 24px 48px rgba(18,18,23,0.03), 0 10px 18px rgba(18,18,23,0.03), 0 5px 8px rgba(18,18,23,0.04), 0 2px 4px rgba(18,18,23,0.04)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__panel"
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleClose}
            aria-label={ui('close')}
            data-testid="InvoicePaymentHistoryModal__close"
            style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 360, border: 'none', background: 'none', cursor: 'pointer', color: '#828FA3', fontSize: 20, lineHeight: 1 }}
          >
            &times;
          </button>
          <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, color: '#121217' }}>{title}</div>
          {docNo && (
            <span style={{ alignSelf: 'flex-start', fontSize: 12, lineHeight: '16px', color: '#3F3F50', background: '#F5F7F9', borderRadius: 8, padding: '4px 8px' }}>
              {docNo}
            </span>
          )}
        </div>

        {/* Summary widget — Cliente/Proveedor · Importe total · Saldo pendiente */}
        <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid #E8EAEF', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{partyLabel}</div>
              <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: '#121217', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName || '—'}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{ui('importeTotal')}</div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: '#121217' }}>{fmt(grandTotal, currency)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{ui('saldoPendiente')}</div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: outstandingAmt > 0 ? '#C28800' : '#17663A' }}>{fmt(outstandingAmt, currency)}</div>
            </div>
          </div>
        </div>

        {/* Payment history table */}
        <div className="flex-1 overflow-y-auto">
          {historyBody}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E8EAEF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: '#3F3F50' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M18 9v6"/></svg>
            {payments.length} {getCountLabel(isSales, payments.length, ui)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              data-testid="InvoicePaymentHistoryModal__cerrar-btn"
              style={{ fontSize: 14, lineHeight: '24px', fontWeight: 500, padding: '8px 12px', borderRadius: 360, border: 'none', background: 'none', color: '#121217', cursor: 'pointer' }}
            >
              {ui('cancel')}
            </button>
            {canAddPayment && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                data-testid="InvoicePaymentHistoryModal__add-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '24px', fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', background: '#121217', color: '#fff', cursor: 'pointer' }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                {isSales ? ui('addCobro') : ui('addPago')}
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
