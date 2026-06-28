import { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'EUR', n);
}

function parseInput(str) {
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── Direction badge (arrow-down cobro / arrow-up pago) ───────────────────────

function DirBadge({ dir, size = 36 }) {
  const isIn = dir === 'in';
  const bg = isIn ? '#E2F7EA' : '#FDE2E9';
  const color = isIn ? '#17663A' : '#C5234A';
  const half = Math.round(size * 0.5);
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {isIn
        ? <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>
        : <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>
      }
    </div>
  );
}

// ─── Credit / balance line themes ────────────────────────────────────────────

const CREDIT_THEME = {
  credit: {
    border: '#E0D6FA', bg: '#F8F6FE', rowSel: '#F2ECFD', rowBorder: '#EADFFB',
    ink: '#5423E7', inkDark: '#4B2EAE', inkSoft: '#7E6BB0',
    tagBg: '#EDE7FB', stepBorder: '#D6C9F5', useBorder: '#C9B8F5', useSoft: '#9A8AC0',
  },
  abono: {
    border: '#B6E3D8', bg: '#EDF8F4', rowSel: '#DFF2EB', rowBorder: '#D2EDE4',
    ink: '#0E7C66', inkDark: '#0B5A49', inkSoft: '#5E8C81',
    tagBg: '#D6F0E7', stepBorder: '#A6DBCE', useBorder: '#8ED0C0', useSoft: '#7FA89E',
  },
};

function CreditIcon({ kind, size = 15, color }) {
  if (kind === 'credit') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6"/>
    </svg>
  );
}

// ─── Consumable credit / balance row ─────────────────────────────────────────

function CreditRow({ line, showTag = true, kindLabel, onToggle, onStep }) {
  const tc = CREDIT_THEME[line.kind] || CREDIT_THEME.credit;
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'grid', gridTemplateColumns: '24px 1fr 120px 150px', gap: 12,
        alignItems: 'center', padding: '11px 16px',
        borderTop: `1px solid ${tc.rowBorder}`,
        background: line.sel ? tc.rowSel : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: 17, height: 17, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${line.sel ? '#19191D' : '#A9A9BC'}`,
        background: line.sel ? '#19191D' : '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {line.sel && (
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
      {/* Doc + metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <CreditIcon
          kind={line.kind}
          size={15}
          color={tc.ink}
          data-testid="CreditIcon__ba39f6" />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: tc.inkDark, fontFamily: 'JetBrains Mono, monospace' }}>
              {line.doc}
            </span>
            {showTag && (
              <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 5, background: tc.tagBg, color: tc.ink }}>
                {kindLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: tc.inkSoft, marginTop: 1 }}>{line.date} · {line.note}</div>
        </div>
      </div>
      {/* Available */}
      <div className="tabular-nums" style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: tc.inkSoft }}>
        {fmt(line.avail, 'EUR')}
      </div>
      {/* Use amount / stepper */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {line.sel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              onClick={() => onStep(-100)}
              style={{ width: 28, height: 32, borderRadius: 6, border: `1px solid ${tc.stepBorder}`, background: '#fff', cursor: 'pointer', color: tc.ink, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <div className="tabular-nums" style={{ minWidth: 78, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: 32, padding: '0 9px', border: `1px solid ${tc.useBorder}`, borderRadius: 7, background: '#fff', fontSize: 13, fontWeight: 600, color: tc.ink }}>
              {fmt(line.use, 'EUR')}
            </div>
            <button
              type="button"
              onClick={() => onStep(100)}
              style={{ width: 28, height: 32, borderRadius: 6, border: `1px solid ${tc.stepBorder}`, background: '#fff', cursor: 'pointer', color: tc.ink, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >+</button>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: tc.useSoft }}>Sin usar</span>
        )}
      </div>
    </div>
  );
}

// ─── Local payment method options ────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'transfer', label: 'Transferencia' },
  { id: 'direct',   label: 'Domiciliación' },
  { id: 'cash',     label: 'Efectivo' },
  { id: 'card',     label: 'Tarjeta' },
];

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * NewPaymentModal — full 760px payment/collection creation modal (Task 3).
 *
 * Opens from InvoicePaymentHistoryModal when "Añadir cobro/pago" is clicked.
 * Features: 4-field input row, credit/balance lines, cuadre summary,
 * excess handling, Cancelar / Guardar (draft) / Confirmar (deposited) footer.
 *
 * Props:
 *   invoiceId      — string
 *   invoiceData    — object (grandTotalAmount, outstandingAmount, documentNo, etc.)
 *   specName       — "sales-invoice" | "purchase-invoice"
 *   apiBaseUrl     — string (full URL including spec, e.g. http://host/sws/neo/sales-invoice)
 *   onClose        — callback when modal is dismissed
 *   onPaymentAdded — callback after successful save or confirm
 */
export default function NewPaymentModal({
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

  const isSales = specName === 'sales-invoice';
  const currency = invoiceData?.['currency$_identifier'] || 'EUR';
  const outstandingAmt = parseFloat(invoiceData?.outstandingAmount ?? invoiceData?.grandTotalAmount ?? 0);
  const bpName = invoiceData?.['businessPartner$_identifier'] || invoiceData?.businessPartner || '';
  const docNo = invoiceData?.documentNo || '';
  const dir = isSales ? 'in' : 'out';
  const linePrefix = isSales ? 'FV' : 'FC';

  // Form state
  const [amount, setAmount] = useState(outstandingAmt);
  const [amountStr, setAmountStr] = useState(String(outstandingAmt));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [methodId, setMethodId] = useState('transfer');
  const [accountId, setAccountId] = useState('');

  // API data
  const [accounts, setAccounts] = useState([]);
  const [scheduleId, setScheduleId] = useState(null);
  const [creditLines, setCreditLines] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Credit excess choice
  const [excessMode, setExcessMode] = useState(null); // null | 'credit' | 'vuelto'

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Cuadre computed values
  const usedCredit = creditLines.filter(l => l.sel).reduce((s, l) => s + l.use, 0);
  const funds = amount + usedCredit;
  const diff = funds - outstandingAmt;
  const isExcess = diff > 0.001;
  const isPartial = diff < -0.001;
  const canConfirm = !isExcess || excessMode !== null;

  // Fetch accounts, schedule ID, and credit lines on mount
  useEffect(() => {
    if (!invoiceId || !base) { setLoadingData(false); return; }
    (async () => {
      try {
        const [accountsRes, scheduleRes, creditsRes] = await Promise.allSettled([
          apiFetch(`/${specName}/header/${invoiceId}/action/invoiceAccounts`, { method: 'POST', body: '{}' }),
          apiFetch(`/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=1`),
          apiFetch(`/${specName}/header/${invoiceId}/action/invoiceCredits`, { method: 'POST', body: '{}' }),
        ]);

        if (accountsRes.status === 'fulfilled' && accountsRes.value.ok) {
          const json = await accountsRes.value.json();
          const items = (json.items || []).map(a => ({ id: a.id, name: a.label || a.name }));
          setAccounts(items);
          if (items.length > 0) setAccountId(items[0].id);
        }

        if (scheduleRes.status === 'fulfilled' && scheduleRes.value.ok) {
          const items = (await scheduleRes.value.json())?.response?.data || [];
          setScheduleId(items[0]?.finPaymentScheduleID || items[0]?.id || null);
        }

        if (creditsRes.status === 'fulfilled' && creditsRes.value.ok) {
          const json = await creditsRes.value.json();
          const raw = json.response?.data || json.items || [];
          setCreditLines(raw.map(l => ({
            id: l.id,
            kind: l.kind || 'credit',
            doc: l.documentNo || l.doc || l.id,
            date: l.paymentDate || l.date || '',
            note: l.description || l.note || '',
            avail: parseFloat(l.availableAmount || l.avail || 0),
            sel: false,
            use: 0,
          })));
        }
      } catch { /* silent — any failure is non-critical */ }
      finally { setLoadingData(false); }
    })();
  }, [apiFetch, base, invoiceId, specName]);

  // Toggle a credit line: select and auto-fill use amount to cover remaining gap
  const toggleLine = useCallback((id) => {
    setCreditLines(ls => {
      const target = ls.find(l => l.id === id);
      if (!target) return ls;
      if (target.sel) return ls.map(l => l.id === id ? { ...l, sel: false, use: 0 } : l);
      const otherUsed = ls.filter(l => l.sel && l.id !== id).reduce((s, l) => s + l.use, 0);
      const needNow = outstandingAmt - amount - otherUsed;
      const use = Math.max(0, Math.min(target.avail, Math.round(Math.max(0, needNow) * 100) / 100)) || target.avail;
      return ls.map(l => l.id === id ? { ...l, sel: true, use } : l);
    });
    setExcessMode(null);
  }, [amount, outstandingAmt]);

  const stepLine = useCallback((id, delta) => {
    setCreditLines(ls => ls.map(l =>
      l.id === id
        ? { ...l, use: Math.max(0, Math.min(l.avail, Math.round((l.use + delta) * 100) / 100)) }
        : l,
    ));
  }, []);

  // Set amount to exactly close the invoice (accounting for used credit)
  const handleEqualize = useCallback(() => {
    const v = Math.max(0, outstandingAmt - usedCredit);
    setAmount(v);
    setAmountStr(String(v));
    setExcessMode(null);
  }, [outstandingAmt, usedCredit]);

  const handleAmountChange = (raw) => {
    setAmountStr(raw);
    const n = parseInput(raw);
    if (n !== null) { setAmount(n); setExcessMode(null); }
    else if (raw.trim() === '') setAmount(0);
  };

  const handleSubmit = async (asDraft) => {
    if (!accountId) { setError(ui('paymentAccountRequired')); return; }
    if (!date) { setError(ui('paymentDateRequired')); return; }
    if (amount <= 0) { setError(ui('paymentAmountInvalid')); return; }
    if (!canConfirm) return;
    setError(null);
    setSaving(true);
    try {
      const usedLines = creditLines.filter(l => l.sel && l.use > 0);
      const res = await apiFetch(
        `/${specName}/header/${invoiceId}/action/registerPayment`,
        {
          method: 'POST',
          body: JSON.stringify({
            scheduleId,
            actual_payment: String(amount),
            payment_date: date,
            fin_financial_account_id: accountId,
            payment_method: methodId,
            draft: asDraft,
            excess_mode: isExcess ? excessMode : null,
            credit_lines: usedLines.map(l => ({ id: l.id, use: l.use })),
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.response?.status === -1 || json?.response?.error) {
        throw new Error(json?.response?.error?.message || json?.response?.message?.text || ui('paymentRequestFailed'));
      }
      onPaymentAdded?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const partyLabel = ui(isSales ? 'client' : 'supplier');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(16,20,28,.46)' }}
      onClick={onClose}
      data-testid="NewPaymentModal__backdrop"
    >
      <div
        style={{
          width: 760, maxWidth: '96vw', maxHeight: '90vh',
          background: '#fff', borderRadius: 14,
          boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        data-testid="NewPaymentModal__panel"
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 24px 16px', gap: 12, borderBottom: '1px solid #E3E7EC', flexShrink: 0 }}>
          <DirBadge dir={dir} size={36} data-testid="DirBadge__ba39f6" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#19191D', letterSpacing: '-0.01em' }}>
                {isSales ? ui('newCobro') : ui('newPago')}
              </h2>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 6, background: isSales ? '#E2F7EA' : '#FDE2E9', color: isSales ? '#17663A' : '#C5234A' }}>
                {isSales ? ui('cobro') : ui('pago')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 6, background: '#F1F2F4', color: '#55556D' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A9A9BC' }} />
                {ui('draft')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#828FA3', marginTop: 3 }}>
              {ui('invoiceLabel')}{' '}
              <b style={{ color: '#55556D', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                {linePrefix}-{docNo}
              </b>
              {' · '}{bpName}
              {outstandingAmt > 0 && <> · {ui('pending').toLowerCase()} {fmt(outstandingAmt, currency)}</>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="NewPaymentModal__close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#828FA3', padding: 4, marginTop: 2, display: 'flex', flexShrink: 0 }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>{ui('loading')}</div>
          ) : (
            <>
              {/* 4-column fields row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>

                {/* Cantidad */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#55556D', lineHeight: '16px' }}>
                    {ui('paymentAmount')} ({currency})
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 12px', border: '1px solid #19191D', borderRadius: 8, background: '#fff' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amountStr}
                      onChange={e => handleAmountChange(e.target.value)}
                      onBlur={() => setAmountStr(String(amount))}
                      data-testid="NewPaymentModal__amount-input"
                      style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: '#19191D' }}
                    />
                    <span style={{ fontSize: 13, color: '#828FA3', marginLeft: 5, flexShrink: 0 }}>€</span>
                  </div>
                </div>

                {/* Fecha */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#55556D', lineHeight: '16px' }}>{ui('paymentDate')}</label>
                  <DateField
                    value={date}
                    onChange={setDate}
                    data-testid="NewPaymentModal__date-input"
                  />
                </div>

                {/* Método de pago */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#55556D', lineHeight: '16px' }}>{ui('paymentMethodCol')}</label>
                  <Select value={methodId} onValueChange={setMethodId} data-testid="Select__ba39f6">
                    <SelectTrigger
                      data-testid="NewPaymentModal__method-select"
                      style={{ height: 42, fontSize: 14, borderRadius: 8, border: '1px solid #D0D5DD' }}
                    >
                      <SelectValue data-testid="SelectValue__ba39f6" />
                    </SelectTrigger>
                    <SelectContent data-testid="SelectContent__ba39f6">
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.id} value={m.id} data-testid="SelectItem__ba39f6">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cuenta */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#55556D', lineHeight: '16px' }}>{ui('paymentAccount')}</label>
                  <Select
                    value={accountId}
                    onValueChange={setAccountId}
                    data-testid="Select__ba39f6">
                    <SelectTrigger
                      data-testid="NewPaymentModal__account-select"
                      style={{ height: 42, fontSize: 14, borderRadius: 8, border: '1px solid #D0D5DD' }}
                    >
                      <SelectValue placeholder={ui('selectAccount')} data-testid="SelectValue__ba39f6" />
                    </SelectTrigger>
                    <SelectContent data-testid="SelectContent__ba39f6">
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id} data-testid="SelectItem__ba39f6">{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Credit / balance section — only shown if lines exist */}
              {creditLines.length > 0 && (
                <div style={{ border: '1px solid #E3E7EC', borderRadius: 12, background: '#FCFCFD', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#19191D' }}>{ui('creditAndBalance')}</span>
                    <span style={{ fontSize: 12, color: '#828FA3' }}>· {ui('creditHint')}</span>
                    <div style={{ flex: 1 }} />
                    {usedCredit > 0 && (
                      <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: '#19191D' }}>
                        − {fmt(usedCredit, currency)}
                      </span>
                    )}
                  </div>
                  {creditLines.map(l => (
                    <CreditRow
                      key={l.id}
                      line={l}
                      showTag
                      kindLabel={l.kind === 'credit' ? ui('creditKindCredit') : ui('creditKindAbono')}
                      onToggle={() => toggleLine(l.id)}
                      onStep={delta => stepLine(l.id, delta)}
                      data-testid="CreditRow__ba39f6" />
                  ))}
                </div>
              )}

              {/* Cuadre summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '13px 16px', border: '1px solid #E3E7EC', borderRadius: 12, background: '#FCFCFD' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#828FA3', lineHeight: '14px' }}>{ui('totalInvoice')}</div>
                  <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: '#19191D', lineHeight: '20px' }}>{fmt(outstandingAmt, currency)}</div>
                </div>
                <span style={{ color: '#A9A9BC', fontSize: 13 }}>·</span>
                <div>
                  <div style={{ fontSize: 11, color: '#828FA3', lineHeight: '14px' }}>{ui('cash')}</div>
                  <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: '#19191D', lineHeight: '20px' }}>{fmt(amount, currency)}</div>
                </div>
                {usedCredit > 0 && (
                  <>
                    <span style={{ color: '#A9A9BC', fontSize: 14, fontWeight: 600 }}>+</span>
                    <div>
                      <div style={{ fontSize: 11, color: '#5423E7', lineHeight: '14px' }}>{ui('creditBalance')}</div>
                      <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: '#5423E7', lineHeight: '20px' }}>{fmt(usedCredit, currency)}</div>
                    </div>
                  </>
                )}
                <span style={{ color: '#A9A9BC', fontSize: 14, fontWeight: 600 }}>=</span>
                <div>
                  <div style={{ fontSize: 11, color: '#828FA3', lineHeight: '14px' }}>{ui('applied')}</div>
                  <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: '#19191D', lineHeight: '20px' }}>{fmt(funds, currency)}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#828FA3', lineHeight: '14px' }}>
                    {isExcess ? ui('surplus') : isPartial ? ui('missing') : ui('difference')}
                  </div>
                  <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: isPartial ? '#C5234A' : '#17663A', lineHeight: '20px' }}>
                    {fmt(Math.abs(diff), currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEqualize}
                  data-testid="NewPaymentModal__equalize-btn"
                  style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #D0D5DD', background: '#fff', cursor: 'pointer', color: '#55556D', fontSize: 12, fontWeight: 500 }}
                >
                  {ui('equalize')}
                </button>
              </div>

              {/* Excess block — shown when funds > outstanding */}
              {isExcess && (
                <div style={{ padding: '12px 14px', background: '#E9F8EF', border: '1px solid #BEE6CF', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#17663A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#17663A' }}>
                      {fmt(diff, currency)} — {ui('excessInfo')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Leave as credit */}
                    <button
                      type="button"
                      onClick={() => setExcessMode('credit')}
                      data-testid="NewPaymentModal__excess-credit"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, border: `1px solid ${excessMode === 'credit' ? '#17663A' : '#D0D5DD'}`, background: excessMode === 'credit' ? '#E2F7EA' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${excessMode === 'credit' ? '#19191D' : '#A9A9BC'}`, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {excessMode === 'credit' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#19191D' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#19191D' }}>{ui('leaveAsCredit')}</div>
                        <div style={{ fontSize: 11, color: '#828FA3', marginTop: 2 }}>
                          {fmt(diff, currency)} {ui('leaveAsCreditFor')} {partyLabel}
                        </div>
                      </div>
                    </button>

                    {/* Give change */}
                    <button
                      type="button"
                      onClick={() => setExcessMode('vuelto')}
                      data-testid="NewPaymentModal__excess-vuelto"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, border: `1px solid ${excessMode === 'vuelto' ? '#17663A' : '#D0D5DD'}`, background: excessMode === 'vuelto' ? '#E2F7EA' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${excessMode === 'vuelto' ? '#19191D' : '#A9A9BC'}`, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {excessMode === 'vuelto' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#19191D' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#19191D' }}>{ui('giveChange')}</div>
                        <div style={{ fontSize: 11, color: '#828FA3', marginTop: 2 }}>
                          {ui('giveChangeReturn')} {fmt(diff, currency)} {ui('toThe')} {partyLabel}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div style={{ fontSize: 12, color: '#C5234A', padding: '4px 0' }} data-testid="NewPaymentModal__error">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: '1px solid #E3E7EC', background: '#fff', flexShrink: 0 }}>
          <div style={{ flex: 1 }} />

          {/* Cancelar */}
          <button
            type="button"
            onClick={onClose}
            data-testid="NewPaymentModal__cancel"
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'transparent', color: '#55556D', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {ui('cancel')}
          </button>

          {/* Guardar — saves as draft */}
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={saving}
            data-testid="NewPaymentModal__save"
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #D0D5DD', background: '#fff', color: '#19191D', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}
          >
            {ui('save')}
          </button>

          {/* Confirmar — creates deposited payment */}
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={saving || !canConfirm}
            data-testid="NewPaymentModal__confirm"
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: '#19191D', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (saving || !canConfirm) ? 'not-allowed' : 'pointer', opacity: (saving || !canConfirm) ? 0.45 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {ui('confirmDeposit')}
          </button>
        </div>
      </div>
    </div>
  );
}
