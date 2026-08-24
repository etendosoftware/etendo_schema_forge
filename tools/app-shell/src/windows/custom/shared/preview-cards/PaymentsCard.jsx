import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { paymentDisplayState } from '../paymentStatuses';


function fmtPayDate(raw) {
  return formatCalendarDate(raw, 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SectionCard({ title, titleRight, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        {titleRight}
      </div>
      <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function DirBadge({ isIn, size = 26 }) {
  const bg = isIn ? 'var(--status-success-bg)' : 'var(--status-destructive-bg)';
  const color = isIn ? 'var(--status-success-fg)' : 'hsl(var(--destructive))';
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

// Tone + copy per display state; the pill shape itself never changes.
const STATE_TAGS = {
  error: { testid: 'payments-card-state-error', bg: 'var(--status-destructive-bg)', fg: 'var(--status-destructive-fg)', labelKey: 'cpPaymentStateError' },
  inProgress: { testid: 'payments-card-state-in-progress', bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)', labelKey: 'cpPaymentStateInProgress' },
  deposited: { testid: 'payments-card-state-deposited', bg: 'var(--status-success-bg)', fg: 'var(--status-success-fg)', labelKey: 'statusDeposited' },
  draft: { testid: 'payments-card-state-draft', bg: 'hsl(var(--muted))', fg: 'hsl(var(--muted-foreground))', dot: 'hsl(var(--text-disabled))', labelKey: 'statusDraft' },
};

function StateTag({ payment, ui }) {
  // Same helper the invoice's payment modal uses, so a transfer the bank has only authorized reads
  // the same on both — it used to say "Depositado" here and "Pago en progreso" there (ETP-4895).
  const tag = STATE_TAGS[paymentDisplayState(payment)];
  return (
    <span
      data-testid={tag.testid}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, background: tag.bg, color: tag.fg, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.dot || tag.fg, flexShrink: 0 }} />
      {ui(tag.labelKey)}
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
 *   addPaymentBlockedByDraft boolean — invoice takes payments, but the drafts on it already
 *                            reserve the whole outstanding
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
  addPaymentBlockedByDraft = false,
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 5, background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--status-info-fg)', flexShrink: 0 }} />
        {ui('creditBalance')}
      </span>
    );
  } else if (canAddPayment) {
    titleRight = (
      <button
        onClick={onAddPayment}
        className="text-xs font-medium text-foreground underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
      >
        {ui('previewCardAddPayment')}
      </button>
    );
  } else if (addPaymentBlockedByDraft) {
    // Shown, but inert: the reason it is unavailable is what the user needs to act on.
    titleRight = (
      <span
        className="text-xs font-medium text-muted-foreground"
        title={ui('cpAddPaymentBlockedByDraft')}
      >
        {ui('previewCardAddPayment')}
      </span>
    );
  } else if (isFullyPaid) {
    titleRight = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: 'var(--status-success-fg)' }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {isIn ? ui('cobrada') : ui('pagada')}
      </span>
    );
  }

  let content;
  if (loading) {
    content = <p className="text-xs text-muted-foreground py-4 text-center">{ui('loading')}</p>;
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
        {/* Neutral document icon — the empty state has no direction, so no in/out arrow. */}
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', flexShrink: 0 }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        </div>
        <p style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', textAlign: 'center', margin: 0 }}>
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
          const amtColor = isIn ? 'var(--status-success-fg)' : 'hsl(var(--foreground))';
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
                borderBottom: idx < payments.length - 1 ? '0.5px solid hsl(var(--muted))' : 'none',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              className="hover:bg-muted transition-colors"
              data-testid={`PaymentsCard__row-${idx}`}
            >
              <DirBadge isIn={isIn} data-testid="DirBadge__c6fe34" />
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '600 12px/16px JetBrains Mono, monospace', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.documentNo || p.id}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, color: 'hsl(var(--text-disabled))' }}>
                  <span style={{ display: 'inline-flex' }}>{METHOD_ICONS[methodKey]}</span>
                  <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {methodRaw || fmtPayDate(p.paymentDate)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <span className="tabular-nums" style={{ font: '600 13px/17px Inter', color: amtColor, whiteSpace: 'nowrap' }}>
                  {amtSign}{formatCurrency(currency, p.amount)}
                </span>
                <StateTag payment={p} ui={ui} data-testid="StateTag__c6fe34" />
              </div>
            </div>
          );
        })}
        {totalOutstanding > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '0.5px solid hsl(var(--muted))', background: 'var(--status-warning-bg)' }}>
            <span style={{ fontSize: 12, color: 'var(--status-warning-fg)' }}>{ui('invoicePendingPayment')}</span>
            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-warning-fg)' }}>
              {formatCurrency(currencyCode, totalOutstanding)}
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
