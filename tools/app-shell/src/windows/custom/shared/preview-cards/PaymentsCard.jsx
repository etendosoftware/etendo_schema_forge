import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';

// Processed APRM statuses. PWNC ("Withdrawn not Cleared") and RPAE ("Awaiting
// Execution") are the processed states for payments-out / deferred accounts.
const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE']);

function fmtPayDate(raw) {
  return formatCalendarDate(raw, 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addThousandDots(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return out;
}

function fmt(val) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + addThousandDots(abs[0]) + ',' + abs[1];
}

function SectionCard({ title, titleRight, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        {titleRight}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function DirBadge({ isIn, size = 26 }) {
  const bg = isIn ? '#E2F7EA' : '#FDE2E9';
  const color = isIn ? '#17663A' : '#C5234A';
  const half = Math.round(size * 0.5);
  return (
    <div style={{ width: size, height: size, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {isIn
        ? <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>
        : <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>}
    </div>
  );
}

const METHOD_ICONS = {
  transfer: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/></svg>,
  card:     <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  cash:     <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>,
  direct:   <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/></svg>,
};

function resolveMethodKey(name) {
  const s = (name || '').toLowerCase();
  if (s.includes('transferencia') || s.includes('transfer')) return 'transfer';
  if (s.includes('tarjeta') || s.includes('card')) return 'card';
  if (s.includes('efectivo') || s.includes('cash')) return 'cash';
  if (s.includes('domiciliac') || s.includes('direct')) return 'direct';
  return 'transfer';
}

function StateTag({ status, processed, ui }) {
  // The backend `processed` flag is the source of truth; the status whitelist
  // is a fallback for rows that don't carry it.
  const isDeposited = processed === true || PAID_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, background: '#E2F7EA', color: '#17663A', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {ui('statusDeposited')}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, background: '#F1F2F4', color: '#55556D', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('statusDraft')}
    </span>
  );
}

/**
 * PaymentsCard — payment history in invoice preview panel.
 *
 * Props:
 *   payments        array   — from invoicePayments action: { id, documentNo, paymentDate, paymentMethod$_identifier, amount, status }
 *   currencyCode    string
 *   totalOutstanding number
 *   canAddPayment   boolean
 *   isFullyPaid     boolean
 *   loading         boolean
 *   onAddPayment    function
 *   specName        string  — 'sales-invoice' | 'purchase-invoice'
 */
export default function PaymentsCard({
  payments = [],
  currencyCode = '',
  totalOutstanding = 0,
  canAddPayment = false,
  isFullyPaid = false,
  isCreditNote = false,
  loading = false,
  onAddPayment,
  specName = 'purchase-invoice',
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const isIn = specName === 'sales-invoice';
  const paymentWindow = isIn ? 'payment-in' : 'payment-out';

  let titleRight = null;
  if (isCreditNote) {
    titleRight = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 5, background: '#EDE9FE', color: '#5B21B6' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C3AED', flexShrink: 0 }} />
        {ui('creditBalance')}
      </span>
    );
  } else if (canAddPayment) {
    titleRight = (
      <button
        onClick={onAddPayment}
        className="text-xs font-medium text-gray-900 underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
      >
        {ui('previewCardAddPayment')}
      </button>
    );
  } else if (isFullyPaid) {
    titleRight = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: '#17663A' }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {isIn ? ui('cobrada') : ui('pagada')}
      </span>
    );
  }

  let content;
  if (loading) {
    content = <p className="text-xs text-gray-400 py-4 text-center">{ui('loading')}</p>;
  } else if (payments.length === 0) {
    let emptyLabel;
    if (isCreditNote) {
      emptyLabel = ui('noApplicationsRegistered');
    } else if (isIn) {
      emptyLabel = ui('noCobroYet');
    } else {
      emptyLabel = ui('noPagoYet');
    }
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', gap: 8 }}>
        <DirBadge isIn={isIn} size={36} data-testid="DirBadge__c6fe34" />
        <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
          {emptyLabel}
        </p>
      </div>
    );
  } else {
    content = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {payments.map((p, idx) => {
          const methodRaw = p['paymentMethod$_identifier'] || p.paymentMethod || '';
          const methodKey = resolveMethodKey(methodRaw);
          const amtColor = isIn ? '#17663A' : '#19191D';
          const amtSign = isIn ? '+ ' : '− ';
          const currency = currencyCode || p['currency$_identifier'] || '';
          return (
            <div
              key={p.id || idx}
              onClick={() => navigate(`/${paymentWindow}/${p.id}`)}
              style={{
                display: 'grid',
                gridTemplateColumns: '26px 1fr auto',
                gap: 8,
                padding: '11px 14px',
                borderBottom: idx < payments.length - 1 ? '0.5px solid #F3F4F6' : 'none',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              className="hover:bg-gray-50 transition-colors"
              data-testid={`PaymentsCard__row-${idx}`}
            >
              <DirBadge isIn={isIn} data-testid="DirBadge__c6fe34" />
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '600 12px/16px JetBrains Mono, monospace', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.documentNo || p.id}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, color: '#9CA3AF' }}>
                  <span style={{ display: 'inline-flex' }}>{METHOD_ICONS[methodKey]}</span>
                  <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {methodRaw || fmtPayDate(p.paymentDate)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <span className="tabular-nums" style={{ font: '600 13px/17px Inter', color: amtColor, whiteSpace: 'nowrap' }}>
                  {amtSign}{fmt(p.amount)} {currency}
                </span>
                <StateTag status={p.status || ''} processed={p.processed} ui={ui} data-testid="StateTag__c6fe34" />
              </div>
            </div>
          );
        })}
        {totalOutstanding > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '0.5px solid #F3F4F6', background: '#FFFBEB' }}>
            <span style={{ fontSize: 12, color: '#92400E' }}>{ui('invoicePendingPayment')}</span>
            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>
              {fmt(totalOutstanding)} {currencyCode}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <SectionCard
      title={ui('previewCardPayments')}
      titleRight={titleRight}
      data-testid="SectionCard__c6fe34">
      {content}
    </SectionCard>
  );
}
